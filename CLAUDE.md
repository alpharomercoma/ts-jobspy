# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ts-jobspy** is an npm library (TypeScript port of python-jobspy) that scrapes job postings from job boards. Only **LinkedIn** and **Indeed** scrapers currently work; Glassdoor, ZipRecruiter, Google, Bayt, Naukri, and BDJobs exist in the codebase but are "under maintenance" (still exported for future use). Keep the `SupportedSiteName` type in `src/model.ts` and README claims in sync with which scrapers actually work.

Requires Node.js >= 20 (undici/cheerio `File` global compatibility).

## Commands

```bash
npm run build          # tsup: bundles src/index.ts to dist/ (CJS + ESM + .d.ts)
npm run lint           # eslint src --ext .ts
npm run lint:fix
npm test               # jest unit tests (test/_custom/ is excluded via testPathIgnorePatterns)
npm test -- test/util.test.ts          # single test file
npm test -- -t "extractSalary"         # tests matching name
npm run test:coverage
npm run test:integration   # live-network tests (test/_custom/integration) — hit real job boards, flaky by nature
```

**Warning:** the integration tests make real network requests and risk rate limiting (Google blocks datacenter IPs outright with 429/sorry-page — its scraper is under maintenance anyway). They currently all go through Google, so failures there usually mean IP blocking, not code breakage. The two working scrapers are best smoke-tested directly via a small `scrapeJobs({ siteName: 'indeed' | 'linkedin', ... })` script against `dist/`.

## Architecture

- `src/index.ts` — public API. `scrapeJobs(options)` normalizes options, instantiates one scraper per requested site from `SCRAPER_MAPPING`, runs them concurrently via `Promise.all`, then flattens each `JobPost` into the flat `JobData` output shape (`processJobToData`), sorting by site then date.
- `src/model.ts` — all shared types/enums: `Site`, `JobType` (with multilingual string variations for matching), `Country` (Indeed domain mappings), `JobPost`, `ScraperInput`, and the abstract `Scraper` contract every scraper implements.
- `src/util.ts` — shared infrastructure: axios session factory with retry + rotating proxy support (`createSession`, `RotatingProxySession`), HTML→markdown/plain conversion, salary extraction from descriptions (`extractSalary`, `convertToAnnual`), logger.
- `src/<site>/` — one directory per job board, each with `index.ts` (scraper class implementing `Scraper.scrape(input): Promise<JobResponse>`), `constant.ts` (headers, API queries), and `util.ts` (site-specific parsers). Scrapers fetch via the shared session, parse with cheerio (HTML sites) or hit JSON/GraphQL APIs (Indeed, Glassdoor).

Adding or fixing a scraper means: implement the `Scraper` interface in `src/<site>/`, register it in `SCRAPER_MAPPING` in `src/index.ts`, and widen `SupportedSiteName` in `src/model.ts` once it works.

## CI/Publishing

`.github/workflows/ci.yml` runs lint → test → build on every push/PR to main, and **auto-publishes to npm on every push to main** (version bump in package.json required for publish to succeed). `npm test` in CI runs unit tests only.

## Notes

- ESLint is strict: type-checked rules, `prefer-nullish-coalescing` and `prefer-optional-chain` are errors, `no-console` warns (use the `createLogger` utility instead of `console`).
- `test/_custom/bugs.md` tracks known bugs/limitations of both this port and upstream python-jobspy.
