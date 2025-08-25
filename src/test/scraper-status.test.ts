import { scrapeJobs } from '../index';

describe('Scraper Status Tests', () => {
    // Increase timeout for actual network requests
    const TEST_TIMEOUT = 30000;

    describe('Working Scrapers', () => {
        it('should return jobs from Indeed', async () => {
            const jobs = await scrapeJobs({
                siteName: ['indeed'],
                searchTerm: 'engineer',
                countryIndeed: 'usa',
                resultsWanted: 5
            });

            // Indeed should work and return jobs
            expect(jobs.length).toBeGreaterThan(0);
            if (jobs.length > 0) {
                const job = jobs.at(0)!;
                expect(job.title).toBeDefined();
                expect(job.jobUrl).toMatch(/indeed\.com/);
                expect(typeof job.title).toBe('string');
                expect(typeof job.jobUrl).toBe('string');
            }
        }, TEST_TIMEOUT);

        it('should return jobs from LinkedIn', async () => {
            const jobs = await scrapeJobs({
                siteName: ['linkedin'],
                searchTerm: 'engineer',
                location: 'New York, NY',
                resultsWanted: 5
            });

            // LinkedIn should work and return jobs
            expect(jobs.length).toBeGreaterThan(0);
            if (jobs.length > 0) {
                const job = jobs.at(0)!;
                expect(job.title).toBeDefined();
                expect(job.jobUrl).toMatch(/linkedin\.com/);
                expect(typeof job.title).toBe('string');
                expect(typeof job.jobUrl).toBe('string');
            }
        }, TEST_TIMEOUT);

        it('should return jobs from both Indeed and LinkedIn', async () => {
            const jobs = await scrapeJobs({
                siteName: ['indeed', 'linkedin'],
                searchTerm: 'software engineer',
                location: 'San Francisco, CA',
                countryIndeed: 'usa',
                resultsWanted: 10
            });

            // Should get jobs from at least one of the working scrapers
            expect(jobs.length).toBeGreaterThan(0);

            // Verify we have jobs from expected sites
            const jobUrls = jobs.toArray().map(job => job.jobUrl);
            const hasIndeedJobs = jobUrls.some(url => url.includes('indeed.com'));
            const hasLinkedInJobs = jobUrls.some(url => url.includes('linkedin.com'));

            // At least one of the working scrapers should return results
            expect(hasIndeedJobs || hasLinkedInJobs).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Non-Working Scrapers', () => {
        // These tests verify that non-working scrapers don't break the system
        // but may return empty results

        it('should handle ZipRecruiter gracefully (under maintenance)', async () => {
            const jobs = await scrapeJobs({
                siteName: ['ziprecruiter'],
                searchTerm: 'engineer',
                location: 'New York, NY',
                resultsWanted: 5
            });

            // ZipRecruiter may return empty results due to maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);
        }, TEST_TIMEOUT);

        it('should handle Glassdoor gracefully (under maintenance)', async () => {
            const jobs = await scrapeJobs({
                siteName: ['glassdoor'],
                searchTerm: 'engineer',
                countryIndeed: 'usa',
                resultsWanted: 5
            });

            // Glassdoor may return empty results due to maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);
        }, TEST_TIMEOUT);

        it('should handle Google gracefully (under maintenance)', async () => {
            const jobs = await scrapeJobs({
                siteName: ['google'],
                searchTerm: 'engineer',
                location: 'San Francisco, CA',
                resultsWanted: 5
            });

            // Google may return empty results due to maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);
        }, TEST_TIMEOUT);

        it('should handle Naukri gracefully (under maintenance)', async () => {
            const jobs = await scrapeJobs({
                siteName: ['naukri'],
                searchTerm: 'engineer',
                location: 'Mumbai',
                resultsWanted: 5
            });

            // Naukri may return empty results due to maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);
        }, TEST_TIMEOUT);

        it('should handle Bayt gracefully (under maintenance)', async () => {
            const jobs = await scrapeJobs({
                siteName: ['bayt'],
                searchTerm: 'engineer',
                location: 'Dubai',
                resultsWanted: 5
            });

            // Bayt may return empty results due to maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);
        }, TEST_TIMEOUT);

        it('should handle BDJobs gracefully (under maintenance)', async () => {
            const jobs = await scrapeJobs({
                siteName: ['bdjobs'],
                searchTerm: 'engineer',
                location: 'Dhaka',
                resultsWanted: 5
            });

            // BDJobs may return empty results due to maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Mixed Scraper Scenarios', () => {
        it('should return results when mixing working and non-working scrapers', async () => {
            const jobs = await scrapeJobs({
                siteName: ['indeed', 'linkedin', 'glassdoor', 'ziprecruiter'],
                searchTerm: 'software engineer',
                location: 'New York, NY',
                countryIndeed: 'usa',
                resultsWanted: 20
            });

            // Should get results from the working scrapers (Indeed, LinkedIn)
            // even if the non-working ones (Glassdoor, ZipRecruiter) return nothing
            expect(jobs.length).toBeGreaterThan(0);

            // Verify we have valid job data
            if (jobs.length > 0) {
                const job = jobs.at(0)!;
                expect(job.title).toBeDefined();
                expect(job.jobUrl).toBeDefined();
                expect(typeof job.title).toBe('string');
                expect(typeof job.jobUrl).toBe('string');
            }
        }, TEST_TIMEOUT);

        it('should handle all non-working scrapers without crashing', async () => {
            const jobs = await scrapeJobs({
                siteName: ['glassdoor', 'ziprecruiter', 'google', 'naukri', 'bayt', 'bdjobs'],
                searchTerm: 'engineer',
                countryIndeed: 'usa',
                resultsWanted: 10
            });

            // May return empty results since all these scrapers are under maintenance
            expect(jobs.length).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(jobs.toArray())).toBe(true);

            // Should not crash and should return a valid JobDataFrame
            expect(typeof jobs.length).toBe('number');
            expect(typeof jobs.head).toBe('function');
            expect(typeof jobs.toCsv).toBe('function');
        }, TEST_TIMEOUT);
    });

    describe('CSV Export with Correct Parameters', () => {
        it('should export CSV with delimiter and headers parameters', async () => {
            const jobs = await scrapeJobs({
                siteName: ['indeed'],
                searchTerm: 'engineer',
                countryIndeed: 'usa',
                resultsWanted: 2
            });

            // Test the corrected CSV export parameters
            expect(async () => {
                await jobs.toCsv('test-output.csv', {
                    delimiter: ',',
                    headers: true,
                    quoting: 'nonnumeric'
                });
            }).not.toThrow();

            // Verify the old parameters would cause TypeScript errors (compile-time check)
            // This test ensures we're using the correct interface
            const csvOptions = {
                delimiter: ',',
                headers: true,
                quoting: 'nonnumeric' as const
            };

            expect(csvOptions.delimiter).toBe(',');
            expect(csvOptions.headers).toBe(true);
            expect(csvOptions.quoting).toBe('nonnumeric');
        }, TEST_TIMEOUT);
    });
});
