import { Scraper } from '../models';
import {
  Site,
  ScraperInput,
  JobResponse,
  JobPost,
  JobType,
  CompensationInterval,
  Compensation,
  DescriptionFormat,
  Location,
} from '../types';
import { SessionManager, createLogger, MarkdownConverter, extractEmailsFromText } from '../utils';
import { LocationHelper, JobTypeHelper } from '../models';
import * as cheerio from 'cheerio';

const logger = createLogger('ZipRecruiter');

export class ZipRecruiterScraper extends Scraper {
  private session: SessionManager;
  private seenUrls: Set<string> = new Set();
  private markdownConverter: MarkdownConverter;

  constructor(config?: { proxies?: string[] | string; caCert?: string; userAgent?: string }) {
    super(Site.ZIP_RECRUITER, config);
    this.session = new SessionManager({
      proxies: this.proxies,
      userAgent: this.userAgent,
      timeout: 15000,
    });
    this.markdownConverter = new MarkdownConverter();
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    logger.info('Starting ZipRecruiter scrape');
    
    const jobs: JobPost[] = [];
    const resultsWanted = input.resultsWanted || 15;
    const offset = input.offset || 0;
    let page = 1;

    while (jobs.length < resultsWanted) {
      logger.info(`Scraping ZipRecruiter page ${page}`);
      
      try {
        const pageJobs = await this.scrapePage(input, page);
        
        if (pageJobs.length === 0) {
          logger.info('No more jobs found');
          break;
        }

        jobs.push(...pageJobs);
        page++;

        // Avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        logger.error(`Error scraping ZipRecruiter page ${page}:`, error);
        break;
      }
    }

    const finalJobs = jobs.slice(offset, offset + resultsWanted);
    logger.info(`Scraped ${finalJobs.length} jobs from ZipRecruiter`);
    
    return { jobs: finalJobs };
  }

  private async scrapePage(input: ScraperInput, page: number): Promise<JobPost[]> {
    const url = this.buildSearchUrl(input, page);

    try {
      const response = await this.session.get(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.ziprecruiter.com/',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (response.status !== 200) {
        logger.warn(`ZipRecruiter responded with status ${response.status}`);
        return [];
      }

      return this.parseJobsFromHtml(response.data, input);
    } catch (error) {
      logger.error('Error making ZipRecruiter request:', error);
      return [];
    }
  }

  private buildSearchUrl(input: ScraperInput, page: number): string {
    const baseUrl = 'https://www.ziprecruiter.com/jobs/search';
    const params = new URLSearchParams();
    
    if (input.searchTerm) {
      params.append('search', input.searchTerm);
    }
    
    if (input.location) {
      params.append('location', input.location);
    }
    
    if (input.distance) {
      params.append('radius', input.distance.toString());
    }
    
    if (input.jobType) {
      const jobTypeMapping: Record<JobType, string> = {
        [JobType.FULL_TIME]: 'full_time',
        [JobType.PART_TIME]: 'part_time',
        [JobType.CONTRACT]: 'contract',
        [JobType.TEMPORARY]: 'temporary',
        [JobType.INTERNSHIP]: 'internship',
        [JobType.PER_DIEM]: '',
        [JobType.NIGHTS]: '',
        [JobType.OTHER]: '',
        [JobType.SUMMER]: '',
        [JobType.VOLUNTEER]: '',
      };
      
      const typeValue = jobTypeMapping[input.jobType];
      if (typeValue) {
        params.append('employment_types', typeValue);
      }
    }
    
    if (input.isRemote) {
      params.append('remote_jobs_only', 'true');
    }
    
    if (input.hoursOld) {
      if (input.hoursOld <= 24) {
        params.append('days', '1');
      } else if (input.hoursOld <= 168) {
        params.append('days', '7');
      } else if (input.hoursOld <= 720) {
        params.append('days', '30');
      }
    }
    
    if (page > 1) {
      params.append('page', page.toString());
    }
    
    return `${baseUrl}?${params.toString()}`;
  }

  private parseJobsFromHtml(html: string, input: ScraperInput): JobPost[] {
    const $ = cheerio.load(html);
    const jobs: JobPost[] = [];

    $('.job_content').each((_, element) => {
      try {
        const job = this.parseJobElement($ as any, $(element), input);
        if (job && !this.seenUrls.has(job.jobUrl)) {
          this.seenUrls.add(job.jobUrl);
          jobs.push(job);
        }
      } catch (error) {
        logger.warn('Error parsing job element:', error);
      }
    });

    return jobs;
  }

  private parseJobElement($: any, element: any, input: ScraperInput): JobPost | null {
    const titleElement = element.find('h2.title a');
    const title = titleElement.text().trim();
    const jobUrl = titleElement.attr('href');
    
    if (!title || !jobUrl) {
      return null;
    }

    const fullJobUrl = jobUrl.startsWith('http') ? jobUrl : `https://www.ziprecruiter.com${jobUrl}`;
    
    const companyName = element.find('.company_name a').text().trim() || 
                       element.find('.company_name').text().trim();
    
    const locationText = element.find('.location').text().trim();
    const location = this.parseLocation(locationText);
    
    const salaryText = element.find('.salary').text().trim();
    const compensation = this.parseSalary(salaryText);
    
    const dateText = element.find('.time').text().trim();
    const datePosted = this.parseDate(dateText);
    
    const descriptionElement = element.find('.job_snippet');
    let description = descriptionElement.html() || '';
    
    if (input.descriptionFormat === DescriptionFormat.MARKDOWN && description) {
      description = this.markdownConverter.convert(description);
    }
    
    const jobTypeText = element.find('.employment_type').text().trim();
    const jobTypes = this.parseJobType(jobTypeText);
    
    const isRemote = this.isJobRemote(locationText, description);

    return {
      id: `zr-${this.extractJobId(fullJobUrl)}`,
      title,
      companyName: companyName || undefined,
      jobUrl: fullJobUrl,
      location,
      description: description || undefined,
      jobType: jobTypes,
      compensation,
      datePosted,
      emails: extractEmailsFromText(description) || undefined,
      isRemote,
    };
  }

  private parseLocation(locationText: string): Location {
    if (!locationText) return {};
    
    const parts = locationText.split(',').map(p => p.trim());
    
    if (parts.length >= 2) {
      return {
        city: parts[0],
        state: parts[1],
      };
    } else if (parts.length === 1) {
      return {
        city: parts[0],
      };
    }
    
    return {};
  }

  private parseSalary(salaryText: string): Compensation | undefined {
    if (!salaryText) return undefined;
    
    // Extract salary range like "$50,000 - $70,000 a year"
    const yearlyMatch = salaryText.match(/\$(\d+(?:,\d+)*)\s*-\s*\$(\d+(?:,\d+)*)\s*a\s*year/i);
    if (yearlyMatch) {
      return {
        interval: CompensationInterval.YEARLY,
        minAmount: parseInt(yearlyMatch[1].replace(/,/g, '')),
        maxAmount: parseInt(yearlyMatch[2].replace(/,/g, '')),
        currency: 'USD',
      };
    }
    
    // Extract hourly range like "$25 - $35 an hour"
    const hourlyMatch = salaryText.match(/\$(\d+(?:\.\d+)?)\s*-\s*\$(\d+(?:\.\d+)?)\s*an?\s*hour/i);
    if (hourlyMatch) {
      return {
        interval: CompensationInterval.HOURLY,
        minAmount: parseFloat(hourlyMatch[1]),
        maxAmount: parseFloat(hourlyMatch[2]),
        currency: 'USD',
      };
    }
    
    return undefined;
  }

  private parseDate(dateText: string): string | undefined {
    if (!dateText) return undefined;
    
    const now = new Date();
    
    if (dateText.includes('today')) {
      return now.toISOString().split('T')[0];
    } else if (dateText.includes('yesterday')) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    } else if (dateText.includes('day')) {
      const match = dateText.match(/(\d+)\s*day/);
      if (match) {
        const daysAgo = parseInt(match[1]);
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        return date.toISOString().split('T')[0];
      }
    }
    
    return undefined;
  }

  private parseJobType(jobTypeText: string): JobType[] {
    if (!jobTypeText) return [];
    
    const typeMapping: Record<string, JobType> = {
      'full-time': JobType.FULL_TIME,
      'part-time': JobType.PART_TIME,
      'contract': JobType.CONTRACT,
      'temporary': JobType.TEMPORARY,
      'internship': JobType.INTERNSHIP,
    };
    
    const normalized = jobTypeText.toLowerCase().trim();
    const jobType = typeMapping[normalized];
    
    return jobType ? [jobType] : [];
  }

  private isJobRemote(locationText: string, description: string): boolean {
    const remoteKeywords = ['remote', 'work from home', 'wfh', 'telecommute'];
    
    const textToCheck = `${locationText} ${description}`.toLowerCase();
    return remoteKeywords.some(keyword => textToCheck.includes(keyword));
  }

  private extractJobId(url: string): string {
    const match = url.match(/\/jobs\/([^\/\?]+)/);
    return match ? match[1] : Math.random().toString(36).substr(2, 9);
  }
}
