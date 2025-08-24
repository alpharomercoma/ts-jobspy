import { JobDataFrame } from './models';
import { SCRAPER_MAPPING } from './scrapers';
import {
  Country,
  DescriptionFormat,
  JobPost,
  JobType,
  ScraperInput,
  Site,
  SiteName,
} from './types';
import { logger, normalizeSalaryToAnnual, parseSalary } from './utils';

export interface ScrapeJobsOptions {
  siteName?: SiteName | SiteName[] | Site | Site[];
  searchTerm?: string;
  googleSearchTerm?: string;
  location?: string;
  distance?: number;
  isRemote?: boolean;
  jobType?: string | JobType;
  easyApply?: boolean;
  resultsWanted?: number;
  countryIndeed?: string;
  proxies?: string[] | string;
  caCert?: string;
  descriptionFormat?: string | DescriptionFormat;
  linkedinFetchDescription?: boolean;
  linkedinCompanyIds?: number[];
  offset?: number;
  hoursOld?: number;
  enforceAnnualSalary?: boolean;
  verbose?: number;
  userAgent?: string;
}

export async function scrapeJobs(options: ScrapeJobsOptions = {}): Promise<JobDataFrame> {
  const {
    siteName,
    searchTerm,
    googleSearchTerm,
    location,
    distance = 50,
    isRemote,
    jobType,
    easyApply,
    resultsWanted = 15,
    countryIndeed,
    proxies,
    caCert,
    descriptionFormat,
    linkedinFetchDescription,
    linkedinCompanyIds,
    offset,
    hoursOld,
    enforceAnnualSalary,
    verbose = 1,
    userAgent,
  } = options;

  // Set logger level based on verbose
  if (verbose !== undefined) {
    const logLevel = verbose === 0 ? 0 : verbose === 1 ? 1 : 2;
    logger.setLevel(logLevel);
  }

  // Parse site types with comprehensive error handling
  const siteTypes = parseSiteTypes(siteName);

  // Parse job type
  const parsedJobType = parseJobType(jobType);

  // Parse country
  const country = countryIndeed ? Country.USA : Country.USA; // Default to USA

  // Parse description format
  const descFormat = typeof descriptionFormat === 'string'
    ? (descriptionFormat === 'html' ? DescriptionFormat.HTML : DescriptionFormat.MARKDOWN)
    : descriptionFormat || DescriptionFormat.MARKDOWN;

  const scraperInput: ScraperInput = {
    siteType: siteTypes,
    searchTerm: searchTerm,
    googleSearchTerm: googleSearchTerm,
    location,
    distance,
    isRemote: isRemote,
    jobType: parsedJobType,
    easyApply: easyApply,
    descriptionFormat: descFormat,
    linkedinFetchDescription: linkedinFetchDescription,
    resultsWanted: resultsWanted,
    linkedinCompanyIds: linkedinCompanyIds,
    offset,
    hoursOld: hoursOld,
    country,
  };

  const scraperConfig = {
    proxies,
    caCert: caCert,
    userAgent: userAgent,
  };

  // Run scrapers concurrently with enhanced error handling
  const scrapePromises = siteTypes.map(async (site) => {
    const ScraperClass = SCRAPER_MAPPING[site];
    if (!ScraperClass) {
      logger.warn(`No scraper available for site: ${site}`);
      return { site, jobs: [], error: `Scraper not implemented for ${site}` };
    }

    try {
      const scraper = new ScraperClass(scraperConfig);
      const response = await scraper.scrape(scraperInput);
      logger.info(`${site} scraping completed - found ${response.jobs.length} jobs`);
      return { site, jobs: response.jobs, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error scraping ${site}: ${errorMessage}`);
      return { site, jobs: [], error: errorMessage };
    }
  });

  const results = await Promise.allSettled(scrapePromises);

  // Combine and process all jobs with error tracking
  const allJobs: JobPost[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { site, jobs, error } = result.value;
      if (error) {
        errors.push(`${site}: ${error}`);
      }
      for (const job of jobs) {
        try {
          const processedJob = processJob(job, site, country, enforceAnnualSalary || false);
          allJobs.push(processedJob);
        } catch (jobError) {
          logger.warn(`Error processing job from ${site}:`, jobError);
        }
      }
    } else {
      errors.push(`Promise rejected: ${result.reason}`);
    }
  }

  // Sort jobs by site and date posted
  allJobs.sort((a, b) => {
    if (a.jobUrl !== b.jobUrl) {
      return a.jobUrl.localeCompare(b.jobUrl);
    }
    if (a.datePosted && b.datePosted) {
      return new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime();
    }
    return 0;
  });

  // Log results and any errors
  if (errors.length > 0) {
    logger.warn(`Scraping completed with ${errors.length} errors:`, errors);
  }

  logger.info(`Total jobs scraped: ${allJobs.length} from ${siteTypes.length} sites`);

  // Return empty result gracefully if no jobs found
  if (allJobs.length === 0) {
    logger.info('No jobs found. This is normal and not an error.');
  }

  return new JobDataFrame(allJobs);
}

// Helper functions
function parseSiteTypes(siteName?: SiteName | SiteName[] | Site | Site[]): Site[] {
  if (!siteName) return [Site.INDEED]; // Default to Indeed

  const sites = Array.isArray(siteName) ? siteName : [siteName];
  return sites.map(site => {
    if (typeof site === 'string') {
      // Map string literals to Site enum values
      const siteMap: Record<SiteName, Site> = {
        'linkedin': Site.LINKEDIN,
        'indeed': Site.INDEED,
        'ziprecruiter': Site.ZIP_RECRUITER,
        'glassdoor': Site.GLASSDOOR,
        'google': Site.GOOGLE,
        'bayt': Site.BAYT,
        'naukri': Site.NAUKRI,
        'bdjobs': Site.BDJOBS,
      };
      return siteMap[site] || Site.INDEED;
    }
    return site;
  });
}

function parseJobType(jobType?: string | JobType): JobType | undefined {
  if (!jobType) return undefined;
  if (typeof jobType === 'string') {
    const typeMap: Record<string, JobType> = {
      'fulltime': JobType.FULL_TIME,
      'parttime': JobType.PART_TIME,
      'contract': JobType.CONTRACT,
      'temporary': JobType.TEMPORARY,
      'internship': JobType.INTERNSHIP,
    };
    return typeMap[jobType.toLowerCase()];
  }
  return jobType;
}

function processJob(job: JobPost, site: Site, country: Country, enforceAnnualSalary: boolean): JobPost {
  const processedJob = { ...job };

  // Process salary if present
  if (job.description && !job.compensation) {
    const extractedSalary = parseSalary(job.description);
    if (extractedSalary) {
      processedJob.compensation = enforceAnnualSalary
        ? normalizeSalaryToAnnual(extractedSalary)
        : extractedSalary;
    }
  }

  return processedJob;
}

// Export types and utilities
export * from './models';
export { SCRAPER_MAPPING } from './scrapers';
export * from './types';
export * from './utils';

// Default export
export default scrapeJobs;
