import { scrapeJobs } from '../src';

async function basicExample() {
  console.log('Starting comprehensive job scraping example...');

  try {
    // Multi-site scraping with all available scrapers
    const jobs = await scrapeJobs({
      siteName: ['indeed', 'linkedin', 'glassdoor', 'google', 'naukri'],
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 25,
      countryIndeed: 'usa',
      hoursOld: 72,
      jobType: 'fulltime',
      isRemote: false,
      verbose: 2,
    });

    console.log(`\nFound ${jobs.length} jobs from multiple sites:`);

    // Display first few jobs with enhanced data
    console.log('\n📋 Sample Jobs:');
    jobs.head(3).forEach((job, index) => {
      console.log(`\n${index + 1}. ${job.title} at ${job.companyName}`);
      console.log(`   🔗 ${job.jobUrl}`);
      console.log(`   📍 ${job.location?.city}, ${job.location?.state}`);
      console.log(`   💰 ${job.compensation?.minAmount ? `$${job.compensation.minAmount}-${job.compensation.maxAmount} ${job.compensation.interval}` : 'Not specified'}`);
      console.log(`   🏠 Remote: ${job.isRemote ? 'Yes' : 'No'}`);
    });

    // Filter and analyze data using JobDataFrame methods
    const remoteJobs = jobs.filter(job => job.isRemote);
    const companyCounts = jobs.groupBy('companyName');

    console.log(`\n📊 Analysis:`);
    console.log(`   Remote jobs: ${remoteJobs.length}/${jobs.length}`);
    console.log(`   Unique companies: ${Object.keys(companyCounts).length}`);

    // Export with enhanced options
    await jobs.toCsv('enhanced-jobs.csv', {
      quoting: 'nonnumeric'
    });
    await jobs.toJson('enhanced-jobs.json', { pretty: true });

    console.log('\n✅ Files exported: enhanced-jobs.csv, enhanced-jobs.json');

  } catch (error) {
    console.error('❌ Error scraping jobs:', error);
  }
}

async function internationalExample() {
  console.log('\n🌍 Starting international job search example...');

  try {
    // Search multiple international job boards
    const [indiaJobs, middleEastJobs, bangladeshJobs] = await Promise.allSettled([
      scrapeJobs({
        siteName: 'naukri',
        searchTerm: 'software developer',
        location: 'Mumbai',
        resultsWanted: 10,
        countryIndeed: 'india',
      }),
      scrapeJobs({
        siteName: 'bayt',
        searchTerm: 'developer',
        location: 'Dubai',
        resultsWanted: 10,
        countryIndeed: 'united arab emirates',
      }),
      scrapeJobs({
        siteName: 'bdjobs',
        searchTerm: 'programmer',
        location: 'Dhaka',
        resultsWanted: 10,
        countryIndeed: 'bangladesh',
      })
    ]);

    console.log('\n📊 International Results:');
    if (indiaJobs.status === 'fulfilled') {
      console.log(`   🇮🇳 India (Naukri): ${indiaJobs.value.length} jobs`);
    }
    if (middleEastJobs.status === 'fulfilled') {
      console.log(`   🇦🇪 Middle East (Bayt): ${middleEastJobs.value.length} jobs`);
    }
    if (bangladeshJobs.status === 'fulfilled') {
      console.log(`   🇧🇩 Bangladesh (BDJobs): ${bangladeshJobs.value.length} jobs`);
    }

  } catch (error) {
    console.error('❌ Error in international search:', error);
  }
}

// Run both examples
if (require.main === module) {
  (async () => {
    await basicExample();
    await internationalExample();
  })();
}
