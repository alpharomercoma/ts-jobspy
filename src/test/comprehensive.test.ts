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

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        title: expect.stringContaining('software engineer'),
        companyName: expect.any(String),
        location: {
          city: 'San Francisco, CA',
          country: 'usa'
        },
        jobUrl: expect.stringMatching(/^https?:\/\//),
        jobType: expect.arrayContaining([JobType.FULL_TIME]),
        description: expect.any(String)
      });
    });

    it('should handle multiple site names', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'developer',
        countryIndeed: 'uk'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].location?.country).toBe('uk');
    });

    it('should work with different countries', async () => {
      const countries = TEST_COUNTRIES.EXTENDED;
      
      for (const country of countries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'engineer',
          countryIndeed: country
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].location?.country).toBe(country);
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should handle empty parameters gracefully', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed']
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        title: expect.any(String),
        companyName: expect.any(String),
        jobUrl: expect.stringMatching(/^https?:\/\//),
        jobType: expect.arrayContaining([JobType.FULL_TIME])
      });
    });

    it('should handle undefined optional parameters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: undefined,
        location: undefined,
        resultsWanted: undefined,
        countryIndeed: undefined
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].location?.country).toBe('usa'); // default
    });
  });

  describe('Type Safety', () => {
    it('should return properly typed JobPost objects', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'test',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      const job = jobs[0];
      
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
        job.jobType.forEach(type => {
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
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toContain('C++ & Java developer');
    });

    it('should handle international locations', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        location: 'München, Germany',
        countryIndeed: 'germany'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].location?.city).toBe('München, Germany');
      expect(jobs[0].location?.country).toBe('germany');
    });
  });
});
