/**
 * Naukri scraper utilities
 */

import { JobType, Location } from '../model';
import { getEnumFromJobType } from '../util';

/**
 * Parse job type from description
 */
export function parseJobType(description: string | null): JobType[] | null {
  if (!description) return null;

  // Simple pattern matching for job type
  const patterns: Record<JobType, RegExp> = {
    [JobType.FULL_TIME]: /full\s*time/i,
    [JobType.PART_TIME]: /part\s*time/i,
    [JobType.CONTRACT]: /contract/i,
    [JobType.TEMPORARY]: /temporary/i,
    [JobType.INTERNSHIP]: /internship/i,
    [JobType.PER_DIEM]: /per\s*diem/i,
    [JobType.NIGHTS]: /nights/i,
    [JobType.OTHER]: /other/i,
    [JobType.SUMMER]: /summer/i,
    [JobType.VOLUNTEER]: /volunteer/i,
  };

  const types: JobType[] = [];
  for (const [jobType, pattern] of Object.entries(patterns)) {
    if (pattern.test(description)) {
      types.push(jobType as JobType);
    }
  }

  return types.length > 0 ? types : null;
}

/**
 * Parse company industry from description
 */
export function parseCompanyIndustry(description: string | null): string | null {
  if (!description) return null;

  // Industry is typically not directly parseable from description
  // This would need specific patterns for Naukri's format
  return null;
}

/**
 * Check if job is remote
 */
export function isJobRemote(
  title: string,
  description: string,
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

  const fullString = `${title} ${description} ${locationStr}`.toLowerCase();

  return remoteKeywords.some((keyword) => fullString.includes(keyword));
}
