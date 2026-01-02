/**
 * LinkedIn scraper utilities
 */

import * as cheerio from 'cheerio';
import { JobType, Location } from '../model';
import { getEnumFromJobType } from '../util';

/**
 * Get job type code for LinkedIn API
 */
export function jobTypeCode(jobType: JobType): string {
  const mapping: Partial<Record<JobType, string>> = {
    [JobType.FULL_TIME]: 'F',
    [JobType.PART_TIME]: 'P',
    [JobType.INTERNSHIP]: 'I',
    [JobType.CONTRACT]: 'C',
    [JobType.TEMPORARY]: 'T',
  };
  return mapping[jobType] ?? '';
}

/**
 * Parse job type from LinkedIn job page
 */
export function parseJobType($: cheerio.CheerioAPI): JobType[] {
  const h3Tag = $(
    'h3.description__job-criteria-subheader:contains("Employment type")'
  ).first();

  if (h3Tag.length) {
    const employmentTypeSpan = h3Tag
      .next(
        'span.description__job-criteria-text.description__job-criteria-text--criteria'
      )
      .first();

    if (employmentTypeSpan.length) {
      let employmentType = employmentTypeSpan.text().trim().toLowerCase();
      employmentType = employmentType.replace(/-/g, '');

      const jobType = getEnumFromJobType(employmentType);
      return jobType ? [jobType] : [];
    }
  }

  return [];
}

/**
 * Parse job level from LinkedIn job page
 */
export function parseJobLevel($: cheerio.CheerioAPI): string | null {
  const h3Tag = $(
    'h3.description__job-criteria-subheader:contains("Seniority level")'
  ).first();

  if (h3Tag.length) {
    const jobLevelSpan = h3Tag
      .next(
        'span.description__job-criteria-text.description__job-criteria-text--criteria'
      )
      .first();

    if (jobLevelSpan.length) {
      return jobLevelSpan.text().trim();
    }
  }

  return null;
}

/**
 * Parse company industry from LinkedIn job page
 */
export function parseCompanyIndustry($: cheerio.CheerioAPI): string | null {
  const h3Tag = $(
    'h3.description__job-criteria-subheader:contains("Industries")'
  ).first();

  if (h3Tag.length) {
    const industrySpan = h3Tag
      .next(
        'span.description__job-criteria-text.description__job-criteria-text--criteria'
      )
      .first();

    if (industrySpan.length) {
      return industrySpan.text().trim();
    }
  }

  return null;
}

/**
 * Check if job is remote based on title, description, and location
 */
export function isJobRemote(
  title: string,
  description: string | null,
  location: Location
): boolean {
  const remoteKeywords = ['remote', 'work from home', 'wfh'];

  const locationStr = [
    location.city,
    location.state,
    typeof location.country === 'string' ? location.country : '',
  ]
    .filter(Boolean)
    .join(' ');

  const fullString = `${title} ${description ?? ''} ${locationStr}`.toLowerCase();

  return remoteKeywords.some((keyword) => fullString.includes(keyword));
}
