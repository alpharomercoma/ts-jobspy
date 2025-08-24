import { JobPost, ScraperInput } from '../types';
import { createLogger } from './index';

const logger = createLogger('EdgeCaseHandler');

/**
 * Comprehensive edge case handling for job scraping operations
 */
export class EdgeCaseHandler {
  /**
   * Validates and sanitizes scraper input parameters
   */
  static validateInput(input: ScraperInput): ScraperInput {
    const sanitized = { ...input };

    // Ensure resultsWanted is within reasonable bounds
    if (sanitized.resultsWanted) {
      sanitized.resultsWanted = Math.max(1, Math.min(1000, sanitized.resultsWanted));
    }

    // Validate distance parameter
    if (sanitized.distance !== undefined) {
      sanitized.distance = Math.max(0, Math.min(100, sanitized.distance));
    }

    // Validate hoursOld parameter
    if (sanitized.hoursOld !== undefined) {
      sanitized.hoursOld = Math.max(1, Math.min(8760, sanitized.hoursOld)); // Max 1 year
    }

    // Sanitize search term
    if (sanitized.searchTerm) {
      sanitized.searchTerm = sanitized.searchTerm.trim().substring(0, 200);
    }

    // Sanitize location
    if (sanitized.location) {
      sanitized.location = sanitized.location.trim().substring(0, 100);
    }

    return sanitized;
  }

  /**
   * Handles network-related errors with retry logic
   */
  static async handleNetworkError<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Determines if an error should not be retried
   */
  private static isNonRetryableError(error: any): boolean {
    const nonRetryableStatuses = [400, 401, 403, 404, 422];
    const nonRetryableCodes = ['ENOTFOUND', 'ECONNREFUSED'];

    return (
      nonRetryableStatuses.includes(error.response?.status) ||
      nonRetryableCodes.includes(error.code) ||
      error.message?.includes('Invalid search parameters')
    );
  }

  /**
   * Validates and cleans job post data
   */
  static validateJobPost(job: Partial<JobPost>): JobPost | null {
    try {
      // Required fields validation
      if (!job.title || !job.jobUrl) {
        logger.warn('Job missing required fields (title or jobUrl)');
        return null;
      }

      // URL validation
      if (!this.isValidUrl(job.jobUrl)) {
        logger.warn(`Invalid job URL: ${job.jobUrl}`);
        return null;
      }

      // Sanitize text fields
      const sanitized: JobPost = {
        ...job,
        title: this.sanitizeText(job.title, 200),
        companyName: job.companyName ? this.sanitizeText(job.companyName, 100) : undefined,
        description: job.description ? this.sanitizeText(job.description, 10000) : undefined,
        jobUrl: job.jobUrl,
      } as JobPost;

      // Validate compensation data
      if (sanitized.compensation) {
        sanitized.compensation = this.validateCompensation(sanitized.compensation);
      }

      // Validate date format
      if (sanitized.datePosted && !this.isValidDate(sanitized.datePosted)) {
        logger.warn(`Invalid date format: ${sanitized.datePosted}`);
        sanitized.datePosted = undefined;
      }

      return sanitized;
    } catch (error) {
      logger.error('Error validating job post:', error);
      return null;
    }
  }

  /**
   * Handles rate limiting with exponential backoff
   */
  static async handleRateLimit(
    rateLimitError: any,
    retryAfter?: number
  ): Promise<void> {
    const delay = retryAfter || this.calculateBackoffDelay(rateLimitError);
    logger.warn(`Rate limited, waiting ${delay}ms before retry`);
    await this.sleep(delay);
  }

  /**
   * Calculates appropriate backoff delay based on error
   */
  private static calculateBackoffDelay(error: any): number {
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 300000; // 5 minutes

    // Extract retry-after header if available
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      return Math.min(parseInt(retryAfter) * 1000, maxDelay);
    }

    // Default exponential backoff
    return Math.min(baseDelay * Math.random() * 2, maxDelay);
  }

  /**
   * Handles proxy rotation on failure
   */
  static rotateProxy(proxies: string[], currentIndex: number): number {
    if (!proxies || proxies.length === 0) return 0;
    return (currentIndex + 1) % proxies.length;
  }

  /**
   * Validates URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes text content
   */
  private static sanitizeText(text: string, maxLength: number): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, maxLength);
  }

  /**
   * Validates compensation data
   */
  private static validateCompensation(compensation: any): any {
    const validated = { ...compensation };

    // Ensure amounts are positive numbers
    if (validated.minAmount !== undefined) {
      validated.minAmount = Math.max(0, Number(validated.minAmount) || 0);
    }
    if (validated.maxAmount !== undefined) {
      validated.maxAmount = Math.max(0, Number(validated.maxAmount) || 0);
    }

    // Ensure min <= max
    if (validated.minAmount && validated.maxAmount && validated.minAmount > validated.maxAmount) {
      [validated.minAmount, validated.maxAmount] = [validated.maxAmount, validated.minAmount];
    }

    return validated;
  }

  /**
   * Validates date format
   */
  private static isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date.getFullYear() > 2000;
  }

  /**
   * Sleep utility for delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handles memory management for large datasets
   */
  static optimizeMemoryUsage<T>(items: T[], batchSize: number = 100): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Handles timeout scenarios
   */
  static withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string = 'Operation timed out'
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  }
}
