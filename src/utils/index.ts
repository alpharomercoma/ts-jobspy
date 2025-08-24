import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CompensationInterval, Compensation, JobType } from '../types';

export * from './logger';
export * from './salary';
export * from './email';
export * from './markdown';

// Export htmlToMarkdown as markdownConverter for backward compatibility
export { htmlToMarkdown as markdownConverter } from './markdown';

export class Logger {
  private name: string;
  private level: 'error' | 'warn' | 'info' | 'debug';

  constructor(name: string, level: 'error' | 'warn' | 'info' | 'debug' = 'info') {
    this.name = name;
    this.level = level;
  }

  private shouldLog(level: 'error' | 'warn' | 'info' | 'debug'): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.level);
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[${new Date().toISOString()}] ERROR [${this.name}]: ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[${new Date().toISOString()}] WARN [${this.name}]: ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[${new Date().toISOString()}] INFO [${this.name}]: ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[${new Date().toISOString()}] DEBUG [${this.name}]: ${message}`, ...args);
    }
  }

  setLevel(level: 'error' | 'warn' | 'info' | 'debug'): void {
    this.level = level;
  }
}

export function createLogger(name: string): Logger {
  return new Logger(`ts-jobspy:${name}`);
}

export class ProxyRotator {
  private proxies: string[];
  private currentIndex: number = 0;

  constructor(proxies: string[] | string) {
    this.proxies = Array.isArray(proxies) ? proxies : [proxies];
  }

  getNext(): string | undefined {
    if (this.proxies.length === 0) return undefined;
    
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  formatProxy(proxy: string): { httpAgent?: any; httpsAgent?: any } {
    if (proxy === 'localhost') return {};
    
    if (proxy.startsWith('socks5://') || proxy.startsWith('socks4://')) {
      const agent = new SocksProxyAgent(proxy);
      return { httpAgent: agent, httpsAgent: agent };
    } else {
      const proxyUrl = proxy.startsWith('http') ? proxy : `http://${proxy}`;
      const agent = new HttpsProxyAgent(proxyUrl);
      return { httpAgent: agent, httpsAgent: agent };
    }
  }
}

export class SessionManager {
  private axiosInstance: AxiosInstance;
  private proxyRotator?: ProxyRotator;
  private userAgent: string;

  constructor(config?: {
    proxies?: string[] | string;
    userAgent?: string;
    timeout?: number;
    caCert?: string;
  }) {
    this.userAgent = config?.userAgent || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    if (config?.proxies) {
      this.proxyRotator = new ProxyRotator(config.proxies);
    }

    this.axiosInstance = axios.create({
      timeout: config?.timeout || 30000,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // Add request interceptor for proxy rotation
    this.axiosInstance.interceptors.request.use((config) => {
      if (this.proxyRotator) {
        const proxy = this.proxyRotator.getNext();
        if (proxy) {
          const proxyConfig = this.proxyRotator.formatProxy(proxy);
          Object.assign(config, proxyConfig);
        }
      }
      return config;
    });
  }

  async get(url: string, config?: AxiosRequestConfig) {
    return this.axiosInstance.get(url, config);
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.axiosInstance.post(url, data, config);
  }

  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

export class MarkdownConverter {
  constructor() {}

  convert(html: string): string {
    if (!html) return '';
    
    // Simple HTML to text conversion without external dependencies
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }
}

export function extractEmailsFromText(text: string): string[] | null {
  if (!text) return null;
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  
  return emails ? [...new Set(emails)] : null;
}

export function extractJobType(text: string, jobTypes: JobType[]): JobType[] | undefined {
  if (!text) return undefined;

  const foundTypes = new Set<JobType>();
  const lowerText = text.toLowerCase();

  for (const jobType of jobTypes) {
    if (lowerText.includes(jobType.toLowerCase())) {
      foundTypes.add(jobType);
    }
  }

  return foundTypes.size > 0 ? Array.from(foundTypes) : undefined;
}

export function extractSalary(
  salaryStr: string,
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

  if (!salaryStr) {
    return { interval: null, minAmount: null, maxAmount: null, currency: null };
  }

  const minMaxPattern = /\$(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)\s*[-—–]\s*(?:\$)?(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)/;
  
  const toInt = (s: string): number => parseInt(s.replace(/,/g, ''), 10);
  
  const convertHourlyToAnnual = (hourlyWage: number): number => hourlyWage * 2080;
  const convertMonthlyToAnnual = (monthlyWage: number): number => monthlyWage * 12;

  const match = salaryStr.match(minMaxPattern);
  
  if (!match) {
    return { interval: null, minAmount: null, maxAmount: null, currency: null };
  }

  let minSalary = toInt(match[1]);
  let maxSalary = toInt(match[3]);

  // Handle 'k' suffix
  if (match[2]?.toLowerCase() === 'k' || match[4]?.toLowerCase() === 'k') {
    minSalary *= 1000;
    maxSalary *= 1000;
  }

  let interval: CompensationInterval;
  let annualMinSalary: number;
  let annualMaxSalary: number;

  // Determine interval and convert to annual if needed
  if (minSalary < hourlyThreshold) {
    interval = CompensationInterval.HOURLY;
    annualMinSalary = convertHourlyToAnnual(minSalary);
    annualMaxSalary = maxSalary < hourlyThreshold ? convertHourlyToAnnual(maxSalary) : maxSalary;
  } else if (minSalary < monthlyThreshold) {
    interval = CompensationInterval.MONTHLY;
    annualMinSalary = convertMonthlyToAnnual(minSalary);
    annualMaxSalary = maxSalary < monthlyThreshold ? convertMonthlyToAnnual(maxSalary) : maxSalary;
  } else {
    interval = CompensationInterval.YEARLY;
    annualMinSalary = minSalary;
    annualMaxSalary = maxSalary;
  }

  // Validate salary range
  if (
    annualMinSalary < lowerLimit ||
    annualMinSalary > upperLimit ||
    annualMaxSalary < lowerLimit ||
    annualMaxSalary > upperLimit ||
    annualMinSalary >= annualMaxSalary
  ) {
    return { interval: null, minAmount: null, maxAmount: null, currency: null };
  }

  return {
    interval,
    minAmount: enforceAnnualSalary ? annualMinSalary : minSalary,
    maxAmount: enforceAnnualSalary ? annualMaxSalary : maxSalary,
    currency: 'USD',
  };
}

export function convertToAnnual(compensation: Compensation): Compensation {
  if (!compensation.minAmount || !compensation.maxAmount || !compensation.interval) {
    return compensation;
  }

  let multiplier = 1;
  switch (compensation.interval) {
    case CompensationInterval.HOURLY:
      multiplier = 2080; // 40 hours/week * 52 weeks
      break;
    case CompensationInterval.DAILY:
      multiplier = 260; // 5 days/week * 52 weeks
      break;
    case CompensationInterval.WEEKLY:
      multiplier = 52;
      break;
    case CompensationInterval.MONTHLY:
      multiplier = 12;
      break;
    case CompensationInterval.YEARLY:
      return compensation; // Already annual
  }

  return {
    ...compensation,
    interval: CompensationInterval.YEARLY,
    minAmount: compensation.minAmount * multiplier,
    maxAmount: compensation.maxAmount * multiplier,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

export const DESIRED_COLUMN_ORDER = [
  'id',
  'site',
  'jobUrl',
  'jobUrlDirect',
  'title',
  'companyName',
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
