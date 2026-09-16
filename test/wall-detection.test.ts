/**
 * A bot wall or a moved endpoint must surface as an error, never as a clean
 * 'empty' result. Both scenarios below were observed live on 2026-09-16:
 * Google answers non-browser clients with HTTP 200 and a JavaScript-required
 * interstitial, and jobs.bdjobs.com now 302s its search to a new SPA host.
 */

import { BDJobsException, GoogleJobsException } from '../src/exception';
import type { ScraperInput } from '../src/model';
import { createSession } from '../src/util';

jest.mock('../src/util', () => {
  const actual = jest.requireActual('../src/util');
  return { ...actual, createSession: jest.fn() };
});

type FakeResponse = { status: number; data: string; request?: { res?: { responseUrl?: string } } };

function fakeSession(response: FakeResponse) {
  const get = jest.fn().mockResolvedValue(response);
  (createSession as jest.Mock).mockReturnValue({ defaults: { headers: {} }, get });
  return get;
}

const input = {
  searchTerm: 'software engineer',
  location: 'San Francisco, CA',
  resultsWanted: 5,
  offset: 0,
} as unknown as ScraperInput;

const GOOGLE_JS_WALL = `<!doctype html><html><head><title>Google Search</title>
<noscript><meta http-equiv="refresh" content="0;url=/httpservice/retry/enablejs?sei=abc123"></noscript>
</head><body><div style="display:block">Please click <a href="/httpservice/retry/enablejs?sei=abc123">here</a> if you are not redirected within a few seconds.</div></body></html>`;

describe('Google: JavaScript wall is an error, not an empty result', () => {
  it('rejects with GoogleJobsException when a 200 page is the enable-JavaScript interstitial', async () => {
    const { Google } = await import('../src/google');
    fakeSession({ status: 200, data: GOOGLE_JS_WALL });
    await expect(new Google({}).scrape(input)).rejects.toThrow(GoogleJobsException);
    await expect(new Google({}).scrape(input)).rejects.toThrow(/JavaScript/);
  });

  it('still resolves empty for a genuine 200 results page with no jobs and no wall markers', async () => {
    const { Google } = await import('../src/google');
    fakeSession({
      status: 200,
      data: '<html><body><div id="search">No results</div></body></html>',
    });
    await expect(new Google({}).scrape(input)).resolves.toMatchObject({ jobs: [] });
  });
});

describe('BDJobs: a search redirected off the scraper host is an error, not an empty result', () => {
  it('rejects with BDJobsException naming the redirect target', async () => {
    const { BDJobs } = await import('../src/bdjobs');
    fakeSession({
      status: 200,
      data: '<html><head><title>Jobs</title></head><body app-root ng-version="17"></body></html>',
      request: { res: { responseUrl: 'https://bdjobs.com/h/jobs/?txtsearch=software+engineer' } },
    });
    await expect(new BDJobs({}).scrape(input)).rejects.toThrow(BDJobsException);
    await expect(new BDJobs({}).scrape(input)).rejects.toThrow(/bdjobs\.com\/h\/jobs/);
  });

  it('still resolves empty when the search host answers 200 with zero cards and no redirect', async () => {
    const { BDJobs } = await import('../src/bdjobs');
    fakeSession({
      status: 200,
      data: '<html><body><div class="no-jobs">No jobs found</div></body></html>',
      request: { res: { responseUrl: 'https://jobs.bdjobs.com/jobsearch.asp?txtsearch=x' } },
    });
    await expect(new BDJobs({}).scrape(input)).resolves.toMatchObject({ jobs: [] });
  });
});
