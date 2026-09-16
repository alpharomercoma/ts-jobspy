/**
 * Enrichment must stay inside the requested window, a detail link must stay on
 * the board's own host, and Glassdoor must paginate from page 1 with the
 * board's cursors and report a failed description fetch instead of swallowing
 * it. Every scenario drives the public scrape() through a mocked session.
 */

import { Glassdoor } from '../src/glassdoor';
import type { ScraperInput } from '../src/model';
import { createSession } from '../src/util';
import { ZipRecruiter } from '../src/ziprecruiter';

jest.mock('../src/util', () => {
  const actual = jest.requireActual('../src/util');
  return { ...actual, createSession: jest.fn() };
});

type Session = { defaults: { headers: Record<string, string> }; get: jest.Mock; post: jest.Mock };

function fakeSession(): Session {
  const session: Session = { defaults: { headers: {} }, get: jest.fn(), post: jest.fn() };
  (createSession as jest.Mock).mockReturnValue(session);
  return session;
}

function input(overrides: Partial<ScraperInput>): ScraperInput {
  return { searchTerm: 'engineer', location: 'Austin, TX', ...overrides } as ScraperInput;
}

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// ZipRecruiter
// ---------------------------------------------------------------------------

const ZIP_API = 'https://api.ziprecruiter.com/jobs-app/jobs';
const ZIP_DETAIL_HTML =
  '<html><body><div class="job_description"><p>Full text</p></div></body></html>';

function zipJob(n: number) {
  return {
    listing_key: `k${n}`,
    name: `Job ${n}`,
    job_description: `<p>Summary ${n}</p>`,
    hiring_company: { name: 'Acme' },
    job_country: 'US',
    job_city: 'Austin',
    job_state: 'TX',
    employment_type: 'full_time',
    posted_time: '2026-09-15T00:00:00Z',
  };
}

function zipPage(from: number, count: number, next?: string) {
  return {
    jobs: Array.from({ length: count }, (_, i) => zipJob(from + i)),
    ...(next && { continue: next }),
  };
}

/** Mock a ZipRecruiter session serving the given API pages in order. */
function zipSession(pages: unknown[], detail?: (url: string) => Promise<unknown>) {
  const session = fakeSession();
  let pageIndex = 0;
  session.post.mockResolvedValue({ status: 200, data: '' });
  session.get.mockImplementation(async (url: string) => {
    if (url === ZIP_API) return { status: 200, data: pages[pageIndex++] };
    if (url.includes('/jobs//j?lvk=')) {
      return detail ? detail(url) : { status: 200, data: ZIP_DETAIL_HTML };
    }
    throw new Error(`unexpected GET ${url}`);
  });
  return session;
}

const zipDetailKeys = (session: Session): string[] =>
  session.get.mock.calls
    .map(([url]: [string]) => url)
    .filter((url) => url.includes('/jobs//j?lvk='))
    .map((url) => url.split('lvk=')[1]);

const zipSearchCalls = (session: Session) =>
  session.get.mock.calls.filter(([url]: [string]) => url === ZIP_API);

describe('ZipRecruiter: detail enrichment stays inside the requested window', () => {
  it('fetches exactly one detail page for resultsWanted 1 on a page of 20 listings', async () => {
    const session = zipSession([zipPage(0, 20)]);
    const result = await new ZipRecruiter({}).scrape(input({ resultsWanted: 1, offset: 0 }));

    expect(zipDetailKeys(session)).toEqual(['k0']);
    expect(result.jobs.map((j) => j.id)).toEqual(['zr-k0']);
    expect(result.jobs[0].description).toContain('Full text');
    expect(result.errors).toBeUndefined();
  });

  it('skips listings before the offset without enriching them and stops when the window is full', async () => {
    const session = zipSession([zipPage(0, 20)]);
    const result = await new ZipRecruiter({}).scrape(input({ resultsWanted: 3, offset: 5 }));

    expect(zipDetailKeys(session)).toEqual(['k5', 'k6', 'k7']);
    expect(result.jobs.map((j) => j.id)).toEqual(['zr-k5', 'zr-k6', 'zr-k7']);
  });

  it('walks the continue token across pages and enriches only the window listings', async () => {
    jest.useFakeTimers();
    const session = zipSession([zipPage(0, 20, 'tok-2'), zipPage(20, 20)]);

    const pending = new ZipRecruiter({}).scrape(input({ resultsWanted: 2, offset: 25 }));
    // The second page is paced by the scraper's own delay; advance past it.
    await jest.advanceTimersByTimeAsync(5000);
    const result = await pending;

    const searches = zipSearchCalls(session);
    expect(searches).toHaveLength(2);
    expect(searches[1][1].params.continue_from).toBe('tok-2');
    expect(zipDetailKeys(session)).toEqual(['k25', 'k26']);
    expect(result.jobs.map((j) => j.id)).toEqual(['zr-k25', 'zr-k26']);
  });

  it('slides to the next listing on the same page when a windowed listing fails to process', async () => {
    const pages = [zipPage(0, 20)];
    // A non-string employment_type makes processJob throw for that listing only.
    (pages[0].jobs[1] as { employment_type: unknown }).employment_type = 42;
    const session = zipSession(pages);
    const result = await new ZipRecruiter({}).scrape(input({ resultsWanted: 2, offset: 0 }));

    expect(result.jobs.map((j) => j.id)).toEqual(['zr-k0', 'zr-k2']);
    expect(zipDetailKeys(session)).toEqual(['k0', 'k2']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toMatch(/^job k1: /);
  });
});

describe('ZipRecruiter: a detail link must stay on ziprecruiter.com', () => {
  type WithUrlBuilder = { jobUrlFor: (listingKey: string) => string };

  function scraperLinkingTo(host: string): ZipRecruiter {
    const scraper = new ZipRecruiter({});
    (scraper as unknown as WithUrlBuilder).jobUrlFor = (key) =>
      `https://${host}/jobs//j?lvk=${key}`;
    return scraper;
  }

  it('does not fetch an off-site link, keeps the job, and records the host only', async () => {
    const session = zipSession([zipPage(0, 1)]);
    const result = await scraperLinkingTo('evil.example').scrape(
      input({ resultsWanted: 1, offset: 0 })
    );

    const fetched = session.get.mock.calls.map(([url]: [string]) => url);
    expect(fetched.some((url) => url.includes('evil.example'))).toBe(false);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].description).toBe('<p>Summary 0</p>');
    expect(result.errors).toEqual(['job k0: detail link points off-site (evil.example)']);
    expect(result.errors?.join('\n')).not.toContain('/jobs//j?lvk=');
  });

  it('treats a look-alike host (ziprecruiter.com.evil.example) as off-site', async () => {
    const session = zipSession([zipPage(0, 1)]);
    const result = await scraperLinkingTo('ziprecruiter.com.evil.example').scrape(
      input({ resultsWanted: 1, offset: 0 })
    );

    expect(zipDetailKeys(session)).toEqual([]);
    expect(result.errors).toEqual([
      'job k0: detail link points off-site (ziprecruiter.com.evil.example)',
    ]);
  });

  it('records a failed detail fetch per job and keeps the job', async () => {
    const session = zipSession([zipPage(0, 1)], async () => {
      throw new Error('socket hang up');
    });
    const result = await new ZipRecruiter({}).scrape(input({ resultsWanted: 1, offset: 0 }));

    expect(zipDetailKeys(session)).toEqual(['k0']);
    expect(result.jobs.map((j) => j.id)).toEqual(['zr-k0']);
    expect(result.errors).toEqual(['job k0: description fetch failed: socket hang up']);
  });
});

// ---------------------------------------------------------------------------
// Glassdoor
// ---------------------------------------------------------------------------

function gdListing(id: number) {
  return {
    jobview: {
      header: {
        employerNameFromSearch: 'Acme',
        jobTitleText: `Job ${id}`,
        locationName: 'Austin, TX',
        locationType: 'C',
        ageInDays: 1,
        employer: { id: 7, name: 'Acme' },
      },
      job: { listingId: id, jobTitleText: `Job ${id}` },
    },
  };
}

function gdPage(from: number, count: number, nextPage?: number) {
  return [
    {
      data: {
        jobListings: {
          jobListings: Array.from({ length: count }, (_, i) => gdListing(from + i)),
          paginationCursors: nextPage
            ? [{ pageNumber: nextPage, cursor: `cursor-${nextPage}` }]
            : [],
        },
      },
    },
  ];
}

function gdDetail(id: number) {
  return {
    status: 200,
    data: [{ data: { jobview: { job: { description: `<p>Detail ${id}</p>` } } } }],
  };
}

type SearchVariables = { pageNumber: number; pageCursor: string | null };
type DetailBody = Array<{ variables: { jl: number } }>;

/** Mock a Glassdoor session: CSRF + location over GET, search + detail over POST. */
function glassdoorSession(
  pages: Record<number, unknown>,
  detail: (id: number) => Promise<unknown> | unknown = gdDetail
) {
  const session = fakeSession();
  session.get.mockImplementation(async (url: string) => {
    if (url.includes('computer-science-jobs.htm')) return { status: 200, data: '"token":"csrf"' };
    if (url.includes('findPopularLocationAjax')) {
      return { status: 200, data: [{ locationId: '1139', locationType: 'C' }] };
    }
    throw new Error(`unexpected GET ${url}`);
  });
  session.post.mockImplementation(async (_url: string, body: unknown) => {
    if (typeof body === 'string') {
      const [{ variables }] = JSON.parse(body) as Array<{ variables: SearchVariables }>;
      const page = pages[variables.pageNumber];
      if (!page) throw new Error(`no fixture for page ${variables.pageNumber}`);
      return { status: 200, data: page };
    }
    return detail((body as DetailBody)[0].variables.jl);
  });
  return session;
}

const gdSearchVariables = (session: Session): SearchVariables[] =>
  session.post.mock.calls
    .filter(([, body]: [string, unknown]) => typeof body === 'string')
    .map(
      ([, body]: [string, string]) =>
        (JSON.parse(body) as Array<{ variables: SearchVariables }>)[0].variables
    );

const gdDetailIds = (session: Session): number[] =>
  session.post.mock.calls
    .filter(([, body]: [string, unknown]) => typeof body !== 'string')
    .map(([, body]: [string, DetailBody]) => body[0].variables.jl);

describe('Glassdoor: offset walks from page 1 with the board cursors', () => {
  it('sends page 1 with a null cursor first, then page 2 with the cursor page 1 returned', async () => {
    const session = glassdoorSession({ 1: gdPage(1, 30, 2), 2: gdPage(31, 30, 3) });
    const result = await new Glassdoor({}).scrape(input({ resultsWanted: 2, offset: 30 }));

    expect(gdSearchVariables(session)).toEqual([
      expect.objectContaining({ pageNumber: 1, pageCursor: null }),
      expect.objectContaining({ pageNumber: 2, pageCursor: 'cursor-2' }),
    ]);
    expect(gdDetailIds(session)).toEqual([31, 32]);
    expect(result.jobs.map((j) => j.id)).toEqual(['gd-31', 'gd-32']);
  });

  it('fetches exactly one description for resultsWanted 1 on a page of 30 listings', async () => {
    const session = glassdoorSession({ 1: gdPage(1, 30, 2) });
    const result = await new Glassdoor({}).scrape(input({ resultsWanted: 1, offset: 0 }));

    expect(gdSearchVariables(session)).toHaveLength(1);
    expect(gdDetailIds(session)).toEqual([1]);
    expect(result.jobs.map((j) => j.id)).toEqual(['gd-1']);
    expect(result.jobs[0].description).toBe('<p>Detail 1</p>');
  });

  it('honors an intra-page offset exactly', async () => {
    const session = glassdoorSession({ 1: gdPage(1, 30, 2) });
    const result = await new Glassdoor({}).scrape(input({ resultsWanted: 3, offset: 7 }));

    expect(gdDetailIds(session)).toEqual([8, 9, 10]);
    expect(result.jobs.map((j) => j.id)).toEqual(['gd-8', 'gd-9', 'gd-10']);
  });
});

describe('Glassdoor: a failed description fetch is recorded, never swallowed', () => {
  it('keeps the job with a null description and records the failure', async () => {
    const session = glassdoorSession({ 1: gdPage(1, 2) }, async (id) => {
      if (id === 1) throw new Error('socket hang up');
      return gdDetail(id);
    });
    const result = await new Glassdoor({}).scrape(input({ resultsWanted: 2, offset: 0 }));

    expect(gdDetailIds(session)).toEqual([1, 2]);
    expect(result.jobs.map((j) => j.id)).toEqual(['gd-1', 'gd-2']);
    expect(result.jobs[0].description).toBeNull();
    expect(result.jobs[1].description).toBe('<p>Detail 2</p>');
    expect(result.errors).toEqual(['job 1: description fetch failed: socket hang up']);
  });

  it('records an HTTP failure on the detail query', async () => {
    glassdoorSession({ 1: gdPage(1, 1) }, async () => ({ status: 500, data: 'oops' }));
    const result = await new Glassdoor({}).scrape(input({ resultsWanted: 1, offset: 0 }));

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].description).toBeNull();
    expect(result.errors).toEqual(['job 1: description fetch failed: HTTP 500']);
  });

  it('rethrows a cancellation raised during a description fetch', async () => {
    glassdoorSession({ 1: gdPage(1, 3) }, async () => {
      throw Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
    });
    await expect(
      new Glassdoor({}).scrape(input({ resultsWanted: 3, offset: 0 }))
    ).rejects.toMatchObject({ name: 'CanceledError' });
  });
});
