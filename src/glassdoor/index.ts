/**
 * Glassdoor Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { AxiosInstance } from 'axios';
import {
  JobPost,
  JobResponse,
  ScraperInput,
  Site,
  Country,
  DescriptionFormat,
  Scraper,
  getGlassdoorUrl,
} from '../model';
import {
  createSession,
  createLogger,
  markdownConverter,
  extractEmailsFromText,
} from '../util';
import { HEADERS, QUERY_TEMPLATE, FALLBACK_TOKEN } from './constant';
import { parseCompensation, parseLocation, getCursorForPage } from './util';

const log = createLogger('Glassdoor');

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
    this.scraperInput = {
      ...input,
      resultsWanted: Math.min(900, input.resultsWanted ?? 15),
    };
    this.seenUrls.clear();

    try {
      this.baseUrl = getGlassdoorUrl(input.country ?? Country.USA);
    } catch {
      this.baseUrl = 'https://www.glassdoor.com/';
    }

    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
      hasRetry: true,
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

    // Get location
    const locationResult = await this.getLocation(
      input.location ?? '',
      input.isRemote ?? false
    );

    if (!locationResult) {
      log.error('Glassdoor: location not parsed');
      return { jobs: [] };
    }

    const { locationId, locationType } = locationResult;
    const jobList: JobPost[] = [];
    let cursor: string | null = null;
    const resultsWanted = this.scraperInput.resultsWanted ?? 15;

    const rangeStart = 1 + Math.floor((input.offset ?? 0) / this.jobsPerPage);
    const totPages = Math.floor(resultsWanted / this.jobsPerPage) + 2;
    const rangeEnd = Math.min(totPages, this.maxPages + 1);

    for (let page = rangeStart; page < rangeEnd; page++) {
      log.info(`search page: ${page} / ${rangeEnd - 1}`);

      try {
        const { jobs, nextCursor } = await this.fetchJobsPage(
          locationId,
          locationType,
          page,
          cursor
        );

        jobList.push(...jobs);

        if (jobs.length === 0 || jobList.length >= resultsWanted) {
          break;
        }

        cursor = nextCursor;
      } catch (e) {
        log.error(`Glassdoor: ${(e as Error).message}`);
        break;
      }
    }

    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async fetchJobsPage(
    locationId: string,
    locationType: string,
    pageNum: number,
    cursor: string | null
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null }> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], nextCursor: null };
    }

    const payload = this.addPayload(locationId, locationType, pageNum, cursor);

    try {
      const response = await this.session.post<GlassdoorApiResponse[]>(
        `${this.baseUrl}graph`,
        payload,
        { timeout: 15000 }
      );

      if (response.status !== 200) {
        log.error(`bad response status code: ${response.status}`);
        return { jobs: [], nextCursor: null };
      }

      const resJson = response.data[0];

      if (resJson.errors) {
        throw new Error('Error encountered in API response');
      }

      const jobsData = resJson.data.jobListings.jobListings;
      const jobs: JobPost[] = [];

      for (const jobData of jobsData) {
        const jobPost = await this.processJob(jobData);
        if (jobPost) {
          jobs.push(jobPost);
        }
      }

      const nextCursor = getCursorForPage(
        resJson.data.jobListings.paginationCursors,
        pageNum + 1
      );

      return { jobs, nextCursor };
    } catch (e) {
      log.error(`Glassdoor: ${(e as Error).message}`);
      return { jobs: [], nextCursor: null };
    }
  }

  private async getCsrfToken(): Promise<string | null> {
    if (!this.session) return null;

    try {
      const response = await this.session.get(
        `${this.baseUrl}Job/computer-science-jobs.htm`
      );
      const pattern = /"token":\s*"([^"]+)"/;
      const htmlData = response.data as string;
      const match = htmlData.match(pattern);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private async processJob(
    jobData: GlassdoorJobListing
  ): Promise<JobPost | null> {
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
    } catch {
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
      const response = await this.session.post(url, body);

      if (response.status !== 200) {
        return null;
      }

      const data = response.data as Array<{
        data: { jobview: { job: { description: string } } };
      }>;
      let desc = data[0].data.jobview.job.description;

      if (this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN) {
        desc = markdownConverter(desc) ?? desc;
      }

      return desc;
    } catch {
      return null;
    }
  }

  private async getLocation(
    location: string,
    isRemote: boolean
  ): Promise<LocationResult | null> {
    if (!location || isRemote) {
      return { locationId: '11047', locationType: 'STATE' };
    }

    if (!this.session) return null;

    try {
      const url = `${this.baseUrl}findPopularLocationAjax.htm?maxLocationsToReturn=10&term=${encodeURIComponent(location)}`;
      const response = await this.session.get(url);

      if (response.status !== 200) {
        if (response.status === 429) {
          log.error('429 Response - Blocked by Glassdoor for too many requests');
        } else {
          log.error(`Glassdoor response status code ${response.status}`);
        }
        return null;
      }

      const items = response.data as Array<{
        locationId: string;
        locationType: string;
      }>;

      if (!items || items.length === 0) {
        throw new Error(`Location '${location}' not found on Glassdoor`);
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
    } catch (e) {
      log.error(`Error getting location: ${(e as Error).message}`);
      return null;
    }
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

export default Glassdoor;
