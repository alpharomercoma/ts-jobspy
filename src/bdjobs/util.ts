/**
 * BDJobs scraper utilities
 */

import type * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { Country, type Location } from '../model';
import { JOB_SELECTORS } from './constant';

/**
 * Parse location text into a Location object
 */
export function parseLocation(locationText: string, _country = 'bangladesh'): Location {
  const parts = locationText.split(',');
  if (parts.length >= 2) {
    return {
      city: parts[0].trim(),
      state: parts[1].trim(),
      country: Country.BANGLADESH,
    };
  }
  return {
    city: locationText.trim(),
    country: Country.BANGLADESH,
  };
}

/**
 * Parse a genuine posting-date string into a Date object.
 *
 * IMPORTANT: this must never be fed a BDJobs "Deadline:" value. A deadline is a
 * future application cut-off, not the publication date, so reporting it as
 * datePosted is wrong (codex #12). The caller is responsible for only passing
 * real posting-date text here; when none exists, datePosted stays null.
 */
export function parseDate(dateText: string): Date | null {
  if (!dateText) return null;

  try {
    const date = new Date(dateText.trim());
    if (!Number.isNaN(date.getTime())) {
      return date;
    }

    return null;
  } catch {
    return null;
  }
}

/** The only host (with its subdomains) a card's detail link may send a request to. */
const SITE_HOST = 'bdjobs.com';

/** Where a card's detail href resolves to, and whether the scraper may fetch it. */
export interface DetailLink {
  /** Absolute URL, resolved against the search host. */
  url: string;
  /** Hostname for error messages; the protocol when the URL has none (javascript:, data:). */
  target: string;
  /** True only for an http(s) URL on bdjobs.com or one of its subdomains. */
  onSite: boolean;
}

/**
 * Resolve a card's detail href and decide whether it may be fetched.
 *
 * Cards are scraped content, so an absolute (or protocol-relative) href would
 * let the page steer the detail request at any host - an SSRF vector. Only
 * http(s) URLs on bdjobs.com or a subdomain qualify; a suffix trick such as
 * bdjobs.com.evil.example does not. Returns null when the href cannot be
 * parsed at all.
 */
export function resolveDetailLink(href: string, baseUrl: string): DetailLink | null {
  let parsed: URL;
  try {
    parsed = new URL(href, baseUrl);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const onSite = isHttp && (hostname === SITE_HOST || hostname.endsWith(`.${SITE_HOST}`));
  return { url: parsed.href, target: hostname || parsed.protocol, onSite };
}

/**
 * Find job listing elements in the HTML
 */
export function findJobListings($: cheerio.CheerioAPI): AnyNode[] {
  // Try different selectors
  for (const selector of JOB_SELECTORS) {
    const elements = $(selector).toArray();
    if (elements.length > 0) {
      return elements;
    }
  }

  // If no selectors match, look for job detail links
  const jobLinks = $('a[href*="jobdetail"]').toArray();
  if (jobLinks.length > 0) {
    return jobLinks.map((link) => {
      const parent = $(link).parent().get(0);
      return parent ?? link;
    });
  }

  return [];
}

/**
 * Check if a job is remote based on text content
 */
export function isJobRemote(
  title: string,
  description?: string | null,
  location?: Location | null
): boolean {
  const remoteKeywords = ['remote', 'work from home', 'wfh', 'home based'];

  let fullText = title.toLowerCase();
  if (description) {
    fullText += ` ${description.toLowerCase()}`;
  }
  if (location?.city) {
    fullText += ` ${location.city.toLowerCase()}`;
  }
  if (location?.state) {
    fullText += ` ${location.state.toLowerCase()}`;
  }

  return remoteKeywords.some((keyword) => fullText.includes(keyword));
}
