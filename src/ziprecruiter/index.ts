/**
 * ZipRecruiter Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import {
  type JobPost,
  type JobResponse,
  type Location,
  type ScraperInput,
  Site,
  Country,
  type Compensation,
  DescriptionFormat,
  type Scraper,
  getCountryFromString,
} from '../model';
import {
  createSession,
  createLogger,
  sleep,
  markdownConverter,
  plainConverter,
  removeAttributes,
  extractEmailsFromText,
  loadHtml,
} from '../util';
import { RateLimitException, ZipRecruiterException } from '../exception';
import { HEADERS, COOKIE_DATA } from './constant';
import { addParams, getJobTypeEnum } from './util';

const log = createLogger('ZipRecruiter');

interface ZipRecruiterJob {
  listing_key: string;
  name: string;
  job_description?: string;
  buyer_type?: string;
  hiring_company?: { name?: string };
  job_country?: string;
  job_city?: string;
  job_state?: string;
  employment_type?: string;
  posted_time?: string;
  compensation_interval?: string;
  compensation_min?: number;
  compensation_max?: number;
  compensation_currency?: string;
}

interface ZipRecruiterResponse {
  jobs?: ZipRecruiterJob[];
  continue?: string;
}

/** One search page after windowing: what was enriched, passed over, and seen. */
interface PageResult {
  jobs: JobPost[];
  /** Leading unique listings passed over (never enriched) to honor the offset. */
  skipped: number;
  /** Raw listings the board returned on this page, before windowing. */
  listingCount: number;
  nextToken: string | null;
}

export class ZipRecruiter implements Scraper {
  site = Site.ZIP_RECRUITER;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly baseUrl = 'https://www.ziprecruiter.com';
  private readonly apiUrl = 'https://api.ziprecruiter.com';
  private readonly delay = 5;
  private readonly jobsPerPage = 20;

  // Bound detail-page enrichment so a single search page doesn't fire a burst
  // of back-to-back detail requests (one per result) simultaneously.
  private readonly enrichmentConcurrency = 5;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private seenUrls = new Set<string>();
  private enrichmentErrors: string[] = [];

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.scraperInput = input;
    this.seenUrls.clear();
    this.enrichmentErrors = [];

    this.session = createSession({
      siteDomain: 'ziprecruiter.com',
      proxies: this.proxies,
      caCert: this.caCert,
      userAgent: this.userAgent,
    });

    // Set headers; a caller-supplied userAgent overrides the default.
    if (this.session.defaults.headers) {
      Object.assign(this.session.defaults.headers, HEADERS);
      if (this.userAgent) {
        this.session.defaults.headers['user-agent'] = this.userAgent;
      }
    }

    // Initialize session with cookies (best-effort; not part of data collection)
    await this.getCookies();

    const jobList: JobPost[] = [];
    const errors: string[] = [];
    let continueToken: string | null = null;
    const offset = input.offset ?? 0;
    const resultsWanted = input.resultsWanted ?? 15;
    // ZipRecruiter paginates via an opaque continue token (no offset param), so
    // walk pages from the start, pass over the first `offset` listings without
    // enriching them, and enrich only until the window is full. jobList then
    // holds exactly [offset, offset + resultsWanted) of the board's order.
    const maxPages = Math.ceil((offset + resultsWanted) / this.jobsPerPage);
    let skipped = 0;

    const finish = (): JobResponse => {
      const all = [...errors, ...this.enrichmentErrors];
      return {
        jobs: jobList,
        ...(all.length > 0 && { errors: all }),
      };
    };

    for (let page = 1; page <= maxPages; page++) {
      if (jobList.length >= resultsWanted) break;

      log.info(`search page: ${page} / ${maxPages}`);

      let result: PageResult;
      try {
        // Pace pages inside the try so an abort during the delay is handled by
        // the same partial-results logic below, not thrown out of scrape().
        if (page > 1) {
          await sleep(this.delay * 1000, input.signal);
        }
        result = await this.findJobsInPage(
          continueToken,
          offset - skipped,
          resultsWanted - jobList.length
        );
      } catch (e) {
        const failure = e instanceof Error ? e : new Error(String(e));
        if (failure.message.includes('Proxy')) {
          log.error('ZipRecruiter: Bad proxy');
        } else {
          log.error(`ZipRecruiter: ${failure.message}`);
        }
        // Nothing collected: fail the scrape. Partially collected: report what
        // we have, recording the interruption honestly.
        if (jobList.length === 0) throw failure;
        errors.push(`page ${page}: ${failure.message}`);
        return finish();
      }

      skipped += result.skipped;
      jobList.push(...result.jobs);

      // An empty page means the board has nothing more, whatever the window.
      if (result.listingCount === 0) break;
      if (!result.nextToken) break;
      continueToken = result.nextToken;
    }

    return finish();
  }

  /**
   * Fetch one search page and enrich only the part of it that falls inside the
   * requested window: pass over the first `skip` unique listings, then collect
   * up to `want` jobs.
   */
  private async findJobsInPage(
    continueToken: string | null,
    skip: number,
    want: number
  ): Promise<PageResult> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], skipped: 0, listingCount: 0, nextToken: null };
    }

    const params = addParams(this.scraperInput);
    if (continueToken) {
      params.continue_from = continueToken;
    }

    const response = await this.session.get<ZipRecruiterResponse>(`${this.apiUrl}/jobs-app/jobs`, {
      params,
      signal: this.scraperInput.signal,
    });

    if (response.status < 200 || response.status >= 400) {
      // Never swallow an HTTP failure into an empty page: throw so the caller
      // can decide (fail the scrape, or report partial results).
      if (response.status === 429) {
        throw new RateLimitException(
          'ZipRecruiter',
          'ZipRecruiter responded with HTTP 429 (blocked for too many requests)'
        );
      }
      throw new ZipRecruiterException(`ZipRecruiter responded with status code ${response.status}`);
    }

    const resData = response.data;
    const jobsList = resData.jobs ?? [];
    const nextToken = resData.continue ?? null;

    // Dedupe before any network work so window positions count unique listings
    // in board order, then pass over the offset without enriching it.
    const fresh = jobsList.filter((job) => {
      const jobUrl = this.jobUrlFor(job.listing_key);
      if (this.seenUrls.has(jobUrl)) return false;
      this.seenUrls.add(jobUrl);
      return true;
    });
    const skipped = Math.min(skip, fresh.length);
    const jobs = await this.enrichWindow(fresh.slice(skipped), want);

    return { jobs, skipped, listingCount: jobsList.length, nextToken };
  }

  /**
   * Enrich listings in board order until `want` jobs are collected or the
   * listings run out. Each batch is sized to the remaining deficit, so a
   * listing that fails to process is replaced by the next one on the page and
   * no listing outside the window is ever fetched.
   */
  private async enrichWindow(listings: ZipRecruiterJob[], want: number): Promise<JobPost[]> {
    const jobs: JobPost[] = [];
    let index = 0;

    while (jobs.length < want && index < listings.length) {
      const batch = listings.slice(index, index + (want - jobs.length));
      index += batch.length;

      const processed = await this.mapWithConcurrency(
        batch,
        this.enrichmentConcurrency,
        async (job): Promise<JobPost | null> => {
          try {
            return await this.processJob(job);
          } catch (e) {
            // A cancellation must abort the whole scrape, so re-throw it. Any
            // other per-job failure (e.g. malformed job payload) is recorded and
            // the slot yields null so one bad row can't kill the whole page.
            if (this.isAbortError(e)) throw e;
            const message = e instanceof Error ? e.message : String(e);
            this.enrichmentErrors.push(`job ${job.listing_key}: ${message}`);
            return null;
          }
        }
      );
      jobs.push(...processed.filter((job): job is JobPost => job !== null));
    }

    return jobs;
  }

  /**
   * True when an error represents an aborted/cancelled request (from the
   * orchestrator's timeout signal). Callers re-throw these so cancellation
   * propagates promptly instead of being recorded as an ordinary failure.
   */
  private isAbortError(e: unknown): boolean {
    if (this.scraperInput?.signal?.aborted) return true;
    const err = e as { name?: string; code?: string } | null | undefined;
    return (
      err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED'
    );
  }

  /**
   * Map over items with a bounded number of promises in flight at once,
   * preserving input order. Detail-page enrichment fires one request per
   * result, so this caps concurrent detail fetches instead of launching them
   * all simultaneously.
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const current = nextIndex++;
        results[current] = await fn(items[current]);
      }
    };

    const workerCount = Math.min(Math.max(limit, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  /** Canonical listing URL: both the dedupe key and the detail link. */
  private jobUrlFor(listingKey: string): string {
    return `${this.baseUrl}/jobs//j?lvk=${listingKey}`;
  }

  /**
   * Null when `url` is an http(s) link on ziprecruiter.com or a subdomain of
   * it; otherwise what makes it off-site (the hostname, or the scheme when
   * there is no host), for the errors entry. Never returns the full link.
   */
  private offSiteReason(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return 'unparseable link';
    }
    const host = parsed.hostname.toLowerCase();
    const onSite =
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      (host === 'ziprecruiter.com' || host.endsWith('.ziprecruiter.com'));
    return onSite ? null : host || parsed.protocol;
  }

  private async processJob(job: ZipRecruiterJob): Promise<JobPost> {
    const title = job.name;
    const jobUrl = this.jobUrlFor(job.listing_key);

    let description = (job.job_description ?? '').trim();
    const listingType = job.buyer_type ?? '';

    if (this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN) {
      description = markdownConverter(description) ?? description;
    } else if (this.scraperInput?.descriptionFormat === DescriptionFormat.PLAIN) {
      description = plainConverter(description) ?? description;
    }
    // DescriptionFormat.HTML leaves the source HTML as-is.

    const company = job.hiring_company?.name ?? null;
    const countryValue = job.job_country === 'US' ? 'usa' : 'canada';
    let countryEnum: Country;
    try {
      countryEnum = getCountryFromString(countryValue);
    } catch {
      countryEnum = Country.USA;
    }

    const location: Location = {
      city: job.job_city,
      state: job.job_state,
      country: countryEnum,
    };

    const jobType = getJobTypeEnum((job.employment_type ?? '').replace(/_/g, '').toLowerCase());

    let datePosted: Date | null = null;
    if (job.posted_time) {
      // Parse the ISO timestamp unchanged. Stripping the trailing 'Z' would
      // reinterpret a UTC instant as server-local time and can shift the date
      // by a day.
      datePosted = new Date(job.posted_time);
    }

    let compInterval = job.compensation_interval;
    if (compInterval === 'annual') {
      compInterval = 'yearly';
    }

    const compMin = job.compensation_min ? Math.floor(job.compensation_min) : undefined;
    const compMax = job.compensation_max ? Math.floor(job.compensation_max) : undefined;
    const compCurrency = job.compensation_currency;

    const { descriptionFull, jobUrlDirect } = await this.getDescription(job.listing_key, jobUrl);

    const compensation: Compensation = {
      interval: compInterval as Compensation['interval'],
      minAmount: compMin,
      maxAmount: compMax,
      currency: compCurrency,
    };

    return {
      id: `zr-${job.listing_key}`,
      title,
      companyName: company,
      location,
      jobType,
      compensation,
      datePosted,
      jobUrl,
      description: descriptionFull ?? description,
      emails: extractEmailsFromText(description),
      jobUrlDirect,
      listingType,
    };
  }

  private async getDescription(
    listingKey: string,
    jobUrl: string
  ): Promise<{ descriptionFull: string | null; jobUrlDirect: string | null }> {
    const none = { descriptionFull: null, jobUrlDirect: null };
    if (!this.session) return none;

    // A detail fetch carries the session's headers and cookies, so only follow
    // a link that stays on the board's own host. The job is kept either way;
    // the entry names the host, never the full link.
    const offSite = this.offSiteReason(jobUrl);
    if (offSite !== null) {
      this.enrichmentErrors.push(`job ${listingKey}: detail link points off-site (${offSite})`);
      return none;
    }

    try {
      const response = await this.session.get(jobUrl, {
        maxRedirects: 5,
        signal: this.scraperInput?.signal,
      });

      if (response.status < 200 || response.status >= 400) {
        this.enrichmentErrors.push(
          `job ${listingKey}: description fetch failed: HTTP ${response.status}`
        );
        return none;
      }

      const $ = loadHtml(response.data as string);
      const jobDescrDiv = $('div.job_description');
      const companyDescrSection = $('section.company_description');

      let descriptionFull = '';

      if (jobDescrDiv.length) {
        descriptionFull += removeAttributes(jobDescrDiv.html() ?? '');
      }

      if (companyDescrSection.length) {
        descriptionFull += removeAttributes(companyDescrSection.html() ?? '');
      }

      let jobUrlDirect: string | null = null;
      try {
        const scriptTag = $('script[type="application/json"]').first();
        if (scriptTag.length) {
          const scriptContent = scriptTag.html();
          if (scriptContent) {
            const jobJson = JSON.parse(scriptContent) as {
              model?: { saveJobURL?: string };
            };
            const jobUrlVal = jobJson.model?.saveJobURL ?? '';
            const match = jobUrlVal.match(/job_url=(.+)/);
            if (match) {
              jobUrlDirect = match[1];
            }
          }
        }
      } catch {
        jobUrlDirect = null;
      }

      if (descriptionFull) {
        if (this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN) {
          descriptionFull = markdownConverter(descriptionFull) ?? descriptionFull;
        } else if (this.scraperInput?.descriptionFormat === DescriptionFormat.PLAIN) {
          descriptionFull = plainConverter(descriptionFull) ?? descriptionFull;
        }
        // DescriptionFormat.HTML leaves the cleaned HTML as-is.
      }

      return {
        descriptionFull: descriptionFull || null,
        jobUrlDirect,
      };
    } catch (e) {
      // A cancellation must abort the scrape promptly rather than resolving an
      // unenriched job, so re-throw it instead of recording an enrichment error.
      if (this.isAbortError(e)) throw e;
      this.enrichmentErrors.push(
        `job ${listingKey}: description fetch failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return none;
    }
  }

  private async getCookies(): Promise<void> {
    if (!this.session) return;

    const url = `${this.apiUrl}/jobs-app/event`;
    const formData = new URLSearchParams();

    for (const [key, value] of COOKIE_DATA) {
      formData.append(key, value);
    }

    try {
      await this.session.post(url, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: this.scraperInput?.signal,
      });
    } catch {
      // Ignore cookie initialization errors
    }
  }
}
