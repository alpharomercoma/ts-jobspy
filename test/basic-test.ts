import { scrapeJobs } from '../src';

async function testBasicScraping() {
  console.log('Testing ts-jobspy basic functionality...');

  try {
    const jobs = await scrapeJobs({
      siteName: ['indeed'],
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 3,
      verbose: 2,
    });

    console.log(`\n✅ Successfully scraped ${jobs.length} jobs`);
    
    if (jobs.length > 0) {
      console.log('\nFirst job:');
      const firstJob = jobs[0];
      console.log(`- Title: ${firstJob.title}`);
      console.log(`- Company: ${firstJob.companyName || 'N/A'}`);
      console.log(`- URL: ${firstJob.jobUrl}`);
      console.log(`- Location: ${(firstJob as any).location || 'N/A'}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testBasicScraping().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { testBasicScraping };
