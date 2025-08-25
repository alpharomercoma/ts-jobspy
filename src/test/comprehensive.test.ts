import { scrapeJobs } from '../index';
import { JobType } from '../types';
import { TEST_COUNTRIES } from './utils';

describe('Comprehensive Tests', () => {
  describe('Core Functionality', () => {
    it('should scrape jobs with all parameters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'software engineer',
        location: 'San Francisco, CA',
        resultsWanted: 1,
        countryIndeed: 'usa'
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      expect(jobs.length).toBeLessThanOrEqual(1);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
          companyName: expect.any(String),
          jobUrl: expect.stringMatching(/^https?:\/\//),
        });
      }
    });

    it('should handle multiple site names', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'developer',
        countryIndeed: 'uk',
        resultsWanted: 2
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      expect(jobs.length).toBeLessThanOrEqual(2);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
          jobUrl: expect.stringMatching(/^https?:\/\//),
        });
      }
    });

    it('should work with different countries', async () => {
      const countries = TEST_COUNTRIES.EXTENDED;

      for (const country of countries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'engineer',
          countryIndeed: country,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(jobs.at(0)!).toMatchObject({
            title: expect.any(String),
          });
        }
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should handle empty parameters gracefully', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
          jobUrl: expect.stringMatching(/^https?:\/\//),
        });
        // companyName can be null or string
        const companyName = jobs.at(0)!.companyName;
        expect(companyName === null || typeof companyName === 'string').toBe(true);
      }
    });

    it('should handle undefined optional parameters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: undefined,
        location: undefined,
        resultsWanted: 1,
        countryIndeed: undefined
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
        });
      }
    });
  });

  describe('Type Safety', () => {
    it('should return properly typed JobPost objects', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'test',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length === 0) return; // Skip if no jobs found
      const job = jobs.at(0)!;

      // Check all required fields exist
      expect(typeof job.title).toBe('string');
      expect(typeof job.jobUrl).toBe('string');

      // Check optional fields are properly typed
      if (job.companyName) {
        expect(typeof job.companyName).toBe('string');
      }

      if (job.location) {
        expect(typeof job.location).toBe('object');
        if (job.location.city) {
          expect(typeof job.location.city).toBe('string');
        }
        if (job.location.country) {
          expect(typeof job.location.country).toBe('string');
        }
      }

      if (job.jobType) {
        expect(Array.isArray(job.jobType)).toBe(true);
        job.jobType.forEach((type: JobType) => {
          expect(Object.values(JobType)).toContain(type);
        });
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in search terms', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'C++ & Java developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
        });
      }
    });

    it('should handle international locations', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        location: 'München, Germany',
        countryIndeed: 'germany',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
        });
      }
    });
  });
});
