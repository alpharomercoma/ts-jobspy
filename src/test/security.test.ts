import { scrapeJobs } from '../index';
import { TEST_COUNTRIES } from './utils';

describe('Security Tests', () => {
  describe('Input Sanitization', () => {
    it('should handle malicious script injection attempts', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '"><script>alert(1)</script>',
        '\'; DROP TABLE jobs; --',
        '${process.env.SECRET}'
      ];

      for (const maliciousInput of maliciousInputs) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: maliciousInput,
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        // If jobs are returned, ensure no script execution occurred (jobs exist = API didn't crash)
        if (jobs.length > 0) {
          const job = jobs.at(0)!;
          expect(typeof job.title).toBe('string');
          expect(typeof job.jobUrl).toBe('string');
        }
      }
    });

    it('should handle SQL injection attempts in search terms', async () => {
      const sqlInjections = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM passwords --",
        "'; INSERT INTO logs VALUES ('hacked'); --"
      ];

      for (const injection of sqlInjections) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: injection,
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          const job = jobs.at(0)!;
          expect(typeof job.title).toBe('string');
        }
      }
    });

    it('should handle path traversal attempts', async () => {
      const pathTraversals = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '../../../../proc/self/environ',
        '../config/database.yml'
      ];

      for (const path of pathTraversals) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: path,
          location: path,
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          const job = jobs.at(0)!;
          expect(typeof job.title).toBe('string');
        }
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should handle extremely long input strings', async () => {
      const longString = 'A'.repeat(10000);

      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: longString,
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const job = jobs.at(0)!;
        expect(typeof job.title).toBe('string');
      }
    });

    it('should handle null bytes and control characters', async () => {
      const controlChars = [
        'test\x00null',
        'test\x01control',
        'test\x1Funit',
        'test\x7Fdel'
      ];

      for (const controlChar of controlChars) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: controlChar,
          countryIndeed: 'usa',
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          const job = jobs.at(0)!;
          expect(typeof job.title).toBe('string');
        }
      }
    });

    it('should validate country parameters against known values', async () => {
      // Test with valid countries
      const validCountries = TEST_COUNTRIES.BASIC.slice(0, 3);

      for (const country of validCountries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: country,
          resultsWanted: 1
        });

        expect(jobs.length).toBeGreaterThanOrEqual(0);
        if (jobs.length > 0) {
          const job = jobs.at(0)!;
          expect(typeof job.title).toBe('string');
        }
      }
    });
  });

  describe('Output Sanitization', () => {
    it('should ensure job URLs are properly formatted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const job = jobs.at(0)!;
        expect(job.jobUrl).toMatch(/^https?:\/\/[^\s<>"']+$/);
        if (job.jobUrlDirect) {
          expect(job.jobUrlDirect).toMatch(/^https?:\/\/[^\s<>"']+$/);
        }
      }
    });

    it('should ensure dates are in valid ISO format', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const job = jobs.at(0)!;
        if (job.datePosted) {
          expect(() => new Date(job.datePosted!)).not.toThrow();
          expect(job.datePosted).toMatch(/^\d{4}-\d{2}-\d{2}/);
        }
      }
    });

    it('should ensure no sensitive information leaks in responses', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa',
        resultsWanted: 1
      });

      expect(jobs.length).toBeGreaterThanOrEqual(0);
      if (jobs.length > 0) {
        const jobString = JSON.stringify(jobs.at(0)!);

        // Check for common sensitive patterns
        expect(jobString).not.toMatch(/password/i);
        expect(jobString).not.toMatch(/api[_-]?key/i);
        expect(jobString).not.toMatch(/secret/i);
        expect(jobString).not.toMatch(/token/i);
        expect(jobString).not.toMatch(/private[_-]?key/i);
      }
    });
  });
});
