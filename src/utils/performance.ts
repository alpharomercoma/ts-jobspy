import { logger } from './logger';

export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();
  private static metrics: Map<string, number[]> = new Map();

  static startTimer(label: string): void {
    this.timers.set(label, Date.now());
  }

  static endTimer(label: string): number {
    const startTime = this.timers.get(label);
    if (!startTime) {
      logger.warn(`Timer '${label}' was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(label);

    // Store metric for analysis
    const existing = this.metrics.get(label) || [];
    existing.push(duration);
    this.metrics.set(label, existing);

    logger.debug(`${label}: ${duration}ms`);
    return duration;
  }

  static getMetrics(label: string): { avg: number; min: number; max: number; count: number; } | null {
    const values = this.metrics.get(label);
    if (!values || values.length === 0) return null;

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  static clearMetrics(): void {
    this.metrics.clear();
    this.timers.clear();
  }
}

export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor (maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);

      logger.info(`Rate limit reached, waiting ${waitTime}ms`);
      await this.delay(waitTime);
      return this.checkLimit();
    }

    this.requests.push(now);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor (
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeMs: number = 60000
  ) { }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeMs) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker moving to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }
}

export class MemoryMonitor {
  static getUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  static logUsage(label: string = 'Memory'): void {
    const usage = this.getUsage();

    logger.debug(`${label} - RSS: ${this.formatMemoryUsage(usage.rss)}, Heap: ${this.formatMemoryUsage(usage.heapUsed)}/${this.formatMemoryUsage(usage.heapTotal)}, External: ${this.formatMemoryUsage(usage.external)}`);
  }

  static checkMemoryLeak(threshold: number = 500): boolean {
    const usage = this.getUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;

    if (heapUsedMB > threshold) {
      logger.warn(`Potential memory leak detected: ${heapUsedMB}MB heap used`);
      return true;
    }

    return false;
  }

  static formatMemoryUsage(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

export function withPerformanceMonitoring<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  label: string
) {
  return async (...args: T): Promise<R> => {
    PerformanceMonitor.startTimer(label);
    MemoryMonitor.logUsage(`${label} - Start`);

    try {
      const result = await fn(...args);
      PerformanceMonitor.endTimer(label);
      MemoryMonitor.logUsage(`${label} - End`);
      return result;
    } catch (error) {
      PerformanceMonitor.endTimer(label);
      MemoryMonitor.logUsage(`${label} - Error`);
      throw error;
    }
  };
}

export function withRateLimit<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  rateLimiter: RateLimiter
) {
  return async (...args: T): Promise<R> => {
    await rateLimiter.checkLimit();
    return fn(...args);
  };
}

export function withCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  circuitBreaker: CircuitBreaker
) {
  return async (...args: T): Promise<R> => {
    return circuitBreaker.execute(() => fn(...args));
  };
}
