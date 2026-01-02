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
