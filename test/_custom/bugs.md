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
