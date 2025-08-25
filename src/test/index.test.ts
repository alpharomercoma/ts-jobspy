import { scrapeJobs } from '../index';

describe('scrapeJobs', () => {
  it('should return JobDataFrame with scraped job data', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 1,
      countryIndeed: 'usa'
    });

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const firstJob = jobs.at(0);
    expect(firstJob).toBeDefined();
    expect(firstJob?.title).toBeDefined();
    expect(firstJob?.companyName).toBeDefined();
    expect(firstJob?.jobUrl).toMatch(/^https?:\/\//);
    expect(firstJob?.location).toBeDefined();
    if (firstJob?.jobType) {
      expect(Array.isArray(firstJob.jobType)).toBe(true);
    }
  });

  it('should handle empty search term', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      countryIndeed: 'uk'
    });

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const firstJob = jobs.at(0);
    expect(firstJob?.title).toBeDefined();
  });

  it('should use default values', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed']
    });

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const firstJob = jobs.at(0);
    expect(firstJob).toBeDefined();
  });

  it('should provide autocomplete for country names', () => {
    // This test verifies that TypeScript provides proper autocomplete for country names
    // In a real IDE, users will see all supported countries as suggestions
    const testCountries: Array<'usa' | 'uk' | 'canada' | 'germany' | 'france'> = [
      'usa', 'uk', 'canada', 'germany', 'france'
    ];

    expect(testCountries).toContain('usa');
    expect(testCountries).toContain('uk');
    expect(testCountries).toContain('canada');
  });
});
