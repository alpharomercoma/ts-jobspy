/**
 * ts-jobspy - TypeScript Job Scraper
 *
 * A TypeScript port of python-jobspy for scraping job postings from
 * LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google, Bayt, Naukri, and BDJobs.
 *
 * Original: https://github.com/speedyapply/JobSpy
 * Original authors:
 * - Cullen Watson (cullen@cullenwatson.com)
 * - Zachary Hampton (zachary@zacharysproducts.com)
 */

import {
  Site,
  JobType,
  Country,
  JobPost,
  JobResponse,
  ScraperInput,
  ScrapeJobsOptions,
  Scraper,
  Compensation,
  CompensationInterval,
  Location,
  SalarySource,
  DescriptionFormat,
  displayLocation,
  getCountryFromString,
  DESIRED_ORDER,
} from './model';

import {
  setLoggerLevel,
  extractSalary,
  createLogger,
  getEnumFromValue,
  mapStrToSite,
  convertToAnnual,
} from './util';

// Import scrapers
import { LinkedIn } from './linkedin';
import { Indeed } from './indeed';
import { ZipRecruiter } from './ziprecruiter';
import { Glassdoor } from './glassdoor';
import { Google } from './google';
import { BaytScraper } from './bayt';
import { Naukri } from './naukri';
import { BDJobs } from './bdjobs';

// Export all types and classes
export {
  Site,
  JobType,
  Country,
  CompensationInterval,
  SalarySource,
  DescriptionFormat,
  displayLocation,
  getCountryFromString,
  DESIRED_ORDER,
  LinkedIn,
  Indeed,
  ZipRecruiter,
  Glassdoor,
  Google,
  BaytScraper,
  Naukri,
  BDJobs,
};

// Export types separately
export type {
  JobPost,
  JobResponse,
  ScraperInput,
  ScrapeJobsOptions,
  Scraper,
  Compensation,
  Location,
};

// Export exceptions
export * from './exception';

// Export utilities
export {
  setLoggerLevel,
  extractSalary,
  createLogger,
  getEnumFromValue,
  mapStrToSite,
  convertToAnnual,
} from './util';

const log = createLogger('Main');

/**
 * Scraper mapping
 */
const SCRAPER_MAPPING: Record<Site, new (options: { proxies?: string[]; caCert?: string; userAgent?: string }) => Scraper> = {
  [Site.LINKEDIN]: LinkedIn,
  [Site.INDEED]: Indeed,
  [Site.ZIP_RECRUITER]: ZipRecruiter,
  [Site.GLASSDOOR]: Glassdoor,
  [Site.GOOGLE]: Google,
  [Site.BAYT]: BaytScraper,
  [Site.NAUKRI]: Naukri,
  [Site.BDJOBS]: BDJobs,
};

/**
 * Output job data interface (flattened for export)
 */
export interface JobData {
  id: string | null;
  site: string;
  jobUrl: string;
  jobUrlDirect: string | null;
  title: string;
  company: string | null;
  location: string | null;
  datePosted: string | null;
  jobType: string | null;
  salarySource: string | null;
  interval: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
  isRemote: boolean | null;
  jobLevel: string | null;
  jobFunction: string | null;
  listingType: string | null;
  emails: string | null;
  description: string | null;
  companyIndustry: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  companyUrlDirect: string | null;
  companyAddresses: string | null;
  companyNumEmployees: string | null;
  companyRevenue: string | null;
  companyDescription: string | null;
  // Naukri-specific
  skills: string | null;
  experienceRange: string | null;
  companyRating: number | null;
  companyReviewsCount: number | null;
  vacancyCount: number | null;
  workFromHomeType: string | null;
}

/**
 * Main function to scrape jobs from multiple job boards concurrently
 */
export async function scrapeJobs(options: ScrapeJobsOptions = {}): Promise<JobData[]> {
  const {
    siteName,
    searchTerm,
    googleSearchTerm,
    location,
    distance = 50,
    isRemote = false,
    jobType,
    easyApply,
    resultsWanted = 15,
    countryIndeed = 'usa',
    proxies,
    caCert,
    descriptionFormat = 'markdown',
    linkedinFetchDescription = false,
    linkedinCompanyIds,
    offset = 0,
    hoursOld,
    enforceAnnualSalary = false,
    verbose = 2,
    userAgent,
  } = options;

  setLoggerLevel(verbose);

  // Parse job type
  let jobTypeEnum: JobType | undefined;
  if (jobType) {
    try {
      jobTypeEnum = getEnumFromValue(jobType);
    } catch {
      jobTypeEnum = undefined;
    }
  }

  // Get site types
  const getSiteTypes = (): Site[] => {
    if (!siteName) {
      return Object.values(Site);
    }

    if (typeof siteName === 'string') {
      return [mapStrToSite(siteName)];
    }

    if (Array.isArray(siteName)) {
      return siteName.map((s) =>
        typeof s === 'string' ? mapStrToSite(s) : s
      );
    }

    return [siteName as Site];
  };

  const siteTypes = getSiteTypes();

  // Parse country
  let countryEnum: Country;
  try {
    countryEnum = getCountryFromString(countryIndeed);
  } catch {
    countryEnum = Country.USA;
  }

  // Parse description format
  let descFormat: DescriptionFormat;
  switch (descriptionFormat.toLowerCase()) {
    case 'html':
      descFormat = DescriptionFormat.HTML;
      break;
    case 'plain':
      descFormat = DescriptionFormat.PLAIN;
      break;
    default:
      descFormat = DescriptionFormat.MARKDOWN;
  }

  // Build scraper input
  const scraperInput: ScraperInput = {
    siteType: siteTypes,
    country: countryEnum,
    searchTerm,
    googleSearchTerm,
    location,
    distance,
    isRemote,
    jobType: jobTypeEnum,
    easyApply,
    descriptionFormat: descFormat,
    linkedinFetchDescription,
    resultsWanted,
    linkedinCompanyIds,
    offset,
    hoursOld,
  };

  // Parse proxies
  let proxyList: string[] | undefined;
  if (proxies) {
    proxyList = typeof proxies === 'string' ? [proxies] : proxies;
  }

  // Scrape function for a single site
  const scrapeSite = async (
    site: Site
  ): Promise<{ site: string; response: JobResponse }> => {
    const ScraperClass = SCRAPER_MAPPING[site];
    const scraper = new ScraperClass({
      proxies: proxyList,
      caCert,
      userAgent,
    });

    const scrapedData = await scraper.scrape(scraperInput);

    const capName = site.charAt(0).toUpperCase() + site.slice(1);
    let siteName = capName;
    if (capName === 'Zip_recruiter') siteName = 'ZipRecruiter';
    if (capName === 'Linkedin') siteName = 'LinkedIn';

    log.info(`${siteName}: finished scraping`);

    return { site, response: scrapedData };
  };

  // Scrape all sites concurrently
  const results = await Promise.all(siteTypes.map((site) => scrapeSite(site)));

  // Process results
  const jobsData: JobData[] = [];

  for (const { site, response } of results) {
    for (const job of response.jobs) {
      const jobData = processJobToData(
        job,
        site,
        countryEnum,
        enforceAnnualSalary
      );
      jobsData.push(jobData);
    }
  }

  // Sort by site and date_posted
  jobsData.sort((a, b) => {
    const siteCompare = (a.site ?? '').localeCompare(b.site ?? '');
    if (siteCompare !== 0) return siteCompare;

    // Sort by date descending (newest first)
    const dateA = a.datePosted ? new Date(a.datePosted).getTime() : 0;
    const dateB = b.datePosted ? new Date(b.datePosted).getTime() : 0;
    return dateB - dateA;
  });

  return jobsData;
}

/**
 * Process a JobPost into a flat JobData object
 */
function processJobToData(
  job: JobPost,
  site: string,
  countryEnum: Country,
  enforceAnnualSalary: boolean
): JobData {
  // Format location
  let locationStr: string | null = null;
  if (job.location) {
    locationStr = displayLocation(job.location);
  }

  // Format job type
  let jobTypeStr: string | null = null;
  if (job.jobType && job.jobType.length > 0) {
    jobTypeStr = job.jobType.join(', ');
  }

  // Format emails
  let emailsStr: string | null = null;
  if (job.emails && job.emails.length > 0) {
    emailsStr = job.emails.join(', ');
  }

  // Handle compensation
  let interval: string | null = null;
  let minAmount: number | null = null;
  let maxAmount: number | null = null;
  let currency: string | null = null;
  let salarySource: string | null = null;

  if (job.compensation) {
    interval = job.compensation.interval ?? null;
    minAmount = job.compensation.minAmount ?? null;
    maxAmount = job.compensation.maxAmount ?? null;
    currency = job.compensation.currency ?? 'USD';
    salarySource = SalarySource.DIRECT_DATA;

    // Enforce annual salary if requested
    if (
      enforceAnnualSalary &&
      interval &&
      interval !== 'yearly' &&
      minAmount &&
      maxAmount
    ) {
      const data = { interval, minAmount, maxAmount };
      convertToAnnual(data);
      interval = data.interval;
      minAmount = data.minAmount;
      maxAmount = data.maxAmount;
    }
  } else if (countryEnum === Country.USA && job.description) {
    // Try to extract salary from description
    const extracted = extractSalary(job.description, {
      enforceAnnualSalary,
    });
    if (extracted.minAmount && extracted.maxAmount) {
      interval = extracted.interval;
      minAmount = extracted.minAmount;
      maxAmount = extracted.maxAmount;
      currency = extracted.currency;
      salarySource = SalarySource.DESCRIPTION;
    }
  }

  // Clear salary source if no salary data
  if (!minAmount) {
    salarySource = null;
  }

  // Format date
  let datePostedStr: string | null = null;
  if (job.datePosted) {
    datePostedStr = job.datePosted.toISOString().split('T')[0];
  }

  // Format skills
  let skillsStr: string | null = null;
  if (job.skills && job.skills.length > 0) {
    skillsStr = job.skills.join(', ');
  }

  return {
    id: job.id,
    site,
    jobUrl: job.jobUrl,
    jobUrlDirect: job.jobUrlDirect ?? null,
    title: job.title,
    company: job.companyName,
    location: locationStr,
    datePosted: datePostedStr,
    jobType: jobTypeStr,
    salarySource,
    interval,
    minAmount,
    maxAmount,
    currency,
    isRemote: job.isRemote ?? null,
    jobLevel: job.jobLevel ?? null,
    jobFunction: job.jobFunction ?? null,
    listingType: job.listingType ?? null,
    emails: emailsStr,
    description: job.description ?? null,
    companyIndustry: job.companyIndustry ?? null,
    companyUrl: job.companyUrl ?? null,
    companyLogo: job.companyLogo ?? null,
    companyUrlDirect: job.companyUrlDirect ?? null,
    companyAddresses: job.companyAddresses ?? null,
    companyNumEmployees: job.companyNumEmployees ?? null,
    companyRevenue: job.companyRevenue ?? null,
    companyDescription: job.companyDescription ?? null,
    skills: skillsStr,
    experienceRange: job.experienceRange ?? null,
    companyRating: job.companyRating ?? null,
    companyReviewsCount: job.companyReviewsCount ?? null,
    vacancyCount: job.vacancyCount ?? null,
    workFromHomeType: job.workFromHomeType ?? null,
  };
}

// Default export
export default scrapeJobs;
