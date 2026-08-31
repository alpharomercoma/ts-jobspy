/**
 * ts-jobspy — TypeScript job scraper.
 *
 * Started as a TypeScript port of python-jobspy (https://github.com/speedyapply/JobSpy)
 * by Cullen Watson and Zachary Hampton; diverged as of v3 into its own API.
 *
 * Author: Alpha Romer Coma (alpharomercoma@proton.me)
 */

import {
  type Compensation,
  CompensationInterval,
  Country,
  DescriptionFormat,
  displayLocation,
  getCountryFromString,
  type JobPost,
  type JobResponse,
  JobType,
  type Location,
  SalarySource,
  type Scraper,
  type ScraperInput,
  Site,
} from './model';

import { convertToAnnual, createLogger, extractSalary, setLoggerLevel } from './util';

import { dedupeJobs } from './dedupe';
import { type ResolvedOptions, resolveOptions, type ScrapeOptions } from './options';
import type { Job, ScrapeResult, SiteMeta, SiteOutcome } from './result';

// Scrapers
import { BaytScraper } from './bayt';
import { BDJobs } from './bdjobs';
import { Glassdoor } from './glassdoor';
import { Google } from './google';
import { Indeed } from './indeed';
import { LinkedIn } from './linkedin';
import { Naukri } from './naukri';
import { ZipRecruiter } from './ziprecruiter';

// Public API surface
export {
  BaytScraper,
  BDJobs,
  CompensationInterval,
  Country,
  DescriptionFormat,
  displayLocation,
  getCountryFromString,
  Glassdoor,
  Google,
  Indeed,
  JobType,
  LinkedIn,
  Naukri,
  SalarySource,
  Site,
  ZipRecruiter,
};
export type { Compensation, JobPost, JobResponse, Location, Scraper, ScraperInput };
export * from './exception';
export {
  type DedupeMode,
  type GoogleOptions,
  type LinkedInOptions,
  type ScrapeOptions,
  type SiteName,
  UNDER_MAINTENANCE_SITES,
  WORKING_SITES,
} from './options';
export type { Job, ScrapeMeta, ScrapeResult, SiteMeta, SiteStatus } from './result';
export {
  convertToAnnual,
  createLogger,
  extractSalary,
  getEnumFromValue,
  mapStrToSite,
  setLoggerLevel,
} from './util';

const log = createLogger('Main');

const SCRAPER_MAPPING: Record<
  Site,
  new (options: {
    proxies?: string[];
    caCert?: string;
    userAgent?: string;
  }) => Scraper
> = {
  [Site.LINKEDIN]: LinkedIn,
  [Site.INDEED]: Indeed,
  [Site.ZIP_RECRUITER]: ZipRecruiter,
  [Site.GLASSDOOR]: Glassdoor,
  [Site.GOOGLE]: Google,
  [Site.BAYT]: BaytScraper,
  [Site.NAUKRI]: Naukri,
  [Site.BDJOBS]: BDJobs,
};

const SITE_DISPLAY: Partial<Record<Site, string>> = {
  [Site.LINKEDIN]: 'LinkedIn',
  [Site.ZIP_RECRUITER]: 'ZipRecruiter',
  [Site.BDJOBS]: 'BDJobs',
};

function displaySite(site: Site): string {
  return SITE_DISPLAY[site] ?? site.charAt(0).toUpperCase() + site.slice(1);
}

/** Public site identifier emitted in Job.site / meta.sites (matches the `sites` option). */
const PUBLIC_SITE_NAME: Partial<Record<Site, string>> = {
  [Site.ZIP_RECRUITER]: 'ziprecruiter',
};

function publicSiteName(site: Site): string {
  return PUBLIC_SITE_NAME[site] ?? site;
}

/**
 * Scrape job postings from one or more job boards.
 *
 * Sites are scraped concurrently and independently: one site failing never
 * discards another site's results. Per-site outcomes (status, count, timing,
 * error) are reported in `result.meta.sites`; set `strict: true` to reject
 * instead when any requested site fails.
 *
 * @throws InvalidInputError when an option is invalid (never silently coerced).
 */
export async function scrapeJobs(options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const resolved = resolveOptions(options);
  setLoggerLevel(resolved.verbose);

  const scraperInput: ScraperInput = {
    siteType: resolved.sites,
    country: resolved.country,
    searchTerm: resolved.searchTerm,
    googleSearchTerm: resolved.google.searchTerm,
    location: resolved.location,
    distance: resolved.distance,
    isRemote: resolved.isRemote,
    jobType: resolved.jobType,
    easyApply: resolved.easyApply,
    descriptionFormat: resolved.descriptionFormat,
    linkedinFetchDescription: resolved.linkedin.fetchDescription ?? false,
    resultsWanted: resolved.resultsWanted,
    linkedinCompanyIds: resolved.linkedin.companyIds,
    offset: resolved.offset,
    hoursOld: resolved.hoursOld,
  };

  const t0 = Date.now();

  const outcomes = await runWithConcurrency(
    resolved.sites.map((site) => () => scrapeSite(site, scraperInput, resolved)),
    resolved.siteConcurrency
  );

  if (resolved.strict) {
    const failed = outcomes.filter((o) => o.failed || o.errors.length > 0);
    if (failed.length > 0) {
      throw new AggregateError(
        failed.map((o) =>
          o.failed
            ? o.thrown instanceof Error
              ? o.thrown
              : new Error(String(o.thrown))
            : new Error(o.errors.join('; '))
        ),
        `Scraping failed for: ${failed.map((o) => o.site).join(', ')}`
      );
    }
  }

  let jobs: Job[] = [];
  const siteMetas: SiteMeta[] = [];

  for (const outcome of outcomes) {
    // Conversion failures stay isolated to their site: the bad posting is
    // skipped and recorded, never discarding other sites' results.
    let converted = 0;
    for (const post of outcome.posts) {
      try {
        jobs.push(toJob(post, outcome.site, resolved));
        converted += 1;
      } catch (e) {
        outcome.errors.push(
          `failed to convert job ${post.jobUrl ?? post.id ?? '(unknown)'}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    siteMetas.push(toSiteMeta({ ...outcome, posts: outcome.posts.slice(0, converted) }));
  }

  // Dedupe on a globally newest-first ordering so the freshest copy of a
  // cross-site duplicate survives regardless of site name ordering.
  let duplicatesRemoved = 0;
  if (resolved.dedupe !== 'none') {
    jobs.sort((a, b) => dateValue(b) - dateValue(a));
    const deduped = dedupeJobs(jobs, resolved.dedupe);
    jobs = deduped.jobs;
    duplicatesRemoved = deduped.removed;
  }

  // Final ordering: by site, then newest first within each site.
  jobs.sort((a, b) => {
    const siteCompare = a.site.localeCompare(b.site);
    if (siteCompare !== 0) return siteCompare;
    return dateValue(b) - dateValue(a);
  });

  const totalDurationMs = Date.now() - t0;
  const totalCollected = siteMetas.reduce((acc, s) => acc + s.jobs, 0);
  const failedSites = siteMetas.filter(
    (s) => s.status === 'error' || s.status === 'partial'
  ).length;

  return {
    jobs,
    meta: {
      sites: siteMetas,
      totalDurationMs,
      jobsPerSecond: rate(totalCollected, totalDurationMs),
      failureRate: siteMetas.length === 0 ? 0 : round(failedSites / siteMetas.length),
      duplicatesRemoved,
    },
  };
}

/** Run tasks with at most `limit` in flight; results in input order. */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Jobs per second, guarding division by ~zero durations. */
function rate(jobs: number, durationMs: number): number {
  return durationMs <= 0 ? 0 : round(jobs / (durationMs / 1000));
}

function dateValue(job: Job): number {
  return job.datePosted ? new Date(job.datePosted).getTime() : 0;
}

function toSiteMeta(outcome: SiteOutcome): SiteMeta {
  const base = {
    site: outcome.site,
    jobs: outcome.posts.length,
    requested: outcome.requested,
    durationMs: outcome.durationMs,
    jobsPerSecond: rate(outcome.posts.length, outcome.durationMs),
  };
  if (outcome.failed) {
    return {
      ...base,
      status: 'error',
      error: toSiteError(outcome.thrown),
    };
  }
  if (outcome.errors.length > 0) {
    return {
      ...base,
      status: outcome.posts.length > 0 ? 'partial' : 'error',
      error: { name: 'ScrapeInterrupted', message: outcome.errors.join('; ') },
    };
  }
  return { ...base, status: outcome.posts.length > 0 ? 'ok' : 'empty' };
}

function toSiteError(thrown: unknown): { name: string; message: string } {
  return {
    name: thrown instanceof Error ? thrown.name : 'Error',
    message: thrown instanceof Error ? thrown.message : String(thrown),
  };
}

class SiteTimeoutError extends Error {
  constructor(site: string, timeoutMs: number) {
    super(`${site}: scrape aborted after ${timeoutMs}ms timeout`);
    this.name = 'SiteTimeoutError';
  }
}

async function scrapeSite(
  site: Site,
  scraperInput: ScraperInput,
  resolved: ResolvedOptions
): Promise<SiteOutcome> {
  const start = Date.now();
  const requested = resolved.resultsWanted;
  const name = publicSiteName(site);
  try {
    const ScraperClass = SCRAPER_MAPPING[site];
    const scraper = new ScraperClass({
      proxies: resolved.proxies,
      caCert: resolved.caCert,
      userAgent: resolved.userAgent,
    });

    let scrapePromise = scraper.scrape(scraperInput);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (resolved.timeoutMs !== undefined) {
      const timeoutMs = resolved.timeoutMs;
      scrapePromise = Promise.race([
        scrapePromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new SiteTimeoutError(name, timeoutMs)), timeoutMs);
        }),
      ]);
    }
    let response: JobResponse;
    try {
      response = await scrapePromise;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    log.info(`${displaySite(site)}: finished scraping (${response.jobs.length} jobs)`);
    return {
      site: name,
      posts: response.jobs,
      requested,
      durationMs: Date.now() - start,
      failed: false,
      errors: response.errors ?? [],
    };
  } catch (thrown) {
    log.error(
      `${displaySite(site)}: scraping failed — ${thrown instanceof Error ? thrown.message : String(thrown)}`
    );
    return {
      site: name,
      posts: [],
      requested,
      durationMs: Date.now() - start,
      failed: true,
      thrown,
      errors: [],
    };
  }
}

/** Flatten a scraper's JobPost into the public Job shape. */
function toJob(post: JobPost, site: string, resolved: ResolvedOptions): Job {
  let interval: string | null = null;
  let minAmount: number | null = null;
  let maxAmount: number | null = null;
  let currency: string | null = null;
  let salarySource: string | null = null;

  if (post.compensation) {
    interval = post.compensation.interval ?? null;
    minAmount = post.compensation.minAmount ?? null;
    maxAmount = post.compensation.maxAmount ?? null;
    // Only assume USD when the search country is the US; anywhere else a
    // missing currency stays unknown rather than becoming wrong data.
    currency = post.compensation.currency ?? (resolved.country === Country.USA ? 'USD' : null);
    salarySource = SalarySource.DIRECT_DATA;

    if (
      resolved.enforceAnnualSalary &&
      interval &&
      interval !== 'yearly' &&
      minAmount &&
      maxAmount
    ) {
      const data = { interval, minAmount, maxAmount };
      convertToAnnual(data);
      interval = data.interval;
      minAmount = data.minAmount;
      maxAmount = data.maxAmount;
    }
  } else if (resolved.country === Country.USA && post.description) {
    const extracted = extractSalary(post.description, {
      enforceAnnualSalary: resolved.enforceAnnualSalary,
    });
    if (extracted.minAmount && extracted.maxAmount) {
      interval = extracted.interval;
      minAmount = extracted.minAmount;
      maxAmount = extracted.maxAmount;
      currency = extracted.currency;
      salarySource = SalarySource.DESCRIPTION;
    }
  }

  if (minAmount === null && maxAmount === null) {
    salarySource = null;
  }

  return {
    id: post.id,
    site,
    jobUrl: post.jobUrl,
    jobUrlDirect: post.jobUrlDirect ?? null,
    title: post.title,
    company: post.companyName,
    location: post.location ? displayLocation(post.location) : null,
    datePosted:
      post.datePosted && !Number.isNaN(post.datePosted.getTime())
        ? post.datePosted.toISOString().split('T')[0]
        : null,
    jobTypes: post.jobType ?? [],
    salarySource,
    interval,
    minAmount,
    maxAmount,
    currency,
    isRemote: post.isRemote ?? null,
    jobLevel: post.jobLevel ?? null,
    jobFunction: post.jobFunction ?? null,
    listingType: post.listingType ?? null,
    emails: post.emails ?? [],
    description: post.description ?? null,
    companyIndustry: post.companyIndustry ?? null,
    companyUrl: post.companyUrl ?? null,
    companyLogo: post.companyLogo ?? null,
    companyUrlDirect: post.companyUrlDirect ?? null,
    companyAddresses: post.companyAddresses ?? null,
    companyNumEmployees: post.companyNumEmployees ?? null,
    companyRevenue: post.companyRevenue ?? null,
    companyDescription: post.companyDescription ?? null,
    skills: post.skills ?? [],
    experienceRange: post.experienceRange ?? null,
    companyRating: post.companyRating ?? null,
    companyReviewsCount: post.companyReviewsCount ?? null,
    vacancyCount: post.vacancyCount ?? null,
    workFromHomeType: post.workFromHomeType ?? null,
  };
}

export default scrapeJobs;
