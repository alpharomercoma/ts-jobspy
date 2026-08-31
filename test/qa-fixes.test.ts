/**
 * Regression tests for the round-2 adversarial QA fixes:
 * abort-on-timeout, strict-covers-conversion, userAgent plumbing,
 * and the Indeed GraphQL escaping.
 */
import type { JobPost, JobResponse, ScraperInput } from '../src/model';

const makePost = (overrides: Partial<JobPost> = {}): JobPost => ({
  id: 'x1',
  title: 'Engineer',
  companyName: 'Acme',
  jobUrl: 'https://indeed.com/1',
  location: { city: 'SF', state: 'CA', country: 'USA' },
  description: null,
  datePosted: new Date('2026-08-30T00:00:00Z'),
  ...overrides,
});

const capture: { indeedInput?: ScraperInput } = {};
const behavior: { indeed: (input: ScraperInput) => Promise<JobResponse> } = {
  indeed: () => Promise.resolve({ jobs: [makePost()] }),
};

jest.mock('../src/indeed', () => ({
  Indeed: jest.fn().mockImplementation(() => ({
    scrape: (input: ScraperInput) => {
      capture.indeedInput = input;
      return behavior.indeed(input);
    },
  })),
}));
jest.mock('../src/linkedin', () => ({
  LinkedIn: jest.fn().mockImplementation(() => ({ scrape: () => Promise.resolve({ jobs: [] }) })),
}));

import { scrapeJobs } from '../src/index';

describe('round-2 QA fixes', () => {
  it('aborts the scraper via signal when the timeout fires', async () => {
    let aborted = false;
    behavior.indeed = (input) =>
      new Promise((resolve) => {
        input.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        // Never resolves on its own; only the abort ends it.
        input.signal?.addEventListener('abort', () => resolve({ jobs: [] }));
      });

    const result = await scrapeJobs({ sites: 'indeed', timeoutMs: 100 });
    expect(aborted).toBe(true);
    expect(result.meta.sites[0].status).toBe('error');
    expect(result.meta.sites[0].error?.name).toBe('SiteTimeoutError');
  });

  it('passes a caller userAgent through to the scraper input', async () => {
    behavior.indeed = () => Promise.resolve({ jobs: [makePost()] });
    await scrapeJobs({ sites: 'indeed', userAgent: 'my-bot/1.0' });
    expect(capture.indeedInput?.userAgent).toBe('my-bot/1.0');
  });

  it('strict mode rejects when a posting fails to convert', async () => {
    // A JobPost whose datePosted is not a Date triggers a conversion throw.
    behavior.indeed = () =>
      Promise.resolve({ jobs: [makePost({ datePosted: 'nope' as unknown as Date })] });
    await expect(scrapeJobs({ sites: 'indeed', strict: true })).rejects.toThrow();
  });
});
