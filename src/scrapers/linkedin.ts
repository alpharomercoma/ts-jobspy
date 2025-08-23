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

const logger = createLogger('LinkedIn');

interface LinkedInJobData {
  jobId: string;
  title: string;
  companyName: string;
  companyUrl?: string;
  location: string;
  postedDate: string;
  applyUrl: string;
  description?: string;
  workplaceTypes?: string[];
  employmentType?: string;
  experienceLevel?: string;
  industries?: string[];
  functions?: string[];
}

export class LinkedInScraper extends Scraper {
  private session: SessionManager;
  private seenUrls: Set<string> = new Set();
  private markdownConverter: MarkdownConverter;

  constructor(config?: { proxies?: string[] | string; caCert?: string; userAgent?: string }) {
    super(Site.LINKEDIN, config);
    this.session = new SessionManager({
      proxies: this.proxies,
      userAgent: this.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      timeout: 15000,
    });
    this.markdownConverter = new MarkdownConverter();
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    logger.info('Starting LinkedIn scrape');
    
    const jobs: JobPost[] = [];
    const resultsWanted = input.resultsWanted || 15;
    const offset = input.offset || 0;
    let start = offset;

    while (jobs.length < resultsWanted) {
      logger.info(`Scraping LinkedIn jobs, start: ${start}`);
      
      try {
        const pageJobs = await this.scrapePage(input, start);
        
        if (pageJobs.length === 0) {
          logger.info('No more jobs found');
          break;
        }

        jobs.push(...pageJobs);
        start += 25; // LinkedIn typically returns 25 jobs per page

        // Avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Error scraping LinkedIn page:`, error);
        break;
      }
    }

    const finalJobs = jobs.slice(0, resultsWanted);
    logger.info(`Scraped ${finalJobs.length} jobs from LinkedIn`);
    
    return { jobs: finalJobs };
  }

  private async scrapePage(input: ScraperInput, start: number): Promise<JobPost[]> {
    const params = this.buildSearchParams(input, start);
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

    try {
      const response = await this.session.get(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.linkedin.com/jobs/search',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (response.status !== 200) {
        logger.warn(`LinkedIn API responded with status ${response.status}`);
        return [];
      }

      return this.parseJobsFromHtml(response.data, input);
    } catch (error) {
      logger.error('Error making LinkedIn request:', error);
      return [];
    }
  }

  private buildSearchParams(input: ScraperInput, start: number): string {
    const params = new URLSearchParams();
    
    if (input.searchTerm) {
      params.append('keywords', input.searchTerm);
    }
    
    if (input.location) {
      params.append('location', input.location);
    }
    
    if (input.distance) {
      params.append('distance', input.distance.toString());
    }
    
    if (input.jobType) {
      const jobTypeMapping: Record<JobType, string> = {
        [JobType.FULL_TIME]: 'F',
        [JobType.PART_TIME]: 'P',
        [JobType.CONTRACT]: 'C',
        [JobType.TEMPORARY]: 'T',
        [JobType.INTERNSHIP]: 'I',
        [JobType.VOLUNTEER]: 'V',
        [JobType.PER_DIEM]: '',
        [JobType.NIGHTS]: '',
        [JobType.OTHER]: 'O',
        [JobType.SUMMER]: '',
      };
      
      const typeCode = jobTypeMapping[input.jobType];
      if (typeCode) {
        params.append('f_JT', typeCode);
      }
    }
    
    if (input.isRemote) {
      params.append('f_WT', '2'); // Remote work type
    }
    
    if (input.easyApply) {
      params.append('f_AL', 'true');
    }
    
    if (input.hoursOld) {
      const timeMapping: Record<number, string> = {
        24: 'r86400',
        168: 'r604800', // 1 week
        720: 'r2592000', // 1 month
      };
      
      const timeFilter = timeMapping[input.hoursOld] || 'r86400';
      params.append('f_TPR', timeFilter);
    }
    
    if (input.linkedinCompanyIds && input.linkedinCompanyIds.length > 0) {
      params.append('f_C', input.linkedinCompanyIds.join(','));
    }
    
    params.append('start', start.toString());
    
    return params.toString();
  }

  private parseJobsFromHtml(html: string, input: ScraperInput): JobPost[] {
    // This is a simplified parser - in a real implementation, you'd use cheerio
    // to parse the HTML and extract job data
    const jobs: JobPost[] = [];
    
    // For now, return empty array as LinkedIn's HTML parsing is complex
    // and would require detailed reverse engineering of their current structure
    logger.warn('LinkedIn HTML parsing not fully implemented - this is a placeholder');
    
    return jobs;
  }

  private parseJobType(employmentType?: string): JobType[] {
    if (!employmentType) return [];
    
    const typeMapping: Record<string, JobType> = {
      'Full-time': JobType.FULL_TIME,
      'Part-time': JobType.PART_TIME,
      'Contract': JobType.CONTRACT,
      'Temporary': JobType.TEMPORARY,
      'Internship': JobType.INTERNSHIP,
      'Volunteer': JobType.VOLUNTEER,
    };
    
    const jobType = typeMapping[employmentType];
    return jobType ? [jobType] : [];
  }

  private parseLocation(locationStr: string): Location {
    const parts = locationStr.split(',').map(p => p.trim());
    
    if (parts.length >= 2) {
      return {
        city: parts[0],
        state: parts[1],
        country: parts[2],
      };
    } else if (parts.length === 1) {
      return {
        city: parts[0],
      };
    }
    
    return {};
  }

  private parseExperienceLevel(level?: string): string | undefined {
    const levelMapping: Record<string, string> = {
      '1': 'Internship',
      '2': 'Entry level',
      '3': 'Associate',
      '4': 'Mid-Senior level',
      '5': 'Director',
      '6': 'Executive',
    };
    
    return level ? levelMapping[level] : undefined;
  }
}
