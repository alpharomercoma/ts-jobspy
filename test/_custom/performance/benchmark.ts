/**
 * Performance Benchmark Tests for ts-jobspy
 *
 * Run with: npx ts-node test/_custom/performance/benchmark.ts
 */

import { scrapeJobs, Site } from '../../../src';

interface BenchmarkResult {
  site: string;
  duration: number;
  jobsFound: number;
  jobsPerSecond: number;
  success: boolean;
  error?: string;
}

async function benchmarkSite(
  site: Site,
  searchTerm: string,
  resultsWanted: number
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  try {
    const jobs = await scrapeJobs({
      siteName: site,
      searchTerm,
      resultsWanted,
      verbose: 0, // Suppress logs during benchmark
    });

    const duration = Date.now() - startTime;
    const jobsFound = jobs.length;
    const jobsPerSecond = jobsFound / (duration / 1000);

    return {
      site,
      duration,
      jobsFound,
      jobsPerSecond,
      success: true,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      site,
      duration,
      jobsFound: 0,
      jobsPerSecond: 0,
      success: false,
      error: (error as Error).message,
    };
  }
}

async function runBenchmarks(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ts-jobspy Performance Benchmarks');
  console.log('='.repeat(60));
  console.log();

  const searchTerm = 'software engineer';
  const resultsWanted = 20;

  const sites = Object.values(Site);
  const results: BenchmarkResult[] = [];

  for (const site of sites) {
    console.log(`Benchmarking ${site}...`);
    const result = await benchmarkSite(site, searchTerm, resultsWanted);
    results.push(result);

    if (result.success) {
      console.log(
        `  ✓ Found ${result.jobsFound} jobs in ${result.duration}ms (${result.jobsPerSecond.toFixed(2)} jobs/sec)`
      );
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log();

  console.log('| Site | Duration (ms) | Jobs Found | Jobs/sec | Status |');
  console.log('|------|---------------|------------|----------|--------|');

  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    console.log(
      `| ${result.site.padEnd(12)} | ${result.duration.toString().padStart(13)} | ${result.jobsFound.toString().padStart(10)} | ${result.jobsPerSecond.toFixed(2).padStart(8)} | ${status.padStart(6)} |`
    );
  }

  const successCount = results.filter((r) => r.success).length;
  const totalJobs = results.reduce((sum, r) => sum + r.jobsFound, 0);
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log();
  console.log(`Total: ${successCount}/${sites.length} sites successful`);
  console.log(`Total jobs found: ${totalJobs}`);
  console.log(`Total time: ${totalTime}ms`);
}

// Run if executed directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

export { benchmarkSite, runBenchmarks, BenchmarkResult };
