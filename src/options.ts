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
  /** Reject the whole scrape if any requested site fails. Default false: failures are reported per-site in meta. */
  strict?: boolean;
  /** Proxy URL(s); rotated per request when more than one is given. */
  proxies?: string[] | string;
  caCert?: string;
  userAgent?: string;
  /** 0 = errors only (default), 1 = +warnings, 2 = +info. */
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
  proxies?: string[];
  caCert?: string;
  userAgent?: string;
  verbose: 0 | 1 | 2;
  linkedin: LinkedInOptions;
  google: GoogleOptions;
}

const SITE_NAMES: readonly SiteName[] = [...WORKING_SITES, ...UNDER_MAINTENANCE_SITES];

function assertNonNegativeInt(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new InvalidInputError(`${name} must be a non-negative number, got: ${String(value)}`);
  }
  return Math.floor(value);
}

export function resolveOptions(options: ScrapeOptions): ResolvedOptions {
  const raw = options.sites ?? [...WORKING_SITES];
  const siteNames = Array.isArray(raw) ? raw : [raw];
  if (siteNames.length === 0) {
    throw new InvalidInputError(`sites must not be empty; valid sites: ${SITE_NAMES.join(', ')}`);
  }
  const sites: Site[] = [];
  for (const name of siteNames) {
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
    if (!Array.isArray(proxies) || proxies.some((p) => typeof p !== 'string' || p.length === 0)) {
      throw new InvalidInputError('proxies must be a non-empty string or an array of strings');
    }
  }

  return {
    sites,
    searchTerm: options.searchTerm,
    location: options.location,
    distance:
      options.distance === undefined ? 50 : assertNonNegativeInt(options.distance, 'distance'),
    isRemote: options.isRemote ?? false,
    jobType,
    easyApply: options.easyApply,
    resultsWanted:
      options.resultsWanted === undefined
        ? 15
        : assertNonNegativeInt(options.resultsWanted, 'resultsWanted'),
    offset: options.offset === undefined ? 0 : assertNonNegativeInt(options.offset, 'offset'),
    hoursOld:
      options.hoursOld === undefined
        ? undefined
        : assertNonNegativeInt(options.hoursOld, 'hoursOld'),
    country,
    descriptionFormat,
    enforceAnnualSalary: options.enforceAnnualSalary ?? false,
    dedupe,
    strict: options.strict ?? false,
    proxies,
    caCert: options.caCert,
    userAgent: options.userAgent,
    verbose,
    linkedin: options.linkedin ?? {},
    google: options.google ?? {},
  };
}
