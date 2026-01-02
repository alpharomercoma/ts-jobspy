/**
 * Glassdoor scraper utilities
 */

import { Compensation, CompensationInterval, Location, JobType } from '../model';

interface PayPeriodAdjustedPay {
  p10?: number;
  p50?: number;
  p90?: number;
}

interface GlassdoorHeader {
  payPeriod?: string;
  payPeriodAdjustedPay?: PayPeriodAdjustedPay;
  payCurrency?: string;
}

interface PaginationCursor {
  pageNumber: number;
  cursor: string;
}

/**
 * Parse compensation from Glassdoor header data
 */
export function parseCompensation(data: GlassdoorHeader): Compensation | null {
  const payPeriod = data.payPeriod;
  const adjustedPay = data.payPeriodAdjustedPay;
  const currency = data.payCurrency ?? 'USD';

  if (!payPeriod || !adjustedPay) {
    return null;
  }

  let interval: CompensationInterval | undefined;

  if (payPeriod === 'ANNUAL') {
    interval = CompensationInterval.YEARLY;
  } else if (payPeriod) {
    interval = getInterval(payPeriod);
  }

  const minAmount =
    adjustedPay.p10 !== undefined ? Math.floor(adjustedPay.p10) : undefined;
  const maxAmount =
    adjustedPay.p90 !== undefined ? Math.floor(adjustedPay.p90) : undefined;

  return {
    interval,
    minAmount,
    maxAmount,
    currency,
  };
}

/**
 * Get compensation interval from string
 */
function getInterval(payPeriod: string): CompensationInterval | undefined {
  const mapping: Record<string, CompensationInterval> = {
    YEAR: CompensationInterval.YEARLY,
    HOUR: CompensationInterval.HOURLY,
    YEARLY: CompensationInterval.YEARLY,
    HOURLY: CompensationInterval.HOURLY,
    MONTHLY: CompensationInterval.MONTHLY,
    WEEKLY: CompensationInterval.WEEKLY,
    DAILY: CompensationInterval.DAILY,
  };

  return mapping[payPeriod.toUpperCase()];
}

/**
 * Get JobType enum from string
 */
export function getJobTypeEnum(jobTypeStr: string): JobType[] | null {
  const normalized = jobTypeStr.toLowerCase().replace(/[-\s]/g, '');

  const mapping: Record<string, JobType> = {
    fulltime: JobType.FULL_TIME,
    parttime: JobType.PART_TIME,
    contract: JobType.CONTRACT,
    temporary: JobType.TEMPORARY,
    internship: JobType.INTERNSHIP,
  };

  const jobType = mapping[normalized];
  return jobType ? [jobType] : null;
}

/**
 * Parse location from location name string
 */
export function parseLocation(locationName: string): Location | null {
  if (!locationName || locationName === 'Remote') {
    return null;
  }

  const parts = locationName.split(', ');
  return {
    city: parts[0],
    state: parts[1],
  };
}

/**
 * Get cursor for a specific page number
 */
export function getCursorForPage(
  paginationCursors: PaginationCursor[],
  pageNum: number
): string | null {
  for (const cursorData of paginationCursors) {
    if (cursorData.pageNumber === pageNum) {
      return cursorData.cursor;
    }
  }
  return null;
}
