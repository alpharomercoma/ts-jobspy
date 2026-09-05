/**
 * Cross-site duplicate removal.
 *
 * 'url'     - exact match on the job's canonical URL (safe, catches same-site repeats).
 * 'content' - normalized title + company + location (catches the same posting
 *             syndicated across boards). The caller feeds jobs newest-first,
 *             so the newest copy of a duplicate survives.
 */

import type { Job } from './result';

/**
 * Unicode-aware normalization: NFKD-fold, strip diacritics (Café → cafe),
 * lowercase, and collapse everything that is not a letter or digit in any
 * script - CJK, Cyrillic, etc. are preserved, not stripped.
 */
function normalize(value: string | null): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function dedupeJobs(jobs: Job[], mode: 'url' | 'content'): { jobs: Job[]; removed: number } {
  const seen = new Set<string>();
  const kept: Job[] = [];
  for (const job of jobs) {
    let key: string | null;
    if (mode === 'url') {
      key = job.jobUrl === '' ? null : job.jobUrl;
    } else {
      const title = normalize(job.title);
      const company = normalize(job.company);
      const location = normalize(job.location);
      // Title alone is too weak a key: require at least one more component so
      // two unrelated postings with empty company+location never collide.
      key =
        title === '' || (company === '' && location === '')
          ? null
          : `${title}|${company}|${location}`;
    }
    // Jobs with no usable key are never treated as duplicates of each other.
    if (key === null) {
      kept.push(job);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(job);
  }
  return { jobs: kept, removed: jobs.length - kept.length };
}
