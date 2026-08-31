import { dedupeJobs } from '../src/dedupe';
import type { Job } from '../src/result';

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: null,
    site: 'indeed',
    jobUrl: 'https://example.com/job/1',
    jobUrlDirect: null,
    title: 'Software Engineer',
    company: 'Acme',
    location: 'San Francisco, CA',
    datePosted: null,
    jobTypes: [],
    salarySource: null,
    interval: null,
    minAmount: null,
    maxAmount: null,
    currency: null,
    isRemote: null,
    jobLevel: null,
    jobFunction: null,
    listingType: null,
    emails: [],
    description: null,
    companyIndustry: null,
    companyUrl: null,
    companyLogo: null,
    companyUrlDirect: null,
    companyAddresses: null,
    companyNumEmployees: null,
    companyRevenue: null,
    companyDescription: null,
    skills: [],
    experienceRange: null,
    companyRating: null,
    companyReviewsCount: null,
    vacancyCount: null,
    workFromHomeType: null,
    ...overrides,
  };
}

describe('dedupeJobs', () => {
  it('url mode removes exact URL duplicates', () => {
    const jobs = [
      makeJob({ jobUrl: 'https://a.com/1' }),
      makeJob({ jobUrl: 'https://a.com/1' }),
      makeJob({ jobUrl: 'https://a.com/2' }),
    ];
    const result = dedupeJobs(jobs, 'url');
    expect(result.jobs).toHaveLength(2);
    expect(result.removed).toBe(1);
  });

  it('content mode removes cross-site duplicates with differing URLs', () => {
    const jobs = [
      makeJob({ site: 'indeed', jobUrl: 'https://indeed.com/1' }),
      makeJob({ site: 'linkedin', jobUrl: 'https://linkedin.com/9' }),
    ];
    const result = dedupeJobs(jobs, 'content');
    expect(result.jobs).toHaveLength(1);
    expect(result.removed).toBe(1);
  });

  it('content mode normalizes punctuation and case', () => {
    const jobs = [
      makeJob({ title: 'Sr. Software Engineer!', company: 'ACME Inc' }),
      makeJob({ title: 'sr software engineer', company: 'acme, inc.' }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(1);
  });

  it('content mode keeps jobs that differ by location', () => {
    const jobs = [
      makeJob({ location: 'San Francisco, CA' }),
      makeJob({ location: 'New York, NY', jobUrl: 'https://a.com/2' }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(2);
  });

  it('never collapses jobs with entirely missing keys', () => {
    const jobs = [
      makeJob({ title: '', company: null, location: null, jobUrl: 'https://a.com/1' }),
      makeJob({ title: '', company: null, location: null, jobUrl: 'https://a.com/2' }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(2);
  });

  it('keeps the first occurrence', () => {
    const jobs = [
      makeJob({ site: 'indeed', jobUrl: 'https://a.com/1' }),
      makeJob({ site: 'linkedin', jobUrl: 'https://a.com/1' }),
    ];
    expect(dedupeJobs(jobs, 'url').jobs[0].site).toBe('indeed');
  });
});

describe('dedupeJobs unicode handling (adversarial review fixes)', () => {
  it('does not collapse distinct CJK postings', () => {
    const jobs = [
      makeJob({ title: '工程師 II', company: '甲', location: '台北', jobUrl: 'https://a.com/1' }),
      makeJob({
        title: '数据分析师 II',
        company: '乙',
        location: '上海',
        jobUrl: 'https://a.com/2',
      }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(2);
  });

  it('dedupes identical CJK postings', () => {
    const jobs = [
      makeJob({ title: '工程師', company: '甲公司', location: '台北', jobUrl: 'https://a.com/1' }),
      makeJob({ title: '工程師', company: '甲公司', location: '台北', jobUrl: 'https://a.com/2' }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(1);
  });

  it('treats accented and unaccented Latin as the same posting', () => {
    const jobs = [
      makeJob({ title: 'Café Manager', jobUrl: 'https://a.com/1' }),
      makeJob({ title: 'Cafe Manager', jobUrl: 'https://a.com/2' }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(1);
  });

  it('never uses a title-only key when company and location are both missing', () => {
    const jobs = [
      makeJob({ title: 'Engineer', company: null, location: null, jobUrl: 'https://a.com/1' }),
      makeJob({ title: 'Engineer', company: null, location: null, jobUrl: 'https://a.com/2' }),
    ];
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(2);
  });
});
