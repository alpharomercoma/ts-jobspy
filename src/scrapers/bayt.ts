import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { Scraper } from '../models';
import {
  Compensation,
  CompensationInterval,
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

const logger = createLogger('Bayt');

interface BaytJobData {
  id: string;
  title: string;
  company: {
    name: string;
    logo?: string;
  };
  location: {
    city: string;
    country: string;
  };
  description: string;
  posted_date: string;
  salary?: {
    min: number;
    max: number;
    currency: string;
    period: string;
  };
  job_type?: string;
  experience_level?: string;
  skills?: string[];
  url: string;
  descriptionFormat?: DescriptionFormat;
}

export class BaytScraper extends Scraper {
  private session: AxiosInstance;
  private baseUrl = 'https://www.bayt.com';
  private seenUrls: Set<string> = new Set();

  constructor (config: ScraperConfig = {}) {
    super(Site.BAYT, config);

    this.session = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://www.bayt.com/',
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
    try {
      const jobs: JobPost[] = [];
      const maxResults = Math.min(500, input.resultsWanted || 15);
      const jobsPerPage = 20;
      const maxPages = Math.ceil(maxResults / jobsPerPage);

      for (let page = 1; page <= maxPages; page++) {
        logger.info(`Scraping Bayt page ${page}/${maxPages}`);

        try {
          const pageJobs = await this.fetchJobsPage(input, page);
          jobs.push(...pageJobs);

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
      logger.error('Bayt scraping failed:', error);
      return { jobs: [] };
    }
  }

  private async fetchJobsPage(input: ScraperInput, page: number): Promise<JobPost[]> {
    const searchParams = new URLSearchParams({
      q: input.searchTerm || '',
      location: input.location || '',
      page: page.toString(),
      sort: 'date',
    });

    if (input.jobType) {
      searchParams.append('job_type', this.mapJobTypeToBayt(input.jobType));
    }

    if (input.hoursOld) {
      const days = Math.ceil(input.hoursOld / 24);
      searchParams.append('posted_within', days.toString());
    }

    try {
      const url = `${this.baseUrl}/en/jobs/?${searchParams.toString()}`;
      const response = await this.session.get(url);

      // Parse HTML to extract job data
      const jobData = this.parseJobsHTML(response.data);

      const jobs: JobPost[] = [];
      for (const data of jobData) {
        const job = await this.processJob(data);
        if (job) {
          jobs.push(job);
        }
      }

      return jobs;
    } catch (error) {
      logger.error('Failed to fetch Bayt jobs page:', error);
      return [];
    }
  }

  private parseJobsHTML(html: string): BaytJobData[] {
    const $ = cheerio.load(html);
    const jobs: BaytJobData[] = [];

    $('li[data-js-job]').each((_, element) => {
      const jobElement = $(element);
      const h2 = jobElement.find('h2');
      const title = h2.text().trim();
      const jobUrl = this.baseUrl + (h2.find('a').attr('href') || '');
      const jobId = String(jobElement.data('js-job') || '');

      if (!jobId || !jobUrl.includes(jobId)) return;

      const companyName = jobElement.find('div.p10l.t-nowrap span').text().trim();
      const location = jobElement.find('div.t-mute.t-small').text().trim();

      jobs.push({
        id: jobId,
        title,
        company: { name: companyName },
        location: this.parseLocationString(location),
        description: '',
        posted_date: '',
        url: jobUrl,
      });
    });

    return jobs;
  }

  private parseJobsFromJson(jobData: unknown[]): JobPost[] {
    const jobs: JobPost[] = [];

    for (const data of jobData) {
      const job = this.processJobFromJson(data);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  private processJobFromJson(data: unknown): JobPost | null {
    const jobData = data as BaytJobData;
    const jobUrl = jobData.url;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }

    const location: Location = {
      city: jobData.location.city,
      country: jobData.location.country,
    };

    const compensation = jobData.salary ? this.parseCompensation(jobData.salary) : undefined;

    let description = jobData.description;
    if (jobData.descriptionFormat === DescriptionFormat.MARKDOWN && description) {
      description = markdownConverter(description);
    }

    const datePosted = jobData.posted_date ?
      new Date(jobData.posted_date).toISOString().split('T')[0] : undefined;

    return {
      id: `bayt-${jobData.id}`,
      title: jobData.title,
      companyName: jobData.company.name,
      jobUrl,
      location,
      description,
      compensation,
      datePosted,
      isRemote: this.isRemoteJob(jobData.location.city, description),
      emails: description ? extractEmailsFromText(description) || undefined : undefined,
      companyLogo: jobData.company.logo,
      skills: jobData.skills,
      jobType: jobData.job_type ? [this.mapBaytJobType(jobData.job_type)] : undefined,
    };
  }

  private async processJob(jobData: BaytJobData, input?: ScraperInput): Promise<JobPost | null> {
    const jobUrl = jobData.url;

    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

    // Fetch detailed job information
    let detailedJob = jobData;
    try {
      if (input) {
        detailedJob = await this.fetchJobDetails(jobData.id);
      }
    } catch (error) {
      logger.warn(`Failed to fetch details for job ${jobData.id}:`, error);
    }

    const location: Location = {
      city: detailedJob.location.city,
      country: detailedJob.location.country,
    };

    const compensation = detailedJob.salary ? this.parseCompensation(detailedJob.salary) : undefined;

    let description = detailedJob.description;
    if (input?.descriptionFormat === DescriptionFormat.MARKDOWN && description) {
      description = markdownConverter(description);
    }

    const datePosted = detailedJob.posted_date ?
      new Date(detailedJob.posted_date).toISOString().split('T')[0] : undefined;

    return {
      id: `bayt-${detailedJob.id}`,
      title: detailedJob.title,
      companyName: detailedJob.company.name,
      jobUrl,
      location,
      description,
      compensation,
      datePosted,
      isRemote: this.isRemoteJob(detailedJob.location.city, description),
      emails: description ? extractEmailsFromText(description) || undefined : undefined,
      companyLogo: detailedJob.company.logo,
      skills: detailedJob.skills,
      jobType: detailedJob.job_type ? [this.mapBaytJobType(detailedJob.job_type)] : undefined,
    };
  }

  private async fetchJobDetails(jobId: string): Promise<BaytJobData> {
    try {
      const url = `${this.baseUrl}/en/jobs/job/${jobId}/`;
      const response = await this.session.get(url);

      // Parse detailed job page
      return this.parseJobDetailsHTML(response.data, jobId);
    } catch (error) {
      logger.warn(`Failed to fetch job details for ${jobId}:`, error);
      throw error;
    }
  }

  private parseJobDetailsHTML(html: string, jobId: string): BaytJobData {
    const $ = cheerio.load(html);

    const title = $('h1.job-title').text().trim();
    const companyName = $('span.company-name').text().trim();
    const locationStr = $('dd[data-js-job-location]').text().trim();
    const description = $('div.card-content[data-js-job-description]').html() || '';
    const postedDateStr = $('span.time-stamp').text().trim();

    return {
      id: jobId,
      title,
      company: { name: companyName },
      location: this.parseLocationString(locationStr),
      description,
      posted_date: this.parseDate(postedDateStr),
      url: `${this.baseUrl}/en/job/${jobId}/`,
    };
  }

  private parseLocationString(locationStr: string): { city: string; country: string; } {
    const parts = locationStr.split(',').map(part => part.trim());
    return {
      city: parts[0] || '',
      country: parts[parts.length - 1] || '',
    };
  }

  private parseCompensation(salary: { min: number; max: number; currency: string; period: string }): Compensation | undefined {
    if (!salary) return undefined;

    return {
      minAmount: salary.min,
      maxAmount: salary.max,
      currency: salary.currency || 'USD',
      interval: this.mapSalaryPeriod(salary.period),
    };
  }

  private mapSalaryPeriod(period?: string): CompensationInterval {
    switch (period?.toLowerCase()) {
      case 'year':
      case 'yearly':
      case 'annual':
        return CompensationInterval.YEARLY;
      case 'month':
      case 'monthly':
        return CompensationInterval.MONTHLY;
      case 'week':
      case 'weekly':
        return CompensationInterval.WEEKLY;
      case 'day':
      case 'daily':
        return CompensationInterval.DAILY;
      case 'hour':
      case 'hourly':
        return CompensationInterval.HOURLY;
      default:
        return CompensationInterval.YEARLY;
    }
  }

  private mapJobTypeToBayt(jobType: JobType): string {
    const mapping: Record<string, string> = {
      [JobType.FULL_TIME]: 'full-time',
      [JobType.PART_TIME]: 'part-time',
      [JobType.CONTRACT]: 'contract',
      [JobType.TEMPORARY]: 'temporary',
      [JobType.INTERNSHIP]: 'internship',
    };

    return mapping[jobType] || 'full-time';
  }

  private parseDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString();

    const now = new Date();
    if (dateStr.includes('hour')) {
      // 'Posted x hours ago'
      const hours = parseInt(dateStr.match(/\d+/)?.[0] || '0');
      now.setHours(now.getHours() - hours);
    } else if (dateStr.includes('day')) {
      // 'Posted x days ago'
      const days = parseInt(dateStr.match(/\d+/)?.[0] || '0');
      now.setDate(now.getDate() - days);
    } else if (dateStr.includes('month')) {
      // 'Posted x months ago'
      const months = parseInt(dateStr.match(/\d+/)?.[0] || '0');
      now.setMonth(now.getMonth() - months);
    }

    return now.toISOString();
  }

  private mapBaytJobType(jobType: string): JobType {
    const mapping: Record<string, JobType> = {
      'full-time': JobType.FULL_TIME,
      'part-time': JobType.PART_TIME,
      'contract': JobType.CONTRACT,
      'temporary': JobType.TEMPORARY,
      'internship': JobType.INTERNSHIP,
    };

    return mapping[jobType.toLowerCase()] || JobType.FULL_TIME;
  }

  private isRemoteJob(location: string, description?: string): boolean {
    const remoteKeywords = ['remote', 'work from home', 'wfh', 'telecommute'];
    const text = (location + ' ' + (description || '')).toLowerCase();

    return remoteKeywords.some(keyword => text.includes(keyword));
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private cleanHTML(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
