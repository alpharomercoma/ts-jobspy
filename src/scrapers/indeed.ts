import { CountryHelper, JobTypeHelper, Scraper } from '../models';
import {
  Compensation,
  CompensationInterval,
  DescriptionFormat,
  JobPost,
  JobResponse,
  JobType,
  Location,
  ScraperInput,
  Site,
} from '../types';
import { MarkdownConverter, SessionManager, createLogger, extractEmailsFromText } from '../utils';

const logger = createLogger('Indeed');

const JOB_SEARCH_QUERY = `
  query GetJobData {
    jobSearch(
      {what}
      {location}
      limit: 100
      {cursor}
      sort: RELEVANCE
      {filters}
    ) {
      pageInfo {
        nextCursor
      }
      results {
        trackingKey
        job {
          source {
            name
          }
          key
          title
          datePublished
          dateOnIndeed
          description {
            html
          }
          location {
            countryName
            countryCode
            admin1Code
            city
            postalCode
            streetAddress
            formatted {
              short
              long
            }
          }
          compensation {
            estimated {
              currencyCode
              baseSalary {
                unitOfWork
                range {
                  ... on Range {
                    min
                    max
                  }
                }
              }
            }
            baseSalary {
              unitOfWork
              range {
                ... on Range {
                  min
                  max
                }
              }
            }
            currencyCode
          }
          attributes {
            key
            label
          }
          employer {
            relativeCompanyPageUrl
            name
            dossier {
              employerDetails {
                addresses
                industry
                employeesLocalizedLabel
                revenueLocalizedLabel
                briefDescription
                ceoName
                ceoPhotoUrl
              }
              images {
                headerImageUrl
                squareLogoUrl
              }
              links {
                corporateWebsite
              }
            }
          }
          recruit {
            viewJobUrl
            detailedSalary
            workSchedule
          }
        }
      }
    }
  }
`;

const API_HEADERS = {
  'Host': 'apis.indeed.com',
  'Content-Type': 'application/json',
  'indeed-api-key': '161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8',
  'Accept': 'application/json',
  'indeed-locale': 'en-US',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Indeed App 193.1',
  'indeed-app-info': 'appv=193.1; appid=com.indeed.jobsearch; osv=16.6.1; os=ios; dtype=phone',
};

interface IndeedJobData {
  key: string;
  title: string;
  datePublished: number;
  description: { html: string };
  location: {
    countryName: string;
    countryCode: string;
    admin1Code: string;
    city: string;
    formatted: { long: string };
  };
  compensation: {
    baseSalary?: {
      unitOfWork: string;
      range: { min?: number; max?: number };
    };
    estimated?: {
      currencyCode: string;
      baseSalary: {
        unitOfWork: string;
        range: { min?: number; max?: number };
      };
    };
    currencyCode?: string;
  };
  attributes: Array<{ key: string; label: string }>;
  employer?: {
    relativeCompanyPageUrl?: string;
    name: string;
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

export class IndeedScraper extends Scraper {
  private session: SessionManager;
  private seenUrls: Set<string> = new Set();
  private baseUrl: string = '';
  private apiCountryCode: string = '';
  private markdownConverter: MarkdownConverter;

  constructor(config?: { proxies?: string[] | string; caCert?: string; userAgent?: string }) {
    super(Site.INDEED, config);
    this.session = new SessionManager({
      proxies: this.proxies,
      userAgent: this.userAgent,
      timeout: 10000,
    });
    this.markdownConverter = new MarkdownConverter();
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    logger.info('Starting Indeed scrape');

    if (!input.country) {
      throw new Error('Country is required for Indeed scraping');
    }

    const { domain, apiCountryCode } = CountryHelper.getIndeedDomain(input.country);
    this.baseUrl = `https://${domain}.indeed.com`;
    this.apiCountryCode = apiCountryCode;

    const jobs: JobPost[] = [];
    let cursor: string | null = null;
    let page = 1;
    const resultsWanted = input.resultsWanted || 15;
    const offset = input.offset || 0;

    while (this.seenUrls.size < resultsWanted + offset) {
      logger.info(`Scraping page ${page} / ${Math.ceil(resultsWanted / 100)}`);

      try {
        const { jobs: pageJobs, nextCursor } = await this.scrapePage(input, cursor);

        if (pageJobs.length === 0) {
          logger.info(`No jobs found on page ${page}`);
          break;
        }

        jobs.push(...pageJobs);
        cursor = nextCursor;
        page++;

        if (!cursor) break;
      } catch (error) {
        logger.error(`Error scraping page ${page}:`, error);
        break;
      }
    }

    const finalJobs = jobs.slice(offset, offset + resultsWanted);
    logger.info(`Scraped ${finalJobs.length} jobs from Indeed`);

    return { jobs: finalJobs };
  }

  private async scrapePage(
    input: ScraperInput,
    cursor: string | null
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null }> {
    const filters = this.buildFilters(input);
    const searchTerm = input.searchTerm ? input.searchTerm.replace(/"/g, '\\"') : '';

    const query = JOB_SEARCH_QUERY
      .replace('{what}', searchTerm ? `what: "${searchTerm}"` : '')
      .replace('{location}', input.location ?
        `location: {where: "${input.location}", radius: ${input.distance || 50}, radiusUnit: MILES}` : '')
      .replace('{cursor}', cursor ? `cursor: "${cursor}"` : '')
      .replace('{filters}', filters);

    const payload = { query };
    const headers = { ...API_HEADERS, 'indeed-co': this.apiCountryCode };

    try {
      const response = await this.session.post('https://apis.indeed.com/graphql', payload, { headers });

      if (response.status !== 200) {
        logger.warn(`API responded with status ${response.status}`);
        return { jobs: [], nextCursor: null };
      }

      const data = response.data;
      const results = data.data?.jobSearch?.results || [];
      const nextCursor = data.data?.jobSearch?.pageInfo?.nextCursor || null;

      const jobs: JobPost[] = [];
      for (const result of results) {
        const job = this.processJob(result.job, input);
        if (job) {
          jobs.push(job);
        }
      }

      return { jobs, nextCursor };
    } catch (error) {
      logger.error('Error making API request:', error);
      return { jobs: [], nextCursor: null };
    }
  }

  private buildFilters(input: ScraperInput): string {
    if (input.hoursOld) {
      return `
        filters: {
          date: {
            field: "dateOnIndeed",
            start: "${input.hoursOld}h"
          }
        }
      `;
    }

    if (input.easyApply) {
      return `
        filters: {
          keyword: {
            field: "indeedApplyScope",
            keys: ["DESKTOP"]
          }
        }
      `;
    }

    if (input.jobType || input.isRemote) {
      const jobTypeMapping: Record<JobType, string> = {
        [JobType.FULL_TIME]: 'CF3CP',
        [JobType.PART_TIME]: '75GKK',
        [JobType.CONTRACT]: 'NJXCK',
        [JobType.INTERNSHIP]: 'VDTG7',
        [JobType.TEMPORARY]: '',
        [JobType.PER_DIEM]: '',
        [JobType.NIGHTS]: '',
        [JobType.OTHER]: '',
        [JobType.SUMMER]: '',
        [JobType.VOLUNTEER]: '',
      };

      const keys: string[] = [];

      if (input.jobType && jobTypeMapping[input.jobType]) {
        keys.push(jobTypeMapping[input.jobType]);
      }

      if (input.isRemote) {
        keys.push('DSQF7');
      }

      if (keys.length > 0) {
        const keysStr = keys.map(k => `"${k}"`).join(', ');
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

  private processJob(job: IndeedJobData, input: ScraperInput): JobPost | null {
    const jobUrl = `${this.baseUrl}/viewjob?jk=${job.key}`;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

    let description = job.description?.html || '';
    if (input.descriptionFormat === DescriptionFormat.MARKDOWN && description) {
      description = this.markdownConverter.convert(description);
    }

    const jobTypes = this.getJobTypes(job.attributes);
    const compensation = this.getCompensation(job.compensation);
    const datePosted = new Date(job.datePublished).toISOString().split('T')[0];

    const employer = job.employer?.dossier;
    const employerDetails = employer?.employerDetails || {};

    const location: Location = {
      city: job.location?.city,
      state: job.location?.admin1Code,
      country: job.location?.countryCode,
    };

    return {
      id: `in-${job.key}`,
      title: job.title,
      description,
      companyName: job.employer?.name,
      companyUrl: job.employer?.relativeCompanyPageUrl ?
        `${this.baseUrl}${job.employer.relativeCompanyPageUrl}` : undefined,
      companyUrlDirect: employer?.links?.corporateWebsite,
      location,
      jobType: jobTypes,
      compensation,
      datePosted,
      jobUrl,
      jobUrlDirect: job.recruit?.viewJobUrl,
      emails: extractEmailsFromText(description) || undefined,
      isRemote: this.isJobRemote(job, description),
      companyAddresses: employerDetails.addresses?.[0],
      companyIndustry: employerDetails.industry?.replace('Iv1', '').replace(/_/g, ' ').trim(),
      companyNumEmployees: employerDetails.employeesLocalizedLabel,
      companyRevenue: employerDetails.revenueLocalizedLabel,
      companyDescription: employerDetails.briefDescription,
      companyLogo: employer?.images?.squareLogoUrl,
    };
  }

  private getJobTypes(attributes: Array<{ key: string; label: string }>): JobType[] {
    const jobTypes: JobType[] = [];

    for (const attribute of attributes) {
      const jobTypeStr = attribute.label.replace(/-/g, '').replace(/\s/g, '').toLowerCase();
      const jobType = JobTypeHelper.fromString(jobTypeStr);
      if (jobType) {
        jobTypes.push(jobType);
      }
    }

    return jobTypes;
  }

  private getCompensation(compensation: IndeedJobData['compensation']): Compensation | undefined {
    if (!compensation?.baseSalary && !compensation?.estimated) {
      return undefined;
    }

    const comp = compensation.baseSalary || compensation.estimated?.baseSalary;
    if (!comp) return undefined;

    const interval = this.getCompensationInterval(comp.unitOfWork);
    if (!interval) return undefined;

    const minAmount = comp.range?.min;
    const maxAmount = comp.range?.max;

    return {
      interval,
      minAmount: minAmount ? Math.floor(minAmount) : undefined,
      maxAmount: maxAmount ? Math.floor(maxAmount) : undefined,
      currency: compensation.estimated?.currencyCode || compensation.currencyCode || 'USD',
    };
  }

  private getCompensationInterval(unitOfWork: string): CompensationInterval | undefined {
    const mapping: Record<string, CompensationInterval> = {
      'DAY': CompensationInterval.DAILY,
      'YEAR': CompensationInterval.YEARLY,
      'HOUR': CompensationInterval.HOURLY,
      'WEEK': CompensationInterval.WEEKLY,
      'MONTH': CompensationInterval.MONTHLY,
    };

    return mapping[unitOfWork?.toUpperCase()];
  }

  private isJobRemote(job: IndeedJobData, description: string): boolean {
    const remoteKeywords = ['remote', 'work from home', 'wfh'];

    // Check attributes
    const isRemoteInAttributes = job.attributes.some(attr =>
      remoteKeywords.some(keyword => attr.label.toLowerCase().includes(keyword))
    );

    // Check description
    const isRemoteInDescription = remoteKeywords.some(keyword =>
      description.toLowerCase().includes(keyword)
    );

    // Check location
    const isRemoteInLocation = remoteKeywords.some(keyword =>
      job.location?.formatted?.long?.toLowerCase().includes(keyword)
    );

    return isRemoteInAttributes || isRemoteInDescription || isRemoteInLocation;
  }
}
