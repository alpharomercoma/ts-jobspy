/**
 * Unit tests for the LinkedIn scraper's job card parsing
 */

import * as cheerio from 'cheerio';
import { LinkedIn } from '../src';
import type { JobPost } from '../src/model';

function jobCard(timeClass: string): string {
  return `
    <div class="base-search-card">
      <span class="sr-only">Software Engineer</span>
      <h4 class="base-search-card__subtitle">
        <a href="https://www.linkedin.com/company/acme?trk=x">Acme Corp</a>
      </h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">San Francisco, CA</span>
        <time class="${timeClass}" datetime="2026-07-05">1 day ago</time>
      </div>
    </div>`;
}

type ProcessJob = (
  $: cheerio.CheerioAPI,
  jobId: string,
  fullDescr: boolean
) => Promise<JobPost | null>;

describe('LinkedIn processJob', () => {
  const scraper = new LinkedIn({});
  const processJob = (scraper as unknown as { processJob: ProcessJob }).processJob.bind(
    scraper
  ) as ProcessJob;

  it('parses datePosted from time.job-search-card__listdate', async () => {
    const job = await processJob(cheerio.load(jobCard('job-search-card__listdate')), '4242', false);
    expect(job?.datePosted?.toISOString().slice(0, 10)).toBe('2026-07-05');
  });

  it('parses datePosted from time.job-search-card__listdate--new (used for recent jobs, e.g. hoursOld filter)', async () => {
    const job = await processJob(
      cheerio.load(jobCard('job-search-card__listdate--new')),
      '4242',
      false
    );
    expect(job?.datePosted?.toISOString().slice(0, 10)).toBe('2026-07-05');
  });
});
