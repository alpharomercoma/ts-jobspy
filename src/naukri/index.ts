/**
 * Naukri Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import { NaukriException, RateLimitException } from '../exception';
import {
  type Compensation,
  CompensationInterval,
  Country,
  DescriptionFormat,
  type JobPost,
  type JobResponse,
  type Location,
  type Scraper,
  type ScraperInput,
  Site,
} from '../model';
import {
  createLogger,
  createSession,
  extractEmailsFromText,
  intervalFromText,
  markdownConverter,
  plainConverter,
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
      userAgent: this.userAgent,
      hasRetry: true,
      retryDelay: 5,
    });

    // Update session headers; a caller-supplied userAgent overrides the default.
    if (this.session.defaults.headers) {
      Object.assign(this.session.defaults.headers, HEADERS);
      if (this.userAgent) {
        this.session.defaults.headers['user-agent'] = this.userAgent;
      }
    }

    log.info('Naukri scraper initialized');

    const jobList: JobPost[] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();
    // Naukri paginates in fixed pages of `jobsPerPage`. Align to the page that
    // contains `offset`, collect the intra-page remainder, and slice it off at
    // the end so `offset` is honored exactly (the API cannot start mid-page).
    const offset = input.offset ?? 0;
    let page = Math.floor(offset / this.jobsPerPage) + 1;
    const skip = offset - (page - 1) * this.jobsPerPage;
    let requestCount = 0;
    const secondsOld = input.hoursOld ? input.hoursOld * 3600 : null;
    const resultsWanted = input.resultsWanted ?? 15;
    const targetCount = resultsWanted + skip;

    // Options Naukri's search request cannot express. Declared unconditionally:
    // the orchestrator intersects this list with the options the caller actually
    // supplied, so a filter is never reported unless it was set. isRemote (remote
    // param) and hoursOld (days param) ARE applied, so they are omitted here.
    const unsupportedOptions: string[] = ['distance', 'jobType', 'easyApply'];

    const finish = (): JobResponse => ({
      jobs: jobList.slice(skip, skip + resultsWanted),
      ...(errors.length > 0 && { errors }),
      ...(unsupportedOptions.length > 0 && { unsupportedOptions }),
    });

    const continueSearch = () => jobList.length < targetCount && page <= 50;

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
        // Naukri filters by whole days. Sub-day values would floor to 0 and
        // silently disable the filter, so apply it at day granularity with a
        // floor of 1 day; values >= 24h map to their exact day count.
        params.days = Math.max(1, Math.floor(secondsOld / 86400));
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
          signal: input.signal,
        });

        if (response.status < 200 || response.status >= 400) {
          const failure =
            response.status === 429
              ? new RateLimitException('Naukri', 'Naukri responded with HTTP 429 (rate limited)')
              : new NaukriException(`Naukri API responded with status code ${response.status}`);
          log.error(failure.message);
          // Nothing collected: fail the whole scrape. Partially collected:
          // report what we have, recording the interruption honestly.
          if (jobList.length === 0) throw failure;
          errors.push(`page ${requestCount}: ${failure.message}`);
          return finish();
        }

        const data = response.data;
        const jobDetails = data.jobDetails ?? [];

        log.info(`Received ${jobDetails.length} job entries from API`);

        if (jobDetails.length === 0) {
          log.warning('No job details found in API response');
          break;
        }

        for (const [index, job] of jobDetails.entries()) {
          const jobId = job.jobId;
          if (!jobId) {
            // Surface a malformed entry so a systematically broken feed reads as
            // 'partial' rather than cleanly smaller. Don't throw for it.
            errors.push(`job ${index}: missing id`);
            continue;
          }
          if (seenIds.has(jobId)) {
            continue;
          }
          seenIds.add(jobId);
          log.debug(`Processing job ID: ${jobId}`);

          try {
            const jobPost = this.processJob(job, jobId);
            if (jobPost) {
              jobList.push(jobPost);
              log.info(`Added job: ${jobPost.title} (ID: ${jobId})`);
            }
            if (!continueSearch()) {
              break;
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            log.error(`Error processing job ID ${jobId}: ${message}`);
            // Surface the drop so a systematically failing parser shows up as
            // 'partial' in meta instead of looking like a clean, smaller result.
            errors.push(`job ${jobId}: ${message}`);
          }
        }

        // A short page is terminal: Naukri returned fewer than a full page, so
        // there are no further results. Stop rather than requesting empty pages
        // up to the page<=50 backstop.
        if (jobDetails.length < this.jobsPerPage) {
          log.info('Received a short page; no more results.');
          break;
        }

        if (continueSearch()) {
          await randomDelay(this.delay, this.delay + this.bandDelay, input.signal);
          page += 1;
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        log.error(`Naukri API request failed: ${error.message}`);
        // Nothing collected: propagate so the orchestrator marks the site
        // 'error'. Partially collected: return what we have with the error noted.
        if (jobList.length === 0) throw error;
        errors.push(`page ${requestCount}: ${error.message}`);
        return finish();
      }
    }

    log.info(`Scraping completed. Total jobs collected: ${jobList.length}`);
    return finish();
  }

  private processJob(job: NaukriJobData, jobId: string): JobPost | null {
    const title = job.title ?? 'N/A';
    const company = job.companyName ?? 'N/A';
    const companyUrl = job.staticUrl ? `https://www.naukri.com/${job.staticUrl}` : null;

    const location = this.getLocation(job.placeholders);
    const compensation = this.getCompensation(job.placeholders);
    const datePosted = this.parseDate(job.footerPlaceholderLabel, job.createdDate);

    const jobUrl = `https://www.naukri.com${job.jdURL ?? `/job/${jobId}`}`;
    // The description is always present in Naukri's search response, so use it
    // directly — it must not be gated behind linkedinFetchDescription.
    const rawDescription = job.jobDescription ?? null;

    const jobType = parseJobType(rawDescription);
    const companyIndustry = parseCompanyIndustry(rawDescription);

    let description = rawDescription;
    if (description) {
      const format = this.scraperInput?.descriptionFormat;
      if (format === DescriptionFormat.MARKDOWN) {
        description = markdownConverter(description) ?? description;
      } else if (format === DescriptionFormat.PLAIN) {
        description = plainConverter(description) ?? description;
      }
      // DescriptionFormat.HTML (and the default) leaves the description as-is.
    }

    const remote = isJobRemote(title, description ?? '', location);
    const companyLogo = job.logoPathV3 ?? job.logoPath ?? null;

    // Naukri-specific fields
    const skills = job.tagsAndSkills ? job.tagsAndSkills.split(',').map((s) => s.trim()) : null;
    const experienceRange = job.experienceText ?? null;
    const ambitionBox = job.ambitionBoxData ?? {};
    const companyRating = ambitionBox.AggregateRating
      ? parseFloat(ambitionBox.AggregateRating)
      : null;
    const companyReviewsCount = ambitionBox.ReviewsCount ?? null;
    const vacancyCount = job.vacancy ?? null;
    const workFromHomeType = this.inferWorkFromHomeType(job.placeholders, title, description ?? '');

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
        log.debug(`Parsed location: ${[city, state].filter(Boolean).join(', ')}`);
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

          // Naukri quotes Lacs/Cr amounts per annum (usually "... P.A."), so
          // record the yearly interval instead of leaving it unset.
          const interval = intervalFromText(salaryText) ?? CompensationInterval.YEARLY;

          log.debug(`Parsed salary: ${minSalary} - ${maxSalary} INR (${interval})`);
          return {
            interval,
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

  private parseDate(label: string | undefined, createdDate: number | undefined): Date | null {
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
    const locationStr = placeholders.find((p) => p.type === 'location')?.label.toLowerCase() ?? '';

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
