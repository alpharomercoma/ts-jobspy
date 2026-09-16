/**
 * Hardening for the BDJobs and Naukri scrapers (adversarial QA, 2026-09).
 *
 * - BDJobs: a card's detail href is scraped content. It must never steer the
 *   detail request off bdjobs.com (SSRF), and it must not be logged or echoed
 *   in full. Details are fetched once per unique job, and a page that adds no
 *   new jobs ends paging instead of running to the page cap.
 * - Naukri: a full page containing only already-seen jobs ends paging.
 *
 * The session is mocked like test/wall-detection.test.ts; page delays are
 * real production code, so the paging tests run under jest fake timers.
 */

import type { ScraperInput } from '../src/model';
import { createSession } from '../src/util';

jest.mock('../src/util', () => {
  const actual = jest.requireActual('../src/util');
  return { ...actual, createSession: jest.fn() };
});

type FakeResponse = {
  status: number;
  data: unknown;
  request?: { res?: { responseUrl?: string } };
};

/** Install a session whose get() answers per URL; returns the get mock for call inspection. */
function fakeSession(answer: (url: string) => FakeResponse) {
  const get = jest.fn().mockImplementation(async (url: string) => answer(url));
  (createSession as jest.Mock).mockReturnValue({ defaults: { headers: {} }, get });
  return get;
}

function requestedUrls(get: jest.Mock): string[] {
  return get.mock.calls.map(([url]) => String(url));
}

function input(overrides: Partial<ScraperInput>): ScraperInput {
  return { searchTerm: 'engineer', offset: 0, resultsWanted: 5, ...overrides } as ScraperInput;
}

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// BDJobs fixtures
// ---------------------------------------------------------------------------

const BD_SEARCH_URL = 'https://jobs.bdjobs.com/jobsearch.asp';
/** The redirect check needs the final URL to stay on the search host. */
const BD_ON_HOST = { res: { responseUrl: 'https://jobs.bdjobs.com/jobsearch.asp?txtsearch=x' } };

function bdCard(href: string, title: string, company: string): string {
  return (
    '<div class="norm-jobs-wrapper">' +
    `<div class="job-title-text"><a href="${href}">${title}</a></div>` +
    `<div class="comp-name-text">${company}</div>` +
    '<div class="locon-text-d">Dhaka</div>' +
    '</div>'
  );
}

function bdSearchPage(cards: string[]): string {
  return `<html><body>${cards.join('')}</body></html>`;
}

const BD_DETAIL_PAGE =
  '<html><body><div class="jobcontent"><h4 id="job_resp">Responsibilities</h4>' +
  '<ul><li>Build things</li></ul><hr></div></body></html>';

function bdSession(searchPage: string) {
  return fakeSession((url) =>
    url === BD_SEARCH_URL
      ? { status: 200, data: searchPage, request: BD_ON_HOST }
      : { status: 200, data: BD_DETAIL_PAGE, request: BD_ON_HOST }
  );
}

describe('BDJobs: a scraped detail link never steers a request off bdjobs.com', () => {
  it('skips the fetch for an absolute href on another host and names only the host', async () => {
    const { BDJobs } = await import('../src/bdjobs');
    const evil = 'http://127.0.0.1/jobdetail.asp?jobid=EVIL1';
    const get = bdSession(bdSearchPage([bdCard(evil, 'Planted job', 'Planted Co')]));

    const result = await new BDJobs({}).scrape(input({ resultsWanted: 1 }));

    const urls = requestedUrls(get);
    expect(urls.some((u) => u.includes('127.0.0.1'))).toBe(false);
    expect(urls).toEqual([BD_SEARCH_URL]);

    expect(result.errors).toEqual(['card 0: detail link points off-site (127.0.0.1)']);
    expect(result.errors?.join('\n')).not.toContain(evil);

    // The card's own fields still come back; only the enrichment is refused
    // and the untrusted URL is not reported as the job's URL.
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      title: 'Planted job',
      companyName: 'Planted Co',
      jobUrl: '',
    });
    expect(result.jobs[0].description).toBeUndefined();
  });

  it('fetches only http(s) links on bdjobs.com or one of its subdomains', async () => {
    const { BDJobs } = await import('../src/bdjobs');
    const get = bdSession(
      bdSearchPage([
        bdCard('jobdetail.asp?jobid=OK1', 'Relative', 'Co'),
        bdCard('https://www.bdjobs.com/jobdetail.asp?jobid=OK2', 'Absolute on-site', 'Co'),
        bdCard('https://bdjobs.com.evil.example/jobdetail.asp?jobid=X1', 'Suffix trick', 'Co'),
        bdCard('//evil.example/jobdetail.asp?jobid=X2', 'Protocol-relative', 'Co'),
        bdCard('ftp://jobs.bdjobs.com/jobdetail.asp?jobid=X3', 'Wrong scheme', 'Co'),
      ])
    );

    const result = await new BDJobs({}).scrape(input({ resultsWanted: 5 }));

    expect(requestedUrls(get)).toEqual([
      BD_SEARCH_URL,
      'https://jobs.bdjobs.com/jobdetail.asp?jobid=OK1',
      'https://www.bdjobs.com/jobdetail.asp?jobid=OK2',
    ]);
    expect(result.errors).toEqual([
      'card 2: detail link points off-site (bdjobs.com.evil.example)',
      'card 3: detail link points off-site (evil.example)',
      'card 4: detail link points off-site (jobs.bdjobs.com)',
    ]);
    expect(result.jobs.map((j) => j.jobUrl)).toEqual([
      'https://jobs.bdjobs.com/jobdetail.asp?jobid=OK1',
      'https://www.bdjobs.com/jobdetail.asp?jobid=OK2',
      '',
      '',
      '',
    ]);
    expect(result.jobs[0].description).toContain('Build things');
  });
});

describe('BDJobs: details are fetched once per unique job and paging stops on zero progress', () => {
  it('fetches each detail once and ends after the first page that adds nothing', async () => {
    jest.useFakeTimers();
    const { BDJobs } = await import('../src/bdjobs');
    const page = bdSearchPage([
      bdCard('jobdetail.asp?jobid=A1', 'Job A', 'Co A'),
      bdCard('/jobdetail.asp?jobid=B2', 'Job B', 'Co B'),
    ]);
    const get = bdSession(page);

    // Every page is identical, so page 2 repeats page 1 and must end the loop.
    const pending = new BDJobs({}).scrape(input({ resultsWanted: 5 }));
    await jest.runAllTimersAsync();
    const result = await pending;

    const urls = requestedUrls(get);
    expect(urls.filter((u) => u === BD_SEARCH_URL)).toHaveLength(2);
    expect(urls.filter((u) => u.includes('jobid=A1'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('jobid=B2'))).toHaveLength(1);

    expect(result.jobs.map((j) => j.id)).toEqual(['A1', 'B2']);
    // Running out of distinct jobs is normal, not an error.
    expect(result.errors).toBeUndefined();
  });

  it('does not re-fetch a job that appears twice on the same page', async () => {
    jest.useFakeTimers();
    const { BDJobs } = await import('../src/bdjobs');
    const get = bdSession(
      bdSearchPage([
        bdCard('jobdetail.asp?jobid=A1', 'Job A (featured)', 'Co A'),
        bdCard('jobdetail.asp?jobid=A1', 'Job A', 'Co A'),
      ])
    );

    // Wanting 2 keeps the loop alive past the first card and onto page 2.
    const pending = new BDJobs({}).scrape(input({ resultsWanted: 2 }));
    await jest.runAllTimersAsync();
    const result = await pending;

    expect(requestedUrls(get).filter((u) => u.includes('jobid=A1'))).toHaveLength(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.errors).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Naukri fixtures
// ---------------------------------------------------------------------------

function nkJob(id: number) {
  return {
    jobId: String(id),
    title: `Engineer ${id}`,
    companyName: 'Acme',
    jdURL: `/job-listings-${id}`,
    jobDescription: 'Full time role',
    placeholders: [{ type: 'location', label: 'Bengaluru, Karnataka' }],
    footerPlaceholderLabel: '2 days ago',
  };
}

function nkPage(ids: number[]) {
  return { status: 200, data: { jobDetails: ids.map(nkJob) } };
}

const nkIds = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('Naukri: a page that adds no new jobs ends paging', () => {
  it('stops after the same full page comes back twice', async () => {
    jest.useFakeTimers();
    const { Naukri } = await import('../src/naukri');
    const get = fakeSession(() => nkPage(nkIds(1, 20)));

    const pending = new Naukri({}).scrape(input({ resultsWanted: 40 }));
    await jest.runAllTimersAsync();
    const result = await pending;

    expect(get.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.jobs).toHaveLength(20);
    expect(new Set(result.jobs.map((j) => j.id)).size).toBe(20);
    // Running out of distinct jobs is normal, not an error.
    expect(result.errors).toBeUndefined();
  });

  it('keeps paging while a full page still contributes something new', async () => {
    jest.useFakeTimers();
    const { Naukri } = await import('../src/naukri');
    const pages = [nkPage(nkIds(1, 20)), nkPage(nkIds(11, 30)), nkPage(nkIds(11, 30))];
    const get = fakeSession(() => pages[Math.min(get.mock.calls.length - 1, pages.length - 1)]);

    const pending = new Naukri({}).scrape(input({ resultsWanted: 40 }));
    await jest.runAllTimersAsync();
    const result = await pending;

    // Page 2 overlaps but adds 21-30; page 3 adds nothing and ends the loop.
    expect(get.mock.calls).toHaveLength(3);
    expect(result.jobs).toHaveLength(30);
    expect(result.errors).toBeUndefined();
  });
});
