/**
 * ts-jobspy - TypeScript Job Scraper
 * Model definitions for job data structures
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

/**
 * Enum representing job types
 */
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

/**
 * Job type string variations for matching
 */
export const JOB_TYPE_VARIATIONS: Record<JobType, string[]> = {
  [JobType.FULL_TIME]: [
    'fulltime',
    'períodointegral',
    'estágio/trainee',
    'cunormăîntreagă',
    'tiempocompleto',
    'vollzeit',
    'voltijds',
    'tempointegral',
    '全职',
    'plnýúvazek',
    'fuldtid',
    'دوامكامل',
    'kokopäivätyö',
    'tempsplein',
    'πλήρηςαπασχόληση',
    'teljesmunkaidő',
    'tempopieno',
    'heltid',
    'jornadacompleta',
    'pełnyetat',
    '정규직',
    '100%',
    '全職',
    'งานประจำ',
    'tamzamanlı',
    'повназайнятість',
    'toànthờigian',
  ],
  [JobType.PART_TIME]: ['parttime', 'teilzeit', 'částečnýúvazek', 'deltid'],
  [JobType.CONTRACT]: ['contract', 'contractor'],
  [JobType.TEMPORARY]: ['temporary'],
  [JobType.INTERNSHIP]: [
    'internship',
    'prácticas',
    'ojt(onthejobtraining)',
    'praktikum',
    'praktik',
  ],
  [JobType.PER_DIEM]: ['perdiem'],
  [JobType.NIGHTS]: ['nights'],
  [JobType.OTHER]: ['other'],
  [JobType.SUMMER]: ['summer'],
  [JobType.VOLUNTEER]: ['volunteer'],
};

/**
 * Supported job board sites
 */
export enum Site {
  LINKEDIN = 'linkedin',
  INDEED = 'indeed',
  ZIP_RECRUITER = 'zip_recruiter',
  GLASSDOOR = 'glassdoor',
  GOOGLE = 'google',
  BAYT = 'bayt',
  NAUKRI = 'naukri',
  BDJOBS = 'bdjobs',
}

/**
 * Salary source enumeration
 */
export enum SalarySource {
  DIRECT_DATA = 'direct_data',
  DESCRIPTION = 'description',
}

/**
 * Compensation interval enumeration
 */
export enum CompensationInterval {
  YEARLY = 'yearly',
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  DAILY = 'daily',
  HOURLY = 'hourly',
}

/**
 * Description format options
 */
export enum DescriptionFormat {
  MARKDOWN = 'markdown',
  HTML = 'html',
  PLAIN = 'plain',
}

/**
 * Country enumeration with Indeed and Glassdoor domain values
 * Format: [displayNames, indeedDomain:apiCode, glassdoorDomain:tld]
 */
export enum Country {
  ARGENTINA = 'argentina',
  AUSTRALIA = 'australia',
  AUSTRIA = 'austria',
  BAHRAIN = 'bahrain',
  BANGLADESH = 'bangladesh',
  BELGIUM = 'belgium',
  BRAZIL = 'brazil',
  BULGARIA = 'bulgaria',
  CANADA = 'canada',
  CHILE = 'chile',
  CHINA = 'china',
  COLOMBIA = 'colombia',
  COSTARICA = 'costarica',
  CROATIA = 'croatia',
  CYPRUS = 'cyprus',
  CZECHREPUBLIC = 'czechrepublic',
  DENMARK = 'denmark',
  ECUADOR = 'ecuador',
  EGYPT = 'egypt',
  ESTONIA = 'estonia',
  FINLAND = 'finland',
  FRANCE = 'france',
  GERMANY = 'germany',
  GREECE = 'greece',
  HONGKONG = 'hongkong',
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
  NEWZEALAND = 'newzealand',
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
  SAUDIARABIA = 'saudiarabia',
  SINGAPORE = 'singapore',
  SLOVAKIA = 'slovakia',
  SLOVENIA = 'slovenia',
  SOUTHAFRICA = 'southafrica',
  SOUTHKOREA = 'southkorea',
  SPAIN = 'spain',
  SWEDEN = 'sweden',
  SWITZERLAND = 'switzerland',
  TAIWAN = 'taiwan',
  THAILAND = 'thailand',
  TURKEY = 'turkey',
  UKRAINE = 'ukraine',
  UNITEDARABEMIRATES = 'unitedarabemirates',
  UK = 'uk',
  USA = 'usa',
  URUGUAY = 'uruguay',
  VENEZUELA = 'venezuela',
  VIETNAM = 'vietnam',
  US_CANADA = 'us_canada',
  WORLDWIDE = 'worldwide',
}

/**
 * Country configuration data including domain values
 */
export interface CountryConfig {
  names: string[];
  indeedDomain: string;
  indeedApiCode: string;
  glassdoorDomain?: string;
}

export const COUNTRY_CONFIG: Record<Country, CountryConfig> = {
  [Country.ARGENTINA]: { names: ['argentina'], indeedDomain: 'ar', indeedApiCode: 'AR', glassdoorDomain: 'com.ar' },
  [Country.AUSTRALIA]: { names: ['australia'], indeedDomain: 'au', indeedApiCode: 'AU', glassdoorDomain: 'com.au' },
  [Country.AUSTRIA]: { names: ['austria'], indeedDomain: 'at', indeedApiCode: 'AT', glassdoorDomain: 'at' },
  [Country.BAHRAIN]: { names: ['bahrain'], indeedDomain: 'bh', indeedApiCode: 'BH' },
  [Country.BANGLADESH]: { names: ['bangladesh'], indeedDomain: 'bd', indeedApiCode: 'BD' },
  [Country.BELGIUM]: { names: ['belgium'], indeedDomain: 'be', indeedApiCode: 'BE', glassdoorDomain: 'fr.glassdoor.be' },
  [Country.BRAZIL]: { names: ['brazil'], indeedDomain: 'br', indeedApiCode: 'BR', glassdoorDomain: 'com.br' },
  [Country.BULGARIA]: { names: ['bulgaria'], indeedDomain: 'bg', indeedApiCode: 'BG' },
  [Country.CANADA]: { names: ['canada'], indeedDomain: 'ca', indeedApiCode: 'CA', glassdoorDomain: 'ca' },
  [Country.CHILE]: { names: ['chile'], indeedDomain: 'cl', indeedApiCode: 'CL' },
  [Country.CHINA]: { names: ['china'], indeedDomain: 'cn', indeedApiCode: 'CN' },
  [Country.COLOMBIA]: { names: ['colombia'], indeedDomain: 'co', indeedApiCode: 'CO' },
  [Country.COSTARICA]: { names: ['costa rica', 'costarica'], indeedDomain: 'cr', indeedApiCode: 'CR' },
  [Country.CROATIA]: { names: ['croatia'], indeedDomain: 'hr', indeedApiCode: 'HR' },
  [Country.CYPRUS]: { names: ['cyprus'], indeedDomain: 'cy', indeedApiCode: 'CY' },
  [Country.CZECHREPUBLIC]: { names: ['czech republic', 'czechia', 'czechrepublic'], indeedDomain: 'cz', indeedApiCode: 'CZ' },
  [Country.DENMARK]: { names: ['denmark'], indeedDomain: 'dk', indeedApiCode: 'DK' },
  [Country.ECUADOR]: { names: ['ecuador'], indeedDomain: 'ec', indeedApiCode: 'EC' },
  [Country.EGYPT]: { names: ['egypt'], indeedDomain: 'eg', indeedApiCode: 'EG' },
  [Country.ESTONIA]: { names: ['estonia'], indeedDomain: 'ee', indeedApiCode: 'EE' },
  [Country.FINLAND]: { names: ['finland'], indeedDomain: 'fi', indeedApiCode: 'FI' },
  [Country.FRANCE]: { names: ['france'], indeedDomain: 'fr', indeedApiCode: 'FR', glassdoorDomain: 'fr' },
  [Country.GERMANY]: { names: ['germany'], indeedDomain: 'de', indeedApiCode: 'DE', glassdoorDomain: 'de' },
  [Country.GREECE]: { names: ['greece'], indeedDomain: 'gr', indeedApiCode: 'GR' },
  [Country.HONGKONG]: { names: ['hong kong', 'hongkong'], indeedDomain: 'hk', indeedApiCode: 'HK', glassdoorDomain: 'com.hk' },
  [Country.HUNGARY]: { names: ['hungary'], indeedDomain: 'hu', indeedApiCode: 'HU' },
  [Country.INDIA]: { names: ['india'], indeedDomain: 'in', indeedApiCode: 'IN', glassdoorDomain: 'co.in' },
  [Country.INDONESIA]: { names: ['indonesia'], indeedDomain: 'id', indeedApiCode: 'ID' },
  [Country.IRELAND]: { names: ['ireland'], indeedDomain: 'ie', indeedApiCode: 'IE', glassdoorDomain: 'ie' },
  [Country.ISRAEL]: { names: ['israel'], indeedDomain: 'il', indeedApiCode: 'IL' },
  [Country.ITALY]: { names: ['italy'], indeedDomain: 'it', indeedApiCode: 'IT', glassdoorDomain: 'it' },
  [Country.JAPAN]: { names: ['japan'], indeedDomain: 'jp', indeedApiCode: 'JP' },
  [Country.KUWAIT]: { names: ['kuwait'], indeedDomain: 'kw', indeedApiCode: 'KW' },
  [Country.LATVIA]: { names: ['latvia'], indeedDomain: 'lv', indeedApiCode: 'LV' },
  [Country.LITHUANIA]: { names: ['lithuania'], indeedDomain: 'lt', indeedApiCode: 'LT' },
  [Country.LUXEMBOURG]: { names: ['luxembourg'], indeedDomain: 'lu', indeedApiCode: 'LU' },
  [Country.MALAYSIA]: { names: ['malaysia'], indeedDomain: 'malaysia', indeedApiCode: 'MY', glassdoorDomain: 'com' },
  [Country.MALTA]: { names: ['malta'], indeedDomain: 'malta', indeedApiCode: 'MT', glassdoorDomain: 'mt' },
  [Country.MEXICO]: { names: ['mexico'], indeedDomain: 'mx', indeedApiCode: 'MX', glassdoorDomain: 'com.mx' },
  [Country.MOROCCO]: { names: ['morocco'], indeedDomain: 'ma', indeedApiCode: 'MA' },
  [Country.NETHERLANDS]: { names: ['netherlands'], indeedDomain: 'nl', indeedApiCode: 'NL', glassdoorDomain: 'nl' },
  [Country.NEWZEALAND]: { names: ['new zealand', 'newzealand'], indeedDomain: 'nz', indeedApiCode: 'NZ', glassdoorDomain: 'co.nz' },
  [Country.NIGERIA]: { names: ['nigeria'], indeedDomain: 'ng', indeedApiCode: 'NG' },
  [Country.NORWAY]: { names: ['norway'], indeedDomain: 'no', indeedApiCode: 'NO' },
  [Country.OMAN]: { names: ['oman'], indeedDomain: 'om', indeedApiCode: 'OM' },
  [Country.PAKISTAN]: { names: ['pakistan'], indeedDomain: 'pk', indeedApiCode: 'PK' },
  [Country.PANAMA]: { names: ['panama'], indeedDomain: 'pa', indeedApiCode: 'PA' },
  [Country.PERU]: { names: ['peru'], indeedDomain: 'pe', indeedApiCode: 'PE' },
  [Country.PHILIPPINES]: { names: ['philippines'], indeedDomain: 'ph', indeedApiCode: 'PH' },
  [Country.POLAND]: { names: ['poland'], indeedDomain: 'pl', indeedApiCode: 'PL' },
  [Country.PORTUGAL]: { names: ['portugal'], indeedDomain: 'pt', indeedApiCode: 'PT' },
  [Country.QATAR]: { names: ['qatar'], indeedDomain: 'qa', indeedApiCode: 'QA' },
  [Country.ROMANIA]: { names: ['romania'], indeedDomain: 'ro', indeedApiCode: 'RO' },
  [Country.SAUDIARABIA]: { names: ['saudi arabia', 'saudiarabia'], indeedDomain: 'sa', indeedApiCode: 'SA' },
  [Country.SINGAPORE]: { names: ['singapore'], indeedDomain: 'sg', indeedApiCode: 'SG', glassdoorDomain: 'sg' },
  [Country.SLOVAKIA]: { names: ['slovakia'], indeedDomain: 'sk', indeedApiCode: 'SK' },
  [Country.SLOVENIA]: { names: ['slovenia'], indeedDomain: 'sl', indeedApiCode: 'SI' },
  [Country.SOUTHAFRICA]: { names: ['south africa', 'southafrica'], indeedDomain: 'za', indeedApiCode: 'ZA' },
  [Country.SOUTHKOREA]: { names: ['south korea', 'southkorea'], indeedDomain: 'kr', indeedApiCode: 'KR' },
  [Country.SPAIN]: { names: ['spain'], indeedDomain: 'es', indeedApiCode: 'ES', glassdoorDomain: 'es' },
  [Country.SWEDEN]: { names: ['sweden'], indeedDomain: 'se', indeedApiCode: 'SE' },
  [Country.SWITZERLAND]: { names: ['switzerland'], indeedDomain: 'ch', indeedApiCode: 'CH', glassdoorDomain: 'de.glassdoor.ch' },
  [Country.TAIWAN]: { names: ['taiwan'], indeedDomain: 'tw', indeedApiCode: 'TW' },
  [Country.THAILAND]: { names: ['thailand'], indeedDomain: 'th', indeedApiCode: 'TH' },
  [Country.TURKEY]: { names: ['türkiye', 'turkey'], indeedDomain: 'tr', indeedApiCode: 'TR' },
  [Country.UKRAINE]: { names: ['ukraine'], indeedDomain: 'ua', indeedApiCode: 'UA' },
  [Country.UNITEDARABEMIRATES]: { names: ['united arab emirates', 'uae', 'unitedarabemirates'], indeedDomain: 'ae', indeedApiCode: 'AE' },
  [Country.UK]: { names: ['uk', 'united kingdom'], indeedDomain: 'uk', indeedApiCode: 'GB', glassdoorDomain: 'co.uk' },
  [Country.USA]: { names: ['usa', 'us', 'united states'], indeedDomain: 'www', indeedApiCode: 'US', glassdoorDomain: 'com' },
  [Country.URUGUAY]: { names: ['uruguay'], indeedDomain: 'uy', indeedApiCode: 'UY' },
  [Country.VENEZUELA]: { names: ['venezuela'], indeedDomain: 've', indeedApiCode: 'VE' },
  [Country.VIETNAM]: { names: ['vietnam'], indeedDomain: 'vn', indeedApiCode: 'VN', glassdoorDomain: 'com' },
  [Country.US_CANADA]: { names: ['usa/ca', 'us_canada'], indeedDomain: 'www', indeedApiCode: 'US' },
  [Country.WORLDWIDE]: { names: ['worldwide'], indeedDomain: 'www', indeedApiCode: 'US' },
};

/**
 * Get country from string
 */
export function getCountryFromString(countryStr: string): Country {
  const normalized = countryStr.trim().toLowerCase();
  for (const [country, config] of Object.entries(COUNTRY_CONFIG)) {
    if (config.names.includes(normalized)) {
      return country as Country;
    }
  }
  throw new Error(`Invalid country string: '${countryStr}'`);
}

/**
 * Get Indeed domain value for a country
 */
export function getIndeedDomainValue(country: Country): { domain: string; apiCode: string } {
  const config = COUNTRY_CONFIG[country];
  return { domain: config.indeedDomain, apiCode: config.indeedApiCode };
}

/**
 * Get Glassdoor URL for a country
 */
export function getGlassdoorUrl(country: Country): string {
  const config = COUNTRY_CONFIG[country];
  if (!config.glassdoorDomain) {
    throw new Error(`Glassdoor is not available for ${country}`);
  }
  // If domain starts with a letter like 'fr.glassdoor' or 'de.glassdoor', it's a subdomain
  if (config.glassdoorDomain.includes('glassdoor')) {
    return `https://${config.glassdoorDomain}/`;
  }
  // Otherwise, it's a TLD like 'com', 'co.uk', 'com.au'
  return `https://www.glassdoor.${config.glassdoorDomain}/`;
}

/**
 * Location interface
 */
export interface Location {
  country?: Country | string;
  city?: string;
  state?: string;
}

/**
 * Display location as formatted string
 */
export function displayLocation(location: Location): string {
  const parts: string[] = [];
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country) {
    // Check if it's a known Country enum value
    const countryVal = location.country as Country;
    const config = COUNTRY_CONFIG[countryVal];
    if (config && countryVal !== Country.US_CANADA && countryVal !== Country.WORLDWIDE) {
      let countryName = config.names[0];
      // Special case for USA and UK - display as uppercase
      if (countryName === 'usa' || countryName === 'uk') {
        countryName = countryName.toUpperCase();
      } else {
        // Capitalize first letter
        countryName = countryName.charAt(0).toUpperCase() + countryName.slice(1);
      }
      parts.push(countryName);
    } else if (typeof location.country === 'string' && !config) {
      // Unknown country string - just use as-is
      parts.push(location.country);
    }
  }
  return parts.join(', ');
}

/**
 * Compensation interface
 */
export interface Compensation {
  interval?: CompensationInterval;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
}

/**
 * Job post interface - main data structure for job listings
 */
export interface JobPost {
  id: string | null;
  title: string;
  companyName: string | null;
  jobUrl: string;
  jobUrlDirect?: string | null;
  location?: Location | null;
  description?: string | null;
  companyUrl?: string | null;
  companyUrlDirect?: string | null;
  jobType?: JobType[] | null;
  compensation?: Compensation | null;
  datePosted?: Date | null;
  emails?: string[] | null;
  isRemote?: boolean | null;
  listingType?: string | null;

  // LinkedIn specific
  jobLevel?: string | null;

  // LinkedIn and Indeed specific
  companyIndustry?: string | null;

  // Indeed specific
  companyAddresses?: string | null;
  companyNumEmployees?: string | null;
  companyRevenue?: string | null;
  companyDescription?: string | null;
  companyLogo?: string | null;
  bannerPhotoUrl?: string | null;

  // LinkedIn only
  jobFunction?: string | null;

  // Naukri specific
  skills?: string[] | null;
  experienceRange?: string | null;
  companyRating?: number | null;
  companyReviewsCount?: number | null;
  vacancyCount?: number | null;
  workFromHomeType?: string | null;
}

/**
 * Job response wrapper
 */
export interface JobResponse {
  jobs: JobPost[];
}

/**
 * Scraper input configuration
 */
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

/**
 * Default scraper input values
 */
export const DEFAULT_SCRAPER_INPUT: Partial<ScraperInput> = {
  country: Country.USA,
  distance: 50,
  isRemote: false,
  offset: 0,
  linkedinFetchDescription: false,
  descriptionFormat: DescriptionFormat.MARKDOWN,
  requestTimeout: 60,
  resultsWanted: 15,
};

/**
 * Options for the main scrapeJobs function
 */
export interface ScrapeJobsOptions {
  siteName?: string | string[] | Site | Site[];
  searchTerm?: string;
  googleSearchTerm?: string;
  location?: string;
  distance?: number;
  isRemote?: boolean;
  jobType?: string;
  easyApply?: boolean;
  resultsWanted?: number;
  countryIndeed?: string;
  proxies?: string[] | string;
  caCert?: string;
  descriptionFormat?: string;
  linkedinFetchDescription?: boolean;
  linkedinCompanyIds?: number[];
  offset?: number;
  hoursOld?: number;
  enforceAnnualSalary?: boolean;
  verbose?: number;
  userAgent?: string;
}

/**
 * Abstract base class for scrapers
 */
export interface Scraper {
  site: Site;
  proxies?: string[];
  caCert?: string;
  userAgent?: string;
  scrape(input: ScraperInput): Promise<JobResponse>;
}

/**
 * Desired column order for output (matching Python implementation)
 */
export const DESIRED_ORDER: string[] = [
  'id',
  'site',
  'jobUrl',
  'jobUrlDirect',
  'title',
  'company',
  'location',
  'datePosted',
  'jobType',
  'salarySource',
  'interval',
  'minAmount',
  'maxAmount',
  'currency',
  'isRemote',
  'jobLevel',
  'jobFunction',
  'listingType',
  'emails',
  'description',
  'companyIndustry',
  'companyUrl',
  'companyLogo',
  'companyUrlDirect',
  'companyAddresses',
  'companyNumEmployees',
  'companyRevenue',
  'companyDescription',
  // Naukri-specific fields
  'skills',
  'experienceRange',
  'companyRating',
  'companyReviewsCount',
  'vacancyCount',
  'workFromHomeType',
];
