/**
 * Unit tests for util.ts
 */

import {
  createLogger,
  setLoggerLevel,
  markdownConverter,
  plainConverter,
  extractEmailsFromText,
  getEnumFromJobType,
  mapStrToSite,
  currencyParser,
  extractSalary,
  extractJobType,
  convertToAnnual,
  sleep,
  isJobRemote,
} from '../src/util';
import { JobType, Site } from '../src/model';

describe('Utility Tests', () => {
  describe('createLogger', () => {
    it('should create a logger with the correct name', () => {
      const logger = createLogger('TestLogger');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warning).toBe('function');
    });
  });

  describe('setLoggerLevel', () => {
    it('should not throw for valid levels', () => {
      expect(() => setLoggerLevel(0)).not.toThrow();
      expect(() => setLoggerLevel(1)).not.toThrow();
      expect(() => setLoggerLevel(2)).not.toThrow();
    });

    it('should handle undefined', () => {
      expect(() => setLoggerLevel(undefined)).not.toThrow();
    });
  });

  describe('markdownConverter', () => {
    it('should convert HTML to markdown', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const result = markdownConverter(html);
      expect(result).toContain('Hello');
      expect(result).toContain('world');
    });

    it('should return null for null input', () => {
      expect(markdownConverter(null)).toBeNull();
    });
  });

  describe('plainConverter', () => {
    it('should convert HTML to plain text', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const result = plainConverter(html);
      expect(result).toBe('Hello world');
    });

    it('should return null for null input', () => {
      expect(plainConverter(null)).toBeNull();
    });
  });

  describe('extractEmailsFromText', () => {
    it('should extract emails from text', () => {
      const text = 'Contact us at test@example.com or hr@company.org';
      const emails = extractEmailsFromText(text);
      expect(emails).toEqual(['test@example.com', 'hr@company.org']);
    });

    it('should return null for text without emails', () => {
      const emails = extractEmailsFromText('No emails here');
      expect(emails).toBeNull();
    });

    it('should return null for null input', () => {
      expect(extractEmailsFromText(null)).toBeNull();
    });
  });

  describe('getEnumFromJobType', () => {
    it('should return FULL_TIME for "fulltime"', () => {
      expect(getEnumFromJobType('fulltime')).toBe(JobType.FULL_TIME);
    });

    it('should handle variations', () => {
      expect(getEnumFromJobType('full-time')).toBe(JobType.FULL_TIME);
      expect(getEnumFromJobType('parttime')).toBe(JobType.PART_TIME);
    });

    it('should return null for unknown type', () => {
      expect(getEnumFromJobType('unknown')).toBeNull();
    });
  });

  describe('mapStrToSite', () => {
    it('should map string to Site enum', () => {
      expect(mapStrToSite('linkedin')).toBe(Site.LINKEDIN);
      expect(mapStrToSite('indeed')).toBe(Site.INDEED);
      expect(mapStrToSite('ziprecruiter')).toBe(Site.ZIP_RECRUITER);
    });

    it('should throw for unknown site', () => {
      expect(() => mapStrToSite('unknown')).toThrow();
    });
  });

  describe('currencyParser', () => {
    it('should parse currency strings', () => {
      expect(currencyParser('$100,000')).toBe(100000);
      expect(currencyParser('$50.50')).toBe(50.5);
    });
  });

  describe('extractSalary', () => {
    it('should extract salary range from text', () => {
      const result = extractSalary('Salary: $100,000 - $150,000');
      expect(result.minAmount).toBe(100000);
      expect(result.maxAmount).toBe(150000);
      expect(result.currency).toBe('USD');
    });

    it('should handle k suffix', () => {
      const result = extractSalary('$100k - $150k per year');
      expect(result.minAmount).toBe(100000);
      expect(result.maxAmount).toBe(150000);
    });

    it('should return nulls for invalid input', () => {
      const result = extractSalary('No salary info');
      expect(result.minAmount).toBeNull();
      expect(result.maxAmount).toBeNull();
    });
  });

  describe('extractJobType', () => {
    it('should extract job types from description', () => {
      const types = extractJobType('This is a full time position');
      expect(types).toContain(JobType.FULL_TIME);
    });

    it('should extract multiple job types', () => {
      const types = extractJobType('Full time or contract position');
      expect(types).toContain(JobType.FULL_TIME);
      expect(types).toContain(JobType.CONTRACT);
    });

    it('should return null for no matches', () => {
      expect(extractJobType('No job type mentioned')).toBeNull();
    });
  });

  describe('convertToAnnual', () => {
    it('should convert hourly to annual', () => {
      const data = { interval: 'hourly', minAmount: 50, maxAmount: 75 };
      convertToAnnual(data);
      expect(data.interval).toBe('yearly');
      expect(data.minAmount).toBe(50 * 2080);
      expect(data.maxAmount).toBe(75 * 2080);
    });

    it('should convert monthly to annual', () => {
      const data = { interval: 'monthly', minAmount: 5000, maxAmount: 7000 };
      convertToAnnual(data);
      expect(data.interval).toBe('yearly');
      expect(data.minAmount).toBe(5000 * 12);
      expect(data.maxAmount).toBe(7000 * 12);
    });
  });

  describe('sleep', () => {
    it('should wait for specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('isJobRemote', () => {
    it('should detect remote in title', () => {
      expect(isJobRemote('Remote Software Engineer', null, null)).toBe(true);
    });

    it('should detect remote in description', () => {
      expect(
        isJobRemote('Software Engineer', 'This is a remote position', null)
      ).toBe(true);
    });

    it('should detect wfh', () => {
      expect(isJobRemote('WFH Developer', null, null)).toBe(true);
    });

    it('should return false for non-remote jobs', () => {
      expect(isJobRemote('On-site Developer', 'Office based', null)).toBe(
        false
      );
    });
  });
});
