/**
 * Glassdoor Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  Site,
  Country,
  DescriptionFormat,
  type Scraper,
  getGlassdoorUrl,
} from '../model';
import { GlassdoorException, RateLimitException } from '../exception';
import {
  createSession,
  createLogger,
  markdownConverter,
  plainConverter,
  extractEmailsFromText,
} from '../util';
import { HEADERS, QUERY_TEMPLATE, FALLBACK_TOKEN } from './constant';
import { parseCompensation, parseLocation, getCursorForPage } from './util';

const log = createLogger('Glassdoor');

/**
 * Detect a cancellation from an aborted signal - either the DOMException raised
 * by the signal-aware sleep helpers or axios's own CanceledError
 * (name 'CanceledError' / code 'ERR_CANCELED').
 */
function isAbortError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { name?: string; code?: string };
  return err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED';
}

interface GlassdoorJobView {
  header: {
    employerNameFromSearch: string;
    jobTitleText: string;
    locationName: string;
    locationType: string;
    ageInDays?: number;
    payPeriod?: string;
    payPeriodAdjustedPay?: {
      p10?: number;
      p50?: number;
      p90?: number;
    };
    payCurrency?: string;
    employer: {
      id: number;
      name: string;
    };
    adOrderSponsorshipLevel?: string;
  };
  job: {
    listingId: number;
    jobTitleText: string;
    description?: string;
  };
  overview?: {
    squareLogoUrl?: string;
  };
}

interface GlassdoorJobListing {
  jobview: GlassdoorJobView;
}

interface GlassdoorApiResponse {
  data: {
    jobListings: {
      jobListings: GlassdoorJobListing[];
      paginationCursors: Array<{ pageNumber: number; cursor: string }>;
    };
  };
  errors?: unknown[];
}

/** The JobDetailQuery body; fields are optional so a changed shape is detected. */
interface GlassdoorDetailResponse {
  data?: { jobview?: { job?: { description?: string | null } } };
}

interface LocationResult {
  locationId: string;
  locationType: string;
}

/** A listing that survived dedupe, with its index on the page for error labels. */
interface PageListing {
  jobData: GlassdoorJobListing;
  index: number;
}

/** One search page after windowing: what was enriched, passed over, and seen. */
interface PageResult {
  jobs: JobPost[];
  /** Leading unique listings passed over (never enriched) to honor the offset. */
  skipped: number;
  /** Raw listings the board returned on this page, before windowing. */
  listingCount: number;
  nextCursor: string | null;
  errors: string[];
}

export class Glassdoor implements Scraper {
  site = Site.GLASSDOOR;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly jobsPerPage = 30;
  private readonly maxPages = 30;

  // Bound description enrichment so a page doesn't fire one detail query per
  // listing at once. Glassdoor blocks aggressively, so keep the burst small.
  private readonly enrichmentConcurrency = 3;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private baseUrl = '';
  private seenUrls = new Set<string>();

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    // Do NOT silently cap resultsWanted here: the site's hard cap
    // (maxPages * jobsPerPage) is enforced naturally by the page loop below,
    // which never collects more than the requested window.
    this.scraperInput = input;
    this.seenUrls.clear();

    try {
      this.baseUrl = getGlassdoorUrl(input.country ?? Country.USA);
    } catch {
      // Do not silently fall back to the US site: returning US jobs for, say, a
      // Bangladesh request is dishonest. Fail clearly so meta reports an error.
      throw new GlassdoorException(
        `Glassdoor is not available for country '${input.country ?? Country.USA}'`
      );
    }

    this.session = createSession({
      siteDomain: new URL(this.baseUrl).hostname.replace(/^www\./, ''),
      proxies: this.proxies,
      caCert: this.caCert,
      hasRetry: true,
      userAgent: this.userAgent,
    });

    // Get CSRF token
    const token = await this.getCsrfToken();
    const headers = { ...HEADERS };
    headers['gd-csrf-token'] = token ?? FALLBACK_TOKEN;

    if (this.userAgent) {
      headers['user-agent'] = this.userAgent;
    }

    if (this.session.defaults.headers) {
      Object.assign(this.session.defaults.headers, headers);
    }

    // Get location. A failure here happens before any jobs are collected, so
    // getLocation throws (RateLimit/Glassdoor) rather than returning empty.
    const { locationId, locationType } = await this.getLocation(
      input.location ?? '',
      input.isRemote ?? false
    );

    const jobList: JobPost[] = [];
    const errors: string[] = [];
    const resultsWanted = input.resultsWanted ?? 15;
    const offset = input.offset ?? 0;

    // Glassdoor pages are addressed by opaque cursors that each page hands out
    // for the next one, so an offset cannot jump straight to its page. Walk
    // from page 1 (null cursor), pass over the first `offset` listings without
    // enriching them, and enrich only until the window is full. jobList then
    // holds exactly [offset, offset + resultsWanted) of the board's order;
    // maxPages is the site's hard cap on how deep the walk may go.
    let cursor: string | null = null;
    let skipped = 0;

    for (let page = 1; page <= this.maxPages; page++) {
      if (jobList.length >= resultsWanted) break;

      log.info(`search page: ${page} (collected ${jobList.length} / ${resultsWanted})`);

      let result: PageResult;
      try {
        result = await this.fetchJobsPage(
          locationId,
          locationType,
          page,
          cursor,
          offset - skipped,
          resultsWanted - jobList.length
        );
      } catch (e) {
        // Nothing collected yet: the whole scrape failed. Partially collected:
        // report what we have, but record the interruption honestly.
        if (jobList.length === 0) throw e;
        errors.push(`page ${page}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }

      skipped += result.skipped;
      jobList.push(...result.jobs);
      errors.push(...result.errors);

      // An empty page means the board has nothing more, whatever the window.
      if (result.listingCount === 0) break;

      // No further cursor (or the API returned the same one): stop paginating.
      // maxPages remains a backstop via the loop bound.
      if (!result.nextCursor || result.nextCursor === cursor) break;
      cursor = result.nextCursor;
    }

    return {
      jobs: jobList,
      ...(errors.length > 0 && { errors }),
      ...(this.unsupportedOptions().length > 0 && {
        unsupportedOptions: this.unsupportedOptions(),
      }),
    };
  }

  /**
   * Options the Glassdoor API cannot express. Only `distance` qualifies:
   * jobType/easyApply map to filterParams, hoursOld maps to fromAge (day
   * granularity is acceptable), and isRemote maps to the remote location - all
   * are actually applied. Declared unconditionally; the orchestrator intersects
   * this with the options the caller actually supplied, so we must not gate it
   * on a value (the default is indistinguishable from a caller-set 50 here).
   */
  private unsupportedOptions(): string[] {
    return ['distance'];
  }

  /**
   * Fetch one search page and enrich only the part of it that falls inside the
   * requested window: pass over the first `skip` unique listings, then collect
   * up to `want` jobs. The defaults enrich the whole page.
   */
  private async fetchJobsPage(
    locationId: string,
    locationType: string,
    pageNum: number,
    cursor: string | null,
    skip = 0,
    want = this.jobsPerPage
  ): Promise<PageResult> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], skipped: 0, listingCount: 0, nextCursor: null, errors: [] };
    }

    const payload = this.addPayload(locationId, locationType, pageNum, cursor);

    // Do NOT swallow transport/HTTP errors here: the caller (scrape) decides
    // whether an interruption fails the whole scrape (nothing collected) or is
    // reported via errors[] (partial). Let exceptions propagate.
    const response = await this.session.post<GlassdoorApiResponse[]>(
      `${this.baseUrl}graph`,
      payload,
      { timeout: 15000, signal: this.scraperInput.signal }
    );

    if (response.status < 200 || response.status >= 400) {
      if (response.status === 429) {
        throw new RateLimitException(
          'Glassdoor',
          'Glassdoor responded with HTTP 429 (blocked for too many requests)'
        );
      }
      throw new GlassdoorException(`Glassdoor responded with status code ${response.status}`);
    }

    // A bot-block often returns HTTP 200 with an HTML body instead of the JSON
    // array. That is a block, not an empty result, so fail rather than let it
    // masquerade as a clean 'empty' page.
    if (!Array.isArray(response.data)) {
      throw new GlassdoorException(
        'Glassdoor returned a non-JSON payload (likely a bot-block interstitial)'
      );
    }

    const resJson = response.data[0];

    // Only a non-empty GraphQL errors array is a real failure; `errors: []` is a
    // successful response and must not throw.
    if (resJson?.errors && resJson.errors.length > 0) {
      throw new GlassdoorException('Error encountered in Glassdoor API response');
    }

    // The listings path must exist: a 200 whose JSON lacks it is an API/schema
    // change (or a stub returned to a blocked client), not an empty page. Only
    // an explicit empty jobListings array is a genuinely empty result.
    const listings: unknown = resJson?.data?.jobListings?.jobListings;
    if (!Array.isArray(listings)) {
      throw new GlassdoorException(
        'Glassdoor response shape is unrecognized: data.jobListings.jobListings is missing (schema changed or request blocked)'
      );
    }
    const jobsData = listings;

    // Dedupe before any network work so window positions count unique listings
    // in board order, then pass over the offset without enriching it. A listing
    // without an id stays in so processJob records it as malformed rather than
    // letting such rows collapse into one dedupe key.
    const fresh: PageListing[] = [];
    (jobsData as GlassdoorJobListing[]).forEach((jobData, index) => {
      const id = jobData?.jobview?.job?.listingId;
      if (id !== undefined) {
        const jobUrl = this.jobUrlFor(id);
        if (this.seenUrls.has(jobUrl)) return;
        this.seenUrls.add(jobUrl);
      }
      fresh.push({ jobData, index });
    });
    const skipped = Math.min(skip, fresh.length);
    const { jobs, errors } = await this.enrichWindow(fresh.slice(skipped), want);

    const nextCursor = getCursorForPage(
      resJson?.data?.jobListings?.paginationCursors ?? [],
      pageNum + 1
    );

    return { jobs, skipped, listingCount: jobsData.length, nextCursor, errors };
  }

  /**
   * Enrich listings in board order until `want` jobs are collected or the
   * listings run out. Each batch is sized to the remaining deficit, so a
   * listing that fails to process is replaced by the next one on the page and
   * no listing outside the window is ever fetched.
   */
  private async enrichWindow(
    listings: PageListing[],
    want: number
  ): Promise<{ jobs: JobPost[]; errors: string[] }> {
    const jobs: JobPost[] = [];
    const errors: string[] = [];
    let index = 0;

    while (jobs.length < want && index < listings.length) {
      const batch = listings.slice(index, index + (want - jobs.length));
      index += batch.length;

      const processed = await this.mapWithConcurrency(
        batch,
        this.enrichmentConcurrency,
        async ({ jobData, index: pageIndex }): Promise<JobPost | null> => {
          try {
            return await this.processJob(jobData, errors);
          } catch (e) {
            // A single malformed listing (unexpected nested shape) must not kill
            // the page or the scrape - record and continue. Aborts still propagate.
            if (isAbortError(e)) throw e;
            const id = jobData?.jobview?.job?.listingId ?? `#${pageIndex}`;
            errors.push(`job ${id}: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }
        }
      );
      jobs.push(...processed.filter((job): job is JobPost => job !== null));
    }

    return { jobs, errors };
  }

  /**
   * Map over items with a bounded number of promises in flight at once,
   * preserving input order. Description enrichment fires one detail query per
   * listing, so this caps concurrent queries instead of launching them all
   * simultaneously.
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

  private async getCsrfToken(): Promise<string | null> {
    if (!this.session) return null;

    try {
      const response = await this.session.get(`${this.baseUrl}Job/computer-science-jobs.htm`, {
        signal: this.scraperInput?.signal,
      });
      const pattern = /"token":\s*"([^"]+)"/;
      const htmlData = response.data as string;
      const match = htmlData.match(pattern);
      return match ? match[1] : null;
    } catch (e) {
      // A timeout during CSRF bootstrap must abort promptly, not fall through.
      if (isAbortError(e)) throw e;
      return null;
    }
  }

  /** Canonical listing URL: the dedupe key and the job's public link. */
  private jobUrlFor(jobId: number): string {
    return `${this.baseUrl}job-listing/j?jl=${jobId}`;
  }

  /**
   * Build a JobPost for one listing. A failed description fetch keeps the job
   * (description null) and is recorded in `errors`, the page's error list.
   */
  private async processJob(jobData: GlassdoorJobListing, errors: string[]): Promise<JobPost> {
    const jobId = jobData.jobview.job.listingId;
    const jobUrl = this.jobUrlFor(jobId);

    const job = jobData.jobview;
    const title = job.job.jobTitleText;
    const companyName = job.header.employerNameFromSearch;
    const companyId = job.header.employer.id;
    const locationName = job.header.locationName ?? '';
    const locationTypeVal = job.header.locationType ?? '';
    const ageInDays = job.header.ageInDays;

    let isRemote = false;
    let location = null;

    let datePosted: Date | null = null;
    if (ageInDays !== undefined) {
      datePosted = new Date();
      datePosted.setDate(datePosted.getDate() - ageInDays);
    }

    if (locationTypeVal === 'S') {
      isRemote = true;
    } else {
      location = parseLocation(locationName);
    }

    const compensation = parseCompensation(job.header);

    let description: string | null = null;
    try {
      description = await this.fetchJobDescription(jobId);
    } catch (e) {
      // A cancellation must stop the scrape promptly, so re-throw it. Any other
      // failure keeps the job but is recorded, never swallowed, so the site
      // cannot report 'ok' while enrichment silently failed.
      if (isAbortError(e)) throw e;
      errors.push(
        `job ${jobId}: description fetch failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const companyUrl = `${this.baseUrl}Overview/W-EI_IE${companyId}.htm`;
    const companyLogo = job.overview?.squareLogoUrl ?? null;
    const listingType = (job.header.adOrderSponsorshipLevel ?? '').toLowerCase();

    return {
      id: `gd-${jobId}`,
      title,
      companyUrl: companyId ? companyUrl : null,
      companyName,
      datePosted,
      jobUrl,
      location,
      compensation,
      isRemote,
      description,
      emails: extractEmailsFromText(description),
      companyLogo,
      listingType,
    };
  }

  /**
   * Fetch one listing's description. Throws on any failure (HTTP status,
   * unrecognized shape, transport); processJob decides how to record it.
   * Resolves null only when the listing genuinely carries no description.
   */
  private async fetchJobDescription(jobId: number): Promise<string | null> {
    if (!this.session) return null;

    const url = `${this.baseUrl}graph`;
    const body = [
      {
        operationName: 'JobDetailQuery',
        variables: {
          jl: jobId,
          queryString: 'q',
          pageTypeEnum: 'SERP',
        },
        query: `
          query JobDetailQuery($jl: Long!, $queryString: String, $pageTypeEnum: PageTypeEnum) {
              jobview: jobView(
                  listingId: $jl
                  contextHolder: {queryString: $queryString, pageTypeEnum: $pageTypeEnum}
              ) {
                  job {
                      description
                      __typename
                  }
                  __typename
              }
          }
        `,
      },
    ];

    const response = await this.session.post<GlassdoorDetailResponse[]>(url, body, {
      signal: this.scraperInput?.signal,
    });

    if (response.status < 200 || response.status >= 400) {
      throw new GlassdoorException(
        response.status === 429
          ? 'HTTP 429 (blocked for too many requests)'
          : `HTTP ${response.status}`
      );
    }

    const job = Array.isArray(response.data) ? response.data[0]?.data?.jobview?.job : undefined;
    if (!job) {
      throw new GlassdoorException(
        'JobDetailQuery response shape is unrecognized (schema changed or request blocked)'
      );
    }

    if (typeof job.description !== 'string') return null;
    let desc: string = job.description;

    const format = this.scraperInput?.descriptionFormat;
    if (format === DescriptionFormat.MARKDOWN) {
      desc = markdownConverter(desc) ?? desc;
    } else if (format === DescriptionFormat.PLAIN) {
      desc = plainConverter(desc) ?? desc;
    }
    // DescriptionFormat.HTML leaves the raw HTML as-is.

    return desc;
  }

  private async getLocation(location: string, isRemote: boolean): Promise<LocationResult> {
    if (!location || isRemote) {
      // 11047 is Glassdoor's own "Remote" pseudo-location (STATE-typed), i.e. the remote filter.
      return { locationId: '11047', locationType: 'STATE' };
    }

    if (!this.session) {
      throw new GlassdoorException('Glassdoor session not initialized');
    }

    // This runs before any jobs are collected, so failures throw (honesty):
    // an unrecoverable error must fail the scrape, not return empty.
    const url = `${this.baseUrl}findPopularLocationAjax.htm?maxLocationsToReturn=10&term=${encodeURIComponent(location)}`;
    const response = await this.session.get(url, { signal: this.scraperInput?.signal });

    if (response.status < 200 || response.status >= 400) {
      if (response.status === 429) {
        throw new RateLimitException(
          'Glassdoor',
          'Glassdoor responded with HTTP 429 (blocked for too many requests)'
        );
      }
      throw new GlassdoorException(`Glassdoor responded with status code ${response.status}`);
    }

    const items = response.data as Array<{
      locationId: string;
      locationType: string;
    }>;

    if (!items || items.length === 0) {
      throw new GlassdoorException(`Location '${location}' not found on Glassdoor`);
    }

    let locationType = items[0].locationType;
    if (locationType === 'C') {
      locationType = 'CITY';
    } else if (locationType === 'S') {
      locationType = 'STATE';
    } else if (locationType === 'N') {
      locationType = 'COUNTRY';
    }

    return {
      locationId: items[0].locationId,
      locationType,
    };
  }

  private addPayload(
    locationId: string,
    locationType: string,
    pageNum: number,
    cursor: string | null
  ): string {
    if (!this.scraperInput) return '[]';

    let fromage: number | null = null;
    if (this.scraperInput.hoursOld) {
      fromage = Math.max(Math.floor(this.scraperInput.hoursOld / 24), 1);
    }

    const filterParams: Array<{ filterKey: string; values: string }> = [];

    if (this.scraperInput.easyApply) {
      filterParams.push({ filterKey: 'applicationType', values: '1' });
    }

    if (fromage) {
      filterParams.push({ filterKey: 'fromAge', values: String(fromage) });
    }

    const payload = {
      operationName: 'JobSearchResultsQuery',
      variables: {
        excludeJobListingIds: [],
        filterParams,
        keyword: this.scraperInput.searchTerm,
        numJobsToShow: 30,
        locationType,
        locationId: parseInt(locationId, 10),
        parameterUrlInput: `IL.0,12_I${locationType}${locationId}`,
        pageNumber: pageNum,
        pageCursor: cursor,
        fromage,
        sort: 'date',
      },
      query: QUERY_TEMPLATE,
    };

    if (this.scraperInput.jobType) {
      filterParams.push({
        filterKey: 'jobType',
        values: this.scraperInput.jobType,
      });
    }

    return JSON.stringify([payload]);
  }
}
