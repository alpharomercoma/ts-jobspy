/**
 * v3 public options: the schema for scrapeJobs().
 *
 * Every option is validated eagerly with descriptive errors — invalid input
 * throws InvalidInputError instead of silently falling back to a default.
 */

import { InvalidInputError } from './exception';
import {
  type Country,
  DescriptionFormat,
  getCountryFromString,
  type JobType,
  type Site,
} from './model';
import { getEnumFromValue, mapStrToSite } from './util';

/** All site names accepted by scrapeJobs. */
export type SiteName =
  | 'linkedin'
  | 'indeed'
  | 'ziprecruiter'
  | 'glassdoor'
  | 'google'
  | 'bayt'
  | 'naukri'
  | 'bdjobs';

/** Sites that currently work without proxies or a browser. */
export const WORKING_SITES: readonly SiteName[] = ['indeed', 'linkedin'] as const;

/**
 * Sites that exist in the codebase but are blocked or broken upstream.
 * Requesting one is allowed (it may work with proxies or from certain IPs),
 * but the per-site result meta will tell you exactly what happened.
 */
export const UNDER_MAINTENANCE_SITES: readonly SiteName[] = [
  'ziprecruiter',
  'glassdoor',
  'google',
  'bayt',
  'naukri',
  'bdjobs',
] as const;

export type DedupeMode = 'none' | 'url' | 'content';

export interface LinkedInOptions {
  /** Fetch the full description (and richer fields) with one extra request per job. */
  fetchDescription?: boolean;
  /** Restrict results to these LinkedIn company ids. */
  companyIds?: number[];
}

export interface GoogleOptions {
  /** Verbatim Google Jobs search query; overrides the query assembled from searchTerm/location. */
  searchTerm?: string;
}

export interface ScrapeOptions {
  /** Sites to scrape. Defaults to the currently working sites. */
  sites?: SiteName | SiteName[];
  searchTerm?: string;
  location?: string;
  /** Search radius in miles (site permitting). Default 50. */
  distance?: number;
  isRemote?: boolean;
  /** e.g. 'fulltime', 'parttime', 'internship', 'contract'. */
  jobType?: string;
  easyApply?: boolean;
  /** Jobs to return per site. Default 15. */
  resultsWanted?: number;
  /** Skip this many results per site before collecting. Default 0. */
  offset?: number;
  /** Only jobs posted within the last N hours. */
  hoursOld?: number;
  /** Country for Indeed/Glassdoor domain selection, e.g. 'usa', 'uk'. Default 'usa'. */
  country?: string;
  /** 'markdown' | 'html' | 'plain'. Default 'markdown'. */
  descriptionFormat?: 'markdown' | 'html' | 'plain';
  /** Convert hourly/monthly salaries to annual. Default false. */
  enforceAnnualSalary?: boolean;
  /** Cross-site duplicate removal. Default 'none'. */
  dedupe?: DedupeMode | boolean;
  /** Reject the whole scrape if any requested site fails or is interrupted. Default false: failures are reported per-site in meta. */
  strict?: boolean;
  /** Abort a site's scrape after this many milliseconds and report it as an error. Default: no timeout. */
  timeoutMs?: number;
  /**
   * Scraping strategy: how many sites are scraped in flight at once.
   * Node runs a single thread with async I/O — there is no multithreading;
   * concurrency here means overlapping network requests. Default: all
   * requested sites concurrently. Set 1 for sequential (gentler on your IP).
   */
  siteConcurrency?: number;
  /** Proxy URL(s); rotated per request when more than one is given. */
  proxies?: string[] | string;
  caCert?: string;
  userAgent?: string;
  /**
   * 0 = errors only (default), 1 = +warnings, 2 = +info.
   * Note: the log level is process-global; concurrent scrapeJobs() calls with
   * different verbose values share the last-set level.
   */
  verbose?: 0 | 1 | 2;
  linkedin?: LinkedInOptions;
  google?: GoogleOptions;
}

/** Options after validation/normalization, ready for the orchestrator. */
export interface ResolvedOptions {
  sites: Site[];
  searchTerm?: string;
  location?: string;
  distance: number;
  isRemote: boolean;
  jobType?: JobType;
  easyApply?: boolean;
  resultsWanted: number;
  offset: number;
  hoursOld?: number;
  country: Country;
  descriptionFormat: DescriptionFormat;
  enforceAnnualSalary: boolean;
  dedupe: DedupeMode;
  strict: boolean;
  timeoutMs?: number;
  siteConcurrency: number;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;
  verbose: 0 | 1 | 2;
  linkedin: LinkedInOptions;
  google: GoogleOptions;
}

const SITE_NAMES: readonly SiteName[] = [...WORKING_SITES, ...UNDER_MAINTENANCE_SITES];

function assertInt(value: unknown, name: string, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new InvalidInputError(`${name} must be an integer >= ${min}, got: ${String(value)}`);
  }
  return value;
}

function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidInputError(`${name} must be a boolean, got: ${String(value)}`);
  }
  return value;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new InvalidInputError(`${name} must be a string, got: ${String(value)}`);
  }
  return value;
}

function optional<T>(
  value: unknown,
  name: string,
  check: (value: unknown, name: string) => T
): T | undefined {
  return value === undefined ? undefined : check(value, name);
}

export function resolveOptions(options: ScrapeOptions): ResolvedOptions {
  const raw = options.sites ?? [...WORKING_SITES];
  const siteNames = Array.isArray(raw) ? raw : [raw];
  if (siteNames.length === 0) {
    throw new InvalidInputError(`sites must not be empty; valid sites: ${SITE_NAMES.join(', ')}`);
  }
  const sites: Site[] = [];
  for (const rawName of siteNames) {
    // Site.ZIP_RECRUITER's enum value is 'zip_recruiter'; accept it as an alias.
    const name =
      typeof rawName === 'string' && rawName.toLowerCase() === 'zip_recruiter'
        ? 'ziprecruiter'
        : rawName;
    if (typeof name !== 'string' || !SITE_NAMES.includes(name.toLowerCase() as SiteName)) {
      throw new InvalidInputError(
        `Unknown site '${String(name)}'; valid sites: ${SITE_NAMES.join(', ')}`
      );
    }
    const site = mapStrToSite(name);
    if (!sites.includes(site)) sites.push(site);
  }

  let jobType: JobType | undefined;
  if (options.jobType !== undefined) {
    try {
      jobType = getEnumFromValue(options.jobType);
    } catch {
      throw new InvalidInputError(
        `Unknown jobType '${options.jobType}'; examples: fulltime, parttime, internship, contract, temporary`
      );
    }
  }

  let country: Country;
  try {
    country = getCountryFromString(options.country ?? 'usa');
  } catch {
    throw new InvalidInputError(`Unknown country '${String(options.country)}'`);
  }

  if (options.descriptionFormat !== undefined) {
    assertString(options.descriptionFormat, 'descriptionFormat');
  }
  let descriptionFormat: DescriptionFormat;
  switch ((options.descriptionFormat ?? 'markdown').toLowerCase()) {
    case 'markdown':
      descriptionFormat = DescriptionFormat.MARKDOWN;
      break;
    case 'html':
      descriptionFormat = DescriptionFormat.HTML;
      break;
    case 'plain':
      descriptionFormat = DescriptionFormat.PLAIN;
      break;
    default:
      throw new InvalidInputError(
        `Unknown descriptionFormat '${String(options.descriptionFormat)}'; valid: markdown, html, plain`
      );
  }

  let dedupe: DedupeMode;
  if (options.dedupe === undefined || options.dedupe === false) {
    dedupe = 'none';
  } else if (options.dedupe === true) {
    dedupe = 'content';
  } else if (
    options.dedupe === 'none' ||
    options.dedupe === 'url' ||
    options.dedupe === 'content'
  ) {
    dedupe = options.dedupe;
  } else {
    throw new InvalidInputError(
      `Unknown dedupe mode '${String(options.dedupe)}'; valid: none, url, content (or a boolean)`
    );
  }

  const verbose = options.verbose ?? 0;
  if (verbose !== 0 && verbose !== 1 && verbose !== 2) {
    throw new InvalidInputError(`verbose must be 0, 1, or 2, got: ${String(verbose)}`);
  }

  let proxies: string[] | undefined;
  if (options.proxies !== undefined) {
    proxies = typeof options.proxies === 'string' ? [options.proxies] : options.proxies;
    if (
      !Array.isArray(proxies) ||
      proxies.length === 0 ||
      proxies.some((p) => typeof p !== 'string' || p.length === 0)
    ) {
      throw new InvalidInputError(
        'proxies must be a non-empty string or a non-empty array of non-empty strings'
      );
    }
  }

  const linkedin = options.linkedin ?? {};
  optional(linkedin.fetchDescription, 'linkedin.fetchDescription', assertBoolean);
  if (linkedin.companyIds !== undefined) {
    if (
      !Array.isArray(linkedin.companyIds) ||
      linkedin.companyIds.some((id) => !Number.isSafeInteger(id) || id < 0)
    ) {
      throw new InvalidInputError('linkedin.companyIds must be an array of non-negative integers');
    }
  }
  const google = options.google ?? {};
  optional(google.searchTerm, 'google.searchTerm', assertString);

  return {
    sites,
    searchTerm: optional(options.searchTerm, 'searchTerm', assertString),
    location: optional(options.location, 'location', assertString),
    distance: options.distance === undefined ? 50 : assertInt(options.distance, 'distance', 0),
    isRemote: optional(options.isRemote, 'isRemote', assertBoolean) ?? false,
    jobType,
    easyApply: optional(options.easyApply, 'easyApply', assertBoolean),
    resultsWanted:
      options.resultsWanted === undefined
        ? 15
        : assertInt(options.resultsWanted, 'resultsWanted', 0),
    offset: options.offset === undefined ? 0 : assertInt(options.offset, 'offset', 0),
    // hoursOld: 0 would silently disable the filter downstream, so require >= 1.
    hoursOld:
      options.hoursOld === undefined ? undefined : assertInt(options.hoursOld, 'hoursOld', 1),
    country,
    descriptionFormat,
    enforceAnnualSalary:
      optional(options.enforceAnnualSalary, 'enforceAnnualSalary', assertBoolean) ?? false,
    dedupe,
    strict: optional(options.strict, 'strict', assertBoolean) ?? false,
    timeoutMs:
      options.timeoutMs === undefined ? undefined : assertInt(options.timeoutMs, 'timeoutMs', 1),
    siteConcurrency:
      options.siteConcurrency === undefined
        ? sites.length
        : Math.min(assertInt(options.siteConcurrency, 'siteConcurrency', 1), sites.length),
    proxies,
    caCert: optional(options.caCert, 'caCert', assertString),
    userAgent: optional(options.userAgent, 'userAgent', assertString),
    verbose,
    linkedin,
    google,
  };
}
