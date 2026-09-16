/**
 * LinkedIn honesty contract: a failure before any job is collected throws, a
 * failure after partial collection returns what was collected plus a
 * structured error, and 'empty' is reserved for a genuine zero-card page. A
 * stale card structure or an auth wall must surface as an error, never as a
 * clean empty result, and a filter LinkedIn cannot express must be reported
 * in unsupportedOptions rather than silently dropped.
 */

import { LinkedInException } from '../src/exception';
import { LinkedIn } from '../src/linkedin';
import { JobType, type ScraperInput } from '../src/model';
import { createSession } from '../src/util';

jest.mock('../src/util', () => {
  const actual = jest.requireActual('../src/util');
  return {
    ...actual,
    createSession: jest.fn(),
    // Paging waits 3-7s between search pages; the multi-page cases below
    // must not pay that in a unit test.
    randomDelay: jest.fn().mockResolvedValue(undefined),
  };
});

type FakeResponse = { status: number; data: string; request?: { res?: { responseUrl?: string } } };

const SEARCH_URL =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=engineer';

function fakeSession(...responses: FakeResponse[]) {
  const get = jest.fn();
  for (const response of responses) get.mockResolvedValueOnce(response);
  (createSession as jest.Mock).mockReturnValue({ defaults: { headers: {} }, get });
  return get;
}

function page(cards: string[], responseUrl: string = SEARCH_URL): FakeResponse {
  return {
    status: 200,
    data: `<html><body><ul>${cards.map((c) => `<li>${c}</li>`).join('')}</ul></body></html>`,
    request: { res: { responseUrl } },
  };
}

/** A card exactly as the parser expects it, including the id-bearing link. */
function validCard(id: string): string {
  return `
    <div class="base-search-card">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/software-engineer-at-acme-corp-${id}?trk=x">
        <span class="sr-only">Software Engineer</span>
      </a>
      <h4 class="base-search-card__subtitle">
        <a href="https://www.linkedin.com/company/acme?trk=x">Acme Corp</a>
      </h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">San Francisco, CA</span>
        <time class="job-search-card__listdate" datetime="2026-07-05">1 day ago</time>
      </div>
    </div>`;
}

/** A card whose id-bearing anchor is gone, as after a markup change. */
function staleCard(): string {
  return `
    <div class="base-search-card">
      <a class="base-card__link" href="https://www.linkedin.com/jobs/view/1">
        <span class="sr-only">Software Engineer</span>
      </a>
      <h4 class="base-search-card__subtitle"><a href="https://www.linkedin.com/company/acme">Acme</a></h4>
      <div class="base-search-card__metadata"><span class="job-search-card__location">Remote</span></div>
    </div>`;
}

function input(overrides: Partial<ScraperInput> = {}): ScraperInput {
  return { searchTerm: 'engineer', resultsWanted: 5, offset: 0, ...overrides } as ScraperInput;
}

describe('LinkedIn: a stale card structure is an error, not an empty result', () => {
  it('rejects with LinkedInException naming the page structure when cards exist but none parse', async () => {
    const get = fakeSession(page([staleCard(), staleCard(), staleCard()]));
    await expect(new LinkedIn({}).scrape(input())).rejects.toThrow(LinkedInException);
    expect(get).toHaveBeenCalledTimes(1);

    fakeSession(page([staleCard(), staleCard(), staleCard()]));
    await expect(new LinkedIn({}).scrape(input())).rejects.toThrow(/structure/);
  });

  it('stops paging on the first unparseable page instead of walking to the cap', async () => {
    const stalePage = () => page([staleCard(), staleCard(), staleCard()]);
    const get = fakeSession(stalePage(), stalePage(), stalePage(), stalePage(), stalePage());
    await expect(new LinkedIn({}).scrape(input())).rejects.toThrow(
      'LinkedIn page structure changed: 3 cards found but none could be parsed'
    );
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns the jobs already collected plus a structure error when a later page breaks', async () => {
    fakeSession(page([validCard('101'), validCard('102')]), page([staleCard(), staleCard()]));
    const result = await new LinkedIn({}).scrape(input());
    expect(result.jobs.map((j) => j.id)).toEqual(['li-101', 'li-102']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toMatch(/page 2: .*structure/);
  });

  it('still parses well-formed cards', async () => {
    const get = fakeSession(page(['101', '102', '103', '104', '105'].map(validCard)));
    const result = await new LinkedIn({}).scrape(input());
    expect(result.jobs).toHaveLength(5);
    expect(result.jobs[0]).toMatchObject({
      id: 'li-101',
      title: 'Software Engineer',
      companyName: 'Acme Corp',
      jobUrl: 'https://www.linkedin.com/jobs/view/101',
    });
    expect(result.errors).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('still resolves empty for a genuine page with zero cards', async () => {
    fakeSession(page([]));
    await expect(new LinkedIn({}).scrape(input())).resolves.toEqual({ jobs: [] });
  });
});

describe('LinkedIn: an auth wall is an error, not an empty result', () => {
  it.each([
    'https://www.linkedin.com/authwall?trk=qf&original_referer=',
    'https://www.linkedin.com/login?session_redirect=%2Fjobs',
    'https://www.linkedin.com/signup/cold-join?trk=x',
  ])('rejects with LinkedInException when the search redirects to %s', async (responseUrl) => {
    fakeSession(page([], responseUrl));
    await expect(new LinkedIn({}).scrape(input())).rejects.toThrow(LinkedInException);

    fakeSession(page([], responseUrl));
    await expect(new LinkedIn({}).scrape(input())).rejects.toThrow(/auth|login|sign/i);
  });

  it('records the wall as a page error when jobs were already collected', async () => {
    fakeSession(
      page([validCard('101')]),
      page([], 'https://www.linkedin.com/authwall?trk=qf&original_referer=')
    );
    const result = await new LinkedIn({}).scrape(input());
    expect(result.jobs.map((j) => j.id)).toEqual(['li-101']);
    expect(result.errors?.[0]).toMatch(/page 2: .*authwall/);
  });
});

describe('LinkedIn: a jobType with no f_JT code is reported, not silently dropped', () => {
  it.each([JobType.VOLUNTEER, JobType.PER_DIEM, JobType.NIGHTS, JobType.OTHER, JobType.SUMMER])(
    'reports jobType as unsupported for %s',
    async (jobType) => {
      const get = fakeSession(page([validCard('101')]));
      const result = await new LinkedIn({}).scrape(input({ jobType, resultsWanted: 1 }));
      expect(result.unsupportedOptions).toEqual(['jobType']);
      expect(get.mock.calls[0][1].params).not.toHaveProperty('f_JT');
    }
  );

  it.each([
    JobType.FULL_TIME,
    JobType.PART_TIME,
    JobType.CONTRACT,
    JobType.TEMPORARY,
    JobType.INTERNSHIP,
  ])('sends the f_JT code and reports nothing for %s', async (jobType) => {
    const get = fakeSession(page([validCard('101')]));
    const result = await new LinkedIn({}).scrape(input({ jobType, resultsWanted: 1 }));
    expect(result.unsupportedOptions).toBeUndefined();
    expect(get.mock.calls[0][1].params.f_JT).toEqual(expect.any(String));
  });

  it('reports nothing when no jobType was set', async () => {
    fakeSession(page([validCard('101')]));
    const result = await new LinkedIn({}).scrape(input({ resultsWanted: 1 }));
    expect(result.unsupportedOptions).toBeUndefined();
  });
});
