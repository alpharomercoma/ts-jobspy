/**
 * v3 result schema: what scrapeJobs() resolves to.
 *
 * The envelope separates the data (jobs) from the account of how the scrape
 * went (meta). A site that fails or returns nothing never silently vanishes —
 * its entry in meta.sites says what happened.
 */

import type { JobPost } from './model';

/** One scraped job posting, flattened for easy filtering/export. */
export interface Job {
  id: string | null;
  /** Site the job came from ('indeed', 'linkedin', 'ziprecruiter', ...). */
  site: string;
  jobUrl: string;
  jobUrlDirect: string | null;
  title: string;
  company: string | null;
  location: string | null;
  /**
   * UTC calendar date (YYYY-MM-DD) of the posting instant, when the site
   * reports one. Sites report instants without their local timezone, so a
   * posting made near midnight can differ by one day from the site-local date.
   */
  datePosted: string | null;
  jobTypes: string[];
  salarySource: string | null;
  interval: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
  isRemote: boolean | null;
  jobLevel: string | null;
  jobFunction: string | null;
  listingType: string | null;
  emails: string[];
  description: string | null;
  companyIndustry: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  bannerPhotoUrl: string | null;
  companyUrlDirect: string | null;
  companyAddresses: string | null;
  companyNumEmployees: string | null;
  companyRevenue: string | null;
  companyDescription: string | null;
  // Naukri-specific
  skills: string[];
  experienceRange: string | null;
  companyRating: number | null;
  companyReviewsCount: number | null;
  vacancyCount: number | null;
  workFromHomeType: string | null;
}

export type SiteStatus =
  /** Site responded and returned at least one job with no interruptions. */
  | 'ok'
  /** Site responded but returned zero jobs — a possible soft block, or a query with no matches. */
  | 'empty'
  /** Some jobs were collected, then the scrape was interrupted (e.g. rate limited mid-pagination); see `error`. */
  | 'partial'
  /** The scrape failed before collecting anything; see `error`. */
  | 'error';

export interface SiteError {
  name: string;
  message: string;
}

interface SiteMetaBase {
  site: string;
  /** Jobs this site contributed (before cross-site dedupe). */
  jobs: number;
  requested: number;
  durationMs: number;
  /** Throughput for this site: jobs / durationMs, in jobs per second. */
  jobsPerSecond: number;
}

/** Discriminated on `status`: `error` is present exactly when something went wrong. */
export type SiteMeta =
  | (SiteMetaBase & { status: 'ok' | 'empty'; error?: undefined })
  | (SiteMetaBase & { status: 'partial' | 'error'; error: SiteError });

export interface ScrapeMeta {
  sites: SiteMeta[];
  totalDurationMs: number;
  /**
   * Overall throughput: total jobs (before dedupe) / totalDurationMs, in jobs
   * per second. With the default concurrent strategy this exceeds the per-site
   * rates because sites overlap in time.
   */
  jobsPerSecond: number;
  /**
   * Fraction of requested sites whose scrape failed or was interrupted
   * (status 'error' or 'partial'), 0..1.
   */
  failureRate: number;
  /** Jobs removed by cross-site dedupe (0 when dedupe is 'none'). */
  duplicatesRemoved: number;
}

export interface ScrapeResult {
  jobs: Job[];
  meta: ScrapeMeta;
}

/** Internal: a scraper's outcome plus bookkeeping. */
export interface SiteOutcome {
  site: string;
  posts: JobPost[];
  requested: number;
  durationMs: number;
  /** True when the scraper (or job conversion) threw — even a falsy value. */
  failed: boolean;
  /** The thrown value when failed. */
  thrown?: unknown;
  /** Interruptions the scraper reported alongside partial results. */
  errors: string[];
}
