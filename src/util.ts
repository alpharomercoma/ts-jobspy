/**
 * ts-jobspy - TypeScript Job Scraper
 * Utility functions for HTTP sessions, proxy rotation, logging, and converters
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { readFileSync } from 'node:fs';
import { Agent as HttpsAgent } from 'node:https';
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import { CompensationInterval, JobType, JOB_TYPE_VARIATIONS, Site } from './model';

/**
 * Log levels
 */
enum LogLevel {
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
class RotatingProxySession {
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

  // Custom CA: read once and attach to every request's agent.
  const ca = caCert ? readFileSync(caCert) : undefined;

  const instance = axios.create({
    timeout,
    // Resolve every HTTP status so scrapers can classify 429/4xx/5xx themselves
    // (see each scraper's status handling). Network errors still reject and are
    // subject to the retry policy below; HTTP status codes are not auto-retried,
    // which avoids turning a single 429 into a burst of blocked requests.
    validateStatus: () => true,
    headers: {
      'User-Agent':
        userAgent ??
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  // Add request interceptor for proxy rotation
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    let agentAttached = false;
    if (proxySession.hasProxies()) {
      const proxy = proxySession.getNextProxy();
      if (proxy && proxy.http !== 'http://localhost') {
        const proxyUrl = proxy.https;
        if (proxyUrl.startsWith('socks')) {
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
        } else {
          config.httpsAgent = new HttpsProxyAgent(proxyUrl, ca ? { ca } : {});
          config.httpAgent = new HttpsProxyAgent(proxyUrl);
        }
        agentAttached = true;
      }
    }

    // No proxy but a custom CA: attach a plain https agent carrying it.
    if (ca && !agentAttached) {
      config.httpsAgent = new HttpsAgent({ ca });
    }

    return config;
  });

  // Configure retry if enabled
  if (hasRetry) {
    axiosRetry(instance, {
      retries: maxRetries,
      retryDelay: (retryCount) => retryCount * retryDelay * 1000,
      // Only retry transport-level failures. HTTP status codes (429/5xx) resolve
      // rather than throw (validateStatus above), so retrying them here would
      // both never fire and, if it did, amplify a block into repeated requests -
      // scrapers classify those statuses and back off by returning instead.
      retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error),
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
 * Map a leading currency symbol to an ISO 4217 code so the public `currency`
 * field is always an ISO code (matching Indeed's output), never a raw symbol.
 *
 * A bare '$' is inherently ambiguous (USD, CAD, AUD, SGD, ...); we default it
 * to USD as a best effort since it is by far the most common on the boards we
 * scrape, but genuinely ambiguous or unknown symbols return null rather than
 * inventing a wrong ISO code. Callers should treat null as "unknown currency".
 */
export function currencyFromSymbol(text: string): string | null {
  const trimmed = text.trim();
  // Multi-character prefixes must be checked before the single leading char,
  // so "CA$" is CAD (not C...) and "A$" is AUD (not A...).
  const prefixToIso: Array<[string, string]> = [
    ['CA$', 'CAD'],
    ['C$', 'CAD'],
    ['A$', 'AUD'],
    ['AU$', 'AUD'],
    ['NZ$', 'NZD'],
    ['HK$', 'HKD'],
    ['S$', 'SGD'],
    ['US$', 'USD'],
    ['R$', 'BRL'],
    ['CHF', 'CHF'],
    ['MX$', 'MXN'],
  ];
  for (const [prefix, iso] of prefixToIso) {
    if (trimmed.startsWith(prefix)) return iso;
  }
  const symbolToIso: Record<string, string> = {
    $: 'USD',
    '£': 'GBP',
    '€': 'EUR',
    '₹': 'INR',
    '₩': 'KRW',
    '₺': 'TRY',
    '₪': 'ILS',
    '₽': 'RUB',
    R: 'ZAR',
  };
  return symbolToIso[trimmed[0]] ?? null;
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

/** Factor that turns one interval's amount into a yearly amount. */
const ANNUAL_FACTOR: Record<CompensationInterval, number> = {
  [CompensationInterval.YEARLY]: 1,
  [CompensationInterval.MONTHLY]: 12,
  [CompensationInterval.WEEKLY]: 52,
  [CompensationInterval.DAILY]: 260,
  [CompensationInterval.HOURLY]: 2080,
};

/**
 * Detect the pay interval from an explicit unit in the text (e.g. "per hour",
 * "/yr", "a week", "P.A."). Returns null when the text states no unit, so the
 * caller can fall back to a magnitude heuristic rather than guessing wrongly.
 */
export function intervalFromText(text: string): CompensationInterval | null {
  const t = text.toLowerCase();
  if (/(per\s*hour|\/\s*h(ou)?r|hourly|an?\s+hour)/.test(t)) return CompensationInterval.HOURLY;
  if (/(per\s*day|\/\s*day|daily|an?\s+day)/.test(t)) return CompensationInterval.DAILY;
  if (/(per\s*week|\/\s*w(ee)?k|weekly|an?\s+week)/.test(t)) return CompensationInterval.WEEKLY;
  if (/(per\s*month|\/\s*mo(nth)?|monthly|an?\s+month)/.test(t))
    return CompensationInterval.MONTHLY;
  if (/(per\s*(year|annum)|\/\s*y(ea)?r|p\.?\s*a\.?|yearly|annual|an?\s+year)/.test(t))
    return CompensationInterval.YEARLY;
  return null;
}

/**
 * Extract a salary range from free text.
 *
 * The interval comes from an explicit unit in the text when present ("per week",
 * "/yr", "P.A."); only when the text states none do we fall back to a magnitude
 * heuristic. Amounts are parsed with parseFloat so cents are preserved. With
 * enforceAnnualSalary the amounts are annualized and the interval is reported as
 * 'yearly' (never the pre-conversion unit).
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

  const minMaxPattern =
    /\$(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)\s*[-–—]\s*(?:\$)?(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)/;

  const toNum = (s: string): number => parseFloat(s.replace(/,/g, ''));

  const match = salaryStr.match(minMaxPattern);

  if (!match) return nullResult;

  let minSalary = toNum(match[1]);
  let maxSalary = toNum(match[3]);

  // Handle 'k' suffix
  if (match[2].toLowerCase() === 'k' || match[4].toLowerCase() === 'k') {
    minSalary *= 1000;
    maxSalary *= 1000;
  }

  // Prefer an explicit unit stated in the text; fall back to magnitude only when
  // the text gives no unit at all.
  let interval = intervalFromText(salaryStr);
  if (interval === null) {
    if (minSalary < hourlyThreshold) interval = CompensationInterval.HOURLY;
    else if (minSalary < monthlyThreshold) interval = CompensationInterval.MONTHLY;
    else interval = CompensationInterval.YEARLY;
  }

  const factor = ANNUAL_FACTOR[interval];
  const annualMinSalary = minSalary * factor;
  const annualMaxSalary = maxSalary * factor;

  // Validate the annualized range so hourly/annual figures share one scale.
  if (
    annualMinSalary >= lowerLimit &&
    annualMinSalary <= upperLimit &&
    annualMaxSalary >= lowerLimit &&
    annualMaxSalary <= upperLimit &&
    annualMinSalary < annualMaxSalary
  ) {
    if (enforceAnnualSalary) {
      return {
        interval: CompensationInterval.YEARLY,
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
  if (!jobData.interval || (!jobData.minAmount && !jobData.maxAmount)) return;

  const factor = ANNUAL_FACTOR[jobData.interval as CompensationInterval];
  if (!factor || factor === 1) {
    // Unknown or already-yearly interval: still label it yearly if convertible.
    if (jobData.interval in ANNUAL_FACTOR) jobData.interval = 'yearly';
    return;
  }
  // Convert each bound that is actually present (a one-sided range is valid).
  if (jobData.minAmount) jobData.minAmount *= factor;
  if (jobData.maxAmount) jobData.maxAmount *= factor;
  jobData.interval = 'yearly';
}

/**
 * Sleep utility for delays. When a signal is given, the sleep rejects with an
 * AbortError the moment the signal aborts, so paced scrapers stop promptly on a
 * timeout instead of finishing their delay first.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Random delay between min and max seconds. Abortable via the optional signal.
 */
export function randomDelay(min: number, max: number, signal?: AbortSignal): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  return sleep(delay * 1000, signal);
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
