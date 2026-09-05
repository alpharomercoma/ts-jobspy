# TypeScript Job Scraper 📝

**ts-jobspy** is a job scraping library for JavaScript/TypeScript that aggregates jobs from popular job boards with one call.

It began as a TypeScript port of [python-jobspy](https://github.com/speedyapply/JobSpy). As of **v3** it has diverged into its own project with its own API. The last upstream-parity release line is preserved on the [`python-jobspy-parity`](https://github.com/alpharomercoma/ts-jobspy/tree/python-jobspy-parity) branch (v2.x), and v1 lives on [`v1-legacy`](https://github.com/alpharomercoma/ts-jobspy/tree/v1-legacy). Migrating from v2? See [MIGRATION.md](MIGRATION.md).

## Features

- Scrapes **Indeed** & **LinkedIn** concurrently (more boards ship as they become reliably scrapable - see [Site status](#site-status))
- **Honest results**: every scrape reports per-site status, counts, timing, and errors in `result.meta` - a blocked or failing site can never silently vanish
- **Strict input validation**: invalid options throw a descriptive `InvalidInputError` instead of silently coercing to defaults
- **Cross-site deduplication** (opt-in): by URL or by normalized title + company + location
- Failure isolation: one site erroring never discards another site's jobs (opt into all-or-nothing with `strict: true`)
- Proxy rotation support (HTTP/HTTPS/SOCKS)
- Fully typed - the options and result schemas are plain, documented TypeScript types

## Installation

```bash
npm install ts-jobspy
```

_Node.js >= [20.0.0](https://nodejs.org/) required_

## Usage

```typescript
import { scrapeJobs } from 'ts-jobspy';
import fs from 'node:fs';

const result = await scrapeJobs({
  sites: ['indeed', 'linkedin'], // default: the currently working sites
  searchTerm: 'software engineer',
  location: 'San Francisco, CA',
  resultsWanted: 20,
  hoursOld: 72,
  country: 'usa',
  dedupe: 'content', // drop the same posting syndicated across boards
  // linkedin: { fetchDescription: true }, // richer LinkedIn data (slower)
});

console.log(`Found ${result.jobs.length} jobs`);
for (const site of result.meta.sites) {
  console.log(`${site.site}: ${site.status}, ${site.jobs} jobs in ${site.durationMs}ms`);
}
fs.writeFileSync('jobs.json', JSON.stringify(result.jobs, null, 2));
```

### Example Output

| site     | company | title                                                   | location          | datePosted | jobUrl                                     | interval | minAmount | maxAmount | currency | isRemote |
|----------|---------|---------------------------------------------------------|-------------------|------------|--------------------------------------------|----------|-----------|-----------|----------|----------|
| indeed   | Adobe   | Software Development Engineer                           | San Jose, CA, US  | 2026-01-02 | https://www.indeed.com/viewjob?jk=17cf2... | yearly   | 139000    | 257550    | USD      | false    |
| linkedin | Google  | Software Engineer, Infrastructure, User Personalization | Mountain View, CA | 2025-12-31 | https://www.linkedin.com/jobs/view/4326... | yearly   | 141000    | 202000    | USD      | false    |

## Options

All options are optional. Invalid values throw `InvalidInputError` up front - nothing is silently ignored.

```plaintext
scrapeJobs(options)
├── sites (SiteName | SiteName[]):
│    'indeed' | 'linkedin' | 'ziprecruiter' | 'glassdoor' | 'google' | 'bayt' | 'naukri' | 'bdjobs'
│    default: the currently working sites (indeed, linkedin)
├── searchTerm (string)
├── location (string)
├── distance (number): search radius in miles, default 50
├── jobType (string): fulltime, parttime, internship, contract, ...
├── isRemote (boolean)
├── easyApply (boolean): jobs hosted on the board itself
├── resultsWanted (number): per site, default 15
├── offset (number): skip this many results per site
├── hoursOld (number): only jobs posted in the last N hours
├── country (string): Indeed/Glassdoor country, default 'usa'
├── descriptionFormat ('markdown' | 'html' | 'plain'): default 'markdown'
├── enforceAnnualSalary (boolean): convert hourly/monthly wages to annual
├── dedupe ('none' | 'url' | 'content' | boolean): default 'none'
│    'url' = exact URL match; 'content' (= true) = normalized title+company+location
├── strict (boolean): reject the whole call if any requested site fails or is interrupted; default false
├── timeoutMs (number): abort a site's scrape after this many ms and report it as an error; default none
├── siteConcurrency (number): how many sites are scraped in flight at once;
│    default all requested sites concurrently, 1 = sequential (gentler on your IP)
├── proxies (string | string[]): 'user:pass@host:port', rotated per request
├── caCert (string): CA certificate path for proxies
├── userAgent (string)
├── verbose (0 | 1 | 2): 0 errors only (default), 1 +warnings, 2 +info
├── linkedin ({ fetchDescription?, companyIds? }): LinkedIn-specific options
└── google ({ searchTerm? }): verbatim Google Jobs query
```

## Result schema

`scrapeJobs()` resolves to a `ScrapeResult`:

```plaintext
ScrapeResult
├── jobs: Job[]                  // sorted by site, then newest first
│   ├── id, site, jobUrl, jobUrlDirect
│   ├── title, company, location, datePosted (YYYY-MM-DD)
│   ├── jobTypes: string[]       // real arrays, not comma-joined strings
│   ├── salarySource ('direct_data' | 'description'), interval, minAmount, maxAmount, currency
│   ├── isRemote, jobLevel, jobFunction, listingType
│   ├── emails: string[], description
│   ├── companyIndustry, companyUrl, companyLogo, companyUrlDirect,
│   │   companyAddresses, companyNumEmployees, companyRevenue, companyDescription
│   └── skills: string[], experienceRange, companyRating,   // Naukri-specific
│       companyReviewsCount, vacancyCount, workFromHomeType
└── meta
    ├── sites[]: { site, status, jobs, requested, durationMs, jobsPerSecond,
    │              error?, unsupportedOptions? }
    │     status: 'ok'      - jobs returned, no interruptions
    │             'empty'   - site responded with zero jobs (soft block or no matches)
    │             'partial' - some jobs collected, then interrupted (error says why)
    │             'error'   - failed before collecting anything (error says why)
    │     unsupportedOptions: options you set that this site cannot honor
    │              (e.g. Bayt ignores jobType) - present only when non-empty, so a
    │              dropped filter is never silent. See the option support matrix below.
    ├── totalDurationMs
    ├── jobsPerSecond            // overall throughput (each site also reports its own)
    ├── failureRate              // failed/interrupted sites / requested sites, 0..1
    └── duplicatesRemoved
```

Every field a site provides is passed through - filtering is yours to do.

## Concurrency model & throughput

Node.js runs a single thread with asynchronous I/O - there is no multithreading
or multiprocessing here, and none is needed: scraping is network-bound, so
overlapping requests is what matters. The `siteConcurrency` option picks the
strategy: by default all requested sites are scraped concurrently; `1` scrapes
them one at a time (slower, but gentler on your IP against rate limits).

Every scrape reports its own metrics in `meta` - `jobsPerSecond` per site and
overall, `durationMs`, and `failureRate` - so throughput is measurable on every
call, not just in benchmarks. `node scripts/benchmark.mjs` (in the repo) runs
the strategy comparison live; from a residential IP (2026-08-31, 15 jobs/site):

| Strategy | Indeed | LinkedIn | Overall | Failure rate |
|----------|--------|----------|---------|--------------|
| concurrent (default) | ~1067 jobs/min | ~157 jobs/min | ~313 jobs/min | 0 |
| sequential (`siteConcurrency: 1`) | ~577 jobs/min | ~115 jobs/min | ~193 jobs/min | 0 |

LinkedIn's rate is bounded by its own guest-API politeness delays; Indeed's
GraphQL API returns 100 jobs per request and dominates throughput.

## Reliability, stealth & security notes

- **Rate limiting**: a 429 or block surfaces as `status: 'error'`/`'partial'` with a
  `RateLimitException` message in `meta.sites[].error` - it never silently looks like an
  empty result. HTTP status codes are not auto-retried (only transport errors are), so a
  block is reported rather than amplified into a burst.
- **Pacing**: LinkedIn requests - including per-job description fetches - are jittered.
  Use `siteConcurrency: 1` and modest `resultsWanted` to stay under rate limits; add
  `proxies` for large scrapes.
- **Fingerprint**: requests send browser-like headers but Node's TLS stack, which
  sophisticated anti-bot systems can still fingerprint. For heavy or sensitive scraping,
  route through residential `proxies`. `userAgent` customizes LinkedIn/HTML scrapers;
  Indeed's GraphQL API requires its fixed app user-agent, so it is left untouched there.
- **Input safety**: `searchTerm`/`location` are safely escaped into Indeed's GraphQL query
  (no injection). Options are strictly validated before any request, and unknown option
  keys are rejected rather than silently ignored.
- **`caCert`**: a PEM path trusted for all requests (e.g. behind a TLS-inspecting proxy).
- **`timeoutMs`**: threads an `AbortSignal` into every scraper's requests and paced delays,
  so a timeout actually aborts in-flight work, not just the wait. If a site had already
  collected some jobs when the timeout fired, they are returned as `status: 'partial'`
  rather than discarded.

## Site status

Live status is verified daily by a [scheduled scrape-health workflow](.github/workflows/scrape-health.yml) that alerts when a board changes behavior.

| Site | Status | Notes |
|------|--------|-------|
| Indeed | ✅ Working | GraphQL API; fastest scraper (~30 jobs/sec), minimal rate limiting |
| LinkedIn | ✅ Working | Guest API; rate limits around the 10th page - use proxies for large scrapes |
| Google | 🚧 Blocked | Google serves a JS-required page to non-browser clients (the jobs data itself is unchanged); pursuing options |
| Glassdoor | 🚧 Blocked | TLS fingerprinting; may work with residential proxies |
| ZipRecruiter | 🚧 Blocked | TLS fingerprinting; US/CA only |
| Bayt | 🚧 Blocked | TLS fingerprinting |
| Naukri | ⚠️ Untested | India-focused; worked at last verification |
| BDJobs | ⚠️ Untested | Bangladesh-focused; may need selector updates |

Blocked/untested sites can still be requested - the per-site `meta` entry will tell you exactly what happened (`empty`, or `error` with the reason).

## Per-site option support

`searchTerm`, `location`, `offset`, `resultsWanted`, and `descriptionFormat` are honored by every site. The filter options below vary by board; when you set one a site cannot express, it is listed in that site's `meta.sites[].unsupportedOptions` (never dropped silently):

| Site | distance | jobType | isRemote | easyApply | hoursOld |
|------|:--------:|:-------:|:--------:|:---------:|:--------:|
| Indeed | ✅ | ✅ | ✅ | ✅ | ✅ |
| LinkedIn | ✅ | ✅ | ✅ | ✅ | ✅ |
| Google | ❌ | ✅ | ✅ | ❌ | ✅ (coarse) |
| Glassdoor | ❌ | ✅ | ✅ | ✅ | ✅ (day) |
| ZipRecruiter | ✅ | ✅ | ✅ | ✅ | ✅ (day) |
| Naukri | ❌ | ❌ | ✅ | ❌ | ✅ (day) |
| Bayt | ❌ | ❌ | ❌ | ❌ | ❌ |
| BDJobs | ❌ | ❌ | ❌ | ❌ | ❌ |

Notes: Indeed's API accepts only **one** filter group per search (`hoursOld`, or `easyApply`, or `jobType`/`isRemote` together); when you combine them the lower-precedence ones are reported in `unsupportedOptions`. "(day)" means the site filters at whole-day granularity, so a sub-day `hoursOld` is applied as one day. "(coarse)" means Google maps `hoursOld` to broad buckets (today/3 days/week/month). Support for the blocked sites reflects what their request-building code sends and is not verified live.

## Limitations

```plaintext
├── Indeed: only ONE of these filter groups per search:
│    - hoursOld
│    - jobType & isRemote
│    - easyApply
├── LinkedIn: rate limits at ~10th page; `isRemote` filter is applied
│    inconsistently by LinkedIn's own guest API
└── All boards cap a given search at ~1000 jobs
```

## Supported countries (Indeed)

LinkedIn searches globally and uses only `location`. Indeed uses `country`:

Argentina, Australia, Austria, Bahrain, Belgium, Brazil, Canada, Chile, China, Colombia, Costa Rica, Czech Republic, Denmark, Ecuador, Egypt, Finland, France, Germany, Greece, Hong Kong, Hungary, India, Indonesia, Ireland, Israel, Italy, Japan, Kuwait, Luxembourg, Malaysia, Mexico, Morocco, Netherlands, New Zealand, Nigeria, Norway, Oman, Pakistan, Panama, Peru, Philippines, Poland, Portugal, Qatar, Romania, Saudi Arabia, Singapore, South Africa, South Korea, Spain, Sweden, Switzerland, Taiwan, Thailand, Turkey, Ukraine, United Arab Emirates, UK, USA, Uruguay, Venezuela, Vietnam

## FAQ

**Q: Why is Indeed returning unrelated roles?**
A: Indeed searches descriptions too. Use `-word` to exclude and `"exact phrase"` to match:

```typescript
searchTerm: '"engineering intern" software summer (java OR python OR c++) 2026 -tax -marketing'
```

**Q: Getting HTTP 429?**
A: You're rate limited. Wait between scrapes and/or pass `proxies` to rotate IPs. With v3, a rate-limited site shows up as `status: 'error'` in `meta.sites` instead of failing the whole call.

**Q: How do I know if a job board changed and broke scraping?**
A: Check `result.meta.sites` - a site that used to return `ok` and now returns `empty`/`error` has changed or blocked you. This repo's daily health workflow watches for the same drift on our side.

## Credits

Started as a TypeScript port of [python-jobspy](https://github.com/speedyapply/JobSpy) by Cullen Watson and Zachary Hampton.

**Author:** Alpha Romer Coma (alpharomercoma@proton.me)

## License

MIT License - see [LICENSE](LICENSE).
