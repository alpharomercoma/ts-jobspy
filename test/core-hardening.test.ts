/**
 * Core fixes from the 2026-09-16 adversarial QA pass (codex): scraped data and
 * caller options that could crash, corrupt, or over-drive the library.
 */

import { dedupeJobs } from '../src/dedupe';
import { InvalidInputError } from '../src/exception';
import { Google } from '../src/google';
import { Indeed } from '../src/indeed';
import type { ScraperInput } from '../src/model';
import { resolveOptions } from '../src/options';
import type { Job } from '../src/result';
import { createSession, markdownConverter, plainConverter, sanitizeHtml } from '../src/util';

jest.mock('../src/util', () => {
  const actual = jest.requireActual('../src/util');
  return { ...actual, createSession: jest.fn() };
});

const job = (overrides: Partial<Job>): Job =>
  ({
    id: 'x',
    site: 'indeed',
    jobUrl: 'https://indeed.com/x',
    title: 'Engineer',
    company: 'Acme',
    location: 'SF, CA',
    ...overrides,
  }) as Job;

describe('dedupe: a scraped non-string field never crashes the whole scrape', () => {
  it('content mode coerces a numeric title instead of throwing', () => {
    const jobs = [
      job({ title: 123 as unknown as string }),
      job({ title: '123', jobUrl: 'https://indeed.com/y' }),
    ];
    expect(() => dedupeJobs(jobs, 'content')).not.toThrow();
    expect(dedupeJobs(jobs, 'content').jobs).toHaveLength(1);
  });
});

describe('html descriptions: executable markup is removed', () => {
  const dirty =
    '<p>Role</p><script>alert(1)</script><style>p{}</style><iframe src="https://x"></iframe>' +
    '<a href="javascript:evil()" onclick="x()">apply</a><a href="https://ok.example/apply">ok</a>' +
    '<img src="data:text/html;base64,AAAA">';

  it('sanitizeHtml drops script/style/iframe, event handlers and script URLs but keeps content', () => {
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/<script|alert\(|<style|<iframe|onclick|javascript:|data:text/i);
    expect(clean).toContain('<p>Role</p>');
    expect(clean).toContain('href="https://ok.example/apply"');
    expect(clean).toContain('apply');
  });

  it('markdown conversion never carries script or style content', () => {
    expect(markdownConverter('<p>a</p><script>alert(1)</script><style>p{}</style>')).toBe('a');
  });

  it('plain conversion never carries script or style content', () => {
    expect(plainConverter('<p>a</p><style>p{color:red}</style><script>alert(1)</script>')).toBe(
      'a'
    );
  });
});

describe('options: pagination inputs are bounded', () => {
  it('rejects resultsWanted above 10000 and offset above 100000', () => {
    expect(() => resolveOptions({ sites: 'indeed', resultsWanted: 10001 })).toThrow(
      InvalidInputError
    );
    expect(() => resolveOptions({ sites: 'indeed', offset: 100001 })).toThrow(InvalidInputError);
  });

  it('accepts the documented maxima', () => {
    expect(() =>
      resolveOptions({ sites: 'indeed', resultsWanted: 10000, offset: 100000 })
    ).not.toThrow();
  });
});

describe('Indeed: the server-returned cursor is escaped like every other GraphQL literal', () => {
  it('JSON-escapes quotes and backslashes in the cursor', async () => {
    const scraper = new Indeed({});
    const internals = scraper as unknown as {
      session: { post: jest.Mock };
      scraperInput: ScraperInput;
      apiCountryCode: string;
      scrapePage: (cursor: string | null, pageSize: number) => Promise<unknown>;
    };
    internals.session = {
      post: jest.fn().mockResolvedValue({
        status: 200,
        data: { data: { jobSearch: { results: [], pageInfo: { nextCursor: null } } } },
      }),
    };
    internals.scraperInput = { searchTerm: 'engineer' } as unknown as ScraperInput;
    internals.apiCountryCode = 'US';
    const cursor = 'ab"c\\d';
    await internals.scrapePage.call(scraper, cursor, 10);
    const query = internals.session.post.mock.calls[0][1].query as string;
    expect(query).toContain(`cursor: ${JSON.stringify(cursor)}`);
  });
});

describe('Google: a caller userAgent reaches the request headers', () => {
  it('sends the custom user-agent on the search request', async () => {
    const get = jest
      .fn()
      .mockResolvedValue({ status: 200, data: '<html><body>no results</body></html>' });
    (createSession as jest.Mock).mockReturnValue({ defaults: { headers: {} }, get });
    await new Google({ userAgent: 'CustomAgent/1.0' }).scrape({
      searchTerm: 'engineer',
      resultsWanted: 5,
    } as unknown as ScraperInput);
    expect(get.mock.calls[0][1].headers['user-agent']).toBe('CustomAgent/1.0');
  });
});
