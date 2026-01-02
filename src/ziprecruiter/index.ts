/**
 * ZipRecruiter Scraper
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
  sleep,
  markdownConverter,
  removeAttributes,
  extractEmailsFromText,
} from '../util';
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

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private seenUrls = new Set<string>();

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

    // Set headers
    if (this.session.defaults.headers) {
      Object.assign(this.session.defaults.headers, HEADERS);
    }

    // Initialize session with cookies
    await this.getCookies();

    const jobList: JobPost[] = [];
    let continueToken: string | null = null;
    const resultsWanted = input.resultsWanted ?? 15;
    const maxPages = Math.ceil(resultsWanted / this.jobsPerPage);

    for (let page = 1; page <= maxPages; page++) {
      if (jobList.length >= resultsWanted) break;

      if (page > 1) {
        await sleep(this.delay * 1000);
      }

      log.info(`search page: ${page} / ${maxPages}`);

      const { jobs, nextToken } = await this.findJobsInPage(continueToken);

      if (jobs && jobs.length > 0) {
        jobList.push(...jobs);
      } else {
        break;
      }

      if (!nextToken) break;
      continueToken = nextToken;
    }

    return { jobs: jobList.slice(0, resultsWanted) };
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

    try {
      const response = await this.session.get<ZipRecruiterResponse>(
        `${this.apiUrl}/jobs-app/jobs`,
        { params }
      );

      if (response.status < 200 || response.status >= 400) {
        if (response.status === 429) {
          log.error('429 Response - Blocked by ZipRecruiter for too many requests');
        } else {
          log.error(`ZipRecruiter response status code ${response.status}`);
        }
        return { jobs: [], nextToken: null };
      }

      const resData = response.data;
      const jobsList = resData.jobs ?? [];
      const nextContinueToken = resData.continue ?? null;

      const processedJobs = await Promise.all(
        jobsList.map((job) => this.processJob(job))
      );

      return {
        jobs: processedJobs.filter((job): job is JobPost => job !== null),
        nextToken: nextContinueToken,
      };
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('Proxy')) {
        log.error('ZipRecruiter: Bad proxy');
      } else {
        log.error(`ZipRecruiter: ${error.message}`);
      }
      return { jobs: [], nextToken: null };
    }
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
    }

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

    const jobType = getJobTypeEnum(
      (job.employment_type ?? '').replace(/_/g, '').toLowerCase()
    );

    let datePosted: Date | null = null;
    if (job.posted_time) {
      datePosted = new Date(job.posted_time.replace('Z', ''));
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
      });

      if (response.status < 200 || response.status >= 400) {
        return { descriptionFull: null, jobUrlDirect: null };
      }

      const $ = cheerio.load(response.data);
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

      if (
        this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN &&
        descriptionFull
      ) {
        descriptionFull = markdownConverter(descriptionFull) ?? descriptionFull;
      }

      return {
        descriptionFull: descriptionFull || null,
        jobUrlDirect,
      };
    } catch {
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
      });
    } catch {
      // Ignore cookie initialization errors
    }
  }
}

export default ZipRecruiter;
