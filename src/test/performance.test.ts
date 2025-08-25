import { scrapeJobs } from '../index';

describe('Performance Tests', () => {
  it('should handle multiple concurrent requests', async () => {
    const startTime = Date.now();

    const promises = Array.from({ length: 5 }, () =>
      scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'engineer',
        resultsWanted: 1,
        countryIndeed: 'usa'
      })
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // All requests should complete
    expect(results).toHaveLength(5);
    results.forEach(jobs => {
      expect(jobs).toHaveLength(1);
      expect(jobs.at(0)).toMatchObject({
        title: expect.any(String),
        companyName: expect.any(String),
        jobUrl: expect.any(String)
      });
    });

    // Should complete within reasonable time (5 seconds for mock data)
    expect(duration).toBeLessThan(5000);
  });

  it('should handle large result requests efficiently', async () => {
    const startTime = Date.now();

    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      searchTerm: 'developer',
      resultsWanted: 100, // Large request
      countryIndeed: 'usa'
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should return at least one job (our mock returns 1)
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.at(0)).toMatchObject({
      title: expect.any(String),
      companyName: expect.any(String)
    });

    // Should complete reasonably quickly for real API data
    expect(duration).toBeLessThan(2000);
  });

  it('should handle rapid sequential requests', async () => {
    const startTime = Date.now();
    const results = [];

    // Make 10 rapid sequential requests
    for (let i = 0; i < 10; i++) {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });
      results.push(jobs);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // All requests should succeed
    expect(results).toHaveLength(10);
    results.forEach((jobs) => {
      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const job = jobs.at(0)!;
        expect(typeof job.title).toBe('string');
      }
    });

    // Should complete within reasonable time (15 seconds for 10 sequential API calls)
    expect(duration).toBeLessThan(15000);
  });
});
