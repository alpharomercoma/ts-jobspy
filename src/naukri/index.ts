/**
 * Naukri Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { AxiosInstance } from 'axios';
import {
    Compensation,
    Country,
    DescriptionFormat,
    JobPost,
    JobResponse,
    Location,
    Scraper,
    ScraperInput,
    Site,
} from '../model';
import {
    createLogger,
    createSession,
    extractEmailsFromText,
    markdownConverter,
    randomDelay,
} from '../util';
import { HEADERS } from './constant';
import { isJobRemote, parseCompanyIndustry, parseJobType } from './util';

const log = createLogger('Naukri');

interface NaukriPlaceholder {
  type: string;
  label: string;
}

interface NaukriAmbitionBoxData {
  AggregateRating?: string;
  ReviewsCount?: number;
}

interface NaukriJobData {
  jobId: string;
  title: string;
  companyName: string;
  staticUrl?: string;
  jdURL?: string;
  jobDescription?: string;
  placeholders: NaukriPlaceholder[];
  footerPlaceholderLabel?: string;
  createdDate?: number;
  logoPathV3?: string;
  logoPath?: string;
  tagsAndSkills?: string;
  experienceText?: string;
  ambitionBoxData?: NaukriAmbitionBoxData;
  vacancy?: number;
}

interface NaukriApiResponse {
  jobDetails?: NaukriJobData[];
}

export class Naukri implements Scraper {
  site = Site.NAUKRI;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly baseUrl = 'https://www.naukri.com/jobapi/v3/search';
  private readonly delay = 3;
  private readonly bandDelay = 4;
  private readonly jobsPerPage = 20;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;

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

    log.info('Naukri scraper initialized');

    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();
    const start = input.offset ?? 0;
    let page = Math.floor(start / this.jobsPerPage) + 1;
    let requestCount = 0;
    const secondsOld = input.hoursOld ? input.hoursOld * 3600 : null;
    const resultsWanted = input.resultsWanted ?? 15;

    const continueSearch = () => jobList.length < resultsWanted && page <= 50;

    while (continueSearch()) {
      requestCount += 1;
      log.info(
        `Scraping page ${requestCount} / ${Math.ceil(resultsWanted / this.jobsPerPage)} for search term: ${input.searchTerm}`
      );

      const params: Record<string, string | number | undefined> = {
        noOfResults: this.jobsPerPage,
        urlType: 'search_by_keyword',
        searchType: 'adv',
        keyword: input.searchTerm,
        pageNo: page,
        k: input.searchTerm,
        seoKey: `${(input.searchTerm ?? '').toLowerCase().replace(/\s+/g, '-')}-jobs`,
        src: 'jobsearchDesk',
        latLong: '',
        location: input.location,
        remote: input.isRemote ? 'true' : undefined,
      };

      if (secondsOld) {
        params.days = Math.floor(secondsOld / 86400);
      }

      // Filter out undefined values
      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined)
      );

      try {
        log.debug(`Sending request to ${this.baseUrl}`);
        const response = await this.session.get<NaukriApiResponse>(this.baseUrl, {
          params: filteredParams,
          timeout: 10000,
        });

        if (response.status < 200 || response.status >= 400) {
          log.error(
            `Naukri API response status code ${response.status} - ${JSON.stringify(response.data)}`
          );
          return { jobs: jobList };
        }

        const data = response.data;
        const jobDetails = data.jobDetails ?? [];

        log.info(`Received ${jobDetails.length} job entries from API`);

        if (jobDetails.length === 0) {
          log.warning('No job details found in API response');
          break;
        }

        for (const job of jobDetails) {
          const jobId = job.jobId;
          if (!jobId || seenIds.has(jobId)) {
            continue;
          }
          seenIds.add(jobId);
          log.debug(`Processing job ID: ${jobId}`);

          try {
            const fetchDesc = input.linkedinFetchDescription ?? false;
            const jobPost = this.processJob(job, jobId, fetchDesc);
            if (jobPost) {
              jobList.push(jobPost);
              log.info(`Added job: ${jobPost.title} (ID: ${jobId})`);
            }
            if (!continueSearch()) {
              break;
            }
          } catch (e) {
            log.error(`Error processing job ID ${jobId}: ${(e as Error).message}`);
          }
        }

        if (continueSearch()) {
          await randomDelay(this.delay, this.delay + this.bandDelay);
          page += 1;
        }
      } catch (e) {
        log.error(`Naukri API request failed: ${(e as Error).message}`);
        return { jobs: jobList };
      }
    }

    log.info(`Scraping completed. Total jobs collected: ${jobList.length}`);
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private processJob(
    job: NaukriJobData,
    jobId: string,
    fullDescr: boolean
  ): JobPost | null {
    const title = job.title ?? 'N/A';
    const company = job.companyName ?? 'N/A';
    const companyUrl = job.staticUrl
      ? `https://www.naukri.com/${job.staticUrl}`
      : null;

    const location = this.getLocation(job.placeholders);
    const compensation = this.getCompensation(job.placeholders);
    const datePosted = this.parseDate(job.footerPlaceholderLabel, job.createdDate);

    const jobUrl = `https://www.naukri.com${job.jdURL ?? `/job/${jobId}`}`;
    const rawDescription = fullDescr ? job.jobDescription : null;

    const jobType = parseJobType(rawDescription ?? null);
    const companyIndustry = parseCompanyIndustry(rawDescription ?? null);

    let description = rawDescription;
    if (
      description &&
      this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN
    ) {
      description = markdownConverter(description) ?? description;
    }

    const remote = isJobRemote(title, description ?? '', location);
    const companyLogo = job.logoPathV3 ?? job.logoPath ?? null;

    // Naukri-specific fields
    const skills = job.tagsAndSkills
      ? job.tagsAndSkills.split(',').map((s) => s.trim())
      : null;
    const experienceRange = job.experienceText ?? null;
    const ambitionBox = job.ambitionBoxData ?? {};
    const companyRating = ambitionBox.AggregateRating
      ? parseFloat(ambitionBox.AggregateRating)
      : null;
    const companyReviewsCount = ambitionBox.ReviewsCount ?? null;
    const vacancyCount = job.vacancy ?? null;
    const workFromHomeType = this.inferWorkFromHomeType(
      job.placeholders,
      title,
      description ?? ''
    );

    return {
      id: `nk-${jobId}`,
      title,
      companyName: company,
      companyUrl,
      location,
      isRemote: remote,
      datePosted,
      jobUrl,
      compensation,
      jobType,
      companyIndustry,
      description,
      emails: extractEmailsFromText(description ?? ''),
      companyLogo,
      skills,
      experienceRange,
      companyRating,
      companyReviewsCount,
      vacancyCount,
      workFromHomeType,
    };
  }

  private getLocation(placeholders: NaukriPlaceholder[]): Location {
    let location: Location = { country: Country.INDIA };

    for (const placeholder of placeholders) {
      if (placeholder.type === 'location') {
        const locationStr = placeholder.label;
        const parts = locationStr.split(', ');
        const city = parts[0] ?? undefined;
        const state = parts[1] ?? undefined;
        location = { city, state, country: Country.INDIA };
        log.debug(
          `Parsed location: ${[city, state].filter(Boolean).join(', ')}`
        );
        break;
      }
    }

    return location;
  }

  private getCompensation(placeholders: NaukriPlaceholder[]): Compensation | null {
    for (const placeholder of placeholders) {
      if (placeholder.type === 'salary') {
        const salaryText = placeholder.label.trim();

        if (salaryText === 'Not disclosed') {
          log.debug('Salary not disclosed');
          return null;
        }

        // Handle Indian salary formats (e.g., "12-16 Lacs P.A.", "1-5 Cr")
        const salaryMatch = salaryText.match(
          /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(Lacs?|Lakh|Cr)/i
        );

        if (salaryMatch) {
          let minSalary = parseFloat(salaryMatch[1]);
          let maxSalary = parseFloat(salaryMatch[2]);
          const unit = salaryMatch[3].toLowerCase();
          const currency = 'INR';

          // Convert to base units (INR)
          if (unit === 'lacs' || unit === 'lac' || unit === 'lakh') {
            minSalary *= 100000; // 1 Lakh = 100,000 INR
            maxSalary *= 100000;
          } else if (unit === 'cr') {
            minSalary *= 10000000; // 1 Crore = 10,000,000 INR
            maxSalary *= 10000000;
          }

          log.debug(`Parsed salary: ${minSalary} - ${maxSalary} INR`);
          return {
            minAmount: Math.floor(minSalary),
            maxAmount: Math.floor(maxSalary),
            currency,
          };
        }

        log.debug(`Could not parse salary: ${salaryText}`);
        return null;
      }
    }

    return null;
  }

  private parseDate(
    label: string | undefined,
    createdDate: number | undefined
  ): Date | null {
    const today = new Date();

    if (!label) {
      if (createdDate) {
        return new Date(createdDate);
      }
      return null;
    }

    const lowerLabel = label.toLowerCase();

    if (
      lowerLabel.includes('today') ||
      lowerLabel.includes('just now') ||
      lowerLabel.includes('few hours')
    ) {
      log.debug('Date parsed as today');
      return today;
    }

    if (lowerLabel.includes('ago')) {
      const match = lowerLabel.match(/(\d+)\s*day/);
      if (match) {
        const days = parseInt(match[1], 10);
        const parsedDate = new Date(today);
        parsedDate.setDate(parsedDate.getDate() - days);
        log.debug(`Date parsed: ${days} days ago -> ${parsedDate.toISOString()}`);
        return parsedDate;
      }
    }

    if (createdDate) {
      const parsedDate = new Date(createdDate);
      log.debug(`Date parsed from timestamp: ${parsedDate.toISOString()}`);
      return parsedDate;
    }

    log.debug('No date parsed');
    return null;
  }

  private inferWorkFromHomeType(
    placeholders: NaukriPlaceholder[],
    title: string,
    description: string
  ): string | null {
    const locationStr = placeholders
      .find((p) => p.type === 'location')
      ?.label.toLowerCase() ?? '';

    if (
      locationStr.includes('hybrid') ||
      title.toLowerCase().includes('hybrid') ||
      description.toLowerCase().includes('hybrid')
    ) {
      return 'Hybrid';
    }

    if (
      locationStr.includes('remote') ||
      title.toLowerCase().includes('remote') ||
      description.toLowerCase().includes('remote')
    ) {
      return 'Remote';
    }

    if (
      description.toLowerCase().includes('work from office') ||
      (!description.toLowerCase().includes('remote') &&
        !description.toLowerCase().includes('hybrid'))
    ) {
      return 'Work from office';
    }

    return null;
  }
}

export default Naukri;
