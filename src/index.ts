import { CountryHelper } from './models';
import { JobDataFrame } from './models/JobDataFrame';
import { SCRAPER_MAPPING } from './scrapers';
import {
  Country,
  JobPost,
  JobType,
  ScrapeJobsOptions,
  ScraperInput,
  Site,
  SiteName,
} from './types';

export { JobDataFrame } from './models/JobDataFrame';

/**
 * Main function to scrape jobs from various job sites.
 *
 * @param options - Configuration options for scraping
 * @returns Promise<JobDataFrame> - JobDataFrame with scraped job posts
 *
 * @example
 * ```typescript
 * const jobs = await scrapeJobs({
 *   siteName: ['indeed'],
 *   searchTerm: 'software engineer',
 *   location: 'San Francisco, CA',
 *   resultsWanted: 50,
 *   countryIndeed: 'usa'
 * });
 *
 * console.log(jobs.head(5));
 * await jobs.toCsv('jobs.csv');
 * ```
 */
export async function scrapeJobs(options: ScrapeJobsOptions): Promise<JobDataFrame> {
  const {
    siteName = ['indeed'],
    searchTerm = '',
    location = '',
    resultsWanted = 15,
    countryIndeed = Country.USA,
  } = options;

  // Handle edge cases for resultsWanted
  if (resultsWanted <= 0) {
    return new JobDataFrame([]);
  }

  // Convert siteName to Site enum array
  const sites = Array.isArray(siteName) ? siteName : [siteName];
  const siteEnums = sites.map(name => mapSiteNameToEnum(name as SiteName));

  // Handle edge case for empty site names
  if (siteEnums.length === 0) {
    return new JobDataFrame([]);
  }

  // Convert countryIndeed to Country enum
  const country = typeof countryIndeed === 'string'
    ? CountryHelper.stringToCountry(countryIndeed)
    : countryIndeed;

  // Prepare scraper input
  const scraperInput: ScraperInput = {
    siteType: siteEnums,
    searchTerm,
    googleSearchTerm: options.googleSearchTerm,
    location,
    country,
    resultsWanted,
    distance: options.distance,
    isRemote: options.isRemote,
    jobType: options.jobType ? mapJobTypeToEnum(options.jobType) : undefined,
    easyApply: options.easyApply,
    offset: options.offset,
    linkedinFetchDescription: options.linkedinFetchDescription,
    linkedinCompanyIds: options.linkedinCompanyIds,
    descriptionFormat: options.descriptionFormat,
    hoursOld: options.hoursOld,
  };

  const allJobs: JobPost[] = [];
  const jobsPerSite = Math.ceil(resultsWanted / siteEnums.length);

  // Scrape from each site
  for (const site of siteEnums) {
    try {
      const ScraperClass = SCRAPER_MAPPING[site];
      if (!ScraperClass) {
        console.warn(`No scraper found for site: ${site}`);
        continue;
      }

      const scraper = new ScraperClass({
        proxies: options.proxies,
        userAgent: options.userAgent,
      });

      const siteInput = {
        ...scraperInput,
        siteType: [site],
        resultsWanted: jobsPerSite,
      };

      const response = await scraper.scrape(siteInput);
      allJobs.push(...response.jobs);
    } catch (error) {
      console.error(`Error scraping ${site}:`, error);
    }
  }

  // Limit to requested results
  const finalJobs = allJobs.slice(0, resultsWanted);

  return new JobDataFrame(finalJobs);
}

function mapSiteNameToEnum(siteName: SiteName): Site {
  const mapping: Record<SiteName, Site> = {
    'indeed': Site.INDEED,
    'linkedin': Site.LINKEDIN,
    'ziprecruiter': Site.ZIP_RECRUITER,
    'glassdoor': Site.GLASSDOOR,
    'google': Site.GOOGLE,
    'bayt': Site.BAYT,
    'naukri': Site.NAUKRI,
    'bdjobs': Site.BDJOBS,
  };
  return mapping[siteName];
}

function mapJobTypeToEnum(jobType: string): JobType {
  const mapping: Record<string, JobType> = {
    'fulltime': JobType.FULL_TIME,
    'full-time': JobType.FULL_TIME,
    'parttime': JobType.PART_TIME,
    'part-time': JobType.PART_TIME,
    'contract': JobType.CONTRACT,
    'temporary': JobType.TEMPORARY,
    'internship': JobType.INTERNSHIP,
    'perdiem': JobType.PER_DIEM,
    'nights': JobType.NIGHTS,
    'other': JobType.OTHER,
    'summer': JobType.SUMMER,
    'volunteer': JobType.VOLUNTEER,
  };
  return mapping[jobType.toLowerCase()] || JobType.FULL_TIME;
}

// Export only consumer-facing types (not internal enums)
export type {
  Compensation, CompensationInterval,
  DescriptionFormat, JobPost, JobType, Location, SalarySource, ScrapeJobsOptions, Site, SiteName,
  SupportedCountry
} from './types';

// Default export
export default scrapeJobs;
