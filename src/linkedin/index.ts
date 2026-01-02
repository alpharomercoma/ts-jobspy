/**
 * LinkedIn Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import {
  JobPost,
  JobResponse,
  Location,
  ScraperInput,
  Site,
  Country,
  Compensation,
  DescriptionFormat,
  Scraper,
  getCountryFromString,
} from '../model';
import {
  createSession,
  createLogger,
  randomDelay,
  markdownConverter,
  plainConverter,
  extractEmailsFromText,
  currencyParser,
  removeAttributes,
} from '../util';
import { HEADERS } from './constant';
import {
  jobTypeCode,
  parseJobType,
  parseJobLevel,
  parseCompanyIndustry,
  isJobRemote,
} from './util';

const log = createLogger('LinkedIn');

export class LinkedIn implements Scraper {
  site = Site.LINKEDIN;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly baseUrl = 'https://www.linkedin.com';
  private readonly delay = 3;
  private readonly bandDelay = 4;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private readonly jobUrlDirectRegex = /(?<=\?url=)[^"]+/;

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.scraperInput = input;

    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
      hasRetry: true,
      retryDelay: 5,
    });

    // Update session headers
    if (this.session.defaults.headers) {
      Object.assign(this.session.defaults.headers, HEADERS);
    }

    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();
    let start = input.offset ? Math.floor(input.offset / 10) * 10 : 0;
    let requestCount = 0;
    const secondsOld = input.hoursOld ? input.hoursOld * 3600 : null;
    const resultsWanted = input.resultsWanted ?? 15;

    const continueSearch = () => jobList.length < resultsWanted && start < 1000;

    while (continueSearch()) {
      requestCount += 1;
      log.info(
        `search page: ${requestCount} / ${Math.ceil(resultsWanted / 10)}`
      );

      const params: Record<string, string | number | undefined> = {
        keywords: input.searchTerm,
        location: input.location,
        distance: input.distance,
        f_WT: input.isRemote ? 2 : undefined,
        f_JT: input.jobType ? jobTypeCode(input.jobType) : undefined,
        pageNum: 0,
        start,
        f_AL: input.easyApply ? 'true' : undefined,
        f_C: input.linkedinCompanyIds?.join(','),
      };

      if (secondsOld !== null) {
        params.f_TPR = `r${secondsOld}`;
      }

      // Filter out undefined values
      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(
          ([_, v]) => v !== undefined && v !== null && v !== ''
        )
      );

      try {
        const response = await this.session.get(
          `${this.baseUrl}/jobs-guest/jobs/api/seeMoreJobPostings/search`,
          {
            params: filteredParams,
            timeout: 10000,
          }
        );

        if (response.status < 200 || response.status >= 400) {
          if (response.status === 429) {
            log.error('429 Response - Blocked by LinkedIn for too many requests');
          } else {
            log.error(`LinkedIn response status code ${response.status}`);
          }
          return { jobs: jobList };
        }

        const $ = cheerio.load(response.data as string);
        const jobCards = $('div.base-search-card').toArray();

        if (jobCards.length === 0) {
          return { jobs: jobList };
        }

        for (const jobCard of jobCards) {
          const hrefTag = cheerio.load(jobCard)('a.base-card__full-link').first();

          if (hrefTag.length && hrefTag.attr('href')) {
            const href = hrefTag.attr('href')!.split('?')[0];
            const jobId = href.split('-').pop() ?? '';

            if (seenIds.has(jobId)) {
              continue;
            }
            seenIds.add(jobId);

            try {
              const fetchDesc = input.linkedinFetchDescription ?? false;
              const jobPost = await this.processJob(
                cheerio.load(jobCard),
                jobId,
                fetchDesc
              );
              if (jobPost) {
                jobList.push(jobPost);
              }
              if (!continueSearch()) {
                break;
              }
            } catch (e) {
              log.error(`Error processing job: ${(e as Error).message}`);
            }
          }
        }

        if (continueSearch()) {
          await randomDelay(this.delay, this.delay + this.bandDelay);
          start += jobCards.length;
        }
      } catch (e) {
        const error = e as Error;
        if (error.message.includes('Proxy')) {
          log.error('LinkedIn: Bad proxy');
        } else {
          log.error(`LinkedIn: ${error.message}`);
        }
        return { jobs: jobList };
      }
    }

    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async processJob(
    $: cheerio.CheerioAPI,
    jobId: string,
    fullDescr: boolean
  ): Promise<JobPost | null> {
    const salaryTag = $('span.job-search-card__salary-info').first();

    let compensation: Compensation | undefined;
    let description: string | null = null;

    if (salaryTag.length) {
      const salaryText = salaryTag.text().trim();
      const salaryValues = salaryText.split('-').map((v) => currencyParser(v));

      if (salaryValues.length >= 2) {
        const salaryMin = salaryValues[0];
        const salaryMax = salaryValues[1];
        const currency = salaryText[0] !== '$' ? salaryText[0] : 'USD';

        compensation = {
          minAmount: Math.floor(salaryMin),
          maxAmount: Math.floor(salaryMax),
          currency,
        };
      }
    }

    const titleTag = $('span.sr-only').first();
    const title = titleTag.length ? titleTag.text().trim() : 'N/A';

    const companyTag = $('h4.base-search-card__subtitle').first();
    const companyATag = companyTag.find('a').first();
    let companyUrl = '';

    if (companyATag.length && companyATag.attr('href')) {
      const url = new URL(companyATag.attr('href')!);
      url.search = '';
      companyUrl = url.href;
    }

    const company = companyATag.length ? companyATag.text().trim() : 'N/A';

    const metadataCard = $('div.base-search-card__metadata').first();
    const location = this.getLocation(metadataCard);

    let datePosted: Date | null = null;
    const datetimeTag = metadataCard.find('time.job-search-card__listdate').first();

    if (datetimeTag.length && datetimeTag.attr('datetime')) {
      try {
        datePosted = new Date(datetimeTag.attr('datetime')!);
      } catch {
        datePosted = null;
      }
    }

    let jobDetails: {
      description?: string;
      jobType?: import('../model').JobType[];
      jobLevel?: string;
      companyIndustry?: string;
      jobUrlDirect?: string;
      companyLogo?: string;
      jobFunction?: string;
    } = {};

    if (fullDescr) {
      jobDetails = await this.getJobDetails(jobId);
      description = jobDetails.description ?? null;
    }

    const remote = isJobRemote(title, description, location);

    return {
      id: `li-${jobId}`,
      title,
      companyName: company,
      companyUrl,
      location,
      isRemote: remote,
      datePosted,
      jobUrl: `${this.baseUrl}/jobs/view/${jobId}`,
      compensation,
      jobType: jobDetails.jobType,
      jobLevel: jobDetails.jobLevel?.toLowerCase(),
      companyIndustry: jobDetails.companyIndustry,
      description: jobDetails.description,
      jobUrlDirect: jobDetails.jobUrlDirect,
      emails: extractEmailsFromText(description),
      companyLogo: jobDetails.companyLogo,
      jobFunction: jobDetails.jobFunction,
    };
  }

  private async getJobDetails(jobId: string): Promise<{
    description?: string;
    jobType?: import('../model').JobType[];
    jobLevel?: string;
    companyIndustry?: string;
    jobUrlDirect?: string;
    companyLogo?: string;
    jobFunction?: string;
  }> {
    if (!this.session) return {};

    try {
      const response = await this.session.get(
        `${this.baseUrl}/jobs/view/${jobId}`,
        { timeout: 5000 }
      );

      if (response.status < 200 || response.status >= 400) {
        return {};
      }

      // Check for signup redirect
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (response.request?.res?.responseUrl?.includes('linkedin.com/signup')) {
        return {};
      }

      const $ = cheerio.load(response.data as string);

      // Get description
      const divContent = $('div.show-more-less-html__markup').first();
      let description: string | undefined;

      if (divContent.length) {
        const cleanedHtml = removeAttributes(divContent.html() ?? '');

        if (this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN) {
          description = markdownConverter(cleanedHtml) ?? undefined;
        } else if (this.scraperInput?.descriptionFormat === DescriptionFormat.PLAIN) {
          description = plainConverter(cleanedHtml) ?? undefined;
        } else {
          description = cleanedHtml;
        }
      }

      // Get job function
      let jobFunction: string | undefined;
      const h3Tag = $('h3:contains("Job function")').first();
      if (h3Tag.length) {
        const jobFunctionSpan = h3Tag
          .next('span.description__job-criteria-text')
          .first();
        if (jobFunctionSpan.length) {
          jobFunction = jobFunctionSpan.text().trim();
        }
      }

      // Get company logo
      const logoImage = $('img.artdeco-entity-image').first();
      const companyLogo = logoImage.attr('data-delayed-url') ?? undefined;

      // Parse job URL direct
      const jobUrlDirect = this.parseJobUrlDirect($);

      return {
        description,
        jobLevel: parseJobLevel($) ?? undefined,
        companyIndustry: parseCompanyIndustry($) ?? undefined,
        jobType: parseJobType($),
        jobUrlDirect,
        companyLogo,
        jobFunction,
      };
    } catch {
      return {};
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getLocation(metadataCard: any): Location {
    let location: Location = { country: Country.WORLDWIDE };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (metadataCard.length) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const locationTag = metadataCard.find('span.job-search-card__location').first();
      /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      const locationString: string = locationTag.length
        ? (locationTag.text() as string).trim()
        : 'N/A';
      /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

      const parts = locationString.split(', ');

      if (parts.length === 2) {
        const [city, state] = parts;
        location = {
          city,
          state,
          country: Country.WORLDWIDE,
        };
      } else if (parts.length === 3) {
        const [city, state, countryStr] = parts;
        let country: Country;
        try {
          country = getCountryFromString(countryStr);
        } catch {
          country = Country.WORLDWIDE;
        }
        location = { city, state, country };
      }
    }

    return location;
  }

  private parseJobUrlDirect($: cheerio.CheerioAPI): string | undefined {
    const jobUrlDirectContent = $('code#applyUrl').first();

    if (jobUrlDirectContent.length) {
      const content = jobUrlDirectContent.html() ?? '';
      const match = content.match(this.jobUrlDirectRegex);
      if (match) {
        return decodeURIComponent(match[0]);
      }
    }

    return undefined;
  }
}

export default LinkedIn;
