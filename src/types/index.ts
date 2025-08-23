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
  US_CANADA = 'usa/ca',
  WORLDWIDE = 'worldwide',
}

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
  ZIP_RECRUITER = 'zip_recruiter',
  GLASSDOOR = 'glassdoor',
  GOOGLE = 'google',
  BAYT = 'bayt',
  NAUKRI = 'naukri',
  BDJOBS = 'bdjobs',
}

export enum SalarySource {
  DIRECT_DATA = 'direct_data',
  DESCRIPTION = 'description',
}

export interface Location {
  country?: Country | string;
  city?: string;
  state?: string;
}

export interface Compensation {
  interval?: CompensationInterval;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
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
