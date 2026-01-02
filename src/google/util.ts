/**
 * Google Jobs scraper utilities
 */

import { createLogger } from '../util';

export const log = createLogger('Google');

/**
 * Recursively find job info in nested data structure
 */
export function findJobInfo(jobsData: unknown): unknown[] | null {
  if (typeof jobsData === 'object' && jobsData !== null) {
    if (Array.isArray(jobsData)) {
      for (const item of jobsData) {
        const result = findJobInfo(item);
        if (result) return result;
      }
    } else {
      const obj = jobsData as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) {
        if (key === '520084652' && Array.isArray(value)) {
          return value as unknown[];
        }
        const result = findJobInfo(value);
        if (result) return result;
      }
    }
  }
  return null;
}

/**
 * Find job info from initial HTML page
 */
export function findJobInfoInitialPage(htmlText: string): unknown[][] {
  const pattern = /520084652":(\[.*?\]\s*])\s*}\s*]\s*]\s*]\s*]\s*]/g;
  const results: unknown[][] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(htmlText)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as unknown[];
      results.push(parsed);
    } catch (e) {
      log.error(`Failed to parse match: ${(e as Error).message}`);
    }
  }

  return results;
}
