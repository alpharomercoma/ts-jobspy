import {
  Country,
  JobResponse,
  JobType,
  Location,
  ScraperInput,
  Site
} from '../types';

export abstract class Scraper {
  protected site: Site;
  protected proxies?: string[] | string;
  protected caCert?: string;
  protected userAgent?: string;

  constructor(site: Site, config?: { proxies?: string[] | string; caCert?: string; userAgent?: string }) {
    this.site = site;
    this.proxies = config?.proxies;
    this.caCert = config?.caCert;
    this.userAgent = config?.userAgent;
  }

  abstract scrape(input: ScraperInput): Promise<JobResponse>;
}

export class CountryHelper {
  /**
   * Convert string country name to Country enum value.
   * @param countryString - String representation of country
   * @returns Country enum value
   */
  static stringToCountry(countryString: string): Country {
    const normalized = countryString.toLowerCase().trim();
    
    // Direct mappings
    const countryMap: Record<string, Country> = {
      'argentina': Country.ARGENTINA,
      'australia': Country.AUSTRALIA,
      'austria': Country.AUSTRIA,
      'bahrain': Country.BAHRAIN,
      'belgium': Country.BELGIUM,
      'brazil': Country.BRAZIL,
      'canada': Country.CANADA,
      'chile': Country.CHILE,
      'china': Country.CHINA,
      'colombia': Country.COLOMBIA,
      'costa rica': Country.COSTA_RICA,
      'czech republic': Country.CZECH_REPUBLIC,
      'czechia': Country.CZECH_REPUBLIC,
      'denmark': Country.DENMARK,
      'ecuador': Country.ECUADOR,
      'egypt': Country.EGYPT,
      'finland': Country.FINLAND,
      'france': Country.FRANCE,
      'germany': Country.GERMANY,
      'greece': Country.GREECE,
      'hong kong': Country.HONG_KONG,
      'hk': Country.HONG_KONG,
      'hungary': Country.HUNGARY,
      'india': Country.INDIA,
      'indonesia': Country.INDONESIA,
      'ireland': Country.IRELAND,
      'israel': Country.ISRAEL,
      'italy': Country.ITALY,
      'japan': Country.JAPAN,
      'kuwait': Country.KUWAIT,
      'luxembourg': Country.LUXEMBOURG,
      'malaysia': Country.MALAYSIA,
      'mexico': Country.MEXICO,
      'morocco': Country.MOROCCO,
      'netherlands': Country.NETHERLANDS,
      'new zealand': Country.NEW_ZEALAND,
      'nz': Country.NEW_ZEALAND,
      'nigeria': Country.NIGERIA,
      'norway': Country.NORWAY,
      'oman': Country.OMAN,
      'pakistan': Country.PAKISTAN,
      'panama': Country.PANAMA,
      'peru': Country.PERU,
      'philippines': Country.PHILIPPINES,
      'poland': Country.POLAND,
      'portugal': Country.PORTUGAL,
      'qatar': Country.QATAR,
      'romania': Country.ROMANIA,
      'saudi arabia': Country.SAUDI_ARABIA,
      'ksa': Country.SAUDI_ARABIA,
      'singapore': Country.SINGAPORE,
      'south africa': Country.SOUTH_AFRICA,
      'za': Country.SOUTH_AFRICA,
      'south korea': Country.SOUTH_KOREA,
      'korea': Country.SOUTH_KOREA,
      'spain': Country.SPAIN,
      'sweden': Country.SWEDEN,
      'switzerland': Country.SWITZERLAND,
      'taiwan': Country.TAIWAN,
      'thailand': Country.THAILAND,
      'turkey': Country.TURKEY,
      'türkiye': Country.TURKEY,
      'ukraine': Country.UKRAINE,
      'united arab emirates': Country.UNITED_ARAB_EMIRATES,
      'uae': Country.UNITED_ARAB_EMIRATES,
      'emirates': Country.UNITED_ARAB_EMIRATES,
      'uk': Country.UK,
      'united kingdom': Country.UK,
      'britain': Country.UK,
      'usa': Country.USA,
      'us': Country.USA,
      'united states': Country.USA,
      'america': Country.USA,
      'uruguay': Country.URUGUAY,
      'venezuela': Country.VENEZUELA,
      'vietnam': Country.VIETNAM,
    };

    const country = countryMap[normalized];
    if (!country) {
      throw new Error(`Unsupported country: ${countryString}. Please use one of the supported countries.`);
    }
    
    return country;
  }

  /**
   * Country domain mappings restricted to JobSpy-supported countries only.
   * Based on the original JobSpy Python implementation.
   * Countries with glassdoor support are marked with * in original docs.
   */
  private static countryMappings: Record<string, { indeed: string; glassdoor?: string }> = {
    // Countries with Indeed + Glassdoor support (* in original docs)
    [Country.AUSTRALIA]: { indeed: 'au', glassdoor: 'com.au' },
    [Country.AUSTRIA]: { indeed: 'at', glassdoor: 'at' },
    [Country.BELGIUM]: { indeed: 'be', glassdoor: 'fr:be' },
    [Country.BRAZIL]: { indeed: 'br', glassdoor: 'com.br' },
    [Country.CANADA]: { indeed: 'ca', glassdoor: 'ca' },
    [Country.FRANCE]: { indeed: 'fr', glassdoor: 'fr' },
    [Country.GERMANY]: { indeed: 'de', glassdoor: 'de' },
    [Country.HONG_KONG]: { indeed: 'hk', glassdoor: 'com.hk' },
    [Country.INDIA]: { indeed: 'in', glassdoor: 'co.in' },
    [Country.IRELAND]: { indeed: 'ie', glassdoor: 'ie' },
    [Country.ITALY]: { indeed: 'it', glassdoor: 'it' },
    [Country.MEXICO]: { indeed: 'mx', glassdoor: 'com.mx' },
    [Country.NETHERLANDS]: { indeed: 'nl', glassdoor: 'nl' },
    [Country.NEW_ZEALAND]: { indeed: 'nz', glassdoor: 'co.nz' },
    [Country.SINGAPORE]: { indeed: 'sg', glassdoor: 'sg' },
    [Country.SPAIN]: { indeed: 'es', glassdoor: 'es' },
    [Country.SWITZERLAND]: { indeed: 'ch', glassdoor: 'de:ch' },
    [Country.UK]: { indeed: 'uk:gb', glassdoor: 'co.uk' },
    [Country.USA]: { indeed: 'www:us', glassdoor: 'com' },
    [Country.VIETNAM]: { indeed: 'vn', glassdoor: 'com' },
    
    // Countries with Indeed only support
    [Country.ARGENTINA]: { indeed: 'ar' },
    [Country.BAHRAIN]: { indeed: 'bh' },
    [Country.CHILE]: { indeed: 'cl' },
    [Country.CHINA]: { indeed: 'cn' },
    [Country.COLOMBIA]: { indeed: 'co' },
    [Country.COSTA_RICA]: { indeed: 'cr' },
    [Country.CZECH_REPUBLIC]: { indeed: 'cz' },
    [Country.DENMARK]: { indeed: 'dk' },
    [Country.ECUADOR]: { indeed: 'ec' },
    [Country.EGYPT]: { indeed: 'eg' },
    [Country.FINLAND]: { indeed: 'fi' },
    [Country.GREECE]: { indeed: 'gr' },
    [Country.HUNGARY]: { indeed: 'hu' },
    [Country.INDONESIA]: { indeed: 'id' },
    [Country.ISRAEL]: { indeed: 'il' },
    [Country.JAPAN]: { indeed: 'jp' },
    [Country.KUWAIT]: { indeed: 'kw' },
    [Country.LUXEMBOURG]: { indeed: 'lu' },
    [Country.MALAYSIA]: { indeed: 'malaysia:my' },
    [Country.MOROCCO]: { indeed: 'ma' },
    [Country.NIGERIA]: { indeed: 'ng' },
    [Country.NORWAY]: { indeed: 'no' },
    [Country.OMAN]: { indeed: 'om' },
    [Country.PAKISTAN]: { indeed: 'pk' },
    [Country.PANAMA]: { indeed: 'pa' },
    [Country.PERU]: { indeed: 'pe' },
    [Country.PHILIPPINES]: { indeed: 'ph' },
    [Country.POLAND]: { indeed: 'pl' },
    [Country.PORTUGAL]: { indeed: 'pt' },
    [Country.QATAR]: { indeed: 'qa' },
    [Country.ROMANIA]: { indeed: 'ro' },
    [Country.SAUDI_ARABIA]: { indeed: 'sa' },
    [Country.SOUTH_AFRICA]: { indeed: 'za' },
    [Country.SOUTH_KOREA]: { indeed: 'kr' },
    [Country.SWEDEN]: { indeed: 'se' },
    [Country.TAIWAN]: { indeed: 'tw' },
    [Country.THAILAND]: { indeed: 'th' },
    [Country.TURKEY]: { indeed: 'tr' },
    [Country.UKRAINE]: { indeed: 'ua' },
    [Country.UNITED_ARAB_EMIRATES]: { indeed: 'ae' },
    [Country.URUGUAY]: { indeed: 'uy' },
    [Country.VENEZUELA]: { indeed: 've' },
    
    // Internal use for specific scrapers
    [Country.US_CANADA]: { indeed: 'www' },
    [Country.WORLDWIDE]: { indeed: 'www' },
  };

  /**
   * Get Indeed domain configuration for a country.
   * @param country - Country enum value
   * @returns Object with domain and API country code
   * @throws Error if country is not supported by Indeed
   */
  static getIndeedDomain(country: Country): { domain: string; apiCountryCode: string } {
    const mapping = this.countryMappings[country];
    if (!mapping) {
      const supportedCountries = Object.keys(this.countryMappings).join(', ');
      throw new Error(
        `Country '${country}' is not supported for Indeed scraping. Supported countries: ${supportedCountries}`
      );
    }

    const [subdomain, apiCode] = mapping.indeed.split(':');
    return {
      domain: subdomain,
      apiCountryCode: (apiCode || subdomain).toUpperCase(),
    };
  }

  /**
   * Get Glassdoor domain configuration for a country.
   * @param country - Country enum value
   * @returns Glassdoor domain URL
   * @throws Error if country is not supported by Glassdoor
   */
  static getGlassdoorDomain(country: Country): string {
    const mapping = this.countryMappings[country];
    if (!mapping?.glassdoor) {
      const supportedCountries = Object.entries(this.countryMappings)
        .filter(([, config]) => config.glassdoor)
        .map(([country]) => country)
        .join(', ');
      throw new Error(
        `Country '${country}' is not supported for Glassdoor scraping. Supported countries: ${supportedCountries}`
      );
    }

    const [subdomain, domain] = mapping.glassdoor.split(':');
    if (subdomain && domain) {
      return `${subdomain}.glassdoor.${domain}`;
    } else {
      return `www.glassdoor.${mapping.glassdoor}`;
    }
  }

  /**
   * Convert a string to the corresponding Country enum.
   * Supports multiple alternative names for countries.
   * @param countryStr - Country name string (case-insensitive)
   * @returns Country enum value
   * @throws Error if country string is not recognized
   */
  static fromString(countryStr: string): Country {
    const normalized = countryStr.trim().toLowerCase();

    // Direct mapping to enum values
    for (const value of Object.values(Country)) {
      if (value === normalized) {
        return value as Country;
      }
    }

    // Alternative names mapping (comprehensive list from Python JobSpy)
    const alternatives: Record<string, Country> = {
      // USA alternatives
      'us': Country.USA,
      'united states': Country.USA,
      'america': Country.USA,
      
      // UK alternatives
      'united kingdom': Country.UK,
      'great britain': Country.UK,
      'britain': Country.UK,
      
      // Other common alternatives (only for supported countries)
      'czechia': Country.CZECH_REPUBLIC,
      'türkiye': Country.TURKEY,
      'south korea': Country.SOUTH_KOREA,
      'korea': Country.SOUTH_KOREA,
      'uae': Country.UNITED_ARAB_EMIRATES,
      'emirates': Country.UNITED_ARAB_EMIRATES,
      'new zealand': Country.NEW_ZEALAND,
      'nz': Country.NEW_ZEALAND,
      'hong kong': Country.HONG_KONG,
      'hk': Country.HONG_KONG,
      'saudi arabia': Country.SAUDI_ARABIA,
      'ksa': Country.SAUDI_ARABIA,
      'costa rica': Country.COSTA_RICA,
      'south africa': Country.SOUTH_AFRICA,
      'za': Country.SOUTH_AFRICA,
    };

    if (alternatives[normalized]) {
      return alternatives[normalized];
    }

    // Create a helpful error message with valid options
    const validCountries = Object.values(Country)
      .filter(c => c !== Country.US_CANADA && c !== Country.WORLDWIDE)
      .sort();
    
    throw new Error(
      `Invalid country string: '${countryStr}'. Valid countries include: ${validCountries.slice(0, 10).join(', ')}... (and ${validCountries.length - 10} more). Use Country enum values or common alternative names.`
    );
  }
}

export class LocationHelper {
  static displayLocation(location: Location): string {
    const parts: string[] = [];

    if (location.city) {
      parts.push(location.city);
    }

    if (location.state) {
      parts.push(location.state);
    }

    if (typeof location.country === 'string') {
      parts.push(location.country);
    } else if (location.country && location.country !== Country.US_CANADA && location.country !== Country.WORLDWIDE) {
      const countryName = location.country as string;
      if (countryName === Country.USA || countryName === Country.UK) {
        parts.push(countryName.toUpperCase());
      } else {
        parts.push(countryName.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()));
      }
    }

    return parts.join(', ');
  }
}

export class JobTypeHelper {
  private static jobTypePatterns: Record<JobType, string[]> = {
    [JobType.FULL_TIME]: [
      'fulltime', 'full time', 'full-time', 'períodointegral', 'estágio/trainee',
      'cunormăîntreagă', 'tiempocompleto', 'vollzeit', 'voltijds', 'tempointegral',
      '全职', 'plnýúvazek', 'fuldtid', 'دوامكامل', 'kokopäivätyö', 'tempsplein',
      'πλήρηςαπασχόληση', 'teljesmunkaidő', 'tempopieno', 'heltid', 'jornadacompleta',
      'pełnyetat', '정규직', '100%', '全職', 'งานประจำ', 'tamzamanlı', 'повназайнятість',
      'toànthờigian'
    ],
    [JobType.PART_TIME]: ['parttime', 'part time', 'part-time', 'teilzeit', 'částečnýúvazek', 'deltid'],
    [JobType.CONTRACT]: ['contract', 'contractor'],
    [JobType.TEMPORARY]: ['temporary'],
    [JobType.INTERNSHIP]: ['internship', 'intern', 'prácticas', 'ojt(onthejobtraining)', 'praktikum', 'praktik'],
    [JobType.PER_DIEM]: ['perdiem', 'per diem'],
    [JobType.NIGHTS]: ['nights'],
    [JobType.OTHER]: ['other'],
    [JobType.SUMMER]: ['summer'],
    [JobType.VOLUNTEER]: ['volunteer'],
  };

  static fromString(jobTypeStr: string): JobType | null {
    const normalized = jobTypeStr.toLowerCase().trim();

    for (const [jobType, patterns] of Object.entries(this.jobTypePatterns)) {
      if (patterns.includes(normalized)) {
        return jobType as JobType;
      }
    }

    return null;
  }

  static extractFromDescription(description: string): JobType[] {
    if (!description) return [];

    const keywords: Record<JobType, RegExp> = {
      [JobType.FULL_TIME]: /full\s?time/i,
      [JobType.PART_TIME]: /part\s?time/i,
      [JobType.INTERNSHIP]: /internship/i,
      [JobType.CONTRACT]: /contract/i,
      [JobType.TEMPORARY]: /temporary/i,
      [JobType.PER_DIEM]: /per\s?diem/i,
      [JobType.NIGHTS]: /nights/i,
      [JobType.OTHER]: /other/i,
      [JobType.SUMMER]: /summer/i,
      [JobType.VOLUNTEER]: /volunteer/i,
    };

    const foundTypes: JobType[] = [];
    for (const [jobType, pattern] of Object.entries(keywords)) {
      if (pattern.test(description)) {
        foundTypes.push(jobType as JobType);
      }
    }

    return foundTypes;
  }
}

export * from './JobDataFrame';
