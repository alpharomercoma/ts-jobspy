export enum JobType {
  FULL_TIME = 'fulltime',
  PART_TIME = 'parttime',
  CONTRACT = 'contract',
  TEMPORARY = 'temporary',
  INTERNSHIP = 'internship',
  PER_DIEM = 'perdiem',
  NIGHTS = 'nights',
  OTHER = 'other',
  SUMMER = 'summer',
  VOLUNTEER = 'volunteer',
}

export enum Country {
  ARGENTINA = 'argentina',
  AUSTRALIA = 'australia',
  AUSTRIA = 'austria',
  BAHRAIN = 'bahrain',
  BANGLADESH = 'bangladesh',
  BELGIUM = 'belgium',
  BULGARIA = 'bulgaria',
  BRAZIL = 'brazil',
  CANADA = 'canada',
  CHILE = 'chile',
  CHINA = 'china',
  COLOMBIA = 'colombia',
  COSTA_RICA = 'costa rica',
  CROATIA = 'croatia',
  CYPRUS = 'cyprus',
  CZECH_REPUBLIC = 'czech republic',
  DENMARK = 'denmark',
  ECUADOR = 'ecuador',
  EGYPT = 'egypt',
  ESTONIA = 'estonia',
  FINLAND = 'finland',
  FRANCE = 'france',
  GERMANY = 'germany',
  GREECE = 'greece',
  HONG_KONG = 'hong kong',
  HUNGARY = 'hungary',
  INDIA = 'india',
  INDONESIA = 'indonesia',
  IRELAND = 'ireland',
  ISRAEL = 'israel',
  ITALY = 'italy',
  JAPAN = 'japan',
  KUWAIT = 'kuwait',
  LATVIA = 'latvia',
  LITHUANIA = 'lithuania',
  LUXEMBOURG = 'luxembourg',
  MALAYSIA = 'malaysia',
  MALTA = 'malta',
  MEXICO = 'mexico',
  MOROCCO = 'morocco',
  NETHERLANDS = 'netherlands',
  NEW_ZEALAND = 'new zealand',
  NIGERIA = 'nigeria',
  NORWAY = 'norway',
  OMAN = 'oman',
  PAKISTAN = 'pakistan',
  PANAMA = 'panama',
  PERU = 'peru',
  PHILIPPINES = 'philippines',
  POLAND = 'poland',
  PORTUGAL = 'portugal',
  QATAR = 'qatar',
  ROMANIA = 'romania',
  SAUDI_ARABIA = 'saudi arabia',
  SINGAPORE = 'singapore',
  SLOVAKIA = 'slovakia',
  SLOVENIA = 'slovenia',
  SOUTH_AFRICA = 'south africa',
  SOUTH_KOREA = 'south korea',
  SPAIN = 'spain',
  SWEDEN = 'sweden',
  SWITZERLAND = 'switzerland',
  TAIWAN = 'taiwan',
  THAILAND = 'thailand',
  TURKEY = 'turkey',
  UKRAINE = 'ukraine',
  UNITED_ARAB_EMIRATES = 'united arab emirates',
  UK = 'uk',
  USA = 'usa',
  URUGUAY = 'uruguay',
  VENEZUELA = 'venezuela',
  VIETNAM = 'vietnam',
  // Internal use for specific scrapers
  US_CANADA = 'us_canada',
  WORLDWIDE = 'worldwide',
}


/**
 * Supported countries for Indeed scraping with autocomplete.
 * Provides lowercase country names for a clean API experience.
 * Internally mapped to Country enum for type safety.
 */
export type SupportedCountry =
  | 'argentina' | 'australia' | 'austria' | 'bahrain' | 'bangladesh' | 'belgium'
  | 'brazil' | 'bulgaria' | 'canada' | 'chile' | 'china' | 'colombia' | 'costa rica'
  | 'croatia' | 'cyprus' | 'czech republic' | 'denmark' | 'ecuador' | 'egypt'
  | 'estonia' | 'finland' | 'france' | 'germany' | 'greece' | 'hong kong'
  | 'hungary' | 'india' | 'indonesia' | 'ireland' | 'israel' | 'italy' | 'japan'
  | 'kuwait' | 'latvia' | 'lithuania' | 'luxembourg' | 'malaysia' | 'malta'
  | 'mexico' | 'morocco' | 'netherlands' | 'new zealand' | 'nigeria' | 'norway'
  | 'oman' | 'pakistan' | 'panama' | 'peru' | 'philippines' | 'poland' | 'portugal'
  | 'qatar' | 'romania' | 'saudi arabia' | 'singapore' | 'slovakia' | 'slovenia'
  | 'south africa' | 'south korea' | 'spain' | 'sweden' | 'switzerland' | 'taiwan'
  | 'thailand' | 'turkey' | 'ukraine' | 'united arab emirates' | 'uk' | 'usa'
  | 'uruguay' | 'venezuela' | 'vietnam'
  // Common aliases
  | 'czechia' | 'türkiye' | 'korea' | 'uae' | 'emirates' | 'nz' | 'hk'
  | 'ksa' | 'za' | 'britain' | 'united kingdom' | 'us' | 'united states' | 'america';

export enum CompensationInterval {
  YEARLY = 'yearly',
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  DAILY = 'daily',
  HOURLY = 'hourly',
}

export enum DescriptionFormat {
  MARKDOWN = 'markdown',
  HTML = 'html',
}

export enum Site {
  LINKEDIN = 'linkedin',
  INDEED = 'indeed',
  ZIP_RECRUITER = 'ziprecruiter',
  GLASSDOOR = 'glassdoor',
  GOOGLE = 'google',
  BAYT = 'bayt',
  NAUKRI = 'naukri',
  BDJOBS = 'bdjobs',
}

// Strict string literal types for site names (exact match only)
export type SiteName =
  | 'linkedin'
  | 'indeed'
  | 'ziprecruiter'
  | 'glassdoor'
  | 'google'
  | 'bayt'
  | 'naukri'
  | 'bdjobs';

export enum SalarySource {
  DIRECT_DATA = 'direct_data',
  DESCRIPTION = 'description',
}

export interface Location {
  country?: string;
  city?: string;
  state?: string;
}

export interface Compensation {
  interval?: CompensationInterval;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
}

export interface ScrapeJobsOptions {
  siteName?: SiteName | SiteName[];
  searchTerm?: string;
  googleSearchTerm?: string;
  location?: string;
  distance?: number;
  isRemote?: boolean;
  jobType?: string;
  easyApply?: boolean;
  resultsWanted?: number;
  /**
   * Country for Indeed scraping. Required when using Indeed.
   * Provides autocomplete for all supported countries.
   * @example Country.USA | Country.UK | Country.CANADA | 'usa' | 'uk' | 'canada'
   */
  countryIndeed?: SupportedCountry;
  proxies?: string[] | string;
  caCert?: string;
  userAgent?: string;
  descriptionFormat?: DescriptionFormat;
  linkedinFetchDescription?: boolean;
  linkedinCompanyIds?: number[];
  offset?: number;
  hoursOld?: number;
  enforceAnnualSalary?: boolean;
  verbose?: number;
}

export interface JobPost {
  id?: string;
  title: string;
  companyName?: string;
  jobUrl: string;
  jobUrlDirect?: string;
  location?: Location;
  description?: string;
  companyUrl?: string;
  companyUrlDirect?: string;
  jobType?: JobType[];
  compensation?: Compensation;
  datePosted?: string;
  emails?: string[];
  isRemote?: boolean;
  listingType?: string;
  // LinkedIn specific
  jobLevel?: string;
  // LinkedIn and Indeed specific
  companyIndustry?: string;
  // Indeed specific
  companyAddresses?: string;
  companyNumEmployees?: string;
  companyRevenue?: string;
  companyDescription?: string;
  companyLogo?: string;
  bannerPhotoUrl?: string;
  // LinkedIn only
  jobFunction?: string;
  // Naukri specific
  skills?: string[];
  experienceRange?: string;
  companyRating?: number;
  companyReviewsCount?: number;
  vacancyCount?: number;
  workFromHomeType?: string;
}

export interface JobResponse {
  jobs: JobPost[];
}

export interface ScraperInput {
  siteType: Site[];
  searchTerm?: string;
  googleSearchTerm?: string;
  location?: string;
  country?: Country;
  distance?: number;
  isRemote?: boolean;
  jobType?: JobType;
  easyApply?: boolean;
  offset?: number;
  linkedinFetchDescription?: boolean;
  linkedinCompanyIds?: number[];
  descriptionFormat?: DescriptionFormat;
  requestTimeout?: number;
  resultsWanted?: number;
  hoursOld?: number;
}

export interface ProxyConfig {
  http?: string;
  https?: string;
}

export interface ScraperConfig {
  proxies?: string[] | string;
  caCert?: string;
  userAgent?: string;
}
