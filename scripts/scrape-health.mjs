/**
 * Daily scrape-health probe.
 *
 * Runs a small live scrape against each target site and compares the outcome
 * with scrape-health.expected.json. The goal is drift detection: we want to
 * know *when* a job board changes its API/markup or starts blocking us, and
 * conversely when a previously blocked site becomes reachable.
 *
 * Exit code is non-zero only when a site we expect to work regresses.
 * Improvements (a blocked site coming back) are reported but do not fail.
 *
 * Usage: node scripts/scrape-health.mjs [--json out.json]
 * Requires a prior `npm run build` (imports from dist/).
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { scrapeJobs } = await import(join(root, 'dist/index.mjs'));

const expected = JSON.parse(readFileSync(join(root, 'scripts/scrape-health.expected.json'), 'utf8'));

const PROBE = {
  searchTerm: 'software engineer',
  location: 'San Francisco, CA',
  resultsWanted: 5,
  countryIndeed: 'usa',
};

async function probe(site) {
  const t0 = Date.now();
  try {
    const { jobs, meta } = await scrapeJobs({ ...PROBE, sites: site });
    const siteMeta = meta.sites[0];
    const fieldCoverage = {
      title: jobs.filter((j) => j.title).length,
      company: jobs.filter((j) => j.company).length,
      datePosted: jobs.filter((j) => j.datePosted).length,
      description: jobs.filter((j) => j.description).length,
    };
    return {
      site,
      status: siteMeta.status,
      received: jobs.length,
      seconds: (Date.now() - t0) / 1000,
      fieldCoverage,
      ...(siteMeta.error && { error: `${siteMeta.error.name}: ${siteMeta.error.message}`.slice(0, 300) }),
    };
  } catch (err) {
    return {
      site,
      status: 'error',
      received: 0,
      seconds: (Date.now() - t0) / 1000,
      error: String(err?.message ?? err).slice(0, 300),
    };
  }
}

const results = [];
for (const site of Object.keys(expected.sites)) {
  results.push(await probe(site));
}

const report = {
  date: new Date().toISOString(),
  results,
};

const jsonOutIdx = process.argv.indexOf('--json');
if (jsonOutIdx !== -1 && process.argv[jsonOutIdx + 1]) {
  writeFileSync(process.argv[jsonOutIdx + 1], JSON.stringify(report, null, 2));
}

let regressions = 0;
let improvements = 0;
const lines = [
  '| Site | Expected | Actual | Jobs | Seconds | Verdict |',
  '|------|----------|--------|------|---------|---------|',
];
for (const r of results) {
  const exp = expected.sites[r.site];
  const working = r.status === 'ok' || r.status === 'partial';
  let verdict;
  if (exp.working && !working) {
    verdict = '🔴 REGRESSION';
    regressions += 1;
  } else if (!exp.working && working) {
    verdict = '🟢 IMPROVEMENT (update expected file)';
    improvements += 1;
  } else {
    verdict = working ? '✅ ok' : `⚪ still ${r.status} (known: ${exp.reason ?? 'n/a'})`;
  }
  lines.push(
    `| ${r.site} | ${exp.working ? 'working' : 'not working'} | ${r.status}${r.error ? ` (${r.error.slice(0, 80)})` : ''} | ${r.received} | ${r.seconds.toFixed(1)} | ${verdict} |`
  );
}

const summary = lines.join('\n');
console.log(summary);
console.log(JSON.stringify(report, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Scrape health — ${report.date}\n\n${summary}\n`
  );
}

if (regressions > 0) {
  console.error(`\n${regressions} site(s) regressed.`);
  process.exit(1);
}
if (improvements > 0) {
  console.error(
    `\n${improvements} previously blocked site(s) now respond — consider re-enabling and updating scripts/scrape-health.expected.json.`
  );
}
