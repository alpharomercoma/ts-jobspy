import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Scraper } from '../models';
import {
  Compensation,
  CompensationInterval,
  Country,
  DescriptionFormat,
  JobPost,
  JobResponse,
  JobType,
  Location,
  ScraperConfig,
  ScraperInput,
  Site
} from '../types';
import { createLogger, extractEmailsFromText, markdownConverter } from '../utils';

const logger = createLogger('Glassdoor');

interface GlassdoorLocation {
  locationId: number;
  locationType: string;
}

interface GlassdoorJobData {
  jobview: {
    job: {
      listingId: string;
      jobTitleText: string;
    };
    header: {
      employerNameFromSearch: string;
      employer?: { id: string; };
      locationName?: string;
      locationType?: string;
      ageInDays?: number;
    };
    overview?: {
      squareLogoUrl?: string;
    };
  };
}

// interface _GlassdoorCompensation { // Unused interface
//   salaryRange?: {
//     min?: number;
//     max?: number;
//     currency?: string;
//     payPeriod?: string;
//   };
// }

const FALLBACK_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";

const QUERY_TEMPLATE = `
  query JobSearchResultsQuery(
    $excludeJobListingIds: [Long!]
    $filterParams: [FilterParams]
    $keyword: String
    $numJobsToShow: Int!
    $locationType: String!
    $locationId: Int!
    $parameterUrlInput: String!
    $pageNumber: Int!
    $pageCursor: String
    $fromage: Int
    $sort: String
  ) {
    jobListings: jobListings(
      contextHolder: {
        searchParams: {
          excludeJobListingIds: $excludeJobListingIds
          filterParams: $filterParams
          keyword: $keyword
          numJobsToShow: $numJobsToShow
          locationType: $locationType
          locationId: $locationId
          parameterUrlInput: $parameterUrlInput
          pageNumber: $pageNumber
          pageCursor: $pageCursor
          fromage: $fromage
          sort: $sort
        }
      }
    ) {
      jobListings {
        ...JobView
      }
      paginationCursors {
        cursor
        pageNumber
      }
    }
  }

  fragment JobView on JobListingSearchResult {
    jobview: jobView {
      job {
        listingId
        jobTitleText
      }
      header {
        employerNameFromSearch
        employer {
          id
        }
        locationName
        locationType
        ageInDays
        adOrderSponsorshipLevel
      }
      overview {
        squareLogoUrl
      }
    }
  }
`;

export class GlassdoorScraper extends Scraper {
  private session: AxiosInstance;
  private baseUrl: string = '';
  private seenUrls: Set<string> = new Set();
  private jobsPerPage = 30;
  private maxPages = 30;

  constructor (config: ScraperConfig = {}) {
    super(Site.GLASSDOOR, config);

    this.session = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      }
    });

    if (config.proxies) {
      // Configure proxy if provided
      const proxy = Array.isArray(config.proxies) ? config.proxies[0] : config.proxies;
      if (proxy) {
        const proxyUrl = new URL(proxy);
        this.session.defaults.proxy = {
          host: proxyUrl.hostname,
          port: parseInt(proxyUrl.port),
          protocol: proxyUrl.protocol.replace(':', ''),
        };
      }
    }
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    try {
      this.baseUrl = this.getGlassdoorUrl(input.country || Country.USA);

      // Get CSRF token
      const token = await this.extractCsrfToken();
      this.session.defaults.headers['gd-csrf-token'] = token || FALLBACK_TOKEN;

      // Get location info
      const locationInfo = await this.getLocation(input.location, input.isRemote);
      if (!locationInfo) {
        logger.error('Location not found');
        return { jobs: [] };
      }

      const jobs: JobPost[] = [];
      let cursor: string | null = null;
      const maxResults = Math.min(900, input.resultsWanted || 15);

      const rangeStart = 1 + Math.floor((input.offset || 0) / this.jobsPerPage);
      const totalPages = Math.ceil(maxResults / this.jobsPerPage) + 1;
      const rangeEnd = Math.min(totalPages, this.maxPages + 1);

      for (let page = rangeStart; page < rangeEnd; page++) {
        logger.info(`Scraping page ${page}/${rangeEnd - 1}`);

        try {
          const { jobs: pageJobs, nextCursor } = await this.fetchJobsPage(
            input,
            locationInfo,
            page,
            cursor
          );

          jobs.push(...pageJobs);
          cursor = nextCursor;

          if (!pageJobs.length || jobs.length >= maxResults) {
            break;
          }
        } catch (error) {
          logger.error(`Error on page ${page}:`, error);
          break;
        }
      }

      return { jobs: jobs.slice(0, maxResults) };
    } catch (error) {
      logger.error('Glassdoor scraping failed:', error);
      return { jobs: [] };
    }
  }

  private async extractCsrfToken(): Promise<string | null> {
    try {
      const response = await this.session.get(`${this.baseUrl}/Job/computer-science-jobs.htm`);
      const tokenMatch = response.data.match(/"token":\s*"([^"]+)"/);
      return tokenMatch ? tokenMatch[1] : null;
    } catch (error) {
      logger.warn('Failed to get CSRF token:', error);
      return null;
    }
  }

  private async getLocation(location?: string, isRemote?: boolean): Promise<GlassdoorLocation | null> {
    if (!location || isRemote) {
      return { locationId: 11047, locationType: 'STATE' }; // Remote options
    }

    try {
      const url = `${this.baseUrl}/findPopularLocationAjax.htm?maxLocationsToReturn=10&term=${encodeURIComponent(location)}`;
      const response = await this.session.get(url);

      if (response.status === 429) {
        logger.error('Rate limited by Glassdoor');
        return null;
      }

      if (!response.data || !response.data.length) {
        throw new Error(`Location '${location}' not found`);
      }

      const item = response.data[0];
      let locationType = item.locationType;

      if (locationType === 'C') locationType = 'CITY';
      else if (locationType === 'S') locationType = 'STATE';
      else if (locationType === 'N') locationType = 'COUNTRY';

      return {
        locationId: parseInt(item.locationId),
        locationType
      };
    } catch (error) {
      logger.error('Failed to get location:', error);
      return null;
    }
  }

  private async fetchJobsPage(
    input: ScraperInput,
    locationInfo: GlassdoorLocation,
    pageNum: number,
    cursor: string | null
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null; }> {
    const payload = this.buildPayload(input, locationInfo, pageNum, cursor);

    try {
      const response: AxiosResponse = await this.session.post(
        `${this.baseUrl}/graph`,
        [payload]
      );

      if (response.status !== 200) {
        throw new Error(`Bad response status: ${response.status}`);
      }

      const resJson = response.data[0];
      if (resJson.errors) {
        throw new Error('API returned errors');
      }

      const jobsData: GlassdoorJobData[] = resJson.data.jobListings.jobListings;
      const jobs = await Promise.all(
        jobsData.map(jobData => this.processJob(jobData, input))
      );

      const validJobs = jobs.filter(job => job !== null) as JobPost[];
      const nextCursor = this.getCursorForPage(
        resJson.data.jobListings.paginationCursors,
        pageNum + 1
      );

      return { jobs: validJobs, nextCursor };
    } catch (error) {
      logger.error('Failed to fetch jobs page:', error);
      return { jobs: [], nextCursor: null };
    }
  }

  private async processJob(jobData: GlassdoorJobData, input: ScraperInput): Promise<JobPost | null> {
    const jobId = jobData.jobview.job.listingId;
    const jobUrl = `${this.baseUrl}/job-listing/j?jl=${jobId}`;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

    const job = jobData.jobview;
    const title = job.job.jobTitleText;
    const companyName = job.header.employerNameFromSearch;
    const companyId = job.header.employer?.id;
    const locationName = job.header.locationName || '';
    const locationType = job.header.locationType || '';
    const ageInDays = job.header.ageInDays;

    let isRemote = false;
    let location: Location | undefined;
    let datePosted: string | undefined;

    if (ageInDays !== undefined) {
      const date = new Date();
      date.setDate(date.getDate() - ageInDays);
      datePosted = date.toISOString().split('T')[0];
    }

    if (locationType === 'S') {
      isRemote = true;
    } else {
      location = this.parseLocation(locationName);
    }

    const compensation = this.parseCompensation(job.header);

    let description: string | undefined;
    try {
      description = await this.fetchJobDescription(jobId, input.descriptionFormat);
    } catch (error) {
      logger.warn(`Failed to fetch description for job ${jobId}:`, error);
    }

    const companyUrl = companyId ? `${this.baseUrl}/Overview/W-EI_IE${companyId}.htm` : undefined;
    const companyLogo = job.overview?.squareLogoUrl;
    const listingType = (job.header as { adOrderSponsorshipLevel?: string; }).adOrderSponsorshipLevel?.toLowerCase() || '';

    return {
      id: `gd-${jobId}`,
      title,
      companyName,
      jobUrl,
      companyUrl,
      location,
      description,
      compensation,
      datePosted,
      isRemote,
      emails: description ? extractEmailsFromText(description) || undefined : undefined,
      companyLogo,
      listingType,
    };
  }

  private async fetchJobDescription(jobId: string, format?: DescriptionFormat): Promise<string | undefined> {
    const payload = {
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
    };

    try {
      const response = await this.session.post(`${this.baseUrl}/graph`, [payload]);

      if (response.status !== 200) {
        return undefined;
      }

      const data = response.data[0];
      let description = data.data.jobview.job.description;

      if (format === DescriptionFormat.MARKDOWN && description) {
        description = markdownConverter(description);
      }

      return description;
    } catch (error) {
      logger.warn('Failed to fetch job description:', error);
      return undefined;
    }
  }

  private buildPayload(
    input: ScraperInput,
    locationInfo: GlassdoorLocation,
    pageNum: number,
    cursor: string | null
  ): object {
    const fromage = input.hoursOld ? Math.max(Math.floor(input.hoursOld / 24), 1) : undefined;
    const filterParams: Array<{ filterKey: string; values: string | string[]; }> = [];

    if (input.easyApply) {
      filterParams.push({ filterKey: 'applicationType', values: '1' });
    }

    if (fromage) {
      filterParams.push({ filterKey: 'fromAge', values: fromage.toString() });
    }

    if (input.jobType) {
      const jobTypeValues = this.mapJobTypeToGlassdoor(input.jobType);
      if (jobTypeValues) {
        filterParams.push({
          filterKey: 'jobType',
          values: jobTypeValues
        });
      }
    }

    return {
      operationName: 'JobSearchResultsQuery',
      variables: {
        excludeJobListingIds: [],
        filterParams,
        keyword: input.searchTerm || '',
        numJobsToShow: this.jobsPerPage,
        locationType: locationInfo.locationType,
        locationId: locationInfo.locationId,
        parameterUrlInput: `IL.0,12_I${locationInfo.locationType}${locationInfo.locationId}`,
        pageNumber: pageNum,
        pageCursor: cursor,
        sort: 'date',
      },
      query: QUERY_TEMPLATE,
    };
  }

  private parseLocation(locationData: string): Location {
    const locationName = locationData;
    const parts = locationName.split(', ');
    const location: Location = {};

    if (parts.length >= 1) location.city = parts[0];
    if (parts.length >= 2) location.state = parts[1];
    if (parts.length >= 3) location.country = parts[2];

    return location;
  }

  private parseCompensation(jobElement: Record<string, unknown>): Compensation | undefined {
    // Glassdoor compensation parsing logic
    const salaryRange = jobElement.salaryRange as any;
    if (!salaryRange) return undefined;

    return {
      minAmount: salaryRange.min,
      maxAmount: salaryRange.max,
      currency: salaryRange.currency || 'USD',
      interval: this.mapPayPeriodToInterval(salaryRange.payPeriod),
    };
  }

  private mapPayPeriodToInterval(payPeriod?: string): CompensationInterval {
    switch (payPeriod?.toLowerCase()) {
      case 'yearly':
      case 'annual':
        return CompensationInterval.YEARLY;
      case 'monthly':
        return CompensationInterval.MONTHLY;
      case 'weekly':
        return CompensationInterval.WEEKLY;
      case 'daily':
        return CompensationInterval.DAILY;
      case 'hourly':
        return CompensationInterval.HOURLY;
      default:
        return CompensationInterval.YEARLY;
    }
  }

  private mapJobTypeToGlassdoor(jobType: JobType): string[] | undefined {
    const mapping: Partial<Record<JobType, string[]>> = {
      [JobType.FULL_TIME]: ['FULL_TIME'],
      [JobType.PART_TIME]: ['PART_TIME'],
      [JobType.CONTRACT]: ['CONTRACT'],
      [JobType.TEMPORARY]: ['TEMPORARY'],
      [JobType.INTERNSHIP]: ['INTERNSHIP'],
    };

    return mapping[jobType];
  }

  private getCursorForPage(cursors: Array<{ pageNumber: number; cursor: string; }>, pageNumber: number): string | null {
    const cursor = cursors.find(c => c.pageNumber === pageNumber);
    return cursor ? cursor.cursor : null;
  }

  private getGlassdoorUrl(country: Country): string {
    const urls: Partial<Record<Country, string>> = {
      [Country.USA]: 'https://www.glassdoor.com',
      [Country.UK]: 'https://www.glassdoor.co.uk',
      [Country.CANADA]: 'https://www.glassdoor.ca',
      [Country.AUSTRALIA]: 'https://www.glassdoor.com.au',
      [Country.GERMANY]: 'https://www.glassdoor.de',
      [Country.FRANCE]: 'https://www.glassdoor.fr',
      [Country.NETHERLANDS]: 'https://www.glassdoor.nl',
      [Country.SPAIN]: 'https://www.glassdoor.es',
      [Country.ITALY]: 'https://www.glassdoor.it',
      [Country.SWITZERLAND]: 'https://www.glassdoor.ch',
      [Country.AUSTRIA]: 'https://www.glassdoor.at',
      [Country.BELGIUM]: 'https://www.glassdoor.be',
      [Country.IRELAND]: 'https://www.glassdoor.ie',
      [Country.BRAZIL]: 'https://www.glassdoor.com.br',
      [Country.MEXICO]: 'https://www.glassdoor.com.mx',
      [Country.ARGENTINA]: 'https://www.glassdoor.com.ar',
      [Country.INDIA]: 'https://www.glassdoor.co.in',
      [Country.SINGAPORE]: 'https://www.glassdoor.sg',
      [Country.HONG_KONG]: 'https://www.glassdoor.com.hk',
      [Country.NEW_ZEALAND]: 'https://www.glassdoor.co.nz',
    };

    return urls[country] || urls[Country.USA] || 'https://www.glassdoor.com';
  }
}
