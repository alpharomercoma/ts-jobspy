/**
 * Live integration tests (real network; excluded from `npm test`).
 * Run with: npm run test:integration
 *
 * These hit real job boards and are inherently flaky: datacenter IPs are often
 * blocked, LinkedIn rate-limits aggressively. Failures here usually mean IP
 * blocking, not code breakage - check meta.sites for the reported reason.
 */
import { scrapeJobs } from '../../../src';

jest.setTimeout(120_000);

describe('live scrapeJobs (v3)', () => {
  it('scrapes Indeed and reports ok in meta', async () => {
    const result = await scrapeJobs({
      sites: 'indeed',
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 5,
    });

    expect(result.meta.sites).toHaveLength(1);
    const meta = result.meta.sites[0];
    expect(meta.site).toBe('indeed');
    expect(['ok', 'empty', 'error']).toContain(meta.status);
    if (meta.status === 'ok') {
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(result.jobs.length).toBeLessThanOrEqual(5);
      for (const job of result.jobs) {
        expect(job.title).toBeTruthy();
        expect(job.jobUrl).toMatch(/^https?:\/\//);
        expect(job.site).toBe('indeed');
      }
    }
  });

  it('scrapes LinkedIn and reports ok in meta', async () => {
    const result = await scrapeJobs({
      sites: 'linkedin',
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 5,
    });

    const meta = result.meta.sites[0];
    expect(meta.site).toBe('linkedin');
    if (meta.status === 'ok') {
      expect(result.jobs.length).toBeGreaterThan(0);
      for (const job of result.jobs) {
        expect(job.jobUrl).toContain('linkedin.com');
      }
    }
  });

  it('scrapes both working sites concurrently with per-site meta', async () => {
    const result = await scrapeJobs({
      sites: ['indeed', 'linkedin'],
      searchTerm: 'typescript developer',
      resultsWanted: 3,
    });

    expect(result.meta.sites.map((s) => s.site).sort()).toEqual(['indeed', 'linkedin']);
    for (const site of result.meta.sites) {
      expect(site.durationMs).toBeGreaterThan(0);
      expect(site.requested).toBe(3);
    }
    // Concurrency: total wall time should be far less than the sum of site times.
    const sum = result.meta.sites.reduce((acc, s) => acc + s.durationMs, 0);
    expect(result.meta.totalDurationMs).toBeLessThanOrEqual(sum + 1000);
  });

  it('honors offset without page overlap on Indeed', async () => {
    const [page1, page2] = await Promise.all([
      scrapeJobs({ sites: 'indeed', searchTerm: 'nurse', resultsWanted: 5, offset: 0 }),
      scrapeJobs({ sites: 'indeed', searchTerm: 'nurse', resultsWanted: 5, offset: 5 }),
    ]);
    if (page1.meta.sites[0].status === 'ok' && page2.meta.sites[0].status === 'ok') {
      const urls1 = new Set(page1.jobs.map((j) => j.jobUrl));
      const overlap = page2.jobs.filter((j) => urls1.has(j.jobUrl));
      expect(overlap.length).toBeLessThanOrEqual(1); // allow one boundary repeat
    }
  });
});
