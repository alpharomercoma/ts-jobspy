/**
 * Throughput benchmark across scraping strategies.
 *
 * Node is single-threaded with async I/O: "strategy" here means how many
 * sites overlap in flight (siteConcurrency), not OS threads. This measures
 * jobs/second and jobs/minute per site and overall, plus the failure rate,
 * for each strategy - all straight from result.meta, the same numbers users
 * get on every scrape.
 *
 * Usage: node scripts/benchmark.mjs [resultsWanted per site, default 15]
 * Requires a prior `npm run build` (imports from dist/). Live network.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { scrapeJobs, WORKING_SITES } = await import(join(root, 'dist/index.mjs'));

const resultsWanted = Number(process.argv[2] ?? 15);
const sites = [...WORKING_SITES];

const STRATEGIES = [
  { name: 'concurrent (default)', options: {} },
  { name: 'sequential (siteConcurrency: 1)', options: { siteConcurrency: 1 } },
];

const rows = [];
for (const strategy of STRATEGIES) {
  const result = await scrapeJobs({
    sites,
    searchTerm: 'software engineer',
    location: 'San Francisco, CA',
    resultsWanted,
    country: 'usa',
    ...strategy.options,
  });
  rows.push({ strategy: strategy.name, meta: result.meta });
}

const lines = [
  `Benchmark: ${sites.join(', ')} - ${resultsWanted} jobs/site, ${new Date().toISOString()}`,
  '',
  '| Strategy | Site | Jobs | Duration | Jobs/sec | Jobs/min | Status |',
  '|----------|------|------|----------|----------|----------|--------|',
];
for (const { strategy, meta } of rows) {
  for (const site of meta.sites) {
    lines.push(
      `| ${strategy} | ${site.site} | ${site.jobs} | ${(site.durationMs / 1000).toFixed(1)}s | ${site.jobsPerSecond} | ${Math.round(site.jobsPerSecond * 60)} | ${site.status} |`
    );
  }
  const totalJobs = meta.sites.reduce((acc, s) => acc + s.jobs, 0);
  lines.push(
    `| ${strategy} | **overall** | ${totalJobs} | ${(meta.totalDurationMs / 1000).toFixed(1)}s | ${meta.jobsPerSecond} | ${Math.round(meta.jobsPerSecond * 60)} | failureRate ${meta.failureRate} |`
  );
}
console.log(lines.join('\n'));
