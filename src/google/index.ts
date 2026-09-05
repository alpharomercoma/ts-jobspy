/**
 * Google Jobs Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import type { AxiosInstance } from 'axios';
import {
  type JobPost,
  type JobResponse,
  type Location,
  type ScraperInput,
  Site,
  JobType,
  DescriptionFormat,
  type Scraper,
} from '../model';
import {
  createSession,
  extractEmailsFromText,
  extractJobType,
  createLogger,
  markdownConverter,
  plainConverter,
} from '../util';
import { GoogleJobsException, RateLimitException } from '../exception';
import { HEADERS_INITIAL, HEADERS_JOBS, ASYNC_PARAM } from './constant';
import { findJobInfo, findJobInfoInitialPage } from './util';

const log = createLogger('Google');

export class Google implements Scraper {
  site = Site.GOOGLE;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;

  private session: AxiosInstance | null = null;
  private scraperInput: ScraperInput | null = null;
  private jobsPerPage = 10;
  private seenUrls = new Set<string>();
  private parseErrors: string[] = [];
  private readonly url = 'https://www.google.com/search';
  private readonly jobsUrl = 'https://www.google.com/async/callback:550';
  private readonly maxPages = 50;

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.scraperInput = {
      ...input,
      // Honor exactly what the caller asked for; pagination naturally stops when
      // Google runs out of forward cursors. (Previously silently capped at 900.)
      resultsWanted: input.resultsWanted ?? 15,
    };
    this.seenUrls.clear();
    this.parseErrors = [];

    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
      userAgent: this.userAgent,
      hasRetry: true,
    });

    const resultsWanted = this.scraperInput.resultsWanted ?? 15;
    const offset = this.scraperInput.offset ?? 0;
    const errors: string[] = [];
    const unsupported = this.unsupportedOptions();

    // Always slice the accumulated list to [offset, offset + resultsWanted] so a
    // small (or zero) resultsWanted is honored even when there is no forward
    // cursor and only the initial page is available. Per-job parse failures
    // (this.parseErrors) are merged with page-level failures (errors).
    const finalize = (jobList: JobPost[]): JobResponse => {
      const all = [...errors, ...this.parseErrors];
      // Nothing collected but parsing did fail on every attempt: this is not a
      // legitimately empty result, so surface it as an error rather than a
      // silently-empty success.
      if (jobList.length === 0 && this.parseErrors.length > 0) {
        throw new GoogleJobsException(
          `Google returned data but no jobs could be parsed: ${this.parseErrors.join('; ')}`
        );
      }
      return {
        jobs: jobList.slice(offset, offset + resultsWanted),
        ...(all.length > 0 && { errors: all }),
        ...(unsupported.length > 0 && { unsupportedOptions: unsupported }),
      };
    };

    // Nothing collected on a hard failure must throw, not resolve to an empty
    // result (see getInitialCursorAndJobs for the status classification).
    const { forwardCursor, jobs: initialJobs } = await this.getInitialCursorAndJobs();
    let jobList = [...initialJobs];

    if (!forwardCursor) {
      // A 200 with no forward cursor is a legitimately small/empty result set,
      // not an error — return what we have (sliced) rather than swallowing or
      // over-returning.
      log.warning(
        'initial cursor not found, try changing your query or there was at most 10 results'
      );
      return finalize(jobList);
    }

    let page = 1;
    let cursor: string | null = forwardCursor;

    // Terminate on: enough jobs collected, no cursor, an unchanged cursor (no
    // forward progress), or the hard page cap — none of which the site controls,
    // so the loop can never run forever. Progress is measured by jobs actually
    // collected, not by seenUrls (a job whose URL is marked seen but then fails
    // to parse must not count toward the target).
    while (jobList.length < offset + resultsWanted && cursor && page <= this.maxPages) {
      log.info(`search page: ${page} / ${Math.ceil(resultsWanted / this.jobsPerPage)}`);

      try {
        const { jobs, nextCursor } = await this.getJobsNextPage(cursor);
        if (jobs && jobs.length > 0) {
          jobList = [...jobList, ...jobs];
        } else {
          log.info(`found no jobs on page: ${page}`);
        }
        // Stop when the cursor stops advancing (null or repeated), even if the
        // page yielded jobs, so a stuck cursor cannot loop indefinitely.
        if (!nextCursor || nextCursor === cursor) {
          break;
        }
        cursor = nextCursor;
        page += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log.error(`failed to get jobs on page: ${page}, ${message}`);
        // Nothing collected: surface the failure. Partial results already
        // gathered: record the interruption honestly and return what we have.
        if (jobList.length === 0) {
          if (e instanceof RateLimitException) throw e;
          throw e instanceof GoogleJobsException ? e : new GoogleJobsException(message);
        }
        errors.push(`page ${page}: ${message}`);
        break;
      }
    }

    return finalize(jobList);
  }

  /**
   * Options this scraper STRUCTURALLY cannot honor. The orchestrator intersects
   * this list with the options the caller actually supplied, so it is declared
   * unconditionally rather than gated on what is set.
   *
   * `distance` and `easyApply` are always dropped: the assembled query has no
   * place for them. jobType, isRemote and hoursOld are normally appended to the
   * query (hoursOld only coarsely, via natural-language buckets) — but when the
   * caller supplies a verbatim `googleSearchTerm` override, the whole query is
   * replaced and those appended filters are lost too, so they become unsupported
   * in that mode.
   */
  private unsupportedOptions(): string[] {
    const dropped = ['distance', 'easyApply'];
    if (this.scraperInput?.googleSearchTerm) {
      dropped.push('jobType', 'isRemote', 'hoursOld');
    }
    return dropped;
  }

  private async getInitialCursorAndJobs(): Promise<{
    forwardCursor: string | null;
    jobs: JobPost[];
  }> {
    if (!this.session || !this.scraperInput) {
      return { forwardCursor: null, jobs: [] };
    }

    let query = `${this.scraperInput.searchTerm ?? ''} jobs`;

    const getTimeRange = (hoursOld: number): string => {
      if (hoursOld <= 24) return 'since yesterday';
      if (hoursOld <= 72) return 'in the last 3 days';
      if (hoursOld <= 168) return 'in the last week';
      return 'in the last month';
    };

    const jobTypeMapping: Record<JobType, string> = {
      [JobType.FULL_TIME]: 'Full time',
      [JobType.PART_TIME]: 'Part time',
      [JobType.INTERNSHIP]: 'Internship',
      [JobType.CONTRACT]: 'Contract',
      [JobType.TEMPORARY]: 'Temporary',
      [JobType.PER_DIEM]: 'Per diem',
      [JobType.NIGHTS]: 'Nights',
      [JobType.OTHER]: 'Other',
      [JobType.SUMMER]: 'Summer',
      [JobType.VOLUNTEER]: 'Volunteer',
    };

    if (this.scraperInput.jobType && jobTypeMapping[this.scraperInput.jobType]) {
      query += ` ${jobTypeMapping[this.scraperInput.jobType]}`;
    }

    if (this.scraperInput.location) {
      query += ` near ${this.scraperInput.location}`;
    }

    if (this.scraperInput.hoursOld) {
      query += ` ${getTimeRange(this.scraperInput.hoursOld)}`;
    }

    if (this.scraperInput.isRemote) {
      query += ' remote';
    }

    if (this.scraperInput.googleSearchTerm) {
      query = this.scraperInput.googleSearchTerm;
    }

    const response = await this.session.get(this.url, {
      headers: HEADERS_INITIAL,
      params: { q: query, udm: '8' },
      signal: this.scraperInput.signal,
    });

    // Nothing collected yet: a bad status must throw so the scrape reports
    // 'error', never a silently-empty result.
    if (response.status === 429) {
      throw new RateLimitException('Google', 'Google responded with HTTP 429 (rate limited)');
    }
    if (response.status < 200 || response.status >= 400) {
      throw new GoogleJobsException(`Google responded with status code ${response.status}`);
    }

    const patternFc = /<div jsname="Yust4d"[^>]+data-async-fc="([^"]+)"/;
    const htmlData = response.data as string;
    const matchFc = htmlData.match(patternFc);
    const dataAsyncFc = matchFc ? matchFc[1] : null;

    const jobsRaw = findJobInfoInitialPage(htmlData);
    const jobs: JobPost[] = [];

    for (let i = 0; i < jobsRaw.length; i++) {
      try {
        const jobPost = this.parseJob(jobsRaw[i]);
        if (jobPost) {
          jobs.push(jobPost);
        }
      } catch (e) {
        // Isolate a single malformed initial-page entry: record it and keep
        // parsing the rest instead of aborting the whole page.
        this.parseErrors.push(`initial job ${i}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { forwardCursor: dataAsyncFc, jobs };
  }

  private async getJobsNextPage(
    forwardCursor: string
  ): Promise<{ jobs: JobPost[]; nextCursor: string | null }> {
    if (!this.session) {
      return { jobs: [], nextCursor: null };
    }

    const response = await this.session.get(this.jobsUrl, {
      headers: HEADERS_JOBS,
      params: {
        fc: forwardCursor,
        fcv: '3',
        async: ASYNC_PARAM,
      },
      signal: this.scraperInput?.signal,
    });

    // Throw on a bad status so the caller can classify it (rate limit vs. other)
    // and decide between failing and returning partial results.
    if (response.status === 429) {
      throw new RateLimitException('Google', 'Google responded with HTTP 429 (rate limited)');
    }
    if (response.status < 200 || response.status >= 400) {
      throw new GoogleJobsException(`Google responded with status code ${response.status}`);
    }

    return this.parseJobs(response.data as string);
  }

  private parseJobs(jobData: string): { jobs: JobPost[]; nextCursor: string | null } {
    const startIdx = jobData.indexOf('[[[');
    const endIdx = jobData.lastIndexOf(']]]') + 3;

    if (startIdx === -1 || endIdx <= 3) {
      return { jobs: [], nextCursor: null };
    }

    const jsonStr = jobData.slice(startIdx, endIdx);
    let parsed: unknown[][];

    try {
      parsed = JSON.parse(jsonStr) as unknown[][];
    } catch (e) {
      // The page carried a job block but it could not be parsed at all — a real
      // failure, not an empty page. Throw so the caller can decide between
      // failing (nothing collected) and reporting a partial result.
      throw new GoogleJobsException(
        `failed to parse Google jobs page JSON: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const patternFc = /data-async-fc="([^"]+)"/;
    const matchFc = jobData.match(patternFc);
    const dataAsyncFc = matchFc ? matchFc[1] : null;

    const jobsOnPage: JobPost[] = [];

    if (!parsed[0]) return { jobs: [], nextCursor: dataAsyncFc };

    for (let i = 0; i < parsed[0].length; i++) {
      const array = parsed[0][i];
      if (!Array.isArray(array) || array.length < 2) continue;

      const [, jobDataStr] = array as [unknown, string];

      if (typeof jobDataStr !== 'string' || !jobDataStr.startsWith('[[[')) {
        continue;
      }

      try {
        const jobD = JSON.parse(jobDataStr) as unknown;
        const jobInfo = findJobInfo(jobD);

        if (jobInfo) {
          const jobPost = this.parseJob(jobInfo);
          if (jobPost) {
            jobsOnPage.push(jobPost);
          }
        }
      } catch (e) {
        // Isolate a single malformed job entry: record it and keep going so one
        // bad row never silently drops the rest of the page.
        this.parseErrors.push(`job ${i}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { jobs: jobsOnPage, nextCursor: dataAsyncFc };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJob(jobInfo: any[]): JobPost | null {
    if (!Array.isArray(jobInfo)) return null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const jobUrl = jobInfo[3]?.[0]?.[0] as string | undefined;
    if (!jobUrl || this.seenUrls.has(jobUrl)) {
      return null;
    }
    this.seenUrls.add(jobUrl);

    const title = jobInfo[0] as string;
    const companyName = jobInfo[1] as string;
    const locationStr = jobInfo[2] as string;

    let city: string | undefined;
    let state: string | undefined;
    let country: string | undefined;

    if (locationStr?.includes(',')) {
      const parts = locationStr.split(',').map((p: string) => p.trim());
      city = parts[0];
      state = parts[1];
      country = parts[2];
    } else {
      city = locationStr;
    }

    let datePosted: Date | null = null;
    const daysAgoStr = jobInfo[12] as string | number | undefined;

    if (typeof daysAgoStr === 'string') {
      const match = daysAgoStr.match(/\d+/);
      if (match) {
        const daysAgo = parseInt(match[0], 10);
        datePosted = new Date();
        datePosted.setDate(datePosted.getDate() - daysAgo);
      }
    }

    let description = jobInfo[19] as string | undefined;
    if (description) {
      const format = this.scraperInput?.descriptionFormat;
      if (format === DescriptionFormat.MARKDOWN) {
        description = markdownConverter(description) ?? description;
      } else if (format === DescriptionFormat.PLAIN) {
        description = plainConverter(description) ?? description;
      }
      // DescriptionFormat.HTML (and the default) leaves the text as-is.
    }
    const jobId = jobInfo[28] as string | undefined;

    const location: Location = {
      city,
      state,
      country,
    };

    // `.includes()` returns a boolean, so `??` would make the wfh check dead
    // code — use `||` so either keyword flips isRemote true.
    const lowerDescription = description?.toLowerCase();
    const isRemote =
      (lowerDescription?.includes('remote') || lowerDescription?.includes('wfh')) ?? false;

    return {
      id: `go-${jobId ?? Math.random().toString(36).substr(2, 9)}`,
      title,
      companyName,
      location,
      jobUrl,
      datePosted,
      isRemote,
      description: description ?? null,
      emails: extractEmailsFromText(description ?? null),
      jobType: extractJobType(description ?? null),
    };
  }
}
