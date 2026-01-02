/**
 * BDJobs Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import {
  JobPost,
  JobResponse,
  ScraperInput,
  Site,
  DescriptionFormat,
  Scraper,
} from '../model';
import {
  createSession,
  createLogger,
  randomDelay,
  markdownConverter,
  removeAttributes,
} from '../util';
import { HEADERS, SEARCH_PARAMS } from './constant';
import { parseLocation, parseDate, findJobListings, isJobRemote } from './util';

const log = createLogger('BDJobs');

export class BDJobs implements Scraper {
  site = Site.BDJOBS;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly baseUrl = 'https://jobs.bdjobs.com';
  private readonly searchUrl = 'https://jobs.bdjobs.com/jobsearch.asp';
  private readonly delay = 2;
  private readonly bandDelay = 3;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private readonly country = 'bangladesh';

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

    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();
    let page = 1;
    let requestCount = 0;

    const params = { ...SEARCH_PARAMS, txtsearch: input.searchTerm ?? '' };
    const resultsWanted = input.resultsWanted ?? 15;

    const continueSearch = () => jobList.length < resultsWanted;

    while (continueSearch()) {
      requestCount += 1;
      log.info(`search page: ${requestCount}`);

      try {
        if (page > 1) {
          (params as Record<string, unknown>).pg = page;
        }

        const response = await this.session.get(this.searchUrl, {
          params,
          timeout: input.requestTimeout ?? 60000,
        });

        if (response.status !== 200) {
          log.error(`BDJobs response status code ${response.status}`);
          break;
        }

        const $ = cheerio.load(response.data);
        const jobCards = findJobListings($);

        if (!jobCards || jobCards.length === 0) {
          log.info('No more job listings found');
          break;
        }

        log.info(`Found ${jobCards.length} job cards on page ${page}`);

        for (const jobCard of jobCards) {
          try {
            const jobPost = await this.processJob($, jobCard);
            if (jobPost && !seenIds.has(jobPost.id!)) {
              seenIds.add(jobPost.id!);
              jobList.push(jobPost);

              if (!continueSearch()) {
                break;
              }
            }
          } catch (e) {
            log.error(`Error processing job card: ${(e as Error).message}`);
          }
        }

        page += 1;
        await randomDelay(this.delay, this.delay + this.bandDelay);
      } catch (e) {
        log.error(`Error during scraping: ${(e as Error).message}`);
        break;
      }
    }

    return { jobs: jobList.slice(0, resultsWanted) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async processJob(
    _$: cheerio.CheerioAPI,
    jobCard: any
  ): Promise<JobPost | null> {
    try {
      const $card = cheerio.load(jobCard);

      // Find job link
      const jobLink = $card('a[href*="jobdetail"]').first();
      if (!jobLink.length) {
        return null;
      }

      let jobUrl = jobLink.attr('href') ?? '';
      if (!jobUrl.startsWith('http')) {
        jobUrl = new URL(jobUrl, this.baseUrl).href;
      }

      // Extract job ID from URL
      const jobIdMatch = jobUrl.match(/jobid=([^&]+)/);
      const jobId = jobIdMatch ? jobIdMatch[1] : `bdjobs-${this.hashCode(jobUrl)}`;

      // Extract title
      let title = jobLink.text().trim();
      if (!title) {
        const titleElem = $card('h2, h3, h4, strong, div.job-title-text').first();
        title = titleElem.length ? titleElem.text().trim() : 'N/A';
      }

      // Extract company name
      let companyName: string | null = null;
      const companyElem = $card('span.comp-name-text, div.comp-name-text').first();
      if (companyElem.length) {
        companyName = companyElem.text().trim();
      } else {
        const altCompanyElem = $card(
          'span[class*="company"], span[class*="org"], span[class*="comp-name"]'
        ).first();
        companyName = altCompanyElem.length ? altCompanyElem.text().trim() : 'N/A';
      }

      // Extract location
      let locationText = 'Dhaka, Bangladesh';
      const locationElem = $card('span.locon-text-d, div.locon-text-d').first();
      if (locationElem.length) {
        locationText = locationElem.text().trim();
      } else {
        const altLocationElem = $card(
          'span[class*="location"], span[class*="area"], span[class*="locon"]'
        ).first();
        if (altLocationElem.length) {
          locationText = altLocationElem.text().trim();
        }
      }

      const location = parseLocation(locationText, this.country);

      // Extract date posted
      let datePosted: Date | null = null;
      const dateElem = $card(
        'span[class*="date"], span[class*="deadline"], span[class*="published"]'
      ).first();
      if (dateElem.length) {
        datePosted = parseDate(dateElem.text().trim());
      }

      // Check if remote
      const remote = isJobRemote(title, null, location);

      // Create job post
      const jobPost: JobPost = {
        id: jobId,
        title,
        companyName,
        location,
        datePosted,
        jobUrl,
        isRemote: remote,
      };

      // Fetch job details
      const jobDetails = await this.getJobDetails(jobUrl);
      if (jobDetails.description) {
        jobPost.description = jobDetails.description;
      }
      if (jobDetails.jobType) {
        jobPost.listingType = jobDetails.jobType;
      }

      return jobPost;
    } catch (e) {
      log.error(`Error in processJob: ${(e as Error).message}`);
      return null;
    }
  }

  private async getJobDetails(
    jobUrl: string
  ): Promise<{ description?: string; jobType?: string; companyIndustry?: string }> {
    if (!this.session) return {};

    try {
      const response = await this.session.get(jobUrl, { timeout: 60000 });
      if (response.status !== 200) {
        return {};
      }

      const $ = cheerio.load(response.data);
      let description = '';

      // Try to find the job content div
      const jobContentDiv = $('div.jobcontent');
      if (jobContentDiv.length) {
        // Look for responsibilities section
        const responsibilitiesHeading = jobContentDiv.find('h4#job_resp, h4:contains("responsibilities"), h5:contains("responsibilities")').first();

        if (responsibilitiesHeading.length) {
          const responsibilitiesElements: string[] = [];
          let sibling = responsibilitiesHeading.next();

          while (sibling.length && !['hr', 'h4', 'h5'].includes(sibling.prop('tagName')?.toLowerCase() ?? '')) {
            if (sibling.is('ul')) {
              sibling.find('li').each((_, li) => {
                responsibilitiesElements.push($(li).text().trim());
              });
            } else if (sibling.is('p')) {
              responsibilitiesElements.push(sibling.text().trim());
            }
            sibling = sibling.next();
          }

          description = responsibilitiesElements.join('\n');
        }
      }

      // Fallback to original approach
      if (!description) {
        const descriptionElem = $(
          'div.job-description, section.details, section.requirements'
        ).first();
        if (descriptionElem.length) {
          const cleanedHtml = removeAttributes(descriptionElem.html() ?? '');
          if (
            this.scraperInput?.descriptionFormat === DescriptionFormat.MARKDOWN
          ) {
            description = markdownConverter(cleanedHtml) ?? '';
          } else {
            description = cleanedHtml;
          }
        }
      }

      // Extract job type
      let jobType: string | undefined;
      const jobTypeElem = $('span:contains("Job Type"), span:contains("Employment Type")').first();
      if (jobTypeElem.length) {
        const nextElem = jobTypeElem.next('span, div');
        if (nextElem.length) {
          jobType = nextElem.text().trim() || undefined;
        }
      }

      // Extract company industry
      let companyIndustry: string | undefined;
      const industryElem = $('span:contains("Industry")').first();
      if (industryElem.length) {
        const nextElem = industryElem.next('span, div');
        if (nextElem.length) {
          companyIndustry = nextElem.text().trim() || undefined;
        }
      }

      return { description, jobType, companyIndustry };
    } catch (e) {
      log.error(`Error getting job details: ${(e as Error).message}`);
      return {};
    }
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export default BDJobs;
