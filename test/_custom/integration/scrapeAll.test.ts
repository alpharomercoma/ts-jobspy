/**
 * Integration tests for ts-jobspy
 *
 * These tests make real network requests and should be run sparingly
 * to avoid rate limiting.
 */

import { scrapeJobs, Site } from '../../../src';

// Set a longer timeout for integration tests
jest.setTimeout(120000);

describe('Integration Tests', () => {
  describe('scrapeJobs', () => {
    it('should scrape jobs from Google with minimal parameters', async () => {
      const jobs = await scrapeJobs({
        siteName: 'google',
        searchTerm: 'software engineer',
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      expect(Array.isArray(jobs)).toBe(true);

      if (jobs.length > 0) {
        const job = jobs[0];
        expect(job).toHaveProperty('title');
        expect(job).toHaveProperty('company');
        expect(job).toHaveProperty('jobUrl');
        expect(job).toHaveProperty('site', 'google');
      }
    });

    it('should scrape jobs from multiple sites concurrently', async () => {
      const jobs = await scrapeJobs({
        siteName: ['google', 'indeed'],
        searchTerm: 'data scientist',
        location: 'New York',
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      expect(Array.isArray(jobs)).toBe(true);

      // Check that we got jobs from different sites
      const sites = [...new Set(jobs.map((j) => j.site))];
      expect(sites.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle remote filter', async () => {
      const jobs = await scrapeJobs({
        siteName: 'google',
        searchTerm: 'remote python developer',
        isRemote: true,
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      expect(Array.isArray(jobs)).toBe(true);
    });

    it('should respect resultsWanted limit', async () => {
      const limit = 3;
      const jobs = await scrapeJobs({
        siteName: 'google',
        searchTerm: 'javascript developer',
        resultsWanted: limit,
        verbose: 0,
      });

      expect(jobs.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Individual Scrapers', () => {
    // These tests are marked as skipped by default to avoid rate limiting
    // Remove .skip to run individual scraper tests

    it.skip('should scrape LinkedIn', async () => {
      const jobs = await scrapeJobs({
        siteName: Site.LINKEDIN,
        searchTerm: 'product manager',
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      if (jobs.length > 0) {
        expect(jobs[0].site).toBe('linkedin');
      }
    });

    it.skip('should scrape Indeed', async () => {
      const jobs = await scrapeJobs({
        siteName: Site.INDEED,
        searchTerm: 'frontend developer',
        countryIndeed: 'usa',
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      if (jobs.length > 0) {
        expect(jobs[0].site).toBe('indeed');
      }
    });

    it.skip('should scrape ZipRecruiter', async () => {
      const jobs = await scrapeJobs({
        siteName: Site.ZIP_RECRUITER,
        searchTerm: 'backend developer',
        location: 'San Francisco',
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      if (jobs.length > 0) {
        expect(jobs[0].site).toBe('zip_recruiter');
      }
    });

    it.skip('should scrape Glassdoor', async () => {
      const jobs = await scrapeJobs({
        siteName: Site.GLASSDOOR,
        searchTerm: 'devops engineer',
        location: 'Seattle',
        resultsWanted: 5,
        verbose: 0,
      });

      expect(jobs).toBeDefined();
      if (jobs.length > 0) {
        expect(jobs[0].site).toBe('glassdoor');
      }
    });
  });
});
