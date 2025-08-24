import axios, { AxiosInstance } from 'axios';
import { Scraper } from '../models';
import {
  Compensation,
  CompensationInterval,
  Country,
  DescriptionFormat,
  JobPost,
  JobResponse,
  Location,
  ScraperInput,
  Site,
} from '../types';
import { createLogger, extractEmailsFromText, markdownConverter } from '../utils';

const logger = createLogger('Naukri');

interface Placeholder {
  type: string;
  label: string;
}

interface AmbitionBoxData {
  AggregateRating?: string;
  ReviewsCount?: number;
}

interface NaukriJobData {
  jobId: string;
  title: string;
  companyName: string;
  staticUrl?: string;
  placeholders: Placeholder[];
  footerPlaceholderLabel?: string;
  createdDate: number;
  jdURL: string;
  jobDescription?: string;
  logoPathV3?: string;
  logoPath?: string;
  tagsAndSkills?: string;
  experienceText?: string;
  ambitionBoxData?: AmbitionBoxData;
  vacancy?: number;
}

export class NaukriScraper extends Scraper {
  private session: AxiosInstance;
  private baseUrl = 'https://www.naukri.com/jobapi/v3/search';
  private seenIds: Set<string> = new Set();

  constructor(config: any = {}) {
    super(Site.NAUKRI, config);

    this.session = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://www.naukri.com/',
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
      const maxResults = input.resultsWanted || 20;
      const jobsPerPage = 20;
      let page = 1;

      while (jobs.length < maxResults) {
        const pagesToScrape = Math.ceil((maxResults - jobs.length) / jobsPerPage);
        logger.info(`Scraping Naukri page ${page}/${pagesToScrape}`);

        try {
          const pageJobs = await this.fetchJobsPage(input, page);
          if (!pageJobs.length) {
            logger.info('No more jobs found, stopping scraper.');
            break;
          }

          for (const job of pageJobs) {
            if (jobs.length < maxResults) {
              jobs.push(job);
            }
          }

        } catch (error) {
          logger.error(`Error on page ${page}:`, error);
          break;
        }
        page++;
      }

      return { jobs: jobs.slice(0, maxResults) };
    } catch (error) {
      logger.error('Naukri scraping failed:', error);
      return { jobs: [] };
    }
  }

  private async fetchJobsPage(input: ScraperInput, page: number): Promise<JobPost[]> {
    const params: Record<string, unknown> = {
      noOfResults: 20,
      urlType: 'search_by_keyword',
      searchType: 'adv',
      keyword: input.searchTerm,
      pageNo: page,
      seoKey: `${(input.searchTerm || '').toLowerCase().replace(/ /g, '-')}-jobs`,
      src: 'jobsearchDesk',
      latLong: '',
      location: input.location,
    };

    if (input.isRemote) {
      params.remote = 'true';
    }

    if (input.hoursOld) {
      params.days = Math.ceil(input.hoursOld / 24).toString();
    }

    try {
      const response = await this.session.get(this.baseUrl, { params });
      const data = response.data;
      const jobDetails: NaukriJobData[] = data?.jobDetails || [];

      if (!jobDetails.length) {
        return [];
      }

      const jobs: JobPost[] = [];
      for (const jobData of jobDetails) {
        if (jobData.jobId && !this.seenIds.has(jobData.jobId)) {
          this.seenIds.add(jobData.jobId);
          const job = this.processJob(jobData, input);
          if (job) {
            jobs.push(job);
          }
        }
      }
      return jobs;
    } catch (error) {
      logger.error('Failed to fetch Naukri jobs page:', error);
      return [];
    }
  }

  private processJob(jobData: NaukriJobData, input: ScraperInput): JobPost | null {
    const title = jobData.title || 'N/A';
    const companyName = jobData.companyName || 'N/A';
    const companyUrl = jobData.staticUrl ? `https://www.naukri.com/${jobData.staticUrl}` : undefined;

    const location = this.getLocation(jobData.placeholders);
    const compensation = this.getCompensation(jobData.placeholders);
    const datePosted = this.parseDate(jobData.footerPlaceholderLabel, jobData.createdDate);

    const jobUrl = `https://www.naukri.com${jobData.jdURL}`;
    let description = jobData.jobDescription;
    if (description && input.descriptionFormat === DescriptionFormat.MARKDOWN) {
      description = markdownConverter(description);
    }

    const workFromHomeType = this.inferWorkFromHomeType(jobData.placeholders, title, description || '');
    const isRemote = workFromHomeType === 'Remote';
    const companyLogo = jobData.logoPathV3 || jobData.logoPath;

    const skills = jobData.tagsAndSkills ? jobData.tagsAndSkills.split(',') : undefined;
    const experienceRange = jobData.experienceText;
    const ambitionBox = jobData.ambitionBoxData;
    const companyRating = ambitionBox?.AggregateRating ? parseFloat(ambitionBox.AggregateRating) : undefined;
    const companyReviewsCount = ambitionBox?.ReviewsCount;
    const vacancyCount = jobData.vacancy;

    return {
      id: `nk-${jobData.jobId}`,
      title,
      companyName,
      companyUrl,
      location,
      isRemote,
      datePosted,
      jobUrl,
      compensation,
      description,
      emails: extractEmailsFromText(description || '') || undefined,
      companyLogo,
      skills,
      experienceRange,
      companyRating,
      companyReviewsCount,
      vacancyCount,
      workFromHomeType,
    };
  }

  private getLocation(placeholders: Placeholder[]): Location {
    const location: Location = { country: Country.INDIA };
    const locationPlaceholder = placeholders.find(p => p.type === 'location');
    if (locationPlaceholder) {
      const parts = locationPlaceholder.label.split(', ');
      location.city = parts[0];
      if (parts.length > 1) {
        location.state = parts[1];
      }
    }
    return location;
  }

  private getCompensation(placeholders: Placeholder[]): Compensation | undefined {
    const salaryPlaceholder = placeholders.find(p => p.type === 'salary');
    if (!salaryPlaceholder || salaryPlaceholder.label.toLowerCase() === 'not disclosed') {
      return undefined;
    }

    const salaryText = salaryPlaceholder.label;
    const salaryMatch = salaryText.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(Lacs|Lakh|Cr)/i);

    if (salaryMatch) {
      let minAmount = parseFloat(salaryMatch[1]);
      let maxAmount = parseFloat(salaryMatch[2]);
      const unit = salaryMatch[3].toLowerCase();

      if (unit === 'lacs' || unit === 'lakh') {
        minAmount *= 100000;
        maxAmount *= 100000;
      } else if (unit === 'cr') {
        minAmount *= 10000000;
        maxAmount *= 10000000;
      }

      return {
        minAmount,
        maxAmount,
        currency: 'INR',
        interval: CompensationInterval.YEARLY,
      };
    }
    return undefined;
  }

  private parseDate(label?: string, createdDate?: number): string | undefined {
    if (!label && !createdDate) return undefined;

    const today = new Date();
    if (label) {
      const lowerLabel = label.toLowerCase();
      if (lowerLabel.includes('today') || lowerLabel.includes('just now') || lowerLabel.includes('few hours')) {
        return today.toISOString().split('T')[0];
      }
      const daysAgoMatch = lowerLabel.match(/(\d+)\s*day/);
      if (daysAgoMatch) {
        const days = parseInt(daysAgoMatch[1]);
        const pastDate = new Date(today.setDate(today.getDate() - days));
        return pastDate.toISOString().split('T')[0];
      }
    }

    if (createdDate) {
      return new Date(createdDate).toISOString().split('T')[0];
    }

    return undefined;
  }

  private inferWorkFromHomeType(placeholders: Placeholder[], title: string, description: string): string | undefined {
    const locationStr = (placeholders.find(p => p.type === 'location')?.label || '').toLowerCase();
    const fullText = `${title.toLowerCase()} ${description.toLowerCase()} ${locationStr}`;

    if (fullText.includes('hybrid')) return 'Hybrid';
    if (fullText.includes('remote')) return 'Remote';
    if (fullText.includes('work from office')) return 'Work from office';

    return undefined;
  }
}
