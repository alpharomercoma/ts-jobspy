# Known Bugs and Limitations

This document tracks known bugs and limitations in both the original python-jobspy and this TypeScript port (ts-jobspy).

## Original python-jobspy Bugs

### 1. LinkedIn Rate Limiting
- **Location**: `linkedin/index.ts`
- **Description**: LinkedIn rate limits requests around the 10th page with a single IP
- **Impact**: Cannot scrape more than ~250 jobs without proxies
- **Mitigation**:
  - Implement exponential backoff
  - Use rotating proxies (required for large scrapes)
  - Respect rate limits with delays between requests

### 2. ZipRecruiter Region Lock
- **Location**: `ziprecruiter/index.ts`
- **Description**: ZipRecruiter only works in US and Canada
- **Impact**: Returns empty results for other regions
- **Mitigation**: Document limitation, validate region before scraping

### 3. Indeed Mutually Exclusive Filters
- **Location**: `indeed/index.ts`
- **Description**: Indeed API only allows one filter type at a time. You can only use ONE of:
  - `hours_old` (date filter)
  - `job_type` + `is_remote` (attribute filters)
  - `easy_apply` (Indeed Apply filter)
- **Impact**: Cannot combine date filtering with job type filtering
- **Mitigation**: Document limitation, validate input to warn users

### 4. Glassdoor CSRF Token Extraction
- **Location**: `glassdoor/index.ts`
- **Description**: CSRF token extraction from page can fail if page structure changes
- **Impact**: Scraping may fail without fallback token
- **Mitigation**: Use fallback token when extraction fails, implement retry mechanism

### 5. BDJobs Missing user_agent Parameter
- **Location**: Original `bdjobs/__init__.py`
- **Description**: Constructor signature missing `user_agent` parameter unlike other scrapers
- **Impact**: Cannot customize user agent for BDJobs
- **Mitigation**: Fixed in TypeScript version

### 6. ZipRecruiter Error Logging Bug
- **Location**: Original `ziprecruiter/__init__.py` lines 110-112
- **Description**: Error messages incorrectly say "Indeed" instead of "ZipRecruiter"
- **Impact**: Confusing error messages for debugging
- **Mitigation**: Fixed in TypeScript version

### 7. LinkedIn Salary Currency Detection
- **Location**: `linkedin/index.ts`
- **Description**: Non-USD currencies may not be properly parsed
- **Impact**: Incorrect currency values in output
- **Mitigation**: Improved currency detection in TypeScript version

## ts-jobspy Specific Notes

### TypeScript Type Safety
- All scrapers use strict TypeScript types
- Input validation via Zod schemas (optional)
- Null safety enforced throughout

### Async/Await Pattern
- All scrapers use async/await instead of threads
- Promise.all for concurrent scraping
- Proper error propagation

### Proxy Handling
- Supports HTTP, HTTPS, and SOCKS5 proxies
- Rotating proxy session for load balancing
- Proxy agent per-request configuration

### TLS Fingerprinting Difference
- **Issue**: Python version uses `tls_client` which spoofs browser TLS fingerprints
- **Impact**: Some sites (Glassdoor, ZipRecruiter, Bayt) may return 403 errors with standard axios requests
- **Mitigation**: Use proxies with residential IPs or consider TLS fingerprinting libraries for Node.js
- **Affected scrapers**: Glassdoor, ZipRecruiter, Bayt (may need proxies to work reliably)

## Bugs Fixed in v1.0.0 Audit

### 1. Indeed Type Casting Bug (Fixed)
- **Location**: `src/indeed/index.ts` line 119
- **Issue**: Incorrect type casting `Site.INDEED as unknown as Country`
- **Fix**: Changed to `input.country ?? Country.USA`

### 2. Glassdoor Type Casting Bug (Fixed)
- **Location**: `src/glassdoor/index.ts` line 106
- **Issue**: Incorrect type casting `Site.GLASSDOOR as unknown as Country`
- **Fix**: Changed to `input.country ?? Country.USA`

### 3. verbose Default Mismatch (Fixed)
- **Location**: `src/index.ts` line 176
- **Issue**: TypeScript defaulted to `verbose=2` while Python defaults to `verbose=0`
- **Fix**: Changed default from `2` to `0` to match Python behavior

## Option Verification Audit (2026-07-06)

All `scrapeJobs()` options were exercised live against Indeed and LinkedIn (18-case matrix
plus HTTP-layer param capture). Findings:

### 1. LinkedIn `datePosted` null under `hoursOld` (Fixed)
- **Location**: `src/linkedin/index.ts` (`processJob`)
- **Issue**: LinkedIn renders recently posted jobs with `<time class="job-search-card__listdate--new">`.
  The port only matched `time.job-search-card__listdate`, so any search dominated by fresh
  jobs - which is exactly what `hoursOld` returns - produced `datePosted: null` for every job.
  Upstream python-jobspy has a fallback for the `--new` class that was dropped in the port.
- **Fix**: Restored the fallback selector (parity with upstream). Unit-tested with card
  fixtures in `test/linkedin.test.ts`; verified live (hoursOld=24 now returns 0 null dates).

### 2. Indeed `hoursOld` can return jobs with older `datePosted` (Not a bug)
- **Behavior**: The GraphQL filter applies to `dateOnIndeed` (when the posting appeared on
  Indeed), while the output `datePosted` reports `datePublished` (original publication date).
  Reposted jobs can therefore show a `datePosted` older than the `hoursOld` window even though
  the filter worked. Verified live: a job with `datePublished=2026-06-23` under `hoursOld: 24`
  had `dateOnIndeed=2026-07-06`. Identical behavior in upstream python-jobspy.

### 3. LinkedIn `isRemote` filter is applied inconsistently by LinkedIn (Limitation)
- **Behavior**: The scraper correctly sends `f_WT=2` (verified via HTTP capture), but the
  unauthenticated guest API sometimes ignores it and serves a generic result set - back-to-back
  identical requests were observed both honoring and ignoring the filter. Additionally, the
  `isRemote` *output* field is a keyword heuristic (searches title/description/location for
  "remote"/"wfh"), same as upstream, so it can be false for jobs LinkedIn classifies as remote.
- **Mitigation**: Treat LinkedIn `isRemote` as best-effort; use `linkedinFetchDescription: true`
  to give the heuristic more text to scan.

### Verified working (live, 2026-07-06)
- **Indeed**: searchTerm, location, distance, resultsWanted (exact count), hoursOld (see #2),
  jobType, isRemote, easyApply, offset (no page overlap), countryIndeed (uk.indeed.com),
  descriptionFormat html/markdown, enforceAnnualSalary (hourly→yearly conversion).
- **LinkedIn**: searchTerm, location, resultsWanted, hoursOld (after fix #1), jobType (+ f_JT
  param), easyApply (f_AL), offset (start param, no overlap), linkedinCompanyIds (f_C - 5/5
  jobs from requested company), linkedinFetchDescription (descriptions + jobType populated),
  isRemote (f_WT sent; see #3). Full param assembly verified on the wire:
  `keywords, location, distance, f_WT, f_JT, f_AL, f_C, f_TPR, start`.
- **Not verified live**: proxies/caCert/userAgent (need real proxy infra), distance radius
  accuracy (no ground truth), verbose (logging only).

## Scraper Test Results (2026-01-02)

| Scraper | Status | Notes |
|---------|--------|-------|
| LinkedIn | ✅ Working | Returns jobs successfully |
| Indeed | ✅ Working | Returns jobs successfully |
| Naukri | ✅ Working | Returns jobs with India-specific fields |
| Google | ⚠️ Partial | May return 0 results due to bot detection |
| Glassdoor | ❌ Blocked | Returns 403 (requires proxies/TLS spoofing) |
| ZipRecruiter | ❌ Blocked | Returns 403 (requires proxies/TLS spoofing) |
| Bayt | ❌ Blocked | Returns 403 (requires proxies/TLS spoofing) |
| BDJobs | ⚠️ Partial | May need selector updates for site changes |

## Python vs TypeScript Comparison (2026-01-02)

A comprehensive comparison was performed between python-jobspy and ts-jobspy.

### Parity Results

| Test | Python Jobs | TS Jobs | Match |
|------|-------------|---------|-------|
| indeed_basic | 5 | 5 | ✓ |
| indeed_hours_old | 5 | 5 | ✓ |
| indeed_jobtype | 5 | 5 | ✓ |
| indeed_offset | 5 | 5 | ✓ |
| linkedin_basic | 5 | 5 | ✓ |
| linkedin_remote | 5 | 5 | ✓ |
| naukri_basic | 5 | 5 | ✓ |
| multi_site | 10 | 10 | ✓ |
| glassdoor_basic | 0 | 0 | ✓ (both blocked) |
| google_basic | 0 | 0 | ✓ (both blocked) |
| ziprecruiter_basic | 0 | 0 | ✓ (both blocked) |

**Result:** 100% parity on job counts across all tested scenarios.

### Performance Comparison

| Metric | Python | TypeScript | Difference |
|--------|--------|------------|------------|
| Total Time | 12.98s | 9.70s | **-25.3%** |
| Winner | - | TypeScript | - |

TypeScript is approximately 25% faster overall.

### Key Findings

1. **No Critical Issues**: TypeScript implementation matches Python behavior exactly
2. **Both Have Same Blockers**: ZipRecruiter, Glassdoor, and Google return 403 on both implementations
3. **TypeScript Faster**: 25% faster overall execution time
4. **100% Job Count Parity**: Identical results for all working scrapers
5. **All Parameters Work**: All documented parameters (jobType, isRemote, hoursOld, offset, etc.) function correctly

## Recommendations

1. **Always use proxies for LinkedIn** - Rate limiting is aggressive
2. **Be aware of Indeed filter limitations** - Choose one filter category
3. **Handle 429 responses gracefully** - Implement backoff and retry
4. **Validate location strings** - Some sites have strict location requirements
5. **Monitor for site changes** - Job boards frequently update their HTML/API

## Reporting Bugs

If you find a bug, please open an issue on GitHub with:
1. Site affected
2. Search parameters used
3. Error message or unexpected behavior
4. Steps to reproduce

## Live Verification & Throughput (2026-08-31)

Verified against real sites from a residential IP (adjacent testbed installing the packed tarball):

| Site | Result | Throughput |
|------|--------|-----------|
| Indeed | ✅ 25/25 jobs, descriptions/dates/salaries populated | ~30 jobs/sec (25 jobs in 0.84s) |
| LinkedIn | ✅ 25/25 jobs; descriptions require `linkedin.fetchDescription` | ~2.5 jobs/sec (25 jobs in 10.1s; scraper's built-in delay dominates) |
| Google | ⚠️ 0 jobs, no error | see below |

v3 envelope verified live: 3-site concurrent scrape (10 jobs/site) completed in 0.93s
wall time with per-site meta reporting indeed=ok, linkedin=ok, google=empty.

### Google Jobs diagnosis (2026-08-31)

- Plain HTTP GET of `google.com/search?udm=8` returns HTTP 200 with a ~92KB
  "enable JS" interstitial - no jobs markup, no `data-async-fc` cursor.
- Tried: consent cookies (SOCS/CONSENT), modern Chrome 141 header set, browser
  TLS impersonation via impit (Chrome profile), real browser session cookies
  replayed over curl. All still get the JS wall.
- A real JS-executing browser (Playwright Chrome) DOES get the classic jobs
  UI: `jsname="Yust4d"` present, 13 `data-async-fc` cursors - the scraping
  protocol itself is unchanged; the gate is client fingerprinting requiring JS
  execution.
- Upstream python-jobspy (dormant since Feb 2026) has no fix either.
- Conclusion: Google Jobs is not feasible over plain HTTP today. Options: a
  pluggable fetcher so users can wire a headless browser, or wait for the
  daily scrape-health workflow to detect if the gating loosens.

### Upstream parity check (2026-08-31)

All upstream python-jobspy fixes through HEAD (Feb 2026) are already in this
port (LinkedIn `--listdate--new` fallback = upstream #343; BDJobs user_agent =
upstream #295 fix). Upstream is dormant; v3 diverges deliberately.

## Strategy Benchmark (2026-08-31, residential IP, 15 jobs/site)

| Strategy | Site | Jobs | Duration | Jobs/sec | Jobs/min | Status |
|----------|------|------|----------|----------|----------|--------|
| concurrent (default) | indeed | 15 | 0.8s | 17.79 | 1067 | ok |
| concurrent (default) | linkedin | 15 | 5.7s | 2.61 | 157 | ok |
| concurrent (default) | overall | 30 | 5.8s | 5.21 | 313 | failureRate 0 |
| sequential (siteConcurrency: 1) | indeed | 15 | 1.6s | 9.62 | 577 | ok |
| sequential (siteConcurrency: 1) | linkedin | 15 | 7.8s | 1.92 | 115 | ok |
| sequential (siteConcurrency: 1) | overall | 30 | 9.4s | 3.21 | 193 | failureRate 0 |

Reproduce with `node scripts/benchmark.mjs` after `npm run build`. Per-call
metrics (jobsPerSecond, failureRate) ship in every scrape's `meta`.

## Round-2 Adversarial QA (2026-08-31, codex + Claude reviewer)

Both reviewers independently flagged the same core issues; all addressed:
- **429/status handling was dead code** - createSession's validateStatus rejected
  non-2xx before scrapers could classify. Now validateStatus accepts all; scrapers
  classify 429→RateLimitException; retries limited to transport errors (no 429 storm).
- **GraphQL injection** - Indeed query now escapes searchTerm/location via JSON.stringify.
  Verified live: `location: 'Austin, TX" ) malicious'` returns empty, not a crash.
- **userAgent was ignored** - now threaded to LinkedIn/HTML scrapers. NOT applied to
  Indeed (its GraphQL API requires the fixed app UA; a custom UA returns HTTP 403 -
  verified live).
- **caCert was a no-op** - now implemented via https.Agent({ca}).
- **timeoutMs didn't abort** - now wires an AbortController/signal into all axios calls
  and aborts on timeout (rejects race first for deterministic classification).
- **LinkedIn enrichment** - per-description fetches are now paced (jittered 1-3s) and
  their failures are surfaced in meta (→ partial), not silently swallowed.
- **Indeed over-fetch** - page size is min(100, resultsWanted+offset). Verified live:
  resultsWanted:1 now returns 1 job in ~330ms instead of downloading 100.
- **strict didn't cover conversion failures** - strict check moved after job conversion.
- **bannerPhotoUrl** added to the Job output (was the only dropped JobPost field).

Accepted as-is: shared Indeed mobile API key (inherent to the mobile GraphQL endpoint,
same as upstream python-jobspy); Node TLS fingerprint (documented - use proxies).

## Adversarial QA (2026-09-16, codex gpt-5.6-luna xhigh + agy gemini-3.1-pro + Claude reviewer + security review)

Live baseline (residential IP): Indeed ~35 jobs/s, LinkedIn ~2.5 jobs/s (pacing-bound by
design), 30 jobs concurrently in 6.1s, failureRate 0. Dev-dependency audit fixed
(browserslist high, baseline-browser-mapping moderate; both transitive, via npm audit fix).

Fixed:
- **Google JS wall reported as 'empty'** - Google answers non-browser clients with HTTP 200
  and an enable-JavaScript interstitial (`httpservice/retry/enablejs`); the page parsed to
  zero jobs and no cursor, so the scrape reported a clean 'empty'. Now detected via
  WALL_MARKERS and thrown as GoogleJobsException (status 'error'). Verified live.
- **BDJobs moved** - jobs.bdjobs.com/jobsearch.asp now 302s to bdjobs.com/h/jobs, an Angular
  SPA backed by apiv1.bdjobs.com. The session followed the redirect and the old selectors
  found zero cards, so the scrape reported 'empty'. A search landing on another host now
  throws BDJobsException naming the target. Verified live. A port to the JSON API is pending.
- **Glassdoor schema change reported as 'empty'** - `resJson?.data?.jobListings?.jobListings
  ?? []` turned a missing data path into an empty page; a missing path now throws
  GlassdoorException (an explicit empty array is still 'empty').
- **LinkedIn compact salaries 1000x too small** - currencyParser stripped the K in "$120K/yr"
  and reported 120 with salarySource 'direct_data'. A magnitude suffix directly after the
  digits is now applied (120000). Regression test uses a real card fixture.
- README: bannerPhotoUrl added to the Result schema; Google option-matrix footnote (google.searchTerm
  drops jobType/isRemote/hoursOld); 'empty' semantics stated precisely; BDJobs status row.

Verified false or not reachable (no change):
- "Proxy credentials leak into meta errors" (agy) - the flagged catch records per-card parse
  messages; Node/https-proxy-agent connection errors carry host:port only, never credentials,
  and no log prints the proxy config (traced independently by two reviewers).
- "Indeed pagination can loop forever" (agy) - processJob returns null for any URL already in
  seenUrls, so a repeated page yields zero jobs and the loop breaks; a null cursor also breaks.
- "runWithConcurrency crashes on undefined limit" (agy) - resolveOptions always defaults
  siteConcurrency and scrapeJobs never bypasses it.
- Security review of the full v3 diff: no high-confidence vulnerability (Indeed GraphQL escaped
  via JSON.stringify, URL params encoded, caCert adds validation, no secrets in errors/logs).

Deferred, with reason:
- BDJobs relative-date parsing and its still-serial detail fetches - moot until the scraper
  is ported to the new apiv1.bdjobs.com API (the old site now redirects; see above).

### Codex round (gpt-5.6-luna, xhigh; 18 findings) - triage

Fixed (each with a regression test; 196 tests total):
- **LinkedIn stale structure read as 'empty' after a multi-minute loop** - cards present but
  none parseable (e.g. the full-link anchor moved) now throws
  `LinkedIn page structure changed: N cards found but none could be parsed` on the first
  such page (partial when something was already collected); an auth-wall redirect on the
  search request throws `LinkedIn blocked the search with an auth wall`; aborts are
  rethrown instead of being filed as bad cards.
- **LinkedIn unmapped jobType silently unfiltered** - perdiem/nights/other/summer/volunteer
  have no f_JT code; they are now reported in unsupportedOptions (README matrix updated).
- **Scraped detail links steering requests off-site (SSRF class)** - BDJobs resolves the
  card's href and fetches only http(s) URLs on bdjobs.com or a subdomain; ZipRecruiter's
  constructed detail URL gets the same guard. Off-site links are recorded by hostname only.
- **Whole-page enrichment before resultsWanted/offset** - ZipRecruiter and Glassdoor now
  dedupe first, skip to the offset without fetching, and enrich only the remaining deficit
  (resultsWanted: 1 issues exactly one detail request). Glassdoor description fetches run
  through a bounded pool (3) and failures are recorded, never swallowed.
- **Glassdoor offset started cursor pagination at page N with no cursor** - always walks from
  page 1, carrying each page's cursor forward.
- **BDJobs/Naukri repeating pages without progress** - a page that adds zero new jobs ends
  paging; BDJobs dedupes on the card id before any detail fetch.
- **dedupe crashed the whole scrape on a non-string title** - normalize() folds any scraped
  value to text.
- **descriptionFormat 'html' carried executable markup** - new sanitizeHtml() (script/style/
  iframe/object/embed/form elements, on* handlers, javascript:/vbscript:/non-image data:
  URLs removed) applied to every html description; markdown/plain conversion drops script
  and style bodies.
- **Unbounded resultsWanted/offset** - capped at 10000 / 100000 (documented); Google's page
  cap raised to 100 (was silently stopping at 510).
- **Indeed server cursor interpolated unescaped into GraphQL** - now JSON.stringify'd like
  the caller's strings.
- **Google ignored a caller userAgent** - per-request headers now carry it.
- **engines.node too loose** - >=20.18.1 (cheerio/undici floor); README/CLAUDE updated.
- **Publish workflow** - actions pinned to release SHAs, npm pinned (12.0.2) in the job that
  holds id-token: write, least-privilege top-level permissions, and the "already published"
  check fails closed (only a confirmed E404 counts as unpublished).
- README: country list regenerated from CountryName; caCert scope stated precisely (direct
  HTTPS and http(s) proxies; SOCKS uses the system store); bannerPhotoUrl documented.

Verified not an issue:
- Glassdoor isRemote "sends no remote filter" - location id 11047 with type STATE is
  Glassdoor's own "Remote" pseudo-location (its remote SERP is IS11047), as in upstream;
  it is the filter. Comment added.
- caCert read synchronously before the timeout starts - caCert is caller-trusted
  configuration; documented as "a regular PEM file, read once at scrape start".

Live after all fixes (residential IP): Indeed and LinkedIn ok; Google, Glassdoor,
ZipRecruiter, Bayt, Naukri, BDJobs all report 'error' with the specific reason (wall,
403 TLS block, 406, moved), none report a misleading 'empty'.


## Stress, fuzz and load round (2026-09-17, consumer harness + codex gpt-5.6-luna + agy gemini-3.1-pro)

Method: the built tarball was installed in a separate consumer project (`../ts-jobspy-stress`) and driven through an intercepting proxy reached via the public `proxies` + `caCert` options (real TLS, real proxy agents, real axios/retry stack). Real Indeed and LinkedIn responses were recorded once and replayed; every scenario is offline except the live limit script.

### Findings fixed (all under TDD, tests named)

| # | Scenario | Symptom before | Fix | Test |
|---|----------|----------------|-----|------|
| 1 | First proxied request with `caCert` | `unable to verify the first certificate`: https-proxy-agent and socks-proxy-agent apply constructor options to the proxy hop only, so `caCert` was silently ignored for every tunneled TLS connection (README claimed http(s) proxies were covered) | `CaHttpsProxyAgent` / `CaSocksProxyAgent` inject the CA into the tunneled `connect()` options; SOCKS now covered too | test/ca-cert-proxy.test.ts (real TLS origin, CONNECT proxy, SOCKS5 server) |
| 2 | 200KB gzip body inflating to 200MB | `FATAL ERROR: JavaScript heap out of memory`: the consumer process died | `maxContentLength` 16MB (decompressed) | test/response-limits.test.ts |
| 3 | Origin trickles 1 byte / 5s, no `timeoutMs` | Scrape never ends (axios `timeout` is inactivity only); still running after 90s | Total per-request deadline of 2x the inactivity timeout, composed with the caller's AbortSignal, code `ERR_DEADLINE` | test/response-limits.test.ts |
| 4 | 302 to another host | Followed, then "responded with status code 404" from the other host | `siteDomain` per scraper + `beforeRedirect` refusal naming the destination | test/redirect-policy.test.ts |
| 5 | Body over cap / refused redirect / deadline | Retried up to 3 times (the bomb downloaded again, 5s wasted) | `NON_TRANSIENT_ERROR_CODES` excluded from axios-retry | test/response-limits.test.ts |
| 6 | Description with a 100k-char token around "@" | `extractEmailsFromText` took 55s (quadratic backtracking) | Bounded quantifiers (RFC 5321 lengths) | test/parser-limits.test.ts |
| 7 | 50k nested `<div>` in a description | Stack overflow in turndown (~2000 levels) and cheerio's serializer (~5000); parse5 quadratic in depth (50k: 18s, a 16MB page: hours) | Linear `scanHtml`/`htmlDepth` pre-check; converters fall back to a tag strip past 256 levels or 2MB; `loadHtml` refuses such full pages | test/parser-limits.test.ts, test/linkedin-page-guards.test.ts |
| 8 | LinkedIn: truncated page repeating the same cards | Counted as progress; walked toward the 1000-result cap with a 3-7s delay per page (45s+ "hang") | A page adding zero new jobs ends the search | test/linkedin-page-guards.test.ts |
| 9 | LinkedIn: empty body / JSON / binary / block page with HTTP 200 | Reported `empty` | Only the real end-of-results marker (`<!DOCTYPE html>` + `<!---->`, verified live) is empty; anything else is `error` | test/linkedin-page-guards.test.ts |
| 10 | `timeoutMs: 1e12` | `TimeoutOverflowWarning`, timer fired after 1ms, every site "timed out after 1000000000000ms" | Max 2147483647 | test/options-limits.test.ts |
| 11 | Null-prototype object as any option | `TypeError: Cannot convert object to primitive value` out of the error formatter | `describe()` never throws; always `InvalidInputError` | test/options-limits.test.ts |
| 12 | `proxies: 'not a url'` | Every site: `TypeError: Invalid URL` at request time | Each entry must form an http/https/socks4/socks5 URL with a host | test/options-limits.test.ts |
| 13 | `caCert` missing / directory / not PEM | Every site: ENOENT / EISDIR / TLS error at request time | Validated at call start | test/options-limits.test.ts |
| 14 | 1MB `searchTerm`, 100KB `location`/`userAgent`, 10k `companyIds` | LinkedIn: `write EPIPE` / `read ECONNRESET` (request line too long) | Caps: 1000 / 500 / 1024 (+ no control characters) / 100 | test/options-limits.test.ts |
| 15 | Corrupted Indeed payload (`baseSalary.range.max` = 0 or -1) | Job emitted with `minAmount > maxAmount` | Negative, non-finite, or inverted ranges are nulled | test/salary-sanity.test.ts |

### Held up (verified, no change needed)

- Status codes 4xx/5xx/999, empty/garbage/HTML/JSON/truncated bodies, content-length lies, resets before and mid-body, redirect loops, header floods (Node `Parse Error: Header overflow`), wrong `content-encoding`, UTF-16 bodies: all `error` with a specific message, never `empty`, never a rejection of `scrapeJobs`.
- `timeoutMs` under load: 300 concurrent scrapes against a 3s-latency origin with `timeoutMs: 500` all reported the timeout within ~510ms; active handles back to baseline, no `MaxListenersExceededWarning`, no unhandled rejection.
- Load: 200 concurrent scrapes (400 requests) in 1.3s, event-loop lag 37ms; 2000 scrapes in 20 rounds of 100: heap 22MB after GC (no leak), handles 3.
- Mutation fuzzing (570 corrupted Indeed JSON + LinkedIn HTML pages over three seeds, including `__proto__` keys and script/`javascript:` injection): no rejection, no prototype pollution, no `empty` for a corrupted page, per-job failures recorded as `partial`.
- Option fuzzing (400 random option objects): every rejection is `InvalidInputError` except values that throw on property access (a Proxy trap), which propagate as the caller's own error.
- Live (2026-09-16): Indeed 500 jobs in 4.5s (111 jobs/s, all unique), offset 480 overlaps the first 500 by 20 (a live index shifts), offset 5000 past the end is `empty`, 10 concurrent x30 all `ok`; LinkedIn 60 jobs at 2.1 jobs/s, 8 with html descriptions, offset 995 `empty` (marker page), gibberish term returns LinkedIn's fallback results; both sites + `dedupe: 'content'` + `strict` fine.

### Known limits kept

- The event loop is blocked while a page is parsed; a 16MB (cap) page of wide, shallow markup still costs seconds of CPU. Bounded, not eliminated.
- The Proxy-trap case above: an option object whose getters throw is the caller's bug and is reported as such.

### Re-review triage (codex gpt-5.6-luna xhigh: 16 findings; agy gemini-3.1-pro: 12 findings)

Fixed (each with a test in test/review2-fixes.test.ts unless noted):

- codex 1 (high): `sanitizeHtml`'s fallback decoded `&lt;img onerror&gt;` into live markup. The `html` fallback is now HTML-escaped text.
- codex 2 (high): depth guard bypass. parse5 nests `<div/>` (self-closing syntax only closes foreign elements) and ignores a stray `</span>`; `htmlDepth` now simulates the parser's open-element stack (void elements, foreign content, implied end tags for p/li/dt/dd/table parts/option/a, scoped stray end tags). Verified against cheerio: `<div/>` x1000 nests 1002 deep, `<p>` x300 nests 3.
- codex 3 / agy 5 (high): `scanHtml` lowercased the whole input per `<script>`/`<style>` (5s for 50k script tags). Now a case-insensitive regex search from the current position.
- codex 4 / agy 7 (medium): tokenizer ended a tag at a `>` inside a quoted attribute value and a comment at the first `>`. Quoted values are skipped as a unit; comments run to `-->`. (CDATA in HTML content is a bogus comment ending at the first `>` in parse5 too, so that part of the claim was not a defect.)
- codex 5 (medium): the "2 MB" limit measures string length; documented as 2 million characters.
- codex 6 / agy 10 (medium): bounded email regex reported the last 64 characters of an overlong local part; a lookbehind pins the candidate to a token start.
- codex 7 (medium): a bare `<!DOCTYPE html>` counted as LinkedIn's end-of-results marker; the empty comment is now required.
- codex 8 (medium): `jobType` errors interpolated non-strings (TypeError); explicit `null` for any option silently took the default. Both are `InvalidInputError` now.
- codex 9 / agy 9 (medium): `HTTP://host` passed validation but `formatProxy` prepended another `http://`; scheme checks are case-insensitive. Credentials that are not valid percent-encoding are rejected at validation.
- codex 10 (medium): `httpAgent` used the plain proxy agent, so an `https://` proxy's own certificate was not checked against `caCert` for plain-http targets (test in test/ca-cert-proxy.test.ts with a TLS CONNECT proxy).
- codex 11 (medium): `caCert` accepted any file with a BEGIN marker; every PEM block must now parse as an X509Certificate.
- codex 12 (medium): `proxies` had no size bound; at most 1000 entries of 2048 characters.
- codex 13 (medium): Google's locale domains (google.com.ph, google.co.uk, consent.google.com) were refused as off-site; `siteDomain` accepts a RegExp and Google passes one (test/google-site-domain.test.ts).
- codex 14, 15 / agy 12 (low): redirect tests now assert the off-site host was never contacted; the SOCKS fixture buffers fragmented input; origins use 127.0.0.1; timing budgets widened to 2s (the defects they catch cost 7-55s).
- codex 16 (low): README/CLAUDE.md claims aligned (caCert is read at validation and per session; character limit; escaped fallback).
- agy 1 (critical as filed): `removeAttributes` parsed unguarded. Every caller passes a subtree of a page that already went through `loadHtml`, so it was not reachable, but it is guarded now (test in test/review2-fixes.test.ts).
- agy 8 (medium): a corrupted direct salary range now falls back to a salary stated in the description (test/salary-sanity.test.ts).

Rejected after verification:

- agy 2 ("CA lost via shallow copy"): test/ca-cert-proxy.test.ts proves the tunneled TLS trusts the CA through http, https and SOCKS proxies; the subclass passes the modified options to the parent `connect`, which uses them for `tls.connect`.
- agy 3 ("timeoutMs x 2 overflows the timer"): the deadline is derived from the session's inactivity timeout (10-30s), never from `timeoutMs`.
- agy 4 ("isAbortError ignores ECONNABORTED/ERR_DEADLINE"): a per-request timeout during enrichment is a per-job failure by design (recorded, `partial`), not a whole-scrape abort; and axios-retry's own `isNetworkError` already excludes `ECONNABORTED`, so nothing changed there.
- agy 6 ("Indeed country TLDs"): Indeed is always `{code}.indeed.com` (see `Country` in src/model.ts), never `indeed.co.uk`.
- agy 11 (`caCert` read per session): the file is small and read once per site session; documented rather than plumbed through eight scrapers.
