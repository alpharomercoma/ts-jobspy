import {
  JobPost,
  JobResponse,
  ScraperInput,
  Site,
  Country,
  JobType,
  CompensationInterval,
  Location,
  Compensation,
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
  private static countryMappings: Record<string, { indeed: string; glassdoor?: string }> = {
    [Country.ARGENTINA]: { indeed: 'ar', glassdoor: 'com.ar' },
    [Country.AUSTRALIA]: { indeed: 'au', glassdoor: 'com.au' },
    [Country.AUSTRIA]: { indeed: 'at', glassdoor: 'at' },
    [Country.BAHRAIN]: { indeed: 'bh' },
    [Country.BANGLADESH]: { indeed: 'bd' },
    [Country.BELGIUM]: { indeed: 'be', glassdoor: 'fr:be' },
    [Country.BRAZIL]: { indeed: 'br', glassdoor: 'com.br' },
    [Country.CANADA]: { indeed: 'ca', glassdoor: 'ca' },
    [Country.CHILE]: { indeed: 'cl' },
    [Country.CHINA]: { indeed: 'cn' },
    [Country.COLOMBIA]: { indeed: 'co' },
    [Country.COSTA_RICA]: { indeed: 'cr' },
    [Country.CZECH_REPUBLIC]: { indeed: 'cz' },
    [Country.DENMARK]: { indeed: 'dk' },
    [Country.ECUADOR]: { indeed: 'ec' },
    [Country.EGYPT]: { indeed: 'eg' },
    [Country.FINLAND]: { indeed: 'fi' },
    [Country.FRANCE]: { indeed: 'fr', glassdoor: 'fr' },
    [Country.GERMANY]: { indeed: 'de', glassdoor: 'de' },
    [Country.GREECE]: { indeed: 'gr' },
    [Country.HONG_KONG]: { indeed: 'hk', glassdoor: 'com.hk' },
    [Country.HUNGARY]: { indeed: 'hu' },
    [Country.INDIA]: { indeed: 'in', glassdoor: 'co.in' },
    [Country.INDONESIA]: { indeed: 'id' },
    [Country.IRELAND]: { indeed: 'ie', glassdoor: 'ie' },
    [Country.ISRAEL]: { indeed: 'il' },
    [Country.ITALY]: { indeed: 'it', glassdoor: 'it' },
    [Country.JAPAN]: { indeed: 'jp' },
    [Country.KUWAIT]: { indeed: 'kw' },
    [Country.LUXEMBOURG]: { indeed: 'lu' },
    [Country.MALAYSIA]: { indeed: 'malaysia:my', glassdoor: 'com' },
    [Country.MEXICO]: { indeed: 'mx', glassdoor: 'com.mx' },
    [Country.MOROCCO]: { indeed: 'ma' },
    [Country.NETHERLANDS]: { indeed: 'nl', glassdoor: 'nl' },
    [Country.NEW_ZEALAND]: { indeed: 'nz', glassdoor: 'co.nz' },
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
    [Country.SINGAPORE]: { indeed: 'sg', glassdoor: 'sg' },
    [Country.SOUTH_AFRICA]: { indeed: 'za' },
    [Country.SOUTH_KOREA]: { indeed: 'kr' },
    [Country.SPAIN]: { indeed: 'es', glassdoor: 'es' },
    [Country.SWEDEN]: { indeed: 'se' },
    [Country.SWITZERLAND]: { indeed: 'ch', glassdoor: 'de:ch' },
    [Country.TAIWAN]: { indeed: 'tw' },
    [Country.THAILAND]: { indeed: 'th' },
    [Country.TURKEY]: { indeed: 'tr' },
    [Country.UKRAINE]: { indeed: 'ua' },
    [Country.UNITED_ARAB_EMIRATES]: { indeed: 'ae' },
    [Country.UK]: { indeed: 'uk:gb', glassdoor: 'co.uk' },
    [Country.USA]: { indeed: 'www:us', glassdoor: 'com' },
    [Country.URUGUAY]: { indeed: 'uy' },
    [Country.VENEZUELA]: { indeed: 've' },
    [Country.VIETNAM]: { indeed: 'vn', glassdoor: 'com' },
    [Country.US_CANADA]: { indeed: 'www' },
    [Country.WORLDWIDE]: { indeed: 'www' },
  };

  static getIndeedDomain(country: Country): { domain: string; apiCountryCode: string } {
    const mapping = this.countryMappings[country];
    if (!mapping) {
      throw new Error(`Country ${country} not supported for Indeed`);
    }

    const [subdomain, apiCode] = mapping.indeed.split(':');
    return {
      domain: subdomain,
      apiCountryCode: (apiCode || subdomain).toUpperCase(),
    };
  }

  static getGlassdoorDomain(country: Country): string {
    const mapping = this.countryMappings[country];
    if (!mapping?.glassdoor) {
      throw new Error(`Country ${country} not supported for Glassdoor`);
    }

    const [subdomain, domain] = mapping.glassdoor.split(':');
    if (subdomain && domain) {
      return `${subdomain}.glassdoor.${domain}`;
    } else {
      return `www.glassdoor.${mapping.glassdoor}`;
    }
  }

  static fromString(countryStr: string): Country {
    const normalized = countryStr.trim().toLowerCase();
    
    // Direct mapping
    for (const [key, value] of Object.entries(Country)) {
      if (value === normalized) {
        return value as Country;
      }
    }

    // Alternative names mapping
    const alternatives: Record<string, Country> = {
      'us': Country.USA,
      'united states': Country.USA,
      'united kingdom': Country.UK,
      'czechia': Country.CZECH_REPUBLIC,
      'türkiye': Country.TURKEY,
    };

    if (alternatives[normalized]) {
      return alternatives[normalized];
    }

    throw new Error(`Invalid country string: '${countryStr}'`);
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

export * from './dataframe';
