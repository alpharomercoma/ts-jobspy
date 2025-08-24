import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { Scraper } from '../models';
import {
  Compensation,
  CompensationInterval,
  JobPost,
  JobResponse,
  JobType,
  Location,
  ScraperInput,
  Site,
} from '../types';
import { createLogger, extractEmailsFromText, extractJobType, markdownConverter } from '../utils';

const logger = createLogger('Google');

const G_SEARCH_URL = 'https://www.google.com/search';
const G_JOBS_URL = 'https://www.google.com/async/callback:550';

export class GoogleScraper extends Scraper {
  private session: AxiosInstance;
  private seenIds: Set<string> = new Set();

  constructor (config: any = {}) {
    super(Site.GOOGLE, config);

    this.session = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'TE': 'Trailers',
      }
    });

    if (config.proxies) {
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
    const jobList: JobPost[] = [];
    input.resultsWanted = Math.min(900, input.resultsWanted || 100);

    try {
      const { initialJobs, forwardCursor } = await this.getInitialJobsAndCursor(input);
      jobList.push(...initialJobs);

      let currentCursor = forwardCursor;
      while (jobList.length < input.resultsWanted && currentCursor) {
        logger.info(`Paginating with cursor: ${currentCursor.substring(0, 20)}...`);
        const { jobs, nextCursor } = await this.getNextPageJobs(currentCursor);
        if (!jobs.length) {
          logger.info('No more jobs found on subsequent pages.');
          break;
        }
        jobList.push(...jobs);
        currentCursor = nextCursor;
      }

      return { jobs: jobList.slice(0, input.resultsWanted) };
    } catch (error) {
      logger.error('Google scraping failed:', error);
      return { jobs: [] };
    }
  }

  private buildSearchQuery(input: ScraperInput): string {
    let query = input.searchTerm || 'jobs';
    if (input.jobType) {
      const jobTypeMapping: { [key in JobType]?: string } = {
        [JobType.FULL_TIME]: 'Full time',
        [JobType.PART_TIME]: 'Part time',
        [JobType.INTERNSHIP]: 'Internship',
        [JobType.CONTRACT]: 'Contract',
      };
      if (jobTypeMapping[input.jobType]) {
        query += ` ${jobTypeMapping[input.jobType]}`;
      }
    }
    if (input.location) query += ` near ${input.location}`;
    if (input.hoursOld) {
      const timeFilter = input.hoursOld <= 24 ? 'since yesterday' :
        input.hoursOld <= 72 ? 'in the last 3 days' :
          input.hoursOld <= 168 ? 'in the last week' : 'in the last month';
      query += ` ${timeFilter}`;
    }
    if (input.isRemote) query += ' remote';
    return input.googleSearchTerm || query;
  }

  private async getInitialJobsAndCursor(input: ScraperInput): Promise<{ initialJobs: JobPost[], forwardCursor: string | null; }> {
    const query = this.buildSearchQuery(input);
    const response = await this.session.get(G_SEARCH_URL, { params: { q: query, udm: '8' } });
    const $ = cheerio.load(response.data);

    const forwardCursor = $('div[jsname="Yust4d"]').attr('data-async-fc');
    const scripts = $('script[type="application/ld+json"]');
    const initialJobs: JobPost[] = [];

    scripts.each((_, script) => {
      const content = $(script).html();
      if (content) {
        try {
          const jsonData = JSON.parse(content);
          if (jsonData['@type'] === 'JobPosting') {
            const job = this.parseJobsFromJson(jsonData);
            if (job) initialJobs.push(job);
          }
        } catch {
          logger.warn('Failed to parse initial job LD+JSON');
        }
      }
    });

    return { initialJobs, forwardCursor: forwardCursor || null };
  }

  private async getNextPageJobs(cursor: string): Promise<{ jobs: JobPost[], nextCursor: string | null; }> {
    const asyncParam = 'end:1,element_id:YvgnAc,action:page,context:0,query:,cursor:' + cursor;
    const response = await this.session.get(G_JOBS_URL, { params: { fc: cursor, fcv: '3', async: asyncParam } });

    const responseText = response.data;
    const jobs: JobPost[] = [];

    // The response is not valid HTML, so we use regex to find the relevant script tag content
    const scriptContentMatch = responseText.match(/<script.*?>\s*window.jsa\s*=\s*(.*?);<\/script>/s);
    if (scriptContentMatch && scriptContentMatch[1]) {
      try {
        const jsonData = JSON.parse(scriptContentMatch[1]);
        // The actual job data is nested deep inside this JSON structure.
        // The exact path might change, this is based on current observations.
        const jobPostings = jsonData[2]?.[0]?.[0]?.[1]?.[0];
        if (Array.isArray(jobPostings)) {
          for (const posting of jobPostings) {
            const jobData = posting[0]?.[0];
            if (jobData) {
              const job = this.parseJobsFromJson(jobData);
              if (job) jobs.push(job);
            }
          }
        }
      } catch (e) {
        logger.warn('Failed to parse paginated job data JSON', e);
      }
    }

    // Cheerio is used here on the full response to find the next cursor, which is in a div
    const $ = cheerio.load(responseText);
    const nextCursor = $('div[jsname="Yust4d"]').attr('data-async-fc');

    return { jobs, nextCursor: nextCursor || null };
  }

  private parseJobsFromJson(jobData: any): JobPost | null {
    const jobId = jobData.identifier?.value || jobData.jobLocation?.address?.postalCode || Math.random().toString();
    if (this.seenIds.has(jobId)) return null;
    this.seenIds.add(jobId);

    const title = jobData.title;
    const companyName = jobData.hiringOrganization?.name;
    const location = this.parseLocation(jobData.jobLocation?.address);
    const description = jobData.description ? markdownConverter(jobData.description) : undefined;
    const datePosted = jobData.datePosted ? new Date(jobData.datePosted).toISOString().split('T')[0] : undefined;
    const jobUrl = jobData.url || `https://www.google.com/search?q=${encodeURIComponent(`${title} at ${companyName}`)}`;

    return {
      id: `google-${jobId}`,
      title,
      companyName,
      location,
      description,
      jobUrl,
      datePosted,
      isRemote: jobData.jobLocationType === 'TELECOMMUTE' || (description || '').toLowerCase().includes('remote'),
      jobType: extractJobType(description || '', Object.values(JobType)),
      compensation: this.parseCompensation(jobData.baseSalary),
      emails: extractEmailsFromText(description || '') || undefined,
    };
  }

  private parseLocation(address: any): Location {
    if (!address) return {};
    return {
      country: address.addressCountry,
      city: address.addressLocality,
      state: address.addressRegion,
    };
  }

  private parseCompensation(salary: any): Compensation | undefined {
    if (!salary) return undefined;
    return {
      minAmount: salary.value?.minValue,
      maxAmount: salary.value?.maxValue,
      currency: salary.currency,
      interval: this.mapSalaryUnit(salary.unitText),
    };
  }

  private mapSalaryUnit(unit?: string): CompensationInterval {
    const u = (unit || '').toLowerCase();
    if (u.includes('hour')) return CompensationInterval.HOURLY;
    if (u.includes('day')) return CompensationInterval.DAILY;
    if (u.includes('week')) return CompensationInterval.WEEKLY;
    if (u.includes('month')) return CompensationInterval.MONTHLY;
    return CompensationInterval.YEARLY;
  }
}
