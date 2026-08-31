/**
 * Orchestrator tests: per-site isolation, honest meta, strict mode.
 * Scrapers are mocked; no network access.
 */
import type { JobPost } from '../src/model';

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

jest.mock('../src/indeed', () => ({
  Indeed: jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockResolvedValue({
      jobs: [makePost()],
    }),
  })),
}));

jest.mock('../src/linkedin', () => ({
  LinkedIn: jest.fn().mockImplementation(() => ({
    scrape: jest.fn().mockRejectedValue(new Error('429 rate limited')),
  })),
}));

import { InvalidInputError, scrapeJobs } from '../src/index';

describe('scrapeJobs orchestration', () => {
  it('does not let one site failing discard the other sites results', async () => {
    const result = await scrapeJobs({ sites: ['indeed', 'linkedin'] });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].site).toBe('indeed');

    const indeedMeta = result.meta.sites.find((s) => s.site === 'indeed');
    const linkedinMeta = result.meta.sites.find((s) => s.site === 'linkedin');
    expect(indeedMeta).toMatchObject({ status: 'ok', jobs: 1, requested: 15 });
    expect(linkedinMeta).toMatchObject({ status: 'error', jobs: 0 });
    expect(linkedinMeta?.error).toEqual({ name: 'Error', message: '429 rate limited' });
    expect(typeof result.meta.totalDurationMs).toBe('number');
  });

  it('strict mode rejects with an AggregateError naming the failed sites', async () => {
    await expect(scrapeJobs({ sites: ['indeed', 'linkedin'], strict: true })).rejects.toThrow(
      /linkedin/
    );
  });

  it('flattens JobPost into the public Job shape', async () => {
    const result = await scrapeJobs({ sites: 'indeed' });
    const job = result.jobs[0];
    expect(job).toMatchObject({
      id: 'x1',
      site: 'indeed',
      title: 'Engineer',
      company: 'Acme',
      datePosted: '2026-08-30',
      jobTypes: [],
      emails: [],
      skills: [],
    });
  });

  it('rejects invalid options before any scraping', async () => {
    await expect(scrapeJobs({ sites: 'monster' as never })).rejects.toThrow(InvalidInputError);
  });
});
