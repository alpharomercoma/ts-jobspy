/**
 * Indeed Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { AxiosInstance } from 'axios';
import {
  JobPost,
  JobResponse,
  Location,
  ScraperInput,
  Site,
  JobType,
  Country,
  DescriptionFormat,
  Scraper,
  getIndeedDomainValue,
} from '../model';
import {
  createSession,
  createLogger,
  markdownConverter,
  extractEmailsFromText,
} from '../util';
import { JOB_SEARCH_QUERY, API_HEADERS } from './constant';
import { getJobType, getCompensation, isJobRemote } from './util';

const log = createLogger('Indeed');

interface IndeedJobData {
  key: string;
  title: string;
  datePublished: number;
  description: { html: string };
  location: {
    city?: string;
    admin1Code?: string;
    countryCode?: string;
    formatted: { long: string };
  };
  compensation: {
    baseSalary?: unknown;
    estimated?: unknown;
    currencyCode?: string;
  };
  attributes: Array<{ key: string; label: string }>;
  employer?: {
    name?: string;
    relativeCompanyPageUrl?: string;
    dossier?: {
      employerDetails?: {
        addresses?: string[];
        industry?: string;
        employeesLocalizedLabel?: string;
        revenueLocalizedLabel?: string;
        briefDescription?: string;
      };
      images?: {
        squareLogoUrl?: string;
      };
      links?: {
        corporateWebsite?: string;
      };
    };
  };
  recruit?: {
    viewJobUrl?: string;
  };
}

interface IndeedSearchResult {
  job: IndeedJobData;
}

interface IndeedApiResponse {
  data: {
    jobSearch: {
      results: IndeedSearchResult[];
      pageInfo: {
        nextCursor: string | null;
      };
    };
  };
}

export class Indeed implements Scraper {
  site = Site.INDEED;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly apiUrl = 'https://apis.indeed.com/graphql';
  private readonly jobsPerPage = 100;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private seenUrls = new Set<string>();
  private headers: Record<string, string> = {};
  private apiCountryCode = '';
  private baseUrl = '';

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.scraperInput = input;
    this.seenUrls.clear();

    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
    });

    const { domain, apiCode } = getIndeedDomainValue(
      input.country ?? Country.USA
    );
    this.apiCountryCode = apiCode;
    this.baseUrl = `https://${domain}.indeed.com`;

    this.headers = { ...API_HEADERS };
    this.headers['indeed-co'] = apiCode;

    const jobList: JobPost[] = [];
    let page = 1;
    let cursor: string | null = null;
    const resultsWanted = input.resultsWanted ?? 15;
    const offset = input.offset ?? 0;

    while (this.seenUrls.size < resultsWanted + offset) {
      log.info(
        `search page: ${page} / ${Math.ceil(resultsWanted / this.jobsPerPage)}`
      );

      const { jobs, nextCursor } = await this.scrapePage(cursor);

      if (!jobs || jobs.length === 0) {
        log.info(`found no jobs on page: ${page}`);
        break;
      }

      jobList.push(...jobs);
      cursor = nextCursor;
      page += 1;

      if (!nextCursor) break;
    }

    return {
      jobs: jobList.slice(offset, offset + resultsWanted),
    };
  }

  private async scrapePage(
    cursor: string | null
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null }> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], nextCursor: null };
    }

    const filters = this.buildFilters();
    const searchTerm = this.scraperInput.searchTerm?.replace(/"/g, '\\"') ?? '';

    const query = JOB_SEARCH_QUERY.replace(
      '{what}',
      searchTerm ? `what: "${searchTerm}"` : ''
    )
      .replace(
        '{location}',
        this.scraperInput.location
          ? `location: {where: "${this.scraperInput.location}", radius: ${this.scraperInput.distance ?? 50}, radiusUnit: MILES}`
          : ''
      )
      .replace('{cursor}', cursor ? `cursor: "${cursor}"` : '')
      .replace('{filters}', filters);

    const payload = { query };

    const headersTemp = { ...API_HEADERS };
    headersTemp['indeed-co'] = this.apiCountryCode;

    try {
      const response = await this.session.post<IndeedApiResponse>(
        this.apiUrl,
        payload,
        {
          headers: headersTemp,
          timeout: 10000,
        }
      );

      if (response.status < 200 || response.status >= 400) {
        log.info(
          `responded with status code: ${response.status} (submit GitHub issue if this appears to be a bug)`
        );
        return { jobs: [], nextCursor: null };
      }

      const data = response.data;
      const jobs = data.data.jobSearch.results;
      const nextCursor = data.data.jobSearch.pageInfo.nextCursor;

      const jobList: JobPost[] = [];
      for (const result of jobs) {
        const processedJob = this.processJob(result.job);
        if (processedJob) {
          jobList.push(processedJob);
        }
      }

      return { jobs: jobList, nextCursor };
    } catch (e) {
      log.error(`Indeed API error: ${(e as Error).message}`);
      return { jobs: [], nextCursor: null };
    }
  }

  private buildFilters(): string {
    if (!this.scraperInput) return '';

    if (this.scraperInput.hoursOld) {
      return `
        filters: {
          date: {
            field: "dateOnIndeed",
            start: "${this.scraperInput.hoursOld}h"
          }
        }
      `;
    }

    if (this.scraperInput.easyApply) {
      return `
        filters: {
          keyword: {
            field: "indeedApplyScope",
            keys: ["DESKTOP"]
          }
        }
      `;
    }

    if (this.scraperInput.jobType || this.scraperInput.isRemote) {
      const jobTypeKeyMapping: Partial<Record<JobType, string>> = {
        [JobType.FULL_TIME]: 'CF3CP',
        [JobType.PART_TIME]: '75GKK',
        [JobType.CONTRACT]: 'NJXCK',
        [JobType.INTERNSHIP]: 'VDTG7',
      };

      const keys: string[] = [];

      if (this.scraperInput.jobType) {
        const key = jobTypeKeyMapping[this.scraperInput.jobType];
        if (key) keys.push(key);
      }

      if (this.scraperInput.isRemote) {
        keys.push('DSQF7');
      }

      if (keys.length > 0) {
        const keysStr = keys.map((k) => `"${k}"`).join(', ');
        return `
          filters: {
            composite: {
              filters: [{
                keyword: {
                  field: "attributes",
                  keys: [${keysStr}]
                }
              }]
            }
          }
        `;
      }
    }

    return '';
  }

  private processJob(job: IndeedJobData): JobPost | null {
    const jobUrl = `${this.baseUrl}/viewjob?jk=${job.key}`;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

    let description = job.description.html;
    if (this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN) {
      description = markdownConverter(description) ?? description;
    }

    const jobType = getJobType(job.attributes);
    const timestampSeconds = job.datePublished / 1000;
    const datePosted = new Date(timestampSeconds * 1000);

    const employer = job.employer?.dossier;
    const employerDetails = employer?.employerDetails ?? {};
    const relUrl = job.employer?.relativeCompanyPageUrl;

    const location: Location = {
      city: job.location.city,
      state: job.location.admin1Code,
      country: job.location.countryCode,
    };

    let companyIndustry: string | undefined;
    if (employerDetails.industry) {
      companyIndustry = employerDetails.industry
        .replace('Iv1', '')
        .replace(/_/g, ' ')
        .trim();
      companyIndustry =
        companyIndustry.charAt(0).toUpperCase() + companyIndustry.slice(1);
    }

    return {
      id: `in-${job.key}`,
      title: job.title,
      description,
      companyName: job.employer?.name ?? null,
      companyUrl: relUrl ? `${this.baseUrl}${relUrl}` : null,
      companyUrlDirect: employer?.links?.corporateWebsite,
      location,
      jobType,
      compensation: getCompensation(job.compensation as Parameters<typeof getCompensation>[0]),
      datePosted,
      jobUrl,
      jobUrlDirect: job.recruit?.viewJobUrl,
      emails: extractEmailsFromText(description),
      isRemote: isJobRemote(
        {
          attributes: job.attributes,
          location: { formatted: job.location.formatted },
        },
        description
      ),
      companyAddresses: employerDetails.addresses?.[0],
      companyIndustry,
      companyNumEmployees: employerDetails.employeesLocalizedLabel,
      companyRevenue: employerDetails.revenueLocalizedLabel,
      companyDescription: employerDetails.briefDescription,
      companyLogo: employer?.images?.squareLogoUrl,
    };
  }
}

export default Indeed;
