import { SupportedCountry } from '../types';

export const TEST_COUNTRIES = {
  // Basic countries for quick tests
  BASIC: ['usa', 'uk', 'canada'] as SupportedCountry[],

  // Major countries with good scraper support
  MAJOR: ['usa', 'uk', 'canada', 'germany', 'france', 'australia'] as SupportedCountry[],

  // Extended set for comprehensive testing
  EXTENDED: [
    'usa', 'uk', 'canada', 'germany', 'france', 'australia',
    'india', 'singapore', 'netherlands', 'spain', 'italy', 'brazil'
  ] as SupportedCountry[],

  // Country aliases for testing alias resolution
  ALIASES: [
    { input: 'us' as SupportedCountry, expected: 'usa' },
    { input: 'united states' as SupportedCountry, expected: 'usa' },
    { input: 'britain' as SupportedCountry, expected: 'uk' },
    { input: 'united kingdom' as SupportedCountry, expected: 'uk' },
    { input: 'czechia' as SupportedCountry, expected: 'czech republic' }
  ]
};

export const WORKING_SITES = ['indeed', 'linkedin'] as const;
export const MAINTENANCE_SITES = ['glassdoor', 'ziprecruiter', 'google', 'naukri', 'bayt', 'bdjobs'] as const;
export const ALL_SITES = [...WORKING_SITES, ...MAINTENANCE_SITES] as const;

export const TEST_SEARCH_TERMS = [
  'software engineer',
  'developer',
  'data scientist',
  'product manager',
  'full stack developer'
];

export const TEST_LOCATIONS = [
  'San Francisco, CA',
  'New York, NY',
  'London, UK',
  'Toronto, ON',
  'Sydney, Australia',
  'Berlin, Germany'
];

/**
 * Utility to test if a scraper is working
 */
export async function testScraperHealth(siteName: string): Promise<boolean> {
  try {
    const { scrapeJobs } = await import('../index');
    const jobs = await scrapeJobs({
      siteName: [siteName as any],
      searchTerm: 'engineer',
      countryIndeed: 'usa',
      resultsWanted: 1
    });
    return jobs.length > 0;
  } catch (error) {
    console.warn(`Scraper ${siteName} health check failed:`, error);
    return false;
  }
}

/**
 * Utility to validate job post structure
 */
export function validateJobPost(job: any): { valid: boolean; errors: string[]; } {
  const errors: string[] = [];

  // Required fields
  if (!job.title || typeof job.title !== 'string') {
    errors.push('Missing or invalid title');
  }

  if (!job.jobUrl || typeof job.jobUrl !== 'string') {
    errors.push('Missing or invalid jobUrl');
  }

  if (job.jobUrl && !job.jobUrl.match(/^https?:\/\//)) {
    errors.push('jobUrl is not a valid URL');
  }

  // Optional but should be correct type if present
  if (job.companyName && typeof job.companyName !== 'string') {
    errors.push('companyName should be string if present');
  }

  if (job.location && typeof job.location !== 'object') {
    errors.push('location should be object if present');
  }

  if (job.description && typeof job.description !== 'string') {
    errors.push('description should be string if present');
  }

  if (job.datePosted && typeof job.datePosted !== 'string') {
    errors.push('datePosted should be string if present');
  }

  if (job.jobType && !Array.isArray(job.jobType)) {
    errors.push('jobType should be array if present');
  }

  if (job.isRemote && typeof job.isRemote !== 'boolean') {
    errors.push('isRemote should be boolean if present');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Test helper to check if results contain expected site URLs
 */
export function validateJobSources(jobs: any[], expectedSites: string[]): { [site: string]: boolean; } {
  const results: { [site: string]: boolean; } = {};

  for (const site of expectedSites) {
    const sitePattern = getSiteUrlPattern(site);
    results[site] = jobs.some(job => sitePattern.test(job.jobUrl));
  }

  return results;
}

function getSiteUrlPattern(site: string): RegExp {
  const patterns: { [key: string]: RegExp; } = {
    'indeed': /indeed\.com/i,
    'linkedin': /linkedin\.com/i,
    'glassdoor': /glassdoor\.(com|co\.uk|ca|com\.au|de|fr|nl|es|it)/i,
    'ziprecruiter': /ziprecruiter\.com/i,
    'google': /google\.com/i,
    'naukri': /naukri\.com/i,
    'bayt': /bayt\.com/i,
    'bdjobs': /bdjobs\.com/i
  };

  return patterns[site] || /./;
}

/**
 * Performance testing helper
 */
export class PerformanceTimer {
  private startTime: number = 0;

  start(): void {
    this.startTime = Date.now();
  }

  end(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Mock data for testing when scrapers are down
 */
export const MOCK_JOB_DATA = {
  title: 'Software Engineer',
  companyName: 'Test Company',
  jobUrl: 'https://example.com/job/123',
  location: {
    city: 'San Francisco',
    state: 'CA',
    country: 'USA'
  },
  description: 'Test job description',
  datePosted: '2024-01-01',
  jobType: ['fulltime'],
  isRemote: false
};