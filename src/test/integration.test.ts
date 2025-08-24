import { scrapeJobs } from '../index';
import { JobType } from '../types';
import { TEST_COUNTRIES } from './utils';

describe('Integration Tests', () => {
  describe('Basic Integration', () => {
    it('should scrape jobs with minimal parameters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        title: expect.stringContaining('developer'),
        companyName: expect.any(String),
        jobUrl: expect.stringMatching(/^https?:\/\//),
        jobType: expect.arrayContaining([JobType.FULL_TIME])
      });
    });

    it('should handle multiple site names', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'engineer',
        countryIndeed: 'uk'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].location?.country).toBe('uk');
    });

    it('should work with different countries', async () => {
      const countries = TEST_COUNTRIES.BASIC;
      
      for (const country of countries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'software',
          countryIndeed: country
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].location?.country).toBe(country);
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].location?.city).toBe(location);
      }
    });

    it('should handle international characters in locations', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'développeur',
        location: 'Montréal, QC',
        countryIndeed: 'canada'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].location?.city).toBe('Montréal, QC');
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toContain(searchTerm);
      }
    });

    it('should handle search terms with special characters', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'C++ & Java Developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toContain('C++ & Java Developer');
    });
  });
});
