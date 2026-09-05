# Migrating from v2 to v3

v3 is where ts-jobspy diverges from python-jobspy into its own API. The v2 line
(upstream-parity) is preserved on the `python-jobspy-parity` branch and will
receive critical fixes only.

## The result shape changed

**v2** returned a flat array. **v3** returns `{ jobs, meta }`:

```typescript
// v2
const jobs = await scrapeJobs({ ... });
jobs.length;

// v3
const { jobs, meta } = await scrapeJobs({ ... });
jobs.length;
meta.sites; // per-site status/count/duration/error - check this to know how the scrape really went
```

## Option renames

| v2 | v3 |
|----|----|
| `siteName` | `sites` |
| `countryIndeed` | `country` |
| `linkedinFetchDescription` | `linkedin.fetchDescription` |
| `linkedinCompanyIds` | `linkedin.companyIds` |
| `googleSearchTerm` | `google.searchTerm` |

## Behavior changes

- **Default sites**: omitting `sites` now scrapes only the currently working
  sites (`indeed`, `linkedin`) instead of all eight, most of which are blocked.
- **Validation is strict**: an unknown site, jobType, country, or
  descriptionFormat, or a negative number, throws `InvalidInputError`
  immediately. v2 silently fell back to defaults.
- **Failures are visible**: v2 scrapers swallowed errors and returned empty
  arrays. In v3 each site's outcome is reported in `meta.sites[]` as
  `ok`, `empty`, `partial` (some jobs collected, then interrupted), or `error`
  (with the error attached). A site that cannot honor an option you set lists it
  in `meta.sites[].unsupportedOptions`, so a dropped filter is never silent. One site failing no
  longer loses the others' results; pass `strict: true` for all-or-nothing.
- **Arrays are arrays**: `jobType`, `emails`, and `skills` on each job were
  comma-joined strings in v2; in v3 they are `jobTypes: string[]`,
  `emails: string[]`, `skills: string[]`.

## New capabilities

- `dedupe: 'url' | 'content' | boolean` - cross-site duplicate removal.
- `meta.totalDurationMs`, `meta.sites[].durationMs` - built-in timing.
- Exported constants `WORKING_SITES` / `UNDER_MAINTENANCE_SITES` and types
  `ScrapeOptions`, `ScrapeResult`, `Job`, `SiteMeta` for full type-safe usage.

## v3.0 also removes the default export

`import scrapeJobs from 'ts-jobspy'` no longer works - use the named import:
`import { scrapeJobs } from 'ts-jobspy'`.
