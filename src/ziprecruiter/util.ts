/**
 * ZipRecruiter scraper utilities
 */

import { JobType, ScraperInput } from '../model';
import { getEnumFromJobType } from '../util';

/**
 * Build query parameters for ZipRecruiter API
 */
export function addParams(scraperInput: ScraperInput): Record<string, string | number> {
  const params: Record<string, string | number> = {
    search: scraperInput.searchTerm ?? '',
    location: scraperInput.location ?? '',
  };

  if (scraperInput.hoursOld) {
    params.days = Math.max(Math.floor(scraperInput.hoursOld / 24), 1);
  }

  const jobTypeMap: Record<JobType, string> = {
    [JobType.FULL_TIME]: 'full_time',
    [JobType.PART_TIME]: 'part_time',
    [JobType.CONTRACT]: 'contract',
    [JobType.TEMPORARY]: 'temporary',
    [JobType.INTERNSHIP]: 'internship',
    [JobType.PER_DIEM]: 'per_diem',
    [JobType.NIGHTS]: 'nights',
    [JobType.OTHER]: 'other',
    [JobType.SUMMER]: 'summer',
    [JobType.VOLUNTEER]: 'volunteer',
  };

  if (scraperInput.jobType) {
    params.employment_type =
      jobTypeMap[scraperInput.jobType] ?? scraperInput.jobType;
  }

  if (scraperInput.easyApply) {
    params.zipapply = 1;
  }

  if (scraperInput.isRemote) {
    params.remote = 1;
  }

  if (scraperInput.distance) {
    params.radius = scraperInput.distance;
  }

  // Filter out empty/null values
  return Object.fromEntries(
    Object.entries(params).filter(
      ([_, v]) => v !== null && v !== undefined && v !== ''
    )
  );
}

/**
 * Get JobType enum from string
 */
export function getJobTypeEnum(jobTypeStr: string): JobType[] | null {
  const jobType = getEnumFromJobType(jobTypeStr);
  return jobType ? [jobType] : null;
}
