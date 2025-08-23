import {
  Site,
  ScraperInput,
  JobResponse,
  JobPost,
  JobType,
  Country,
  CompensationInterval,
  DescriptionFormat,
  SalarySource,
} from './types';
import { SCRAPER_MAPPING } from './scrapers';
import { createLogger, extractSalary, convertToAnnual, DESIRED_COLUMN_ORDER } from './utils';
import { CountryHelper, JobTypeHelper, JobDataFrame } from './models';

const logger = createLogger('JobSpy');

export interface ScrapeJobsOptions {
  site_name?: string | string[] | Site | Site[];
  search_term?: string;
  google_search_term?: string;
  location?: string;
  distance?: number;
  is_remote?: boolean;
  job_type?: string | JobType;
  easy_apply?: boolean;
  results_wanted?: number;
  country_indeed?: string;
  proxies?: string[] | string;
  ca_cert?: string;
  description_format?: string | DescriptionFormat;
  linkedin_fetch_description?: boolean;
  linkedin_company_ids?: number[];
  offset?: number;
  hours_old?: number;
  enforce_annual_salary?: boolean;
  verbose?: number;
  user_agent?: string;
}

export async function scrapeJobs(options: ScrapeJobsOptions = {}): Promise<JobDataFrame> {
  const {
    site_name,
    search_term,
    google_search_term,
    location,
    distance = 50,
    is_remote = false,
    job_type,
    easy_apply,
    results_wanted = 15,
    country_indeed = 'usa',
    proxies,
    ca_cert,
    description_format = 'markdown',
    linkedin_fetch_description = false,
    linkedin_company_ids,
    offset = 0,
    hours_old,
    enforce_annual_salary = false,
    verbose = 0,
    user_agent,
  } = options;

  // Set logger level based on verbose
  const logLevel = verbose === 0 ? 'error' : verbose === 1 ? 'warn' : 'info';
  logger.setLevel(logLevel);

  // Parse site types
  const siteTypes = parseSiteTypes(site_name);
  
  // Parse job type
  const parsedJobType = parseJobType(job_type);
  
  // Parse country
  const country = CountryHelper.fromString(country_indeed);
  
  // Parse description format
  const descFormat = typeof description_format === 'string' 
    ? (description_format === 'html' ? DescriptionFormat.HTML : DescriptionFormat.MARKDOWN)
    : description_format;

  const scraperInput: ScraperInput = {
    siteType: siteTypes,
    searchTerm: search_term,
    googleSearchTerm: google_search_term,
    location,
    distance,
    isRemote: is_remote,
    jobType: parsedJobType,
    easyApply: easy_apply,
    descriptionFormat: descFormat,
    linkedinFetchDescription: linkedin_fetch_description,
    resultsWanted: results_wanted,
    linkedinCompanyIds: linkedin_company_ids,
    offset,
    hoursOld: hours_old,
    country,
  };

  const scraperConfig = {
    proxies,
    caCert: ca_cert,
    userAgent: user_agent,
  };

  // Run scrapers concurrently
  const scrapePromises = siteTypes.map(async (site) => {
    const ScraperClass = SCRAPER_MAPPING[site];
    if (!ScraperClass) {
      logger.warn(`No scraper available for site: ${site}`);
      return { site, jobs: [] };
    }

    try {
      const scraper = new ScraperClass(scraperConfig);
      const response = await scraper.scrape(scraperInput);
      logger.info(`${site} scraping completed`);
      return { site, jobs: response.jobs };
    } catch (error) {
      logger.error(`Error scraping ${site}:`, error);
      return { site, jobs: [] };
    }
  });

  const results = await Promise.all(scrapePromises);
  
  // Combine and process all jobs
  const allJobs: JobPost[] = [];
  
  for (const { site, jobs } of results) {
    for (const job of jobs) {
      const processedJob = processJob(job, site, country, enforce_annual_salary);
      allJobs.push(processedJob);
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

  logger.info(`Total jobs scraped: ${allJobs.length}`);
  return new JobDataFrame(allJobs);
}

function parseSiteTypes(siteName?: string | string[] | Site | Site[]): Site[] {
  if (!siteName) {
    return Object.values(Site);
  }

  if (typeof siteName === 'string') {
    return [mapStringToSite(siteName)];
  }

  if (Array.isArray(siteName)) {
    return siteName.map(site => 
      typeof site === 'string' ? mapStringToSite(site) : site
    );
  }

  return [siteName];
}

function mapStringToSite(siteName: string): Site {
  const mapping: Record<string, Site> = {
    'linkedin': Site.LINKEDIN,
    'indeed': Site.INDEED,
    'zip_recruiter': Site.ZIP_RECRUITER,
    'ziprecruiter': Site.ZIP_RECRUITER,
    'glassdoor': Site.GLASSDOOR,
    'google': Site.GOOGLE,
    'bayt': Site.BAYT,
    'naukri': Site.NAUKRI,
    'bdjobs': Site.BDJOBS,
  };

  const site = mapping[siteName.toLowerCase()];
  if (!site) {
    throw new Error(`Invalid site name: ${siteName}`);
  }

  return site;
}

function parseJobType(jobType?: string | JobType): JobType | undefined {
  if (!jobType) return undefined;
  
  if (typeof jobType === 'string') {
    return JobTypeHelper.fromString(jobType) || undefined;
  }
  
  return jobType;
}

function processJob(
  job: JobPost, 
  site: Site, 
  country: Country, 
  enforceAnnualSalary: boolean
): JobPost {
  const processedJob = { ...job };
  
  // Add site information
  (processedJob as any).site = site;
  
  // Process company name
  if (processedJob.companyName) {
    (processedJob as any).company = processedJob.companyName;
  }
  
  // Process job types
  if (processedJob.jobType && processedJob.jobType.length > 0) {
    (processedJob as any).jobType = processedJob.jobType.map(type => type.toString()).join(', ');
  }
  
  // Process emails
  if (processedJob.emails && processedJob.emails.length > 0) {
    (processedJob as any).emails = processedJob.emails.join(', ');
  }
  
  // Process location
  if (processedJob.location) {
    (processedJob as any).location = formatLocation(processedJob.location);
  }
  
  // Process compensation
  if (processedJob.compensation) {
    const comp = processedJob.compensation;
    (processedJob as any).interval = comp.interval;
    (processedJob as any).minAmount = comp.minAmount;
    (processedJob as any).maxAmount = comp.maxAmount;
    (processedJob as any).currency = comp.currency || 'USD';
    (processedJob as any).salarySource = SalarySource.DIRECT_DATA;
    
    if (enforceAnnualSalary && comp.interval && comp.interval !== CompensationInterval.YEARLY) {
      const annualComp = convertToAnnual(comp);
      (processedJob as any).interval = annualComp.interval;
      (processedJob as any).minAmount = annualComp.minAmount;
      (processedJob as any).maxAmount = annualComp.maxAmount;
    }
  } else if (country === Country.USA && processedJob.description) {
    // Try to extract salary from description
    const salaryInfo = extractSalary(processedJob.description, { enforceAnnualSalary });
    if (salaryInfo.interval) {
      (processedJob as any).interval = salaryInfo.interval;
      (processedJob as any).minAmount = salaryInfo.minAmount;
      (processedJob as any).maxAmount = salaryInfo.maxAmount;
      (processedJob as any).currency = salaryInfo.currency;
      (processedJob as any).salarySource = SalarySource.DESCRIPTION;
    }
  }
  
  // Set salary source to null if no salary data
  if (!(processedJob as any).minAmount) {
    (processedJob as any).salarySource = null;
  }
  
  return processedJob;
}

function formatLocation(location: any): string {
  const parts: string[] = [];
  
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country) {
    if (typeof location.country === 'string') {
      parts.push(location.country);
    } else {
      const countryName = location.country.toString();
      if (countryName === 'usa' || countryName === 'uk') {
        parts.push(countryName.toUpperCase());
      } else {
        parts.push(countryName.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()));
      }
    }
  }
  
  return parts.join(', ');
}

// Export types and utilities
export * from './types';
export * from './models';
export * from './utils';
export { SCRAPER_MAPPING } from './scrapers';

// Default export
export default scrapeJobs;
