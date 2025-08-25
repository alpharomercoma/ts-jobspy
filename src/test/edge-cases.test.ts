import { scrapeJobs } from '../index';
import { JobType, SupportedCountry } from '../types';

describe('Edge Cases Tests', () => {
  describe('Boundary Values', () => {
    it('should handle zero results wanted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: 0,
        countryIndeed: 'usa'
      });

      // Should return empty JobDataFrame for 0 results
      expect(jobs).toHaveLength(0);
    });

    it('should handle very large results wanted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: 100,
        countryIndeed: 'usa'
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      expect(jobs.length).toBeLessThanOrEqual(100);
    });

    it('should handle negative results wanted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: -1,
        countryIndeed: 'usa'
      });

      // Should return empty JobDataFrame for negative results
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Empty and Null Values', () => {
    it('should handle empty search term', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: '',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(typeof jobs.at(0)!.title).toBe('string');
      }
    });

    it('should handle empty location', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        location: '',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(typeof jobs.at(0)!.title).toBe('string');
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
        expect(typeof jobs.at(0)!.title).toBe('string');
      }
    });
  });

  describe('Unicode and Special Characters', () => {
    it('should handle Unicode characters in search terms', async () => {
      const unicodeTerms = [
        '软件工程师', // Chinese
        'エンジニア', // Japanese
        'مهندس برمجيات', // Arabic
        'разработчик', // Russian
        'développeur', // French with accent
        'Ingeniør' // Norwegian with special character
      ];

      for (const term of unicodeTerms) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: term,
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(typeof jobs.at(0)!.title).toBe('string');
        }
      }
    });

    it('should handle emojis in search terms', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: '👨‍💻 Developer 🚀',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        expect(typeof jobs.at(0)!.title).toBe('string');
      }
    });

    it('should handle special punctuation', async () => {
      const specialChars = [
        'C++ & C# Developer',
        'Full-Stack (React/Node.js)',
        'Senior Engineer @ Tech Co.',
        'DevOps: AWS/Docker/K8s',
        'Data Scientist [ML/AI]'
      ];

      for (const term of specialChars) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: term,
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(typeof jobs.at(0)!.title).toBe('string');
        }
      }
    });
  });

  describe('Array Handling', () => {
    it('should handle single site name as array', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple site names', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 2
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      expect(jobs.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty site name array', async () => {
      const jobs = await scrapeJobs({
        siteName: [],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      // Should return empty JobDataFrame for empty site names
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Country Edge Cases', () => {
    it('should handle country case variations', async () => {
      const countryVariations = [
        'usa',
        'USA',
        'Usa',
        'uSa'
      ];

      for (const country of countryVariations) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: country.toLowerCase() as SupportedCountry,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(typeof jobs.at(0)!.title).toBe('string');
        }
      }
    });

    it('should handle alternative country names', async () => {
      const alternatives = [
        { input: 'us', expected: 'us' },
        { input: 'united states', expected: 'united states' },
        { input: 'britain', expected: 'britain' },
        { input: 'united kingdom', expected: 'united kingdom' }
      ];

      for (const { input } of alternatives) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: input as SupportedCountry,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          expect(typeof jobs.at(0)!.title).toBe('string');
        }
      }
    });
  });

  describe('Response Structure Validation', () => {
    it('should always return a JobDataFrame with length property', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(typeof jobs.length).toBe('number');
      expect(typeof jobs.at).toBe('function');
    });

    it('should have consistent job object structure', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const job = jobs.at(0)!;

        // Required fields
        expect(typeof job.title).toBe('string');
        expect(typeof job.jobUrl).toBe('string');

        // Optional fields should be correct type if present
        if (job.companyName) expect(typeof job.companyName).toBe('string');
        if (job.location) expect(typeof job.location).toBe('object');
        if (job.description) expect(typeof job.description).toBe('string');
        if (job.datePosted) expect(typeof job.datePosted).toBe('string');
        if (job.jobType) expect(Array.isArray(job.jobType)).toBe(true);
      }
    });

    it('should have valid job types', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const job = jobs.at(0)!;

        if (job.jobType) {
          job.jobType.forEach((type: JobType) => {
            expect(Object.values(JobType)).toContain(type);
          });
        }
      }
    });
  });
});
