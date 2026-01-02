/**
 * Unit tests for model.ts
 */

import {
  JobType,
  Site,
  Country,
  CompensationInterval,
  DescriptionFormat,
  getCountryFromString,
  displayLocation,
  getIndeedDomainValue,
  getGlassdoorUrl,
  COUNTRY_CONFIG,
} from '../src/model';

describe('Model Tests', () => {
  describe('JobType', () => {
    it('should have correct enum values', () => {
      expect(JobType.FULL_TIME).toBe('fulltime');
      expect(JobType.PART_TIME).toBe('parttime');
      expect(JobType.CONTRACT).toBe('contract');
      expect(JobType.INTERNSHIP).toBe('internship');
    });
  });

  describe('Site', () => {
    it('should have all expected sites', () => {
      expect(Site.LINKEDIN).toBe('linkedin');
      expect(Site.INDEED).toBe('indeed');
      expect(Site.ZIP_RECRUITER).toBe('zip_recruiter');
      expect(Site.GLASSDOOR).toBe('glassdoor');
      expect(Site.GOOGLE).toBe('google');
      expect(Site.BAYT).toBe('bayt');
      expect(Site.NAUKRI).toBe('naukri');
      expect(Site.BDJOBS).toBe('bdjobs');
    });

    it('should have exactly 8 sites', () => {
      expect(Object.values(Site)).toHaveLength(8);
    });
  });

  describe('getCountryFromString', () => {
    it('should parse USA correctly', () => {
      expect(getCountryFromString('usa')).toBe(Country.USA);
      expect(getCountryFromString('USA')).toBe(Country.USA);
      expect(getCountryFromString('us')).toBe(Country.USA);
      expect(getCountryFromString('united states')).toBe(Country.USA);
    });

    it('should parse UK correctly', () => {
      expect(getCountryFromString('uk')).toBe(Country.UK);
      expect(getCountryFromString('united kingdom')).toBe(Country.UK);
    });

    it('should throw for invalid country', () => {
      expect(() => getCountryFromString('invalid_country')).toThrow();
    });
  });

  describe('displayLocation', () => {
    it('should format city, state, country', () => {
      const location = {
        city: 'San Francisco',
        state: 'CA',
        country: Country.USA,
      };
      // Country.USA displays as uppercase due to special case handling
      expect(displayLocation(location)).toBe('San Francisco, CA, USA');
    });

    it('should format city and state with Country enum', () => {
      const location = {
        city: 'San Francisco',
        state: 'CA',
        country: Country.CANADA,
      };
      expect(displayLocation(location)).toBe('San Francisco, CA, Canada');
    });

    it('should handle partial location', () => {
      const location = { city: 'New York' };
      expect(displayLocation(location)).toBe('New York');
    });

    it('should handle empty location', () => {
      const location = {};
      expect(displayLocation(location)).toBe('');
    });
  });

  describe('getIndeedDomainValue', () => {
    it('should return correct domain for USA', () => {
      const result = getIndeedDomainValue(Country.USA);
      expect(result.domain).toBe('www');
      expect(result.apiCode).toBe('US');
    });

    it('should return correct domain for UK', () => {
      const result = getIndeedDomainValue(Country.UK);
      expect(result.domain).toBe('uk');
      expect(result.apiCode).toBe('GB');
    });
  });

  describe('getGlassdoorUrl', () => {
    it('should return correct URL for USA', () => {
      const url = getGlassdoorUrl(Country.USA);
      expect(url).toBe('https://www.glassdoor.com/');
    });

    it('should return correct URL for UK', () => {
      const url = getGlassdoorUrl(Country.UK);
      expect(url).toContain('glassdoor');
      expect(url).toContain('uk');
    });

    it('should throw for country without Glassdoor support', () => {
      expect(() => getGlassdoorUrl(Country.BAHRAIN)).toThrow();
    });
  });

  describe('COUNTRY_CONFIG', () => {
    it('should have config for all countries', () => {
      const countries = Object.values(Country);
      for (const country of countries) {
        expect(COUNTRY_CONFIG[country]).toBeDefined();
        expect(COUNTRY_CONFIG[country].names).toBeDefined();
        expect(COUNTRY_CONFIG[country].indeedDomain).toBeDefined();
      }
    });
  });

  describe('CompensationInterval', () => {
    it('should have correct values', () => {
      expect(CompensationInterval.YEARLY).toBe('yearly');
      expect(CompensationInterval.MONTHLY).toBe('monthly');
      expect(CompensationInterval.WEEKLY).toBe('weekly');
      expect(CompensationInterval.DAILY).toBe('daily');
      expect(CompensationInterval.HOURLY).toBe('hourly');
    });
  });

  describe('DescriptionFormat', () => {
    it('should have correct values', () => {
      expect(DescriptionFormat.MARKDOWN).toBe('markdown');
      expect(DescriptionFormat.HTML).toBe('html');
      expect(DescriptionFormat.PLAIN).toBe('plain');
    });
  });
});
