/**
 * Unit tests for exception.ts
 */

import {
  JobSpyException,
  LinkedInException,
  IndeedException,
  ZipRecruiterException,
  GlassdoorException,
  GoogleJobsException,
  BaytException,
  NaukriException,
  BDJobsException,
  RateLimitException,
  ProxyException,
} from '../src/exception';

describe('Exception Tests', () => {
  describe('JobSpyException', () => {
    it('should create with default message', () => {
      const error = new JobSpyException();
      expect(error.message).toBe('An error occurred with JobSpy');
      expect(error.name).toBe('JobSpyException');
    });

    it('should create with custom message', () => {
      const error = new JobSpyException('Custom message');
      expect(error.message).toBe('Custom message');
    });

    it('should be instanceof Error', () => {
      const error = new JobSpyException();
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('LinkedInException', () => {
    it('should create with default message', () => {
      const error = new LinkedInException();
      expect(error.message).toBe('An error occurred with LinkedIn');
      expect(error.name).toBe('LinkedInException');
    });

    it('should be instanceof JobSpyException', () => {
      const error = new LinkedInException();
      expect(error instanceof JobSpyException).toBe(true);
    });
  });

  describe('IndeedException', () => {
    it('should create with default message', () => {
      const error = new IndeedException();
      expect(error.message).toBe('An error occurred with Indeed');
      expect(error.name).toBe('IndeedException');
    });
  });

  describe('ZipRecruiterException', () => {
    it('should create with default message', () => {
      const error = new ZipRecruiterException();
      expect(error.message).toBe('An error occurred with ZipRecruiter');
      expect(error.name).toBe('ZipRecruiterException');
    });
  });

  describe('GlassdoorException', () => {
    it('should create with default message', () => {
      const error = new GlassdoorException();
      expect(error.message).toBe('An error occurred with Glassdoor');
      expect(error.name).toBe('GlassdoorException');
    });
  });

  describe('GoogleJobsException', () => {
    it('should create with default message', () => {
      const error = new GoogleJobsException();
      expect(error.message).toBe('An error occurred with Google Jobs');
      expect(error.name).toBe('GoogleJobsException');
    });
  });

  describe('BaytException', () => {
    it('should create with default message', () => {
      const error = new BaytException();
      expect(error.message).toBe('An error occurred with Bayt');
      expect(error.name).toBe('BaytException');
    });
  });

  describe('NaukriException', () => {
    it('should create with default message', () => {
      const error = new NaukriException();
      expect(error.message).toBe('An error occurred with Naukri');
      expect(error.name).toBe('NaukriException');
    });
  });

  describe('BDJobsException', () => {
    it('should create with default message', () => {
      const error = new BDJobsException();
      expect(error.message).toBe('An error occurred with BDJobs');
      expect(error.name).toBe('BDJobsException');
    });
  });

  describe('RateLimitException', () => {
    it('should create with site name', () => {
      const error = new RateLimitException('LinkedIn');
      expect(error.message).toBe('Rate limited by LinkedIn');
      expect(error.name).toBe('RateLimitException');
    });
  });

  describe('ProxyException', () => {
    it('should create with default message', () => {
      const error = new ProxyException();
      expect(error.message).toBe('Proxy connection failed');
      expect(error.name).toBe('ProxyException');
    });
  });
});
