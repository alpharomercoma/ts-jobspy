/**
 * Findings from the 2026-09-16 adversarial QA pass (codex + agy + Claude
 * reviewer). Each test names the production bug it guards against.
 */

import * as cheerio from 'cheerio';
import { GlassdoorException } from '../src/exception';
import { Glassdoor } from '../src/glassdoor';
import { LinkedIn } from '../src/linkedin';
import type { JobPost, ScraperInput } from '../src/model';
import { currencyParser } from '../src/util';

describe('currencyParser: magnitude suffixes are applied, not stripped', () => {
  it('reads $120K as 120000', () => {
    expect(currencyParser('$120K')).toBe(120000);
  });

  it('reads a lowercase k with a unit suffix ($95k/yr) as 95000', () => {
    expect(currencyParser('$95k/yr ')).toBe(95000);
  });

  it('still reads plain figures unchanged', () => {
    expect(currencyParser('$100,000')).toBe(100000);
    expect(currencyParser('$50.50')).toBe(50.5);
  });
});

describe('LinkedIn: compact salary cards ("$120K/yr - $150K/yr") keep their magnitude', () => {
  type ProcessJob = (
    $: cheerio.CheerioAPI,
    jobId: string,
    fullDescr: boolean
  ) => Promise<JobPost | null>;
  const scraper = new LinkedIn({});
  const processJob = (scraper as unknown as { processJob: ProcessJob }).processJob.bind(
    scraper
  ) as ProcessJob;

  it('reports minAmount/maxAmount in full dollars with a yearly interval', async () => {
    const html = `
      <div class="base-search-card">
        <span class="sr-only">Software Engineer</span>
        <h4 class="base-search-card__subtitle"><a href="https://www.linkedin.com/company/acme">Acme</a></h4>
        <div class="base-search-card__metadata">
          <span class="job-search-card__location">Austin, TX</span>
          <time class="job-search-card__listdate" datetime="2026-09-01">1 day ago</time>
        </div>
        <span class="job-search-card__salary-info">$120K/yr - $150K/yr</span>
      </div>`;
    const job = await processJob(cheerio.load(html), '4242', false);
    expect(job?.compensation).toMatchObject({
      minAmount: 120000,
      maxAmount: 150000,
      interval: 'yearly',
      currency: 'USD',
    });
  });
});

describe('Glassdoor: an unrecognized response shape is an error, not an empty page', () => {
  type FetchJobsPage = (
    locationId: string,
    locationType: string,
    pageNum: number,
    cursor: string | null
  ) => Promise<{ jobs: JobPost[]; nextCursor: string | null; errors: string[] }>;

  function scraperWith(data: unknown) {
    const scraper = new Glassdoor({});
    const internals = scraper as unknown as {
      session: { post: jest.Mock };
      scraperInput: ScraperInput;
      fetchJobsPage: FetchJobsPage;
    };
    internals.session = { post: jest.fn().mockResolvedValue({ status: 200, data }) };
    internals.scraperInput = {
      searchTerm: 'engineer',
      resultsWanted: 5,
    } as unknown as ScraperInput;
    return internals.fetchJobsPage.bind(scraper) as FetchJobsPage;
  }

  it('rejects with GlassdoorException when data.jobListings is missing (schema change)', async () => {
    const fetchJobsPage = scraperWith([{ data: { searchResults: { items: [] } } }]);
    await expect(fetchJobsPage('1', 'C', 1, null)).rejects.toThrow(GlassdoorException);
    await expect(fetchJobsPage('1', 'C', 1, null)).rejects.toThrow(/shape|schema/i);
  });

  it('still resolves an empty page when the path exists with zero listings', async () => {
    const fetchJobsPage = scraperWith([{ data: { jobListings: { jobListings: [] } } }]);
    await expect(fetchJobsPage('1', 'C', 1, null)).resolves.toMatchObject({ jobs: [] });
  });
});
