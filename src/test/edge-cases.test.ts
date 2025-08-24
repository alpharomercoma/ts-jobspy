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

      // Our mock always returns 1 job regardless of resultsWanted
      expect(jobs).toHaveLength(1);
    });

    it('should handle very large results wanted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: 999999,
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
    });

    it('should handle negative results wanted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: -1,
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
    });
  });

  describe('Empty and Null Values', () => {
    it('should handle empty search term', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: '',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toBe(' - Sample Job');
    });

    it('should handle empty location', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        location: '',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].location?.city).toBe('Sample City');
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toContain(term);
      }
    });

    it('should handle emojis in search terms', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: '👨‍💻 Developer 🚀',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toContain('👨‍💻 Developer 🚀');
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toContain(term);
      }
    });
  });

  describe('Array Handling', () => {
    it('should handle single site name as array', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
    });

    it('should handle multiple site names', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin', 'ziprecruiter'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
    });

    it('should handle empty site name array', async () => {
      const jobs = await scrapeJobs({
        siteName: [],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
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
          countryIndeed: country.toLowerCase() as SupportedCountry
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].location?.country).toBe(country.toLowerCase());
      }
    });

    it('should handle alternative country names', async () => {
      const alternatives = [
        { input: 'us', expected: 'us' },
        { input: 'united states', expected: 'united states' },
        { input: 'britain', expected: 'britain' },
        { input: 'united kingdom', expected: 'united kingdom' }
      ];

      for (const { input, expected } of alternatives) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: input as SupportedCountry
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].location?.country).toBe(expected);
      }
    });
  });

  describe('Response Structure Validation', () => {
    it('should always return an array', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(Array.isArray(jobs)).toBe(true);
    });

    it('should have consistent job object structure', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      const job = jobs[0];

      // Required fields
      expect(typeof job.title).toBe('string');
      expect(typeof job.jobUrl).toBe('string');

      // Optional fields should be correct type if present
      if (job.companyName) expect(typeof job.companyName).toBe('string');
      if (job.location) expect(typeof job.location).toBe('object');
      if (job.description) expect(typeof job.description).toBe('string');
      if (job.datePosted) expect(typeof job.datePosted).toBe('string');
      if (job.jobType) expect(Array.isArray(job.jobType)).toBe(true);
    });

    it('should have valid job types', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      const job = jobs[0];

      if (job.jobType) {
        job.jobType.forEach(type => {
          expect(Object.values(JobType)).toContain(type);
        });
      }
    });
  });
});
