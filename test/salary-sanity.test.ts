/**
 * A salary range that cannot be true (max below min, or a negative amount)
 * came straight through to the public Job when a board's payload was
 * corrupted (found by mutation-fuzzing Indeed's JSON: baseSalary.range.max
 * set to -1 or 0 produced minAmount > maxAmount). An impossible range is not
 * data; both amounts are dropped rather than emitted.
 */
import type { JobPost } from '../src/model';

let nextJobs: JobPost[] = [];

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
    scrape: jest.fn().mockImplementation(async () => ({ jobs: nextJobs })),
  })),
}));

import { scrapeJobs } from '../src/index';

async function jobFor(post: JobPost) {
  nextJobs = [post];
  const result = await scrapeJobs({ sites: 'indeed' });
  expect(result.meta.sites[0].status).toBe('ok');
  return result.jobs[0];
}

describe('impossible salary ranges are dropped, not emitted', () => {
  it('drops a range whose max is below its min', async () => {
    const job = await jobFor(
      makePost({
        compensation: { interval: 'yearly', minAmount: 150000, maxAmount: 0, currency: 'USD' },
      })
    );
    expect(job.minAmount).toBeNull();
    expect(job.maxAmount).toBeNull();
    expect(job.salarySource).toBeNull();
  });

  it('drops negative amounts', async () => {
    const job = await jobFor(
      makePost({
        compensation: { interval: 'yearly', minAmount: -1, maxAmount: 120000, currency: 'USD' },
      })
    );
    expect(job.minAmount).toBeNull();
    expect(job.maxAmount).toBeNull();
  });

  it('drops a non-finite amount', async () => {
    const job = await jobFor(
      makePost({
        compensation: {
          interval: 'yearly',
          minAmount: 100000,
          maxAmount: Number.POSITIVE_INFINITY,
          currency: 'USD',
        },
      })
    );
    expect(job.minAmount).toBeNull();
    expect(job.maxAmount).toBeNull();
  });

  it('falls back to a salary stated in the description when the direct range is impossible', async () => {
    const job = await jobFor(
      makePost({
        compensation: { interval: 'yearly', minAmount: 150000, maxAmount: 0, currency: 'USD' },
        description: 'Compensation: $120,000 - $140,000 per year plus equity.',
      })
    );
    expect([job.minAmount, job.maxAmount]).toEqual([120000, 140000]);
    expect(job.salarySource).toBe('description');
  });

  it('keeps a sane range and a one-sided range', async () => {
    const both = await jobFor(
      makePost({
        compensation: { interval: 'yearly', minAmount: 100000, maxAmount: 150000, currency: 'USD' },
      })
    );
    expect([both.minAmount, both.maxAmount]).toEqual([100000, 150000]);
    const oneSided = await jobFor(
      makePost({ compensation: { interval: 'hourly', minAmount: 40, currency: 'USD' } })
    );
    expect([oneSided.minAmount, oneSided.maxAmount]).toEqual([40, null]);
    expect(oneSided.salarySource).toBe('direct_data');
  });
});
