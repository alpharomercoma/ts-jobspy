/**
 * BDJobs Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  Site,
  DescriptionFormat,
  type Scraper,
} from '../model';
import {
  createSession,
  createLogger,
  randomDelay,
  markdownConverter,
  plainConverter,
  removeAttributes,
} from '../util';
import { BDJobsException, RateLimitException } from '../exception';
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
  // Safety cap so a site that always returns cards can't loop forever.
  private readonly maxPages = 100;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private enrichmentErrors: string[] = [];
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
      userAgent: this.userAgent,
      hasRetry: true,
      retryDelay: 5,
    });

    // Update session headers; a caller-supplied userAgent overrides the default.
    if (this.session.defaults.headers) {
      Object.assign(this.session.defaults.headers, HEADERS);
      if (this.userAgent) {
        this.session.defaults.headers['User-Agent'] = this.userAgent;
      }
    }

    const jobList: JobPost[] = [];
    const errors: string[] = [];
    this.enrichmentErrors = [];
    const seenIds = new Set<string>();

    // BDJobs pages hold a variable number of cards and expose no stable page
    // size, so we cannot map a job offset onto a starting page reliably. Instead
    // we always start at page 1, accumulate everything up to offset+resultsWanted,
    // and slice the final list to [offset, offset+resultsWanted] - which honors
    // offset exactly and never returns more than resultsWanted.
    const offset = input.offset ?? 0;
    const resultsWanted = input.resultsWanted ?? 15;
    const targetCount = offset + resultsWanted;

    // BDJobs builds its search from only searchTerm, pagination and count; every
    // other search filter the caller set is dropped, so report it honestly.
    const unsupportedOptions = this.collectUnsupportedOptions();

    let page = 1;
    let requestCount = 0;

    const params: Record<string, unknown> = { ...SEARCH_PARAMS, txtsearch: input.searchTerm ?? '' };

    const continueSearch = () => jobList.length < targetCount && page <= this.maxPages;

    const finish = (): JobResponse => {
      const all = [...errors, ...this.enrichmentErrors];
      return {
        jobs: jobList.slice(offset, offset + resultsWanted),
        ...(all.length > 0 && { errors: all }),
        ...(unsupportedOptions.length > 0 && { unsupportedOptions }),
      };
    };

    while (continueSearch()) {
      requestCount += 1;
      log.info(`search page: ${requestCount}`);

      try {
        if (page > 1) {
          params.pg = page;
        }

        const response = await this.session.get(this.searchUrl, {
          params,
          timeout: input.requestTimeout ?? 60000,
          signal: input.signal,
        });

        if (response.status < 200 || response.status >= 400) {
          const failure =
            response.status === 429
              ? new RateLimitException(
                  'BDJobs',
                  'BDJobs responded with HTTP 429 (blocked for too many requests)'
                )
              : new BDJobsException(`BDJobs responded with status code ${response.status}`);
          log.error(failure.message);
          // Nothing collected: fail the scrape. Partially collected: report what
          // we have, recording the interruption honestly.
          if (jobList.length === 0) throw failure;
          errors.push(`page ${requestCount}: ${failure.message}`);
          return finish();
        }

        const $ = cheerio.load(response.data as string);
        const jobCards = findJobListings($);

        if (!jobCards || jobCards.length === 0) {
          log.info('No more job listings found');
          break;
        }

        log.info(`Found ${jobCards.length} job cards on page ${page}`);

        for (let cardIndex = 0; cardIndex < jobCards.length; cardIndex++) {
          const jobCard = jobCards[cardIndex];
          try {
            const jobPost = await this.processJob($, jobCard);
            if (!jobPost) {
              // A genuinely malformed card (missing the required detail link) is
              // a parse failure, not a clean skip - surface it so an all-broken
              // page reads as partial/error instead of cleanly empty.
              this.enrichmentErrors.push(`card ${cardIndex}: missing detail link`);
              continue;
            }
            if (jobPost.id && !seenIds.has(jobPost.id)) {
              seenIds.add(jobPost.id);
              jobList.push(jobPost);

              if (!continueSearch()) {
                break;
              }
            }
            // else: a deliberate duplicate skip - stays silent.
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            log.error(`Error processing job card: ${message}`);
            // Surface the drop so a systematically failing parser shows up as
            // 'partial' instead of looking like a clean, smaller result.
            this.enrichmentErrors.push(`job card: ${message}`);
          }
        }

        page += 1;
        if (continueSearch()) {
          await randomDelay(this.delay, this.delay + this.bandDelay, input.signal);
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (error.message.includes('Proxy')) {
          log.error('BDJobs: Bad proxy');
        } else {
          log.error(`BDJobs: ${error.message}`);
        }
        if (jobList.length === 0) throw error;
        errors.push(`page ${requestCount}: ${error.message}`);
        return finish();
      }
    }

    return finish();
  }

  /**
   * Options BDJobs' search cannot express (it builds only from searchTerm,
   * pagination and count). Declared unconditionally: the orchestrator intersects
   * this list with the options the caller actually supplied, so it must not be
   * gated on resolved values (e.g. distance's default of 50) here.
   */
  private collectUnsupportedOptions(): string[] {
    return ['location', 'distance', 'jobType', 'isRemote', 'easyApply', 'hoursOld'];
  }

  private async processJob(
    _$: cheerio.CheerioAPI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobCard: any
  ): Promise<JobPost | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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

    // Extract date posted. BDJobs cards typically only carry an application
    // DEADLINE (a future date), which is NOT the publication date, so we must not
    // report it as datePosted (codex #12). Only match genuine posting-date markers
    // and leave datePosted null when none is present.
    let datePosted: Date | null = null;
    const dateElem = $card('span[class*="published"], span[class*="posted"]').first();
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
  }

  private async getJobDetails(
    jobUrl: string
  ): Promise<{ description?: string; jobType?: string; companyIndustry?: string }> {
    if (!this.session) return {};

    try {
      const response = await this.session.get(jobUrl, {
        timeout: this.scraperInput?.requestTimeout ?? 60000,
        signal: this.scraperInput?.signal,
      });
      if (response.status < 200 || response.status >= 400) {
        this.enrichmentErrors.push(`job ${jobUrl}: detail fetch returned HTTP ${response.status}`);
        return {};
      }

      const $ = cheerio.load(response.data as string);

      // Collect the description as HTML from whichever section is present, then
      // convert once per the requested format below.
      let descriptionHtml = '';

      const jobContentDiv = $('div.jobcontent');
      if (jobContentDiv.length) {
        // Look for responsibilities section
        const responsibilitiesHeading = jobContentDiv
          .find('h4#job_resp, h4:contains("responsibilities"), h5:contains("responsibilities")')
          .first();

        if (responsibilitiesHeading.length) {
          const parts: string[] = [];
          let sibling = responsibilitiesHeading.next();

          while (
            sibling.length &&
            !['hr', 'h4', 'h5'].includes(sibling.prop('tagName')?.toLowerCase() ?? '')
          ) {
            if (sibling.is('ul') || sibling.is('p')) {
              parts.push($.html(sibling));
            }
            sibling = sibling.next();
          }

          descriptionHtml = parts.join('');
        }
      }

      // Fallback to original approach
      if (!descriptionHtml) {
        const descriptionElem = $(
          'div.job-description, section.details, section.requirements'
        ).first();
        if (descriptionElem.length) {
          descriptionHtml = descriptionElem.html() ?? '';
        }
      }

      // Honor the requested description format (MARKDOWN/PLAIN/HTML).
      let description = '';
      if (descriptionHtml) {
        const cleanedHtml = removeAttributes(descriptionHtml);
        const format = this.scraperInput?.descriptionFormat;
        if (format === DescriptionFormat.MARKDOWN) {
          description = markdownConverter(cleanedHtml) ?? '';
        } else if (format === DescriptionFormat.PLAIN) {
          description = plainConverter(cleanedHtml) ?? '';
        } else {
          description = cleanedHtml;
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
      const message = e instanceof Error ? e.message : String(e);
      // Rethrow cancellation so the orchestrator's abort is honored, not swallowed.
      if (this.scraperInput?.signal?.aborted) {
        throw e;
      }
      this.enrichmentErrors.push(`job ${jobUrl}: detail fetch failed - ${message}`);
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
