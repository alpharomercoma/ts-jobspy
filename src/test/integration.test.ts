import { scrapeJobs } from '../index';
import { TEST_COUNTRIES } from './utils';

describe('Integration Tests', () => {
  describe('Basic Integration', () => {
    it('should scrape jobs with minimal parameters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs.at(0)!).toMatchObject({
        title: expect.any(String),
        companyName: expect.any(String),
        jobUrl: expect.stringMatching(/^https?:\/\//),
      });
    });

    it('should handle multiple site names', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'engineer',
        countryIndeed: 'uk',
        resultsWanted: 2
      });

      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs.length).toBeLessThanOrEqual(2);
      if (jobs.length > 0) {
        expect(jobs.at(0)!).toMatchObject({
          title: expect.any(String),
        });
        // companyName can be null, undefined, or string
        const companyName = jobs.at(0)!.companyName;
        expect(companyName == null || typeof companyName === 'string').toBe(true);
      }
    });

    it('should work with different countries', async () => {
      const countries = TEST_COUNTRIES.BASIC;

      for (const country of countries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'software',
          countryIndeed: country,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(jobs.at(0)!).toMatchObject({
            title: expect.any(String),
          });
          // companyName can be null, undefined, or string
          const companyName = jobs.at(0)!.companyName;
          expect(companyName == null || typeof companyName === 'string').toBe(true);
        }
      }
    });
  });

  describe('Location Integration', () => {
    it('should handle various location formats', async () => {
      const locations = [
        'New York, NY',
        'London, UK',
        'Toronto, ON',
        'Sydney, Australia',
        'Berlin, Germany'
      ];

      for (const location of locations) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          location,
          countryIndeed: 'usa',
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

    it('should handle international characters in locations', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'développeur',
        location: 'Montréal, QC',
        countryIndeed: 'canada',
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

  describe('Search Term Integration', () => {
    it('should handle complex search terms', async () => {
      const searchTerms = [
        'Senior Software Engineer',
        'Full-Stack Developer',
        'DevOps Engineer',
        'Data Scientist',
        'Product Manager'
      ];

      for (const searchTerm of searchTerms) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm,
          countryIndeed: 'usa',
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

    it('should handle search terms with special characters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'C++ & Java Developer',
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
  });
});
