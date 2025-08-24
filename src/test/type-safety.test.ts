import { scrapeJobs } from '../index';
import { JobType, ScrapeJobsOptions, JobPost } from '../types';
import { TEST_COUNTRIES } from './utils';

describe('Type Safety Tests', () => {
  describe('Parameter Type Validation', () => {
    it('should enforce correct ScrapeJobsOptions interface', async () => {
      const validOptions: ScrapeJobsOptions = {
        siteName: ['indeed'],
        searchTerm: 'developer',
        location: 'New York, NY',
        resultsWanted: 10,
        countryIndeed: 'usa'
      };

      const jobs = await scrapeJobs(validOptions);
      expect(jobs).toHaveLength(1);
    });

    it('should accept valid SupportedCountry values', async () => {
      const validCountries = TEST_COUNTRIES.MAJOR;

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

    it('should accept valid site names', async () => {
      const validSites = [
        ['indeed'],
        ['linkedin'],
        ['ziprecruiter'],
        ['glassdoor'],
        ['google'],
        ['bayt'],
        ['naukri'],
        ['bdjobs']
      ];

      for (const siteName of validSites) {
        const jobs = await scrapeJobs({
          siteName: siteName as ['indeed'],
          searchTerm: 'developer',
          countryIndeed: 'usa'
        });

        expect(jobs).toHaveLength(1);
      }
    });
  });

  describe('Return Type Validation', () => {
    it('should return JobPost[] type', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs).toHaveLength(1);

      const job: JobPost = jobs[0];
      expect(job).toBeDefined();
    });

    it('should have properly typed JobPost properties', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      const job = jobs[0];

      // Required string properties
      expect(typeof job.title).toBe('string');
      expect(typeof job.jobUrl).toBe('string');

      // Optional string properties
      if (job.id) expect(typeof job.id).toBe('string');
      if (job.companyName) expect(typeof job.companyName).toBe('string');
      if (job.jobUrlDirect) expect(typeof job.jobUrlDirect).toBe('string');
      if (job.description) expect(typeof job.description).toBe('string');
      if (job.companyUrl) expect(typeof job.companyUrl).toBe('string');
      if (job.companyUrlDirect) expect(typeof job.companyUrlDirect).toBe('string');
      if (job.datePosted) expect(typeof job.datePosted).toBe('string');
      if (job.listingType) expect(typeof job.listingType).toBe('string');
      if (job.jobLevel) expect(typeof job.jobLevel).toBe('string');
      if (job.companyIndustry) expect(typeof job.companyIndustry).toBe('string');

      // Optional boolean properties
      if (job.isRemote !== undefined) expect(typeof job.isRemote).toBe('boolean');

      // Optional array properties
      if (job.jobType) {
        expect(Array.isArray(job.jobType)).toBe(true);
        job.jobType.forEach(type => {
          expect(typeof type).toBe('string');
          expect(Object.values(JobType)).toContain(type);
        });
      }

      if (job.emails) {
        expect(Array.isArray(job.emails)).toBe(true);
        job.emails.forEach(email => {
          expect(typeof email).toBe('string');
        });
      }

      // Optional object properties
      if (job.location) {
        expect(typeof job.location).toBe('object');
        if (job.location.country) expect(typeof job.location.country).toBe('string');
        if (job.location.city) expect(typeof job.location.city).toBe('string');
        if (job.location.state) expect(typeof job.location.state).toBe('string');
      }

      if (job.compensation) {
        expect(typeof job.compensation).toBe('object');
        if (job.compensation.minAmount) expect(typeof job.compensation.minAmount).toBe('number');
        if (job.compensation.maxAmount) expect(typeof job.compensation.maxAmount).toBe('number');
        if (job.compensation.currency) expect(typeof job.compensation.currency).toBe('string');
      }
    });

    it('should validate JobType enum values', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      });

      const job = jobs[0];
      if (job.jobType) {
        job.jobType.forEach(type => {
          expect([
            JobType.FULL_TIME,
            JobType.PART_TIME,
            JobType.CONTRACT,
            JobType.TEMPORARY,
            JobType.INTERNSHIP,
            JobType.PER_DIEM,
            JobType.NIGHTS,
            JobType.OTHER,
            JobType.SUMMER,
            JobType.VOLUNTEER
          ]).toContain(type);
        });
      }
    });
  });

  describe('Optional Parameters', () => {
    it('should handle all optional parameters as undefined', async () => {
      const jobs = await scrapeJobs({
        siteName: ['indeed']
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toBeDefined();
    });

    it('should handle partial parameter objects', async () => {
      const partialOptions: Partial<ScrapeJobsOptions> = {
        siteName: ['indeed'],
        searchTerm: 'developer'
      };

      const jobs = await scrapeJobs(partialOptions as ScrapeJobsOptions);
      expect(jobs).toHaveLength(1);
    });

    it('should maintain type safety with spread operator', async () => {
      const baseOptions = {
        siteName: ['indeed'] as const,
        searchTerm: 'developer'
      };

      const extendedOptions: ScrapeJobsOptions = {
        siteName: ['indeed'],
        searchTerm: baseOptions.searchTerm,
        countryIndeed: 'usa',
        resultsWanted: 5
      };

      const jobs = await scrapeJobs(extendedOptions);
      expect(jobs).toHaveLength(1);
    });
  });

  describe('Generic Type Constraints', () => {
    it('should work with type assertions', async () => {
      const country = 'usa';

      const jobs = await scrapeJobs({
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: country
      });

      expect(jobs).toHaveLength(1);
    });

    it('should maintain type safety in async contexts', async () => {
      const getJobsAsync = async (): Promise<JobPost[]> => {
        return await scrapeJobs({
          siteName: ['indeed'],
          searchTerm: 'developer',
          countryIndeed: 'usa'
        });
      };

      const jobs = await getJobsAsync();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs).toHaveLength(1);
    });

    it('should work with destructuring assignment', async () => {
      const options: ScrapeJobsOptions = {
        siteName: ['indeed'],
        searchTerm: 'developer',
        countryIndeed: 'usa'
      };

      const { siteName, searchTerm, countryIndeed } = options;
      
      const jobs = await scrapeJobs({
        siteName,
        searchTerm,
        countryIndeed
      });

      expect(jobs).toHaveLength(1);
    });
  });
});
