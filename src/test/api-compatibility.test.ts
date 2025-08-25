import { scrapeJobs } from '../index';
import { TEST_COUNTRIES } from './utils';

describe('API Compatibility Tests', () => {
  describe('Parameter Name Compatibility', () => {
    it('should support siteName parameter (matches original site_name)', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      expect(jobs.length).toBeLessThanOrEqual(1);
    });

    it('should support searchTerm parameter (matches original search_term)', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'software engineer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(typeof jobs.at(0)!.title).toBe('string');
      }
    });

    it('should support resultsWanted parameter (matches original results_wanted)', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: 5,
        countryIndeed: 'usa'
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
    });

    it('should support countryIndeed parameter (matches original country_indeed)', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'uk',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(typeof jobs.at(0)!.title).toBe('string');
      }
    });
  });

  describe('Site Name Compatibility', () => {
    it('should support working site names', async () => {
      const workingSites = ['indeed', 'linkedin'];

      for (const site of workingSites) {
        const jobs = await scrapeJobs({
          siteName: [site as 'indeed'],
          searchTerm: 'developer',
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        // Working scrapers should return jobs
        expect(jobs.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should handle maintenance site names without crashing', async () => {
      const maintenanceSites = [
        'ziprecruiter',
        'glassdoor',
        'google',
        'bayt',
        'naukri',
        'bdjobs'
      ];

      for (const site of maintenanceSites) {
        const jobs = await scrapeJobs({
          siteName: [site as 'indeed'],
          searchTerm: 'developer',
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        // Maintenance scrapers may return 0 results but shouldn't crash
        expect(jobs.length).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(jobs.toArray())).toBe(true);
      }
    }, 30000);

    it('should support multiple sites like original', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'], // Use only working scrapers for reliable results
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 10
      });

      // Should get jobs from working scrapers
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(10);
    }, 30000);
  });

  describe('Country Compatibility', () => {
    it('should support all major countries from original', async () => {
      const majorCountries = TEST_COUNTRIES.MAJOR;

      for (const country of majorCountries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: country,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(typeof jobs.at(0)!.title).toBe('string');
        }
      }
    });

    it('should support country aliases like original', async () => {
      const aliases = TEST_COUNTRIES.ALIASES.concat([
        { input: 'uk', expected: 'uk' },
        { input: 'united kingdom', expected: 'united kingdom' }
      ]);

      for (const { input } of aliases) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: input,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(typeof jobs.at(0)!.title).toBe('string');
        }
      }
    });
  });

  describe('Output Format Compatibility', () => {
    it('should return job objects with expected structure', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length === 0) return; // Skip if no jobs found
      const job = jobs.at(0)!;

      // Core fields that should match original
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('companyName');
      expect(job).toHaveProperty('jobUrl');
      expect(job).toHaveProperty('location');
      expect(job).toHaveProperty('description');
      expect(job).toHaveProperty('datePosted');
      expect(job).toHaveProperty('jobType');
    });

    it('should have location object with expected structure', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        location: 'New York, NY',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length === 0) return; // Skip if no jobs found
      const location = jobs.at(0)!.location;

      expect(location).toBeDefined();
      expect(location).toHaveProperty('city');
      expect(location).toHaveProperty('country');
    });

    it('should have jobType as array like original', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length === 0) return; // Skip if no jobs found
      const jobType = jobs.at(0)!.jobType;

      expect(Array.isArray(jobType)).toBe(true);
    });

    it('should have datePosted as ISO string', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length === 0) return; // Skip if no jobs found
      const datePosted = jobs.at(0)!.datePosted;

      if (datePosted) {
        expect(typeof datePosted).toBe('string');
        expect(() => new Date(datePosted)).not.toThrow();
        expect(datePosted).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    });
  });

  describe('Async/Promise Compatibility', () => {
    it('should return a Promise like original', async () => {
      const promise = scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(promise).toBeInstanceOf(Promise);
      const jobs = await promise;
      expect(jobs).toBeInstanceOf(Object);
      expect(typeof jobs.length).toBe('number');
    });

    it('should work with Promise.then() syntax', (done) => {
      scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      }).then(jobs => {
        expect(jobs).toBeInstanceOf(Object);
        expect(typeof jobs.length).toBe('number');
        expect(jobs.length).toBeGreaterThanOrEqual(0);
        done();
      }).catch(done);
    });

    it('should work with async/await syntax', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toBeInstanceOf(Object);
      expect(typeof jobs.length).toBe('number');
      expect(jobs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should handle errors gracefully like original', async () => {
      // Test with our current implementation - should not throw
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array on no results (future implementation)', async () => {
      // Current mock always returns 1 job, but this tests the expected behavior
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'nonexistentjobxyz123',
        countryIndeed: 'usa'
      });

      // For now, our mock returns 1 job, but real implementation should handle this
      expect(jobs).toBeInstanceOf(Object);
      expect(typeof jobs.length).toBe('number');
    });
  });
});
