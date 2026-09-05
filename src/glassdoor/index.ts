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

interface LocationResult {
  locationId: string;
  locationType: string;
}

export class Glassdoor implements Scraper {
  site = Site.GLASSDOOR;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly jobsPerPage = 30;
  private readonly maxPages = 30;

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
    // and the final slice guarantees we never return more than requested.
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
    let cursor: string | null = null;
    const resultsWanted = input.resultsWanted ?? 15;

    // Glassdoor paginates in fixed-size pages. Honor offset exactly: start at
    // the page that contains it, collect the intra-page remainder plus the
    // requested count, then slice [skip, skip + resultsWanted] at the end.
    const offset = input.offset ?? 0;
    const rangeStart = 1 + Math.floor(offset / this.jobsPerPage);
    const skip = offset % this.jobsPerPage;
    const target = skip + resultsWanted;
    // End page accounts for the starting page (the previous code computed the
    // span from page 1 and ignored rangeStart), capped at the site's max pages.
    const pagesNeeded = Math.ceil(target / this.jobsPerPage);
    const rangeEnd = Math.min(rangeStart + pagesNeeded, this.maxPages + 1);

    for (let page = rangeStart; page < rangeEnd; page++) {
      log.info(`search page: ${page} / ${rangeEnd - 1}`);

      let jobs: JobPost[];
      let nextCursor: string | null;
      let pageErrors: string[];
      try {
        ({
          jobs,
          nextCursor,
          errors: pageErrors,
        } = await this.fetchJobsPage(locationId, locationType, page, cursor));
      } catch (e) {
        // Nothing collected yet: the whole scrape failed. Partially collected:
        // report what we have, but record the interruption honestly.
        if (jobList.length === 0) throw e;
        errors.push(`page ${page}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }

      jobList.push(...jobs);
      errors.push(...pageErrors);

      if (jobs.length === 0 || jobList.length >= target) {
        break;
      }

      // No further cursor (or the API returned the same one): stop paginating.
      // maxPages remains a backstop via rangeEnd.
      if (!nextCursor || nextCursor === cursor) {
        break;
      }

      cursor = nextCursor;
    }

    return {
      jobs: jobList.slice(skip, skip + resultsWanted),
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

  private async fetchJobsPage(
    locationId: string,
    locationType: string,
    pageNum: number,
    cursor: string | null
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null; errors: string[] }> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], nextCursor: null, errors: [] };
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

    // A structurally-thin 200 (missing data path) yields an empty page rather
    // than a TypeError, so the site reports 'empty' instead of failing.
    const jobsData = resJson?.data?.jobListings?.jobListings ?? [];
    const jobs: JobPost[] = [];
    const errors: string[] = [];

    for (let i = 0; i < jobsData.length; i++) {
      const jobData = jobsData[i];
      try {
        const jobPost = await this.processJob(jobData);
        if (jobPost) {
          jobs.push(jobPost);
        }
      } catch (e) {
        // A single malformed listing (unexpected nested shape) must not kill the
        // page or the scrape - record and continue. Aborts still propagate.
        if (isAbortError(e)) throw e;
        const id = jobData?.jobview?.job?.listingId ?? `#${i}`;
        errors.push(`job ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const nextCursor = getCursorForPage(
      resJson?.data?.jobListings?.paginationCursors ?? [],
      pageNum + 1
    );

    return { jobs, nextCursor, errors };
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

  private async processJob(jobData: GlassdoorJobListing): Promise<JobPost | null> {
    const jobId = jobData.jobview.job.listingId;
    const jobUrl = `${this.baseUrl}job-listing/j?jl=${jobId}`;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

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
      // A single job's description failing must not fail the whole scrape, but a
      // cancellation must stop it promptly - re-throw aborts so the page loop
      // propagates them.
      if (isAbortError(e)) throw e;
      description = null;
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

    try {
      const response = await this.session.post(url, body, { signal: this.scraperInput?.signal });

      if (response.status < 200 || response.status >= 400) {
        return null;
      }

      const data = response.data as Array<{
        data: { jobview: { job: { description: string } } };
      }>;
      let desc = data[0].data.jobview.job.description;

      const format = this.scraperInput?.descriptionFormat;
      if (format === DescriptionFormat.MARKDOWN) {
        desc = markdownConverter(desc) ?? desc;
      } else if (format === DescriptionFormat.PLAIN) {
        desc = plainConverter(desc) ?? desc;
      }
      // DescriptionFormat.HTML leaves the raw HTML as-is.

      return desc;
    } catch (e) {
      // Propagate cancellation; treat any other failure as a missing description.
      if (isAbortError(e)) throw e;
      return null;
    }
  }

  private async getLocation(location: string, isRemote: boolean): Promise<LocationResult> {
    if (!location || isRemote) {
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
