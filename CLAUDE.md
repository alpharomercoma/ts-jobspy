# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ts-jobspy** is an npm library that scrapes job postings from job boards. It began as a TypeScript port of python-jobspy; as of v3 it is its own project with its own API (see MIGRATION.md). Branches: `main` is the v3+ line, `python-jobspy-parity` preserves the v2 upstream-parity line (critical fixes only), `v1-legacy` is v1.

Only **Indeed** and **LinkedIn** scrapers currently work; Glassdoor, ZipRecruiter, Google, Bayt, Naukri, and BDJobs exist in the codebase but are blocked/untested (Google serves a JS-wall to non-browser clients; Glassdoor/ZipRecruiter/Bayt are TLS-fingerprint blocked). Keep `WORKING_SITES` in `src/options.ts`, the README status table, and `scripts/scrape-health.expected.json` in sync with which scrapers actually work.

Requires Node.js >= 20 (undici/cheerio `File` global compatibility).

## Commands

```bash
npm run build          # tsup: bundles src/index.ts to dist/ (CJS + ESM + .d.ts)
npm run lint           # biome check src test (warnings don't fail; errors do)
npm run lint:fix       # biome check --write
npm run format         # biome format --write
npm test               # jest unit tests (test/_custom/ is excluded via testPathIgnorePatterns)
npm test -- test/util.test.ts          # single test file
npm test -- -t "extractSalary"         # tests matching name
npm run test:coverage
npm run test:integration   # live-network tests (test/_custom/integration) - flaky by nature
node scripts/scrape-health.mjs         # live probe of site status vs expectations (needs build)
```

The two working scrapers are best smoke-tested via a small `scrapeJobs({ sites: ['indeed', 'linkedin'], ... })` script against `dist/` from an adjacent folder (e.g. `../ts-jobspy-testbed`). Google blocks datacenter IPs and non-browser clients outright.

## Architecture (v3)

- `src/index.ts` - public API. `scrapeJobs(options)` resolves options, runs one scraper per requested site concurrently with per-site error isolation, flattens each `JobPost` into the public `Job` shape, sorts, optionally dedupes, and returns `{ jobs, meta }` where `meta.sites[]` reports each site's status ('ok' | 'empty' | 'partial' | 'error'), count, duration, per-site `jobsPerSecond`, any error, and `unsupportedOptions` (set options the site could not honor). On `timeoutMs` it aborts in-flight requests and salvages partial results. Internal scraper classes and the `Scraper`/`ScraperInput`/`JobPost` contract are NOT part of the public export surface.
- `src/options.ts` - v3 option types (`ScrapeOptions`) and `resolveOptions()`: strict validation that throws `InvalidInputError` on anything invalid (never silently coerces). Site-scoped options live under `linkedin:` and `google:` keys. `WORKING_SITES` / `UNDER_MAINTENANCE_SITES` are the source of truth for site status.
- `src/result.ts` - result schema: `Job`, `ScrapeResult`, `SiteMeta`.
- `src/dedupe.ts` - cross-site dedupe ('url' exact; 'content' = normalized title+company+location).
- `src/model.ts` - shared internal types/enums: `Site`, `JobType` (multilingual variations), `Country` (Indeed domain mappings), `JobPost`, `ScraperInput`, the abstract `Scraper` contract.
- `src/util.ts` - axios session factory with retry + rotating proxies (`createSession`), HTML→markdown/plain conversion, salary extraction (`extractSalary`, `convertToAnnual`), logger.
- `src/<site>/` - one directory per board: `index.ts` (implements `Scraper.scrape(input)`), `constant.ts` (headers/queries), `util.ts` (parsers). Cheerio for HTML sites; JSON/GraphQL for Indeed/Glassdoor.

Adding or fixing a scraper: implement `Scraper` in `src/<site>/`, register in `SCRAPER_MAPPING` in `src/index.ts`, and move the site into `WORKING_SITES` in `src/options.ts` once verified live.

## CI/Publishing

`.github/workflows/ci.yml` runs Biome → jest → build on a Node 20/22/24 matrix for every push/PR to main, and auto-publishes to npm on push to main **only when package.json's version is not yet on the registry** (with npm provenance). A publish E404 means the `NPM_TOKEN` secret is invalid/expired - rotate it in repo secrets.

`.github/workflows/scrape-health.yml` runs daily: live-probes each site and compares with `scripts/scrape-health.expected.json`; fails only when a site expected to work regresses, and flags improvements so blocked scrapers can be re-enabled.

## Notes

- Biome is the linter/formatter (`biome.json`); `noConsole`/`noExplicitAny` warn - use `createLogger`, not `console`.
- `test/_custom/bugs.md` tracks known bugs/limitations and live verification results.
- Public API changes must keep README's Options/Result sections and MIGRATION.md accurate.
