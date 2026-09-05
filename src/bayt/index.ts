/**
 * Bayt Job Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import {
  type JobPost,
  type JobResponse,
  type Location,
  type ScraperInput,
  Site,
  Country,
  type Scraper,
} from '../model';
import { createSession, createLogger, randomDelay } from '../util';
import { BaytException, JobSpyException, RateLimitException } from '../exception';

const log = createLogger('Bayt');

/**
 * A single job-listing DOM node as returned by cheerio's `toArray()`. Bayt
 * loads each node individually to scope the per-listing selectors below.
 */
type BaytJobElement = AnyNode;

export class BaytScraper implements Scraper {
  site = Site.BAYT;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private readonly baseUrl = 'https://www.bayt.com';
  private readonly delay = 2;
  private readonly bandDelay = 3;

  private session: AxiosInstance | null = null;

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
      userAgent: this.userAgent,
      hasRetry: true,
    });

    // Bayt's search only accepts a keyword query and page number, so these
    // filters are structurally unsupported. Declare them unconditionally; the
    // orchestrator intersects this list with the options the caller actually
    // set before surfacing them in meta.sites[].unsupportedOptions.
    const unsupportedOptions: string[] = [
      'location',
      'distance',
      'jobType',
      'isRemote',
      'easyApply',
      'hoursOld',
    ];

    const jobList: JobPost[] = [];
    const errors: string[] = [];
    const resultsWanted = input.resultsWanted ?? 10;
    const offset = input.offset ?? 0;
    // Bayt paginates page-by-page with no guaranteed fixed page size, so rather
    // than jump to a computed start page (which could misalign) collect from
    // page 1 up to offset + resultsWanted and slice the window off at the end.
    const target = offset + resultsWanted;
    let page = 1;
    // Safety cap: stop even if pages keep returning non-empty DOM that yields no
    // parseable jobs, so a selector/layout change can never loop indefinitely.
    const maxPages = 50;

    const finish = (): JobResponse => ({
      jobs: jobList.slice(offset, offset + resultsWanted),
      ...(errors.length > 0 && { errors }),
      ...(unsupportedOptions.length > 0 && { unsupportedOptions }),
    });

    while (jobList.length < target && page <= maxPages) {
      log.info(`Fetching Bayt jobs page ${page}`);

      let jobElements: BaytJobElement[];
      try {
        // Pace requests between pages. Kept inside this try so that an abort
        // fired during the delay is handled by the same partial-vs-throw logic
        // below instead of propagating out and discarding jobs already collected.
        if (page > 1) {
          await randomDelay(this.delay, this.delay + this.bandDelay, input.signal);
        }
        jobElements = await this.fetchJobs(input.searchTerm ?? '', page, input.signal);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log.error(`Bayt: Error fetching jobs - ${message}`);
        // Nothing collected yet: the whole scrape failed, so throw. Preserve a
        // typed JobSpy/RateLimit exception; wrap anything else as BaytException.
        if (jobList.length === 0) {
          if (e instanceof JobSpyException) throw e;
          throw new BaytException(message);
        }
        // Partially collected: report what we have, recording the interruption.
        errors.push(`page ${page}: ${message}`);
        return finish();
      }

      if (jobElements.length === 0) {
        break;
      }

      const initialCount = jobList.length;

      for (const job of jobElements) {
        try {
          const jobPost = this.extractJobInfo(job);
          if (jobPost) {
            jobList.push(jobPost);
            if (jobList.length >= target) {
              break;
            }
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          log.error(`Bayt: Error extracting job info: ${message}`);
          // Surface the drop so a systematically failing parser shows up as a
          // partial result instead of looking like a clean, smaller one.
          errors.push(`page ${page}: extract failed - ${message}`);
        }
      }

      if (jobList.length === initialCount) {
        log.info(`No new jobs found on page ${page}. Ending pagination.`);
        break;
      }

      page += 1;
    }

    // Collected nothing, but the parser errored on every listing it saw: that
    // is a parser break, not an honestly empty search - throw rather than
    // returning a silent empty result.
    if (jobList.length === 0 && errors.length > 0) {
      throw new BaytException(`Bayt: failed to extract any jobs - ${errors[0]}`);
    }

    return finish();
  }

  private async fetchJobs(
    query: string,
    page: number,
    signal?: AbortSignal
  ): Promise<BaytJobElement[]> {
    if (!this.session) {
      throw new BaytException('Bayt session was not initialized');
    }

    // Slug the search term into Bayt's hyphenated path segment and encode it so
    // slashes, '?', '#', '%', or Unicode can't corrupt the URL structure.
    const slug = encodeURIComponent(query.trim().replace(/\s+/g, '-'));
    const url = `${this.baseUrl}/en/international/jobs/${slug}-jobs/?page=${page}`;
    const response = await this.session.get(url, { signal });

    if (response.status === 429) {
      throw new RateLimitException('Bayt', 'Bayt responded with HTTP 429 (rate limited)');
    }
    if (response.status < 200 || response.status >= 400) {
      throw new BaytException(`Bayt responded with status code ${response.status}`);
    }

    const $ = cheerio.load(response.data as string);
    const jobListings = $('li[data-js-job]').toArray();

    log.debug(`Found ${jobListings.length} job listing elements`);
    return jobListings;
  }

  private extractJobInfo(jobElement: BaytJobElement): JobPost | null {
    const $ = cheerio.load(jobElement);

    // Find the h2 element holding the title and link
    const jobGeneralInfo = $('h2').first();
    if (!jobGeneralInfo.length) {
      return null;
    }

    const jobTitle = jobGeneralInfo.text().trim();
    const jobUrl = this.extractJobUrl(jobGeneralInfo);

    if (!jobUrl) {
      return null;
    }

    // Extract company name
    const companyTag = $('div.t-nowrap.p10l');
    const companySpan = companyTag.find('span').first();
    const companyName = companySpan.length ? companySpan.text().trim() : null;

    // Extract location
    const locationTag = $('div.t-mute.t-small');
    const locationStr = locationTag.length ? locationTag.text().trim() : null;

    const jobId = `bayt-${Math.abs(this.hashCode(jobUrl))}`;

    const location: Location = {
      city: locationStr ?? undefined,
      country: Country.WORLDWIDE,
    };

    return {
      id: jobId,
      title: jobTitle,
      companyName,
      location,
      jobUrl,
    };
  }

  private extractJobUrl(jobGeneralInfo: cheerio.Cheerio<BaytJobElement>): string | null {
    const aTag = jobGeneralInfo.find('a').first();
    const href = aTag.attr('href');
    if (aTag.length && href) {
      return this.baseUrl + href.trim();
    }
    return null;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }
}
