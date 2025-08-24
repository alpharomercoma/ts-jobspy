import { scrapeJobs } from '../index';
import { JobType } from '../types';

describe('scrapeJobs', () => {
  it('should return sample job data', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 1,
      countryIndeed: 'usa'
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'software engineer - Sample Job',
      companyName: 'Sample Company',
      location: {
        city: 'San Francisco, CA',
        country: 'usa'
      },
      jobUrl: 'https://example.com/job/1',
      jobUrlDirect: 'https://example.com/job/1',
      jobType: [JobType.FULL_TIME],
      description: 'Sample job description for software engineer'
    });
  });

  it('should handle empty search term', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      countryIndeed: 'uk'
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe(' - Sample Job');
    expect(jobs[0].location?.country).toBe('uk');
  });

  it('should use default values', async () => {
    const jobs = await scrapeJobs({
      siteName: ['indeed']
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].location?.country).toBe('usa');
    expect(jobs[0].location?.city).toBe('Sample City');
  });
});
