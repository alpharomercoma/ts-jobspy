/**
 * Cross-site duplicate removal.
 *
 * 'url'     — exact match on the job's canonical URL (safe, catches same-site repeats).
 * 'content' — normalized title + company + location (catches the same posting
 *             syndicated across boards; keeps the first occurrence, which after
 *             sorting is the newest per site).
 */

import type { Job } from './result';

function normalize(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function dedupeJobs(jobs: Job[], mode: 'url' | 'content'): { jobs: Job[]; removed: number } {
  const seen = new Set<string>();
  const kept: Job[] = [];
  for (const job of jobs) {
    const key =
      mode === 'url'
        ? job.jobUrl
        : `${normalize(job.title)}|${normalize(job.company)}|${normalize(job.location)}`;
    // Never treat jobs with no usable key as duplicates of each other.
    if (key === '' || key === '||') {
      kept.push(job);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(job);
  }
  return { jobs: kept, removed: jobs.length - kept.length };
}
