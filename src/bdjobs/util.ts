/**
 * BDJobs scraper utilities
 */

import * as cheerio from 'cheerio';
import { Location, Country } from '../model';
import { JOB_SELECTORS } from './constant';

/**
 * Parse location text into a Location object
 */
export function parseLocation(locationText: string, country = 'bangladesh'): Location {
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
 * Parse date text into a Date object
 */
export function parseDate(dateText: string): Date | null {
  if (!dateText) return null;

  try {
    // Clean up date text
    let cleaned = dateText;
    if (cleaned.includes('Deadline:')) {
      cleaned = cleaned.replace('Deadline:', '').trim();
    }

    // Try parsing with Date constructor
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find job listing elements in the HTML
 */
export function findJobListings($: cheerio.CheerioAPI): cheerio.Element[] {
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
    fullText += ' ' + description.toLowerCase();
  }
  if (location?.city) {
    fullText += ' ' + location.city.toLowerCase();
  }
  if (location?.state) {
    fullText += ' ' + location.state.toLowerCase();
  }

  return remoteKeywords.some((keyword) => fullText.includes(keyword));
}
