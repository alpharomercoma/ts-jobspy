/**
 * ZipRecruiter Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
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
    // fetch enough to cover offset + resultsWanted, then slice off the leading
    // `offset` rows at the end so offset is honored exactly.
    const targetCount = offset + resultsWanted;
    const maxPages = Math.ceil(targetCount / this.jobsPerPage);

    const finish = (): JobResponse => {
      const all = [...errors, ...this.enrichmentErrors];
      return {
        jobs: jobList.slice(offset, offset + resultsWanted),
        ...(all.length > 0 && { errors: all }),
      };
    };

    for (let page = 1; page <= maxPages; page++) {
      if (jobList.length >= targetCount) break;

      log.info(`search page: ${page} / ${maxPages}`);

      let jobs: JobPost[];
      let nextToken: string | null;
      try {
        // Pace pages inside the try so an abort during the delay is handled by
        // the same partial-results logic below, not thrown out of scrape().
        if (page > 1) {
          await sleep(this.delay * 1000, input.signal);
        }
        ({ jobs, nextToken } = await this.findJobsInPage(continueToken));
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

      if (jobs.length > 0) {
        jobList.push(...jobs);
      } else {
        break;
      }

      if (!nextToken) break;
      continueToken = nextToken;
    }

    return finish();
  }

  private async findJobsInPage(
    continueToken: string | null
  ): Promise<{ jobs: JobPost[]; nextToken: string | null }> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], nextToken: null };
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
    const nextContinueToken = resData.continue ?? null;

    const processedJobs = await this.mapWithConcurrency(
      jobsList,
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
          this.enrichmentErrors.push(`${job.listing_key}: ${message}`);
          return null;
        }
      }
    );

    return {
      jobs: processedJobs.filter((job): job is JobPost => job !== null),
      nextToken: nextContinueToken,
    };
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

  private async processJob(job: ZipRecruiterJob): Promise<JobPost | null> {
    const title = job.name;
    const jobUrl = `${this.baseUrl}/jobs//j?lvk=${job.listing_key}`;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

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

    const { descriptionFull, jobUrlDirect } = await this.getDescription(jobUrl);

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
    jobUrl: string
  ): Promise<{ descriptionFull: string | null; jobUrlDirect: string | null }> {
    if (!this.session) {
      return { descriptionFull: null, jobUrlDirect: null };
    }

    try {
      const response = await this.session.get(jobUrl, {
        maxRedirects: 5,
        signal: this.scraperInput?.signal,
      });

      if (response.status < 200 || response.status >= 400) {
        this.enrichmentErrors.push(`${jobUrl}: description fetch returned HTTP ${response.status}`);
        return { descriptionFull: null, jobUrlDirect: null };
      }

      const $ = cheerio.load(response.data as string);
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
        `${jobUrl}: description fetch failed — ${e instanceof Error ? e.message : String(e)}`
      );
      return { descriptionFull: null, jobUrlDirect: null };
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
