import { Scraper } from '../models';
import {
  CompensationInterval,
  JobPost,
  JobResponse,
  JobType,
  ScraperInput,
  Site,
} from '../types';
import { MarkdownConverter, SessionManager, createLogger } from '../utils';

const logger = createLogger('ZipRecruiter');

export class ZipRecruiterScraper extends Scraper {
  private session: SessionManager;
  private seenUrls: Set<string> = new Set();
  private markdownConverter: MarkdownConverter;

  constructor (config?: { proxies?: string[] | string; caCert?: string; userAgent?: string; }) {
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
      const response = await this.session.get(url);

      if (response.status !== 200) {
        logger.warn(`ZipRecruiter API responded with status ${response.status}`);
        return [];
      }

      const jobData = response.data;
      return this.parseJobsFromJson(jobData);
    } catch (error) {
      logger.error('Error making ZipRecruiter API request:', error);
      return [];
    }
  }

  private buildSearchUrl(input: ScraperInput, page: number): string {
    const baseUrl = 'https://api.ziprecruiter.com/jobs-app/jobs';
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

    params.append('page', page.toString());

    return `${baseUrl}?${params.toString()}`;
  }

  private parseJobsFromJson(jobData: any): JobPost[] {
    const jobs: JobPost[] = [];
    const jobPosts = jobData.jobs || [];

    for (const job of jobPosts) {
      const jobUrl = `https://www.ziprecruiter.com/jobs//j?lvk=${job.listing_key}`;
      if (this.seenUrls.has(jobUrl)) {
        continue;
      }
      this.seenUrls.add(jobUrl);

      // Parse compensation interval
      let interval = job.compensation_interval;
      if (interval === 'annual') {
        interval = CompensationInterval.YEARLY;
      } else if (interval === 'hourly') {
        interval = CompensationInterval.HOURLY;
      } else if (interval === 'monthly') {
        interval = CompensationInterval.MONTHLY;
      } else if (interval === 'weekly') {
        interval = CompensationInterval.WEEKLY;
      } else if (interval === 'daily') {
        interval = CompensationInterval.DAILY;
      }

      const description = job.job_description || '';

      const jobPost: JobPost = {
        id: `zr-${job.listing_key}`,
        title: job.name,
        companyName: job.hiring_company?.name,
        location: {
          city: job.job_city,
          state: job.job_state,
          country: job.job_country === 'US' ? 'USA' : 'canada',
        },
        jobUrl,
        description: description,
        jobType: this.parseJobType(job.employment_type),
        datePosted: new Date(job.posted_time).toISOString().split('T')[0],
        compensation: job.compensation_min || job.compensation_max ? {
          minAmount: job.compensation_min ? parseInt(job.compensation_min) : undefined,
          maxAmount: job.compensation_max ? parseInt(job.compensation_max) : undefined,
          currency: job.compensation_currency || 'USD',
          interval: interval,
        } : undefined,
        listingType: job.buyer_type,
      };
      jobs.push(jobPost);
    }

    return jobs;
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


}
