/**
 * ts-jobspy - TypeScript Job Scraper
 * Utility functions for HTTP sessions, proxy rotation, logging, and converters
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import axiosRetry from 'axios-retry';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import { CompensationInterval, JobType, JOB_TYPE_VARIATIONS, Site } from './model';

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 0,
  WARNING = 1,
  INFO = 2,
  DEBUG = 3,
}

let globalLogLevel: LogLevel = LogLevel.INFO;

/**
 * Logger class for consistent logging
 */
export class Logger {
  private name: string;

  constructor(name: string) {
    this.name = `JobSpy:${name}`;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} - ${level} - ${this.name} - ${message}`;
  }

  error(message: string): void {
    if (globalLogLevel >= LogLevel.ERROR) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('ERROR', message));
    }
  }

  warning(message: string): void {
    if (globalLogLevel >= LogLevel.WARNING) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('WARNING', message));
    }
  }

  info(message: string): void {
    if (globalLogLevel >= LogLevel.INFO) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('INFO', message));
    }
  }

  debug(message: string): void {
    if (globalLogLevel >= LogLevel.DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('DEBUG', message));
    }
  }
}

/**
 * Create a logger instance
 */
export function createLogger(name: string): Logger {
  return new Logger(name);
}

/**
 * Set global logger level
 */
export function setLoggerLevel(verbose: number | undefined): void {
  if (verbose === undefined || verbose === null) return;
  const levelMap: Record<number, LogLevel> = {
    0: LogLevel.ERROR,
    1: LogLevel.WARNING,
    2: LogLevel.INFO,
    3: LogLevel.DEBUG,
  };
  globalLogLevel = levelMap[verbose] ?? LogLevel.INFO;
}

/**
 * Proxy configuration interface
 */
interface ProxyConfig {
  http: string;
  https: string;
}

/**
 * Format a proxy string into a config object
 */
function formatProxy(proxy: string): ProxyConfig {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    return { http: proxy, https: proxy };
  }
  if (proxy.startsWith('socks5://') || proxy.startsWith('socks4://')) {
    return { http: proxy, https: proxy };
  }
  return { http: `http://${proxy}`, https: `http://${proxy}` };
}

/**
 * Rotating proxy session for load balancing requests across proxies
 */
export class RotatingProxySession {
  private proxies: ProxyConfig[];
  private proxyIndex: number = 0;

  constructor(proxies?: string | string[] | null) {
    this.proxies = [];
    if (proxies) {
      if (typeof proxies === 'string') {
        this.proxies = [formatProxy(proxies)];
      } else if (Array.isArray(proxies)) {
        this.proxies = proxies.map(formatProxy);
      }
    }
  }

  getNextProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.proxyIndex];
    this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  hasProxies(): boolean {
    return this.proxies.length > 0;
  }
}

/**
 * Session options for creating HTTP clients
 */
export interface SessionOptions {
  proxies?: string | string[] | null;
  caCert?: string | null;
  hasRetry?: boolean;
  retryDelay?: number;
  maxRetries?: number;
  clearCookies?: boolean;
  timeout?: number;
  userAgent?: string;
}

/**
 * Create an axios session with optional proxy rotation and retry
 */
export function createSession(options: SessionOptions = {}): AxiosInstance {
  const {
    proxies,
    caCert,
    hasRetry = false,
    retryDelay = 1,
    maxRetries = 3,
    timeout = 30000,
    userAgent,
  } = options;

  const proxySession = new RotatingProxySession(proxies);

  const instance = axios.create({
    timeout,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      'User-Agent': userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  // Add request interceptor for proxy rotation
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (proxySession.hasProxies()) {
      const proxy = proxySession.getNextProxy();
      if (proxy && proxy.http !== 'http://localhost') {
        const proxyUrl = proxy.https;
        if (proxyUrl.startsWith('socks')) {
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
        } else {
          config.httpsAgent = new HttpsProxyAgent(proxyUrl);
          config.httpAgent = new HttpsProxyAgent(proxyUrl);
        }
      }
    }

    if (caCert) {
      // For custom CA certificates, would need to configure with https.Agent
      // This is handled by the proxy agents if needed
    }

    return config;
  });

  // Configure retry if enabled
  if (hasRetry) {
    axiosRetry(instance, {
      retries: maxRetries,
      retryDelay: (retryCount) => retryCount * retryDelay * 1000,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          error.response?.status === 500 ||
          error.response?.status === 502 ||
          error.response?.status === 503 ||
          error.response?.status === 504
        );
      },
    });
  }

  return instance;
}

/**
 * Turndown service for markdown conversion
 */
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Convert HTML to Markdown
 */
export function markdownConverter(html: string | null): string | null {
  if (!html) return null;
  return turndownService.turndown(html).trim();
}

/**
 * Convert HTML to plain text
 */
export function plainConverter(html: string | null): string | null {
  if (!html) return null;
  const $ = cheerio.load(html);
  const text = $.text();
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract emails from text
 */
export function extractEmailsFromText(text: string | null): string[] | null {
  if (!text) return null;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches && matches.length > 0 ? matches : null;
}

/**
 * Get JobType enum from string value
 */
export function getEnumFromJobType(jobTypeStr: string): JobType | null {
  const normalized = jobTypeStr.toLowerCase().replace(/[-\s]/g, '');
  for (const [jobType, variations] of Object.entries(JOB_TYPE_VARIATIONS)) {
    if (variations.includes(normalized)) {
      return jobType as JobType;
    }
  }
  return null;
}

/**
 * Map string to Site enum
 */
export function mapStrToSite(siteName: string): Site {
  const siteMap: Record<string, Site> = {
    linkedin: Site.LINKEDIN,
    indeed: Site.INDEED,
    zip_recruiter: Site.ZIP_RECRUITER,
    ziprecruiter: Site.ZIP_RECRUITER,
    glassdoor: Site.GLASSDOOR,
    google: Site.GOOGLE,
    bayt: Site.BAYT,
    naukri: Site.NAUKRI,
    bdjobs: Site.BDJOBS,
  };
  const site = siteMap[siteName.toLowerCase()];
  if (!site) {
    throw new Error(`Unknown site: ${siteName}`);
  }
  return site;
}

/**
 * Parse currency from string
 */
export function currencyParser(currencyStr: string): number {
  // Remove any non-numerical characters except for ',' '.' or '-'
  let cleaned = currencyStr.replace(/[^-0-9.,]/g, '');

  // Remove thousands separators (either , or .)
  if (cleaned.length > 3) {
    const lastThree = cleaned.slice(-3);
    const beforeLastThree = cleaned.slice(0, -3);
    cleaned = beforeLastThree.replace(/[.,]/g, '') + lastThree;
  }

  // Handle decimal separator
  if (cleaned.includes('.') && cleaned.indexOf('.') >= cleaned.length - 3) {
    return Math.round(parseFloat(cleaned) * 100) / 100;
  } else if (cleaned.includes(',') && cleaned.indexOf(',') >= cleaned.length - 3) {
    return Math.round(parseFloat(cleaned.replace(',', '.')) * 100) / 100;
  }

  return parseFloat(cleaned);
}

/**
 * Remove all attributes from HTML element (for clean output)
 */
export function removeAttributes(html: string): string {
  const $ = cheerio.load(html);
  $('*').each((_, el) => {
    const element = $(el);
    const attrs = element.attr();
    if (attrs) {
      Object.keys(attrs).forEach((attr) => {
        element.removeAttr(attr);
      });
    }
  });
  return $.html();
}

/**
 * Extract job type from description
 */
export function extractJobType(description: string | null): JobType[] | null {
  if (!description) return null;

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

  const types: JobType[] = [];
  for (const [jobType, pattern] of Object.entries(keywords)) {
    if (pattern.test(description)) {
      types.push(jobType as JobType);
    }
  }

  return types.length > 0 ? types : null;
}

/**
 * Extract salary from description text
 */
export function extractSalary(
  salaryStr: string | null,
  options: {
    lowerLimit?: number;
    upperLimit?: number;
    hourlyThreshold?: number;
    monthlyThreshold?: number;
    enforceAnnualSalary?: boolean;
  } = {}
): {
  interval: CompensationInterval | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
} {
  const {
    lowerLimit = 1000,
    upperLimit = 700000,
    hourlyThreshold = 350,
    monthlyThreshold = 30000,
    enforceAnnualSalary = false,
  } = options;

  const nullResult = { interval: null, minAmount: null, maxAmount: null, currency: null };

  if (!salaryStr) return nullResult;

  const minMaxPattern = /\$(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)\s*[-—–]\s*(?:\$)?(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)/;

  const toInt = (s: string): number => parseInt(s.replace(/,/g, ''), 10);
  const convertHourlyToAnnual = (hourly: number): number => hourly * 2080;
  const convertMonthlyToAnnual = (monthly: number): number => monthly * 12;

  const match = salaryStr.match(minMaxPattern);

  if (!match) return nullResult;

  let minSalary = toInt(match[1]);
  let maxSalary = toInt(match[3]);

  // Handle 'k' suffix
  if (match[2].toLowerCase() === 'k' || match[4].toLowerCase() === 'k') {
    minSalary *= 1000;
    maxSalary *= 1000;
  }

  let interval: CompensationInterval;
  let annualMinSalary: number;
  let annualMaxSalary: number | null = null;

  if (minSalary < hourlyThreshold) {
    interval = CompensationInterval.HOURLY;
    annualMinSalary = convertHourlyToAnnual(minSalary);
    if (maxSalary < hourlyThreshold) {
      annualMaxSalary = convertHourlyToAnnual(maxSalary);
    }
  } else if (minSalary < monthlyThreshold) {
    interval = CompensationInterval.MONTHLY;
    annualMinSalary = convertMonthlyToAnnual(minSalary);
    if (maxSalary < monthlyThreshold) {
      annualMaxSalary = convertMonthlyToAnnual(maxSalary);
    }
  } else {
    interval = CompensationInterval.YEARLY;
    annualMinSalary = minSalary;
    annualMaxSalary = maxSalary;
  }

  if (!annualMaxSalary) return nullResult;

  // Validate salary range
  if (
    annualMinSalary >= lowerLimit &&
    annualMinSalary <= upperLimit &&
    annualMaxSalary >= lowerLimit &&
    annualMaxSalary <= upperLimit &&
    annualMinSalary < annualMaxSalary
  ) {
    if (enforceAnnualSalary) {
      return {
        interval,
        minAmount: annualMinSalary,
        maxAmount: annualMaxSalary,
        currency: 'USD',
      };
    }
    return {
      interval,
      minAmount: minSalary,
      maxAmount: maxSalary,
      currency: 'USD',
    };
  }

  return nullResult;
}

/**
 * Convert compensation to annual salary
 */
export function convertToAnnual(jobData: {
  interval?: string;
  minAmount?: number;
  maxAmount?: number;
}): void {
  if (!jobData.interval || !jobData.minAmount || !jobData.maxAmount) return;

  switch (jobData.interval) {
    case 'hourly':
      jobData.minAmount *= 2080;
      jobData.maxAmount *= 2080;
      break;
    case 'monthly':
      jobData.minAmount *= 12;
      jobData.maxAmount *= 12;
      break;
    case 'weekly':
      jobData.minAmount *= 52;
      jobData.maxAmount *= 52;
      break;
    case 'daily':
      jobData.minAmount *= 260;
      jobData.maxAmount *= 260;
      break;
  }
  jobData.interval = 'yearly';
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  return sleep(delay * 1000);
}

/**
 * Parse date from string
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }
  return null;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Check if job is remote based on text content
 */
export function isJobRemote(
  title: string,
  description: string | null,
  location: string | null
): boolean {
  const remoteKeywords = ['remote', 'work from home', 'wfh'];
  const fullString = `${title} ${description ?? ''} ${location ?? ''}`.toLowerCase();
  return remoteKeywords.some((keyword) => fullString.includes(keyword));
}

/**
 * Get enum value from string
 */
export function getEnumFromValue(valueStr: string): JobType {
  const normalized = valueStr.toLowerCase().replace(/[-\s]/g, '');
  for (const [jobType, variations] of Object.entries(JOB_TYPE_VARIATIONS)) {
    if (variations.includes(normalized)) {
      return jobType as JobType;
    }
  }
  throw new Error(`Invalid job type: ${valueStr}`);
}
