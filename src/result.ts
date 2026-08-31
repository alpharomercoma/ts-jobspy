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
  /** Site the job came from ('indeed', 'linkedin', ...). */
  site: string;
  jobUrl: string;
  jobUrlDirect: string | null;
  title: string;
  company: string | null;
  location: string | null;
  /** ISO date (YYYY-MM-DD) the job was posted, when the site reports one. */
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
  /** Site responded and returned at least one job. */
  | 'ok'
  /** Site responded but returned zero jobs — a possible block or query with no matches. */
  | 'empty'
  /** Scraper threw; see `error`. */
  | 'error';

export interface SiteMeta {
  site: string;
  status: SiteStatus;
  /** Jobs this site contributed (before cross-site dedupe). */
  jobs: number;
  requested: number;
  durationMs: number;
  error?: { name: string; message: string };
}

export interface ScrapeMeta {
  sites: SiteMeta[];
  totalDurationMs: number;
  /** Jobs removed by cross-site dedupe (0 when dedupe is 'none'). */
  duplicatesRemoved: number;
}

export interface ScrapeResult {
  jobs: Job[];
  meta: ScrapeMeta;
}

/** Internal: a scraper's raw output plus bookkeeping. */
export interface SiteOutcome {
  site: string;
  posts: JobPost[];
  requested: number;
  durationMs: number;
  error?: unknown;
}
