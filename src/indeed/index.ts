/**
 * Indeed Scraper
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
  JobType,
  Country,
  DescriptionFormat,
  type Scraper,
  getIndeedDomainValue,
} from '../model';
import { IndeedException, RateLimitException } from '../exception';
import {
  createSession,
  createLogger,
  markdownConverter,
  plainConverter,
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
  data?: {
    jobSearch?: {
      results?: IndeedSearchResult[];
      pageInfo?: {
        nextCursor?: string | null;
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

    const { domain, apiCode } = getIndeedDomainValue(input.country ?? Country.USA);
    this.apiCountryCode = apiCode;
    this.baseUrl = `https://${domain}.indeed.com`;

    this.headers = { ...API_HEADERS };
    this.headers['indeed-co'] = apiCode;

    const jobList: JobPost[] = [];
    const errors: string[] = [];
    let page = 1;
    let cursor: string | null = null;
    const resultsWanted = input.resultsWanted ?? 15;
    const offset = input.offset ?? 0;
    // Don't fetch a full 100-row page (each with descriptions + employer
    // dossiers) when far fewer jobs are needed.
    const pageSize = Math.min(this.jobsPerPage, resultsWanted + offset);

    while (this.seenUrls.size < resultsWanted + offset) {
      log.info(`search page: ${page} / ${Math.ceil((resultsWanted + offset) / pageSize)}`);

      let jobs: JobPost[];
      let nextCursor: string | null;
      try {
        ({ jobs, nextCursor } = await this.scrapePage(cursor, pageSize));
      } catch (e) {
        // Nothing collected yet: the whole scrape failed. Partially collected:
        // report what we have, but record the interruption honestly.
        if (jobList.length === 0) throw e;
        errors.push(`page ${page}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }

      if (!jobs || jobs.length === 0) {
        log.info(`found no jobs on page: ${page}`);
        break;
      }

      jobList.push(...jobs);
      cursor = nextCursor;
      page += 1;

      if (!nextCursor) break;
    }

    const dropped = this.buildFilters().dropped;
    return {
      jobs: jobList.slice(offset, offset + resultsWanted),
      ...(errors.length > 0 && { errors }),
      ...(dropped.length > 0 && { unsupportedOptions: dropped }),
    };
  }

  private async scrapePage(
    cursor: string | null,
    pageSize: number
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null }> {
    if (!this.session || !this.scraperInput) {
      return { jobs: [], nextCursor: null };
    }

    const { filters } = this.buildFilters();
    // GraphQL string literals follow JSON string rules, so JSON.stringify
    // yields a correctly escaped, quoted literal - safe against quotes,
    // backslashes, and newlines in user-supplied searchTerm/location.
    const whatArg = this.scraperInput.searchTerm
      ? `what: ${JSON.stringify(this.scraperInput.searchTerm)}`
      : '';
    const locationArg = this.scraperInput.location
      ? `location: {where: ${JSON.stringify(this.scraperInput.location)}, radius: ${this.scraperInput.distance ?? 50}, radiusUnit: MILES}`
      : '';

    const query = JOB_SEARCH_QUERY.replace('{what}', whatArg)
      .replace('{location}', locationArg)
      .replace('{limit}', String(pageSize))
      .replace('{cursor}', cursor ? `cursor: "${cursor}"` : '')
      .replace('{filters}', filters);

    const payload = { query };

    // Indeed's mobile GraphQL API requires its specific app user-agent as part
    // of the handshake (a custom UA yields HTTP 403), so userAgent is
    // deliberately not applied here - see the userAgent option docs.
    const headersTemp = { ...API_HEADERS };
    headersTemp['indeed-co'] = this.apiCountryCode;

    try {
      const response = await this.session.post<IndeedApiResponse>(this.apiUrl, payload, {
        headers: headersTemp,
        timeout: 10000,
        signal: this.scraperInput.signal,
      });

      if (response.status < 200 || response.status >= 400) {
        if (response.status === 429) {
          throw new RateLimitException('Indeed', 'Indeed responded with HTTP 429 (rate limited)');
        }
        throw new IndeedException(`Indeed API responded with status code ${response.status}`);
      }

      const data = response.data;
      const jobs = data.data?.jobSearch?.results;
      const nextCursor = data.data?.jobSearch?.pageInfo?.nextCursor ?? null;
      if (!Array.isArray(jobs)) {
        throw new IndeedException('Indeed API response is missing jobSearch results (API change?)');
      }

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
      throw e;
    }
  }

  /**
   * Build the GraphQL filter block. Indeed's API accepts only ONE filter group
   * per search, so when the caller sets more than one we apply a fixed
   * precedence (hoursOld > easyApply > jobType/isRemote) and report the dropped
   * ones in `dropped` so the orchestrator can surface them in
   * meta.sites[].unsupportedOptions instead of dropping them silently.
   */
  private buildFilters(): { filters: string; dropped: string[] } {
    const input = this.scraperInput;
    if (!input) return { filters: '', dropped: [] };

    // jobType and isRemote share one group, so they never drop each other.
    const set: string[] = [];
    if (input.hoursOld) set.push('hoursOld');
    if (input.easyApply) set.push('easyApply');
    if (input.jobType) set.push('jobType');
    if (input.isRemote) set.push('isRemote');
    const droppedExcept = (kept: string[]) => set.filter((f) => !kept.includes(f));

    if (input.hoursOld) {
      return {
        filters: `
        filters: {
          date: {
            field: "dateOnIndeed",
            start: "${input.hoursOld}h"
          }
        }
      `,
        dropped: droppedExcept(['hoursOld']),
      };
    }

    if (input.easyApply) {
      return {
        filters: `
        filters: {
          keyword: {
            field: "indeedApplyScope",
            keys: ["DESKTOP"]
          }
        }
      `,
        dropped: droppedExcept(['easyApply']),
      };
    }

    if (input.jobType || input.isRemote) {
      const jobTypeKeyMapping: Partial<Record<JobType, string>> = {
        [JobType.FULL_TIME]: 'CF3CP',
        [JobType.PART_TIME]: '75GKK',
        [JobType.CONTRACT]: 'NJXCK',
        [JobType.INTERNSHIP]: 'VDTG7',
      };

      const keys: string[] = [];

      if (input.jobType) {
        const key = jobTypeKeyMapping[input.jobType];
        if (key) keys.push(key);
      }

      if (input.isRemote) {
        keys.push('DSQF7');
      }

      if (keys.length > 0) {
        const keysStr = keys.map((k) => `"${k}"`).join(', ');
        return {
          filters: `
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
        `,
          dropped: droppedExcept(['jobType', 'isRemote']),
        };
      }
    }

    return { filters: '', dropped: [] };
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
    } else if (this.scraperInput?.descriptionFormat === DescriptionFormat.PLAIN) {
      description = plainConverter(description) ?? description;
    }
    // DescriptionFormat.HTML leaves the cleaned HTML as-is.

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
      companyIndustry = employerDetails.industry.replace('Iv1', '').replace(/_/g, ' ').trim();
      companyIndustry = companyIndustry.charAt(0).toUpperCase() + companyIndustry.slice(1);
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
