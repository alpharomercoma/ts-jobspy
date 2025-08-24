import axios, { AxiosInstance } from 'axios';
import { Scraper } from '../models';
import { 
  ScraperInput, 
  JobResponse, 
  JobPost, 
  Site, 
  DescriptionFormat,
  Location,
  Compensation,
  CompensationInterval,
  JobType
} from '../types';
import { createLogger, extractEmailsFromText, markdownConverter } from '../utils';
import * as cheerio from 'cheerio';

const logger = createLogger('BDJobs');

interface BDJobsData {
  jobId: string;
  title: string;
  companyName: string;
  location: string;
  experience: string;
  salary: string;
  jobDescription: string;
  postedDate: string;
  skills: string[];
  jobUrl: string;
  companyLogo?: string;
  deadline?: string;
  vacancy?: number;
  jobType?: string;
}

export class BDJobsScraper extends Scraper {
  private session: AxiosInstance;
  private baseUrl = 'https://www.bdjobs.com';
  private seenUrls: Set<string> = new Set();

  constructor(config: any = {}) {
    super(Site.BDJOBS, config);
    
    this.session = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://www.bdjobs.com/',
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
        logger.info(`Scraping BDJobs page ${page}/${maxPages}`);
        
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
      logger.error('BDJobs scraping failed:', error);
      return { jobs: [] };
    }
  }

  private async fetchJobsPage(input: ScraperInput, page: number): Promise<JobPost[]> {
    const searchParams = new URLSearchParams({
      txtsearch: input.searchTerm || '',
      pg: page.toString(),
    });

    try {
      const url = `https://jobs.bdjobs.com/jobsearch.asp?${searchParams.toString()}`;
      const response = await this.session.get(url);
      
      // Parse HTML to extract job data
      const jobData = this.parseJobsHTML(response.data);
      
      const jobs: JobPost[] = [];
      for (const data of jobData) {
        const job = await this.processJob(data, input);
        if (job) {
          jobs.push(job);
        }
      }
      
      return jobs;
    } catch (error) {
      logger.error('Failed to fetch BDJobs page:', error);
      return [];
    }
  }

  private parseJobsHTML(html: string): BDJobsData[] {
    const $ = cheerio.load(html);
    const jobs: BDJobsData[] = [];

    $('div.norm-jobs-wrapper, div.sout-jobs-wrapper').each((_, element) => {
      const jobCard = $(element);
      const jobLink = jobCard.find('a[href*="jobdetails.asp"]');
      if (!jobLink.length) return;

      const jobUrl = new URL(jobLink.attr('href')!, this.baseUrl).toString();
      const jobId = new URL(jobUrl).searchParams.get('JobID') || '';
      const title = jobLink.text().trim();
      const companyName = jobCard.find('.comp-name-text').text().trim();
      const location = jobCard.find('.locon-text-d').text().trim();
      const postedDate = jobCard.find('div.dead-text').text().trim();

      jobs.push({
        jobId,
        title,
        companyName,
        location,
        jobUrl,
        postedDate,
        experience: '',
        salary: '',
        jobDescription: '',
        skills: [],
      });
    });

    return jobs;
  }

  private async processJob(jobData: BDJobsData, input: ScraperInput): Promise<JobPost | null> {
    const jobUrl = jobData.jobUrl;
    
    if (this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

    // Fetch detailed job information
    let detailedJob = jobData;
    try {
      detailedJob = await this.fetchJobDetails(jobData.jobId, input);
    } catch (error) {
      logger.warn(`Failed to fetch details for job ${jobData.jobId}:`, error);
    }

    const location = this.parseLocation(detailedJob.location);
    const compensation = this.parseCompensation(detailedJob.salary);
    
    let description = detailedJob.jobDescription;
    if (input.descriptionFormat === DescriptionFormat.MARKDOWN && description) {
      description = markdownConverter(description);
    }

    const datePosted = detailedJob.postedDate ? 
      new Date(detailedJob.postedDate).toISOString().split('T')[0] : undefined;

    return {
      id: `bdjobs-${detailedJob.jobId}`,
      title: detailedJob.title,
      companyName: detailedJob.companyName,
      jobUrl,
      location,
      description,
      compensation,
      datePosted,
      isRemote: this.isRemoteJob(detailedJob.location, description),
      emails: description ? extractEmailsFromText(description) || undefined : undefined,
      companyLogo: detailedJob.companyLogo,
      skills: detailedJob.skills,
      vacancyCount: detailedJob.vacancy,
      jobType: detailedJob.jobType ? [this.mapBDJobsJobType(detailedJob.jobType)] : undefined,
    };
  }

  private async fetchJobDetails(jobId: string, input: ScraperInput): Promise<BDJobsData> {
    try {
      const url = `${this.baseUrl}/jobs/${jobId}`;
      const response = await this.session.get(url);
      
      // Parse detailed job page
      return this.parseJobDetailsHTML(response.data, jobId);
    } catch (error) {
      logger.warn(`Failed to fetch job details for ${jobId}:`, error);
      throw error;
    }
  }

  private parseJobDetailsHTML(html: string, jobId: string): BDJobsData {
    const $ = cheerio.load(html);

    const jobContent = $('div.jobcontent');
    const title = jobContent.find('h1, h2, h3').first().text().trim();
    const companyName = jobContent.find('h4 a').first().text().trim();

    let description = '';
    const respHeading = jobContent.find('h4#job_resp, h5:contains("Responsibilities")');
    if (respHeading.length) {
      let nextElement = respHeading.next();
      while (nextElement.length && !nextElement.is('h4, h5, hr')) {
        description += nextElement.text().trim() + '\n';
        nextElement = nextElement.next();
      }
    }

    const location = jobContent.find('div.location-info').text().trim();
    const salary = jobContent.find('div.salary-info').text().trim();
    const experience = jobContent.find('div.exp-info').text().trim();
    const postedDate = jobContent.find('span.date-info').text().trim();

    return {
      jobId,
      title,
      companyName,
      location,
      experience,
      salary,
      jobDescription: description,
      postedDate,
      skills: [],
      jobUrl: '',
    };
  }

  private parseLocation(locationStr: string): Location {
    const parts = locationStr.split(',').map(part => part.trim());
    const location: Location = {};
    
    if (parts.length >= 1) location.city = parts[0];
    if (parts.length >= 2) location.state = parts[1];
    location.country = 'Bangladesh'; // Default for BDJobs
    
    return location;
  }

  private parseCompensation(salaryStr: string): Compensation | undefined {
    if (!salaryStr || salaryStr.toLowerCase().includes('negotiable')) {
      return undefined;
    }

    // Parse salary string like "25,000-35,000 BDT" or "Tk. 30,000 - 50,000"
    const salaryMatch = salaryStr.match(/(?:tk\.?\s*)?(\d+(?:,\d+)*)\s*-\s*(\d+(?:,\d+)*)\s*(?:bdt|taka)?/i);
    
    if (!salaryMatch) return undefined;

    const minAmount = parseFloat(salaryMatch[1].replace(/,/g, ''));
    const maxAmount = parseFloat(salaryMatch[2].replace(/,/g, ''));

    return {
      minAmount,
      maxAmount,
      currency: 'BDT',
      interval: CompensationInterval.MONTHLY, // BDJobs typically shows monthly salaries
    };
  }

  private mapJobTypeToBDJobs(jobType: JobType): string {
    const mapping: Record<string, string> = {
      [JobType.FULL_TIME]: 'full-time',
      [JobType.PART_TIME]: 'part-time',
      [JobType.CONTRACT]: 'contract',
      [JobType.TEMPORARY]: 'temporary',
      [JobType.INTERNSHIP]: 'internship',
    };
    
    return mapping[jobType] || 'full-time';
  }

  private mapBDJobsJobType(jobType: string): JobType {
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
    const remoteKeywords = ['remote', 'work from home', 'wfh', 'home based'];
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
