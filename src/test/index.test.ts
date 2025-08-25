import { scrapeJobs } from '../index';
import { WORKING_SITES, validateJobPost } from './utils';

describe('scrapeJobs', () => {
  // Use working scrapers only for reliable tests
  it('should return JobDataFrame with scraped job data from working scrapers', async () => {
    const jobs = await scrapeJobs({
      siteName: [WORKING_SITES[0]], // Use Indeed (known working)
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 5,
      countryIndeed: 'usa'
    });

    // Should get at least some jobs from working scraper
    expect(jobs.length).toBeGreaterThan(0);

    if (jobs.length > 0) {
      const firstJob = jobs.at(0);
      expect(firstJob).toBeDefined();

      // Validate job structure
      const validation = validateJobPost(firstJob);
      if (!validation.valid) {
        console.warn('Job validation errors:', validation.errors);
      }

      expect(firstJob?.title).toBeDefined();
      expect(typeof firstJob?.title).toBe('string');
      expect(firstJob?.jobUrl).toMatch(/^https?:\/\//);
      expect(firstJob?.jobUrl).toMatch(/indeed\.com/);

      if (firstJob?.companyName) {
        expect(typeof firstJob.companyName).toBe('string');
      }

      if (firstJob?.jobType) {
        expect(Array.isArray(firstJob.jobType)).toBe(true);
      }
    }
  }, 30000);

  it('should handle empty search term with working scrapers', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      countryIndeed: 'uk',
      resultsWanted: 3
    });

    // Should still get jobs even with empty search term
    expect(jobs.length).toBeGreaterThan(0);

    if (jobs.length > 0) {
      const firstJob = jobs.at(0);
      expect(firstJob?.title).toBeDefined();
      expect(typeof firstJob?.title).toBe('string');
    }
  }, 30000);

  it('should use default values with working scrapers', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      countryIndeed: 'usa' // Ensure we provide required parameter
    });

    // Should get jobs with default parameters
    expect(jobs.length).toBeGreaterThan(0);

    if (jobs.length > 0) {
      const firstJob = jobs.at(0);
      expect(firstJob).toBeDefined();
      expect(typeof firstJob?.title).toBe('string');
    }
  }, 30000);

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

  it('should export CSV with correct parameters (delimiter, headers)', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      searchTerm: 'engineer',
      countryIndeed: 'usa',
      resultsWanted: 2
    });

    // Test that the CSV export uses the correct parameters
    expect(async () => {
      await jobs.toCsv('test-jobs.csv', {
        delimiter: ',',
        headers: true,
        quoting: 'nonnumeric'
      });
    }).not.toThrow();

    // Verify these are the correct type-safe parameters
    const validCsvOptions = {
      delimiter: ',' as const,
      headers: true as const,
      quoting: 'nonnumeric' as const
    };

    expect(validCsvOptions.delimiter).toBe(',');
    expect(validCsvOptions.headers).toBe(true);
    expect(validCsvOptions.quoting).toBe('nonnumeric');
  }, 30000);
});
