import { scrapeJobs } from '../src';

async function basicExample() {
  console.log('Starting basic job scraping example...');

  try {
    const jobs = await scrapeJobs({
      siteName: ['indeed', 'ziprecruiter'],
      searchTerm: 'software engineer',
      location: 'San Francisco, CA',
      resultsWanted: 10,
      verbose: 2,
    });

    console.log(`\nFound ${jobs.length} jobs:`);
    
    jobs.forEach((job, index) => {
      console.log(`\n${index + 1}. ${job.title}`);
      console.log(`   Company: ${job.companyName || 'N/A'}`);
      console.log(`   Location: ${(job as any).location || 'N/A'}`);
      console.log(`   URL: ${job.jobUrl}`);
      if ((job as any).minAmount && (job as any).maxAmount) {
        console.log(`   Salary: $${(job as any).minAmount} - $${(job as any).maxAmount} ${(job as any).interval || ''}`);
      }
    });

  } catch (error) {
    console.error('Error scraping jobs:', error);
  }
}

// Run the example
if (require.main === module) {
  basicExample();
}
