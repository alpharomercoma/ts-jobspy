/**
 * Honest-meta orchestration tests: partial results, falsy throws, timeouts,
 * cross-site dedupe survivor selection. Scrapers are mocked; no network.
 */
import type { JobPost, JobResponse } from '../src/model';

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

const behavior: {
  indeed: () => Promise<JobResponse>;
  linkedin: () => Promise<JobResponse>;
} = {
  indeed: () => Promise.resolve({ jobs: [makePost()] }),
  linkedin: () => Promise.resolve({ jobs: [] }),
};

jest.mock('../src/indeed', () => ({
  Indeed: jest.fn().mockImplementation(() => ({ scrape: () => behavior.indeed() })),
}));
jest.mock('../src/linkedin', () => ({
  LinkedIn: jest.fn().mockImplementation(() => ({ scrape: () => behavior.linkedin() })),
}));

import { scrapeJobs } from '../src/index';

describe('honest per-site meta', () => {
  it('reports partial when a scraper returns jobs plus interruption errors', async () => {
    behavior.indeed = () =>
      Promise.resolve({
        jobs: [makePost()],
        errors: ['page 2: Indeed responded with HTTP 429 (rate limited)'],
      });

    const result = await scrapeJobs({ sites: 'indeed' });
    const meta = result.meta.sites[0];
    expect(meta.status).toBe('partial');
    expect(meta.error?.name).toBe('ScrapeInterrupted');
    expect(meta.error?.message).toContain('429');
    expect(result.jobs).toHaveLength(1);
  });

  it('reports error (not empty) when a scraper returns zero jobs plus errors', async () => {
    behavior.indeed = () => Promise.resolve({ jobs: [], errors: ['page 1: blocked'] });
    const result = await scrapeJobs({ sites: 'indeed' });
    expect(result.meta.sites[0].status).toBe('error');
  });

  it('strict mode rejects on partial interruptions, not only thrown errors', async () => {
    behavior.indeed = () =>
      Promise.resolve({ jobs: [makePost()], errors: ['page 2: rate limited'] });
    await expect(scrapeJobs({ sites: 'indeed', strict: true })).rejects.toThrow(/indeed/);
  });

  it('classifies a falsy thrown value as an error, not a successful empty scrape', async () => {
    // eslint-disable-next-line prefer-promise-reject-errors
    behavior.indeed = () => Promise.reject(undefined);
    const result = await scrapeJobs({ sites: 'indeed' });
    expect(result.meta.sites[0].status).toBe('error');
    await expect(scrapeJobs({ sites: 'indeed', strict: true })).rejects.toThrow();
  });

  it('times out a hung scraper and reports it as an error', async () => {
    behavior.indeed = () => new Promise(() => {}); // never settles
    behavior.linkedin = () => Promise.resolve({ jobs: [makePost({ jobUrl: 'https://l.com/1' })] });

    const result = await scrapeJobs({ sites: ['indeed', 'linkedin'], timeoutMs: 200 });
    const indeed = result.meta.sites.find((s) => s.site === 'indeed');
    const linkedin = result.meta.sites.find((s) => s.site === 'linkedin');
    expect(indeed?.status).toBe('error');
    expect(indeed?.error?.name).toBe('SiteTimeoutError');
    expect(linkedin?.status).toBe('ok');
    expect(result.jobs).toHaveLength(1);
  });

  it('skips an unconvertible posting without discarding other results', async () => {
    behavior.indeed = () =>
      Promise.resolve({
        jobs: [
          makePost({ datePosted: new Date('invalid') }), // invalid Date: survives as null date
          makePost({ jobUrl: 'https://indeed.com/2' }),
        ],
      });
    behavior.linkedin = () => Promise.resolve({ jobs: [makePost({ jobUrl: 'https://l.com/1' })] });

    const result = await scrapeJobs({ sites: ['indeed', 'linkedin'] });
    expect(result.jobs.length).toBe(3);
    expect(result.jobs.find((j) => j.jobUrl === 'https://indeed.com/1')?.datePosted).toBeNull();
  });

  it('content dedupe keeps the newest cross-site copy, not the alphabetically first site', async () => {
    behavior.indeed = () =>
      Promise.resolve({
        jobs: [makePost({ datePosted: new Date('2026-01-01T00:00:00Z') })],
      });
    behavior.linkedin = () =>
      Promise.resolve({
        jobs: [
          makePost({ jobUrl: 'https://l.com/1', datePosted: new Date('2026-08-30T00:00:00Z') }),
        ],
      });

    const result = await scrapeJobs({ sites: ['indeed', 'linkedin'], dedupe: 'content' });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].site).toBe('linkedin');
    expect(result.meta.duplicatesRemoved).toBe(1);
  });
});

describe('metrics and strategy', () => {
  it('reports per-site and overall jobsPerSecond and a zero failureRate on success', async () => {
    behavior.indeed = () => Promise.resolve({ jobs: [makePost()] });
    behavior.linkedin = () => Promise.resolve({ jobs: [makePost({ jobUrl: 'https://l.com/1' })] });

    const result = await scrapeJobs({ sites: ['indeed', 'linkedin'] });
    for (const site of result.meta.sites) {
      expect(typeof site.jobsPerSecond).toBe('number');
      expect(site.jobsPerSecond).toBeGreaterThanOrEqual(0);
    }
    expect(result.meta.jobsPerSecond).toBeGreaterThanOrEqual(0);
    expect(result.meta.failureRate).toBe(0);
  });

  it('computes failureRate from failed and interrupted sites', async () => {
    behavior.indeed = () => Promise.reject(new Error('boom'));
    behavior.linkedin = () => Promise.resolve({ jobs: [makePost({ jobUrl: 'https://l.com/1' })] });

    const result = await scrapeJobs({ sites: ['indeed', 'linkedin'] });
    expect(result.meta.failureRate).toBe(0.5);
  });

  it('siteConcurrency: 1 runs sites sequentially', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tracked = (post: JobPost) => async (): Promise<JobResponse> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return { jobs: [post] };
    };
    behavior.indeed = tracked(makePost());
    behavior.linkedin = tracked(makePost({ jobUrl: 'https://l.com/1' }));

    await scrapeJobs({ sites: ['indeed', 'linkedin'], siteConcurrency: 1 });
    expect(maxInFlight).toBe(1);

    maxInFlight = 0;
    await scrapeJobs({ sites: ['indeed', 'linkedin'] });
    expect(maxInFlight).toBe(2);
  });
});
