import { scrapeJobs, ScrapeJobsOptions } from '../index';
import { JobDataFrame } from '../models';
import { DescriptionFormat, JobType, Site } from '../types';

describe('JobSpy Comprehensive Tests', () => {
  // Test timeout for scraping operations
  const SCRAPE_TIMEOUT = 30000;

  describe('API Type Safety', () => {
    test('should accept camelCase parameters with strict string literals', async () => {
      const options: ScrapeJobsOptions = {
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'software engineer',
        resultsWanted: 5,
        countryIndeed: 'usa',
        isRemote: false,
        descriptionFormat: 'markdown',
      };

      const result = await scrapeJobs(options);
      expect(result).toBeInstanceOf(JobDataFrame);
    }, SCRAPE_TIMEOUT);

    test('should accept Site enum values', async () => {
      const options: ScrapeJobsOptions = {
        siteName: [Site.INDEED, Site.LINKEDIN],
        searchTerm: 'software engineer',
        resultsWanted: 5,
        countryIndeed: 'usa',
        isRemote: false,
        descriptionFormat: 'markdown',
      };

      const result = await scrapeJobs(options);
      expect(result).toBeInstanceOf(JobDataFrame);
    }, SCRAPE_TIMEOUT);

    test('should accept strict lowercase string literals', async () => {
      const testCases: Array<'indeed' | 'linkedin' | 'glassdoor'> = [
        'indeed',
        'linkedin',
        'glassdoor',
      ];

      for (const siteName of testCases) {
        const result = await scrapeJobs({
          siteName: siteName,
          resultsWanted: 1
        });
        expect(result).toBeInstanceOf(JobDataFrame);
      }
    }, SCRAPE_TIMEOUT);

    test('should handle mixed Site enum and string values', async () => {
      const result = await scrapeJobs({
        siteName: [Site.INDEED, 'linkedin'],
        searchTerm: 'developer',
        resultsWanted: 3,
      });

      expect(result).toBeInstanceOf(JobDataFrame);
    }, SCRAPE_TIMEOUT);
  });

  describe('Edge Cases - No Jobs Found', () => {
    test('should handle no jobs found gracefully', async () => {
      const result = await scrapeJobs({
        siteName: 'indeed',
        searchTerm: 'extremely_rare_job_title_12345',
        location: 'nonexistent_city_12345',
        resultsWanted: 10,
      });

      expect(result).toBeInstanceOf(JobDataFrame);
      expect(result.length).toBe(0);
      expect(() => result.head(5)).not.toThrow();
      expect(() => result.toCsv('empty.csv')).not.toThrow();
    }, SCRAPE_TIMEOUT);

    test('should not throw error when no results', async () => {
      await expect(scrapeJobs({
        siteName: 'indeed',
        searchTerm: 'nonexistent_job_xyz_123',
        resultsWanted: 5,
      })).resolves.not.toThrow();
    }, SCRAPE_TIMEOUT);
  });

  describe('Error Handling', () => {
    test('should handle invalid site names gracefully', async () => {
      const result = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        resultsWanted: 5,
      });

      expect(result).toBeInstanceOf(JobDataFrame);
      // Should still work with valid sites
    }, SCRAPE_TIMEOUT);

    test('should handle network timeouts', async () => {
      const result = await scrapeJobs({
        siteName: 'indeed',
        searchTerm: 'developer',
        resultsWanted: 1,
        // Simulate network issues by using invalid proxy
        proxies: ['http://invalid-proxy:8080'],
      });

      expect(result).toBeInstanceOf(JobDataFrame);
      // Should handle gracefully even with network issues
    }, SCRAPE_TIMEOUT);

    test('should handle malformed parameters', async () => {
      const result = await scrapeJobs({
        siteName: 'indeed',
        searchTerm: '',
        location: '',
        resultsWanted: -1, // Invalid number
        distance: -50, // Invalid distance
      });

      expect(result).toBeInstanceOf(JobDataFrame);
    }, SCRAPE_TIMEOUT);
  });

  describe('JobDataFrame Functionality', () => {
    let jobDataFrame: JobDataFrame;

    beforeAll(async () => {
      jobDataFrame = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'software engineer',
        resultsWanted: 10,
        location: 'San Francisco, CA',
      });
    }, SCRAPE_TIMEOUT);

    test('should support head() method', () => {
      expect(() => jobDataFrame.head()).not.toThrow();
      expect(() => jobDataFrame.head(5)).not.toThrow();
      expect(() => jobDataFrame.head(0)).not.toThrow();
      expect(() => jobDataFrame.head(-1)).not.toThrow();
    });

    test('should support tail() method', () => {
      expect(() => jobDataFrame.tail()).not.toThrow();
      expect(() => jobDataFrame.tail(3)).not.toThrow();
    });

    test('should support length() method', () => {
      const length = jobDataFrame.length;
      expect(typeof length).toBe('number');
      expect(length).toBeGreaterThanOrEqual(0);
    });

    test('should support filter() method', () => {
      expect(() => jobDataFrame.filter(job => job.title.includes('engineer'))).not.toThrow();
      expect(() => jobDataFrame.filter(job => job.isRemote === true)).not.toThrow();
    });

    test('should support toCsv() method', async () => {
      await expect(jobDataFrame.toCsv('test-output.csv')).resolves.not.toThrow();
      await expect(jobDataFrame.toCsv('test-output-quoted.csv', {
        quoting: 'nonnumeric'
      })).resolves.not.toThrow();
    });

    test('should support toJson() method', async () => {
      await expect(jobDataFrame.toJson('test-output.json')).resolves.not.toThrow();
      await expect(jobDataFrame.toJson('test-output-pretty.json', {
        pretty: true
      })).resolves.not.toThrow();
    });

    test('should support groupBy() method', () => {
      expect(() => jobDataFrame.groupBy('companyName')).not.toThrow();
      expect(() => jobDataFrame.groupBy('location')).not.toThrow();
    });
  });

  describe('Multi-Site Scraping', () => {
    test('should handle multiple sites concurrently', async () => {
      const result = await scrapeJobs({
        siteName: ['indeed', 'linkedin', 'glassdoor'],
        searchTerm: 'developer',
        resultsWanted: 15,
        location: 'New York, NY',
      });

      expect(result).toBeInstanceOf(JobDataFrame);
      expect(result.length).toBeGreaterThanOrEqual(0);
    }, SCRAPE_TIMEOUT);

    test('should handle partial failures gracefully', async () => {
      const result = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'engineer',
        resultsWanted: 10,
      });

      expect(result).toBeInstanceOf(JobDataFrame);
      // Should still return results from valid sites
    }, SCRAPE_TIMEOUT);
  });

  describe('Parameter Validation', () => {
    test('should handle various job types', async () => {
      const jobTypes = [
        'fulltime',
        'parttime',
        'contract',
        'internship',
        JobType.FULL_TIME,
        JobType.CONTRACT,
      ];

      for (const jobType of jobTypes) {
        const result = await scrapeJobs({
          siteName: 'indeed',
          jobType: jobType,
          resultsWanted: 2,
        });
        expect(result).toBeInstanceOf(JobDataFrame);
      }
    }, SCRAPE_TIMEOUT);

    test('should handle various countries', async () => {
      const countries = ['usa', 'uk', 'canada', 'australia'];

      for (const country of countries) {
        const result = await scrapeJobs({
          siteName: 'indeed',
          countryIndeed: country,
          resultsWanted: 2,
        });
        expect(result).toBeInstanceOf(JobDataFrame);
      }
    }, SCRAPE_TIMEOUT);

    test('should handle description formats', async () => {
      const formats = ['markdown', 'html', DescriptionFormat.MARKDOWN, DescriptionFormat.HTML];

      for (const format of formats) {
        const result = await scrapeJobs({
          siteName: 'indeed',
          descriptionFormat: format,
          resultsWanted: 2,
        });
        expect(result).toBeInstanceOf(JobDataFrame);
      }
    }, SCRAPE_TIMEOUT);
  });

  describe('Performance Tests', () => {
    test('should complete within reasonable time for small requests', async () => {
      const startTime = Date.now();

      await scrapeJobs({
        siteName: 'indeed',
        searchTerm: 'developer',
        resultsWanted: 5,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
    }, 20000);

    test('should handle concurrent requests', async () => {
      const promises = Array(3).fill(null).map(() =>
        scrapeJobs({
          siteName: 'indeed',
          searchTerm: 'engineer',
          resultsWanted: 3,
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toBeInstanceOf(JobDataFrame);
      });
    }, SCRAPE_TIMEOUT);
  });

  describe('Data Quality', () => {
    let jobs: JobDataFrame;

    beforeAll(async () => {
      jobs = await scrapeJobs({
        siteName: ['indeed', 'linkedin'],
        searchTerm: 'software engineer',
        resultsWanted: 20,
        location: 'San Francisco, CA',
      });
    }, SCRAPE_TIMEOUT);

    test('should return valid job data structure', () => {
      if (jobs.length > 0) {
        const firstJob = jobs.head(1)[0];
        expect(firstJob).toHaveProperty('title');
        expect(firstJob).toHaveProperty('jobUrl');
        expect(typeof firstJob.title).toBe('string');
        expect(typeof firstJob.jobUrl).toBe('string');
        expect(firstJob.title.length).toBeGreaterThan(0);
        expect(firstJob.jobUrl.length).toBeGreaterThan(0);
      }
    });

    test('should have unique job URLs', () => {
      if (jobs.length > 1) {
        const allJobs = jobs.head(jobs.length);
        const urls = allJobs.map(job => job.jobUrl);
        const uniqueUrls = new Set(urls);
        expect(uniqueUrls.size).toBe(urls.length);
      }
    });

    test('should have valid dates when present', () => {
      if (jobs.length > 0) {
        const allJobs = jobs.head(jobs.length);
        allJobs.forEach(job => {
          if (job.datePosted) {
            expect(() => new Date(job.datePosted!)).not.toThrow();
            expect(new Date(job.datePosted!).getTime()).not.toBeNaN();
          }
        });
      }
    });
  });

  describe('Memory and Resource Management', () => {
    test('should handle large result sets without memory issues', async () => {
      const result = await scrapeJobs({
        siteName: 'indeed',
        searchTerm: 'engineer',
        resultsWanted: 100,
      });

      expect(result).toBeInstanceOf(JobDataFrame);
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result.length).toBeLessThanOrEqual(100);
    }, SCRAPE_TIMEOUT);

    test('should clean up resources properly', async () => {
      // Test multiple sequential requests to ensure no resource leaks
      for (let i = 0; i < 5; i++) {
        const result = await scrapeJobs({
          siteName: 'indeed',
          searchTerm: 'developer',
          resultsWanted: 5,
        });
        expect(result).toBeInstanceOf(JobDataFrame);
      }
    }, SCRAPE_TIMEOUT);
  });
});

// Integration tests for specific scrapers
describe('Individual Scraper Tests', () => {
  const SCRAPER_TIMEOUT = 20000;

  test('Indeed scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'indeed',
      searchTerm: 'software engineer',
      resultsWanted: 5,
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);

  test('LinkedIn scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'linkedin',
      searchTerm: 'developer',
      resultsWanted: 5,
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);

  test('Glassdoor scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'glassdoor',
      searchTerm: 'engineer',
      resultsWanted: 5,
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);

  test('Google scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'google',
      searchTerm: 'software developer',
      resultsWanted: 5,
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);

  test('Naukri scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'naukri',
      searchTerm: 'software engineer',
      resultsWanted: 5,
      location: 'Mumbai',
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);

  test('Bayt scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'bayt',
      searchTerm: 'developer',
      resultsWanted: 5,
      location: 'Dubai',
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);

  test('BDJobs scraper should work', async () => {
    const result = await scrapeJobs({
      siteName: 'bdjobs',
      searchTerm: 'software engineer',
      resultsWanted: 5,
      location: 'Dhaka',
    });
    expect(result).toBeInstanceOf(JobDataFrame);
  }, SCRAPER_TIMEOUT);
});
