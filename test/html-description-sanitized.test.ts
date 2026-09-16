/**
 * descriptionFormat 'html' must never hand a consumer executable markup taken
 * from a job board, regardless of which scraper produced it.
 */
import type { JobPost, JobResponse } from '../src/model';

let response: JobResponse = { jobs: [] };
jest.mock('../src/indeed', () => ({
  Indeed: jest.fn().mockImplementation(() => ({ scrape: () => Promise.resolve(response) })),
}));

import { scrapeJobs } from '../src/index';

const post: JobPost = {
  id: 'x1',
  title: 'Engineer',
  companyName: 'Acme',
  jobUrl: 'https://indeed.com/1',
  location: { city: 'SF', state: 'CA', country: 'USA' },
  description: '<p>Build things</p><script>alert(1)</script><a href="javascript:x()">apply</a>',
  datePosted: new Date('2026-09-01T00:00:00Z'),
};

it('strips script elements and script URLs from html descriptions', async () => {
  response = { jobs: [post] };
  const { jobs } = await scrapeJobs({ sites: 'indeed', descriptionFormat: 'html' });
  expect(jobs[0].description).toContain('<p>Build things</p>');
  expect(jobs[0].description).not.toMatch(/<script|alert\(|javascript:/i);
});
