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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        // Ensure the malicious input is contained as plain text, not executed
        expect(jobs[0].title).toContain(maliciousInput);
        expect(jobs[0].description).toContain(maliciousInput);
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toContain(injection);
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toContain(path);
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should handle extremely long input strings', async () => {
      const longString = 'A'.repeat(10000);
      
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: longString,
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toContain(longString);
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
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].title).toContain(controlChar);
      }
    });

    it('should validate country parameters against known values', async () => {
      // Test with valid countries
      const validCountries = TEST_COUNTRIES.BASIC.slice(0, 3);
      
      for (const country of validCountries) {
        const jobs = await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: country
        });

        expect(jobs).toHaveLength(1);
        expect(jobs[0].location?.country).toBe(country);
      }
    });
  });

  describe('Output Sanitization', () => {
    it('should ensure job URLs are properly formatted', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].jobUrl).toMatch(/^https?:\/\/[^\s<>"']+$/);
      if (jobs[0].jobUrlDirect) {
        expect(jobs[0].jobUrlDirect).toMatch(/^https?:\/\/[^\s<>"']+$/);
      }
    });

    it('should ensure dates are in valid ISO format', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      if (jobs[0].datePosted) {
        expect(() => new Date(jobs[0].datePosted!)).not.toThrow();
        expect(jobs[0].datePosted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    it('should ensure no sensitive information leaks in responses', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(jobs).toHaveLength(1);
      const jobString = JSON.stringify(jobs[0]);
      
      // Check for common sensitive patterns
      expect(jobString).not.toMatch(/password/i);
      expect(jobString).not.toMatch(/api[_-]?key/i);
      expect(jobString).not.toMatch(/secret/i);
      expect(jobString).not.toMatch(/token/i);
      expect(jobString).not.toMatch(/private[_-]?key/i);
    });
  });
});
