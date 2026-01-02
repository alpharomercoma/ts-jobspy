/**
 * Indeed scraper utilities
 */

import { Compensation, CompensationInterval, JobType } from '../model';
import { getEnumFromJobType } from '../util';

interface IndeedAttribute {
  key: string;
  label: string;
}

interface IndeedCompensation {
  baseSalary?: {
    unitOfWork?: string;
    range?: {
      min?: number;
      max?: number;
    };
  };
  estimated?: {
    currencyCode?: string;
    baseSalary?: {
      unitOfWork?: string;
      range?: {
        min?: number;
        max?: number;
      };
    };
  };
  currencyCode?: string;
}

interface IndeedJob {
  attributes: IndeedAttribute[];
  location: {
    formatted: {
      long: string;
    };
  };
}

/**
 * Get JobType from attributes
 */
export function getJobType(attributes: IndeedAttribute[]): JobType[] {
  const jobTypes: JobType[] = [];

  for (const attribute of attributes) {
    const jobTypeStr = attribute.label
      .replace(/-/g, '')
      .replace(/\s/g, '')
      .toLowerCase();
    const jobType = getEnumFromJobType(jobTypeStr);
    if (jobType) {
      jobTypes.push(jobType);
    }
  }

  return jobTypes;
}

/**
 * Get compensation from Indeed compensation object
 */
export function getCompensation(
  compensation: IndeedCompensation | null
): Compensation | null {
  if (!compensation) return null;

  const baseSalary = compensation.baseSalary ?? compensation.estimated?.baseSalary;
  if (!baseSalary) return null;

  const interval = getCompensationInterval(baseSalary.unitOfWork ?? '');
  if (!interval) return null;

  const minRange = baseSalary.range?.min;
  const maxRange = baseSalary.range?.max;

  const currency =
    compensation.estimated?.currencyCode ?? compensation.currencyCode;

  return {
    interval,
    minAmount: minRange !== undefined ? Math.floor(minRange) : undefined,
    maxAmount: maxRange !== undefined ? Math.floor(maxRange) : undefined,
    currency,
  };
}

/**
 * Check if job is remote
 */
export function isJobRemote(job: IndeedJob, description: string): boolean {
  const remoteKeywords = ['remote', 'work from home', 'wfh'];

  const isRemoteInAttributes = job.attributes.some((attr) =>
    remoteKeywords.some((keyword) => attr.label.toLowerCase().includes(keyword))
  );

  const isRemoteInDescription = remoteKeywords.some((keyword) =>
    description.toLowerCase().includes(keyword)
  );

  const isRemoteInLocation = remoteKeywords.some((keyword) =>
    job.location.formatted.long.toLowerCase().includes(keyword)
  );

  return isRemoteInAttributes || isRemoteInDescription || isRemoteInLocation;
}

/**
 * Get compensation interval from string
 */
export function getCompensationInterval(
  interval: string
): CompensationInterval | null {
  const intervalMapping: Record<string, CompensationInterval> = {
    DAY: CompensationInterval.DAILY,
    YEAR: CompensationInterval.YEARLY,
    HOUR: CompensationInterval.HOURLY,
    WEEK: CompensationInterval.WEEKLY,
    MONTH: CompensationInterval.MONTHLY,
  };

  const mapped = intervalMapping[interval.toUpperCase()];
  return mapped ?? null;
}
