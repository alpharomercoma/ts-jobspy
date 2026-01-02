/**
 * Bayt Job Scraper
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
  Scraper,
} from '../model';
import { createSession, createLogger, randomDelay } from '../util';

const log = createLogger('Bayt');

export class BaytScraper implements Scraper {
  site = Site.BAYT;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly baseUrl = 'https://www.bayt.com';
  private readonly delay = 2;
  private readonly bandDelay = 3;

  private session: AxiosInstance | null = null;

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
      hasRetry: true,
    });

    const jobList: JobPost[] = [];
    let page = 1;
    const resultsWanted = input.resultsWanted ?? 10;

    while (jobList.length < resultsWanted) {
      log.info(`Fetching Bayt jobs page ${page}`);
      const jobElements = await this.fetchJobs(input.searchTerm ?? '', page);

      if (!jobElements || jobElements.length === 0) {
        break;
      }

      const initialCount = jobList.length;

      for (const job of jobElements) {
        try {
          const jobPost = this.extractJobInfo(job);
          if (jobPost) {
            jobList.push(jobPost);
            if (jobList.length >= resultsWanted) {
              break;
            }
          }
        } catch (e) {
          log.error(`Bayt: Error extracting job info: ${(e as Error).message}`);
        }
      }

      if (jobList.length === initialCount) {
        log.info(`No new jobs found on page ${page}. Ending pagination.`);
        break;
      }

      page += 1;
      await randomDelay(this.delay, this.delay + this.bandDelay);
    }

    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async fetchJobs(
    query: string,
    page: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[] | null> {
    if (!this.session) return null;

    try {
      const url = `${this.baseUrl}/en/international/jobs/${query}-jobs/?page=${page}`;
      const response = await this.session.get(url);

      const $ = cheerio.load(response.data);
      const jobListings = $('li[data-js-job]').toArray();

      log.debug(`Found ${jobListings.length} job listing elements`);
      return jobListings;
    } catch (e) {
      log.error(`Bayt: Error fetching jobs - ${(e as Error).message}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractJobInfo(jobElement: any): JobPost | null {
    const $ = cheerio.load(jobElement);

    // Find the h2 element holding the title and link
    const jobGeneralInfo = $('h2').first();
    if (!jobGeneralInfo.length) {
      return null;
    }

    const jobTitle = jobGeneralInfo.text().trim();
    const jobUrl = this.extractJobUrl(jobGeneralInfo);

    if (!jobUrl) {
      return null;
    }

    // Extract company name
    const companyTag = $('div.t-nowrap.p10l');
    const companySpan = companyTag.find('span').first();
    const companyName = companySpan.length ? companySpan.text().trim() : null;

    // Extract location
    const locationTag = $('div.t-mute.t-small');
    const locationStr = locationTag.length ? locationTag.text().trim() : null;

    const jobId = `bayt-${Math.abs(this.hashCode(jobUrl))}`;

    const location: Location = {
      city: locationStr ?? undefined,
      country: Country.WORLDWIDE,
    };

    return {
      id: jobId,
      title: jobTitle,
      companyName,
      location,
      jobUrl,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractJobUrl(jobGeneralInfo: any): string | null {
    const aTag = jobGeneralInfo.find('a').first();
    if (aTag.length && aTag.attr('href')) {
      return this.baseUrl + aTag.attr('href')!.trim();
    }
    return null;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }
}

export default BaytScraper;
