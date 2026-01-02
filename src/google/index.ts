/**
 * Google Jobs Scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { AxiosInstance } from 'axios';
import {
  JobPost,
  JobResponse,
  Location,
  ScraperInput,
  Site,
  JobType,
  Scraper,
} from '../model';
import {
  createSession,
  extractEmailsFromText,
  extractJobType,
  createLogger,
} from '../util';
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
  private readonly url = 'https://www.google.com/search';
  private readonly jobsUrl = 'https://www.google.com/async/callback:550';

  constructor(options: { proxies?: string[]; caCert?: string; userAgent?: string } = {}) {
    this.proxies = options.proxies;
    this.caCert = options.caCert;
    this.userAgent = options.userAgent;
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    this.scraperInput = {
      ...input,
      resultsWanted: Math.min(900, input.resultsWanted ?? 15),
    };
    this.seenUrls.clear();

    this.session = createSession({
      proxies: this.proxies,
      caCert: this.caCert,
      hasRetry: true,
    });

    const { forwardCursor, jobs: initialJobs } = await this.getInitialCursorAndJobs();
    let jobList = [...initialJobs];

    if (!forwardCursor) {
      log.warning(
        'initial cursor not found, try changing your query or there was at most 10 results'
      );
      return { jobs: jobList };
    }

    let page = 1;
    let cursor: string | null = forwardCursor;
    const resultsWanted = this.scraperInput.resultsWanted ?? 15;
    const offset = this.scraperInput.offset ?? 0;

    while (this.seenUrls.size < resultsWanted + offset && cursor) {
      log.info(
        `search page: ${page} / ${Math.ceil(resultsWanted / this.jobsPerPage)}`
      );

      try {
        const { jobs, nextCursor } = await this.getJobsNextPage(cursor);
        if (!jobs || jobs.length === 0) {
          log.info(`found no jobs on page: ${page}`);
          break;
        }
        jobList = [...jobList, ...jobs];
        cursor = nextCursor;
        page += 1;
      } catch (e) {
        log.error(`failed to get jobs on page: ${page}, ${(e as Error).message}`);
        break;
      }
    }

    return {
      jobs: jobList.slice(offset, offset + resultsWanted),
    };
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
    });

    const patternFc = /<div jsname="Yust4d"[^>]+data-async-fc="([^"]+)"/;
    const matchFc = response.data.match(patternFc);
    const dataAsyncFc = matchFc ? matchFc[1] : null;

    const jobsRaw = findJobInfoInitialPage(response.data);
    const jobs: JobPost[] = [];

    for (const jobRaw of jobsRaw) {
      const jobPost = this.parseJob(jobRaw);
      if (jobPost) {
        jobs.push(jobPost);
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
    });

    return this.parseJobs(response.data);
  }

  private parseJobs(
    jobData: string
  ): { jobs: JobPost[]; nextCursor: string | null } {
    const startIdx = jobData.indexOf('[[[');
    const endIdx = jobData.lastIndexOf(']]]') + 3;

    if (startIdx === -1 || endIdx <= 3) {
      return { jobs: [], nextCursor: null };
    }

    const jsonStr = jobData.slice(startIdx, endIdx);
    let parsed: unknown[][];

    try {
      parsed = JSON.parse(jsonStr) as unknown[][];
    } catch {
      return { jobs: [], nextCursor: null };
    }

    const patternFc = /data-async-fc="([^"]+)"/;
    const matchFc = jobData.match(patternFc);
    const dataAsyncFc = matchFc ? matchFc[1] : null;

    const jobsOnPage: JobPost[] = [];

    if (!parsed[0]) return { jobs: [], nextCursor: dataAsyncFc };

    for (const array of parsed[0]) {
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
      } catch {
        continue;
      }
    }

    return { jobs: jobsOnPage, nextCursor: dataAsyncFc };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJob(jobInfo: any[]): JobPost | null {
    if (!Array.isArray(jobInfo)) return null;

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

    if (locationStr && locationStr.includes(',')) {
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

    const description = jobInfo[19] as string | undefined;
    const jobId = jobInfo[28] as string | undefined;

    const location: Location = {
      city,
      state,
      country,
    };

    const isRemote =
      description?.toLowerCase().includes('remote') ||
      description?.toLowerCase().includes('wfh') ||
      false;

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

export default Google;
