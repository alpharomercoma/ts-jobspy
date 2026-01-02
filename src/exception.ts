/**
 * ts-jobspy - TypeScript Job Scraper
 * Custom exception classes for each scraper
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

/**
 * Base exception class for JobSpy errors
 */
export class JobSpyException extends Error {
  constructor(message?: string) {
    super(message ?? 'An error occurred with JobSpy');
    this.name = 'JobSpyException';
    Object.setPrototypeOf(this, JobSpyException.prototype);
  }
}

/**
 * LinkedIn scraper exception
 */
export class LinkedInException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with LinkedIn');
    this.name = 'LinkedInException';
    Object.setPrototypeOf(this, LinkedInException.prototype);
  }
}

/**
 * Indeed scraper exception
 */
export class IndeedException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with Indeed');
    this.name = 'IndeedException';
    Object.setPrototypeOf(this, IndeedException.prototype);
  }
}

/**
 * ZipRecruiter scraper exception
 */
export class ZipRecruiterException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with ZipRecruiter');
    this.name = 'ZipRecruiterException';
    Object.setPrototypeOf(this, ZipRecruiterException.prototype);
  }
}

/**
 * Glassdoor scraper exception
 */
export class GlassdoorException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with Glassdoor');
    this.name = 'GlassdoorException';
    Object.setPrototypeOf(this, GlassdoorException.prototype);
  }
}

/**
 * Google Jobs scraper exception
 */
export class GoogleJobsException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with Google Jobs');
    this.name = 'GoogleJobsException';
    Object.setPrototypeOf(this, GoogleJobsException.prototype);
  }
}

/**
 * Bayt scraper exception
 */
export class BaytException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with Bayt');
    this.name = 'BaytException';
    Object.setPrototypeOf(this, BaytException.prototype);
  }
}

/**
 * Naukri scraper exception
 */
export class NaukriException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with Naukri');
    this.name = 'NaukriException';
    Object.setPrototypeOf(this, NaukriException.prototype);
  }
}

/**
 * BDJobs scraper exception
 */
export class BDJobsException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'An error occurred with BDJobs');
    this.name = 'BDJobsException';
    Object.setPrototypeOf(this, BDJobsException.prototype);
  }
}

/**
 * Rate limit exception
 */
export class RateLimitException extends JobSpyException {
  constructor(site: string, message?: string) {
    super(message ?? `Rate limited by ${site}`);
    this.name = 'RateLimitException';
    Object.setPrototypeOf(this, RateLimitException.prototype);
  }
}

/**
 * Proxy error exception
 */
export class ProxyException extends JobSpyException {
  constructor(message?: string) {
    super(message ?? 'Proxy connection failed');
    this.name = 'ProxyException';
    Object.setPrototypeOf(this, ProxyException.prototype);
  }
}
