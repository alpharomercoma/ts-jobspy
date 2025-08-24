import * as fs from 'fs';
import * as path from 'path';
import { JobPost } from '../types';

export class JobDataFrame {
  private jobs: JobPost[];

  constructor (jobs: JobPost[]) {
    this.jobs = jobs;
  }

  get length(): number {
    return this.jobs.length;
  }

  /**
   * Get the first n jobs (similar to pandas head())
   */
  head(n: number = 5): JobPost[] {
    return this.jobs.slice(0, n);
  }

  /**
   * Get the last n jobs (similar to pandas tail())
   */
  tail(n: number = 5): JobPost[] {
    return this.jobs.slice(-n);
  }

  /**
   * Get all jobs as array
   */
  toArray(): JobPost[] {
    return [...this.jobs];
  }

  /**
   * Export jobs to CSV file
   */
  async toCsv(filePath: string, options: {
    quoting?: 'all' | 'minimal' | 'nonnumeric' | 'none';
    escapeChar?: string;
    includeIndex?: boolean;
  } = {}): Promise<void> {
    const { quoting = 'nonnumeric', escapeChar = '\\', includeIndex = false } = options;

    if (this.jobs.length === 0) {
      throw new Error('No jobs to export');
    }

    // Get all unique keys from all jobs
    const allKeys = new Set<string>();
    this.jobs.forEach(job => {
      Object.keys(job).forEach(key => allKeys.add(key));
      // Add processed fields
      if ('site' in job) allKeys.add('site');
      if ('company' in job) allKeys.add('company');
      if ('location' in job) allKeys.add('location');
      if ('interval' in job) allKeys.add('interval');
      if ('minAmount' in job) allKeys.add('min_amount');
      if ('maxAmount' in job) allKeys.add('max_amount');
      if ('currency' in job) allKeys.add('currency');
      if ('salarySource' in job) allKeys.add('salary_source');
    });

    const headers = Array.from(allKeys).sort();

    // Create CSV content
    let csvContent = '';

    // Add headers
    if (includeIndex) {
      csvContent += 'index,';
    }
    csvContent += headers.map(header => this.escapeCsvValue(header, quoting, escapeChar)).join(',') + '\n';

    // Add data rows
    this.jobs.forEach((job, index) => {
      if (includeIndex) {
        csvContent += `${index},`;
      }

      const row = headers.map(header => {
        let value: string | number | boolean | null | undefined;
        const jobRecord = job as unknown as Record<string, unknown>;

        // Handle special processed fields
        switch (header) {
          case 'site':
            value = String(jobRecord.site || '');
            break;
          case 'company':
            value = String(jobRecord.company || job.companyName || '');
            break;
          case 'location':
            value = String(jobRecord.location || '');
            break;
          case 'interval':
            value = String(jobRecord.interval || '');
            break;
          case 'min_amount':
            value = String(jobRecord.minAmount || '');
            break;
          case 'max_amount':
            value = String(jobRecord.maxAmount || '');
            break;
          case 'currency':
            value = String(jobRecord.currency || '');
            break;
          case 'salary_source':
            value = String(jobRecord.salarySource || '');
            break;
          default:
            value = String(jobRecord[header] || '');
        }

        // Handle arrays
        if (Array.isArray(value)) {
          value = value.join(', ');
        }

        // Handle objects
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }

        return this.escapeCsvValue(String(value), quoting, escapeChar);
      });

      csvContent += row.join(',') + '\n';
    });

    // Write to file
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, csvContent, 'utf8');
  }

  /**
   * Export jobs to JSON file
   */
  async toJson(filePath: string, options: { pretty?: boolean; } = {}): Promise<void> {
    const { pretty = true } = options;

    const jsonContent = pretty
      ? JSON.stringify(this.jobs, null, 2)
      : JSON.stringify(this.jobs);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, jsonContent, 'utf8');
  }

  /**
   * Filter jobs based on a predicate function
   */
  filter(predicate: (job: JobPost, index: number) => boolean): JobDataFrame {
    return new JobDataFrame(this.jobs.filter(predicate));
  }

  /**
   * Map jobs to a new format
   */
  map<T>(mapper: (job: JobPost, index: number) => T): T[] {
    return this.jobs.map(mapper);
  }

  /**
   * Sort jobs by a field
   */
  sortBy(field: keyof JobPost, ascending: boolean = true): JobDataFrame {
    const sorted = [...this.jobs].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return ascending ? 1 : -1;
      if (bVal === undefined) return ascending ? -1 : 1;

      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });

    return new JobDataFrame(sorted);
  }

  /**
   * Get unique values for a field
   */
  unique(field: keyof JobPost): unknown[] {
    const values = this.jobs.map(job => job[field]).filter(val => val !== undefined);
    return [...new Set(values)];
  }

  /**
   * Group jobs by a field
   */
  groupBy(field: keyof JobPost): Record<string, JobDataFrame> {
    const groups: Record<string, JobPost[]> = {};

    this.jobs.forEach(job => {
      const key = String(job[field] || 'undefined');
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(job);
    });

    const result: Record<string, JobDataFrame> = {};
    Object.keys(groups).forEach(key => {
      result[key] = new JobDataFrame(groups[key]);
    });

    return result;
  }

  /**
   * Get basic statistics about the dataset
   */
  describe(): {
    count: number;
    sites: string[];
    companies: string[];
    locations: string[];
    jobTypes: string[];
  } {
    return {
      count: this.jobs.length,
      sites: this.unique('jobUrl' as keyof JobPost).map(url => {
        if (typeof url === 'string') {
          if (url.includes('indeed.com')) return 'indeed';
          if (url.includes('linkedin.com')) return 'linkedin';
          if (url.includes('ziprecruiter.com')) return 'zip_recruiter';
          if (url.includes('glassdoor.com')) return 'glassdoor';
        }
        return 'unknown';
      }).filter((site, index, arr) => arr.indexOf(site) === index),
      companies: this.unique('companyName').filter(Boolean) as string[],
      locations: this.jobs.map(job => String((job as unknown as Record<string, unknown>).location || '')).filter(Boolean),
      jobTypes: this.jobs.flatMap(job => job.jobType || []).map(type => String(type)),
    };
  }

  private escapeCsvValue(value: string, quoting: string, escapeChar: string): string {
    if (!value) return '';

    const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r');

    if (quoting === 'all' || (quoting === 'nonnumeric' && isNaN(Number(value))) || needsQuoting) {
      // Escape existing quotes
      const escaped = value.replace(/"/g, escapeChar + '"');
      return `"${escaped}"`;
    }

    return value;
  }

  /**
   * Iterator support for for...of loops
   */
  *[Symbol.iterator](): Iterator<JobPost> {
    for (const job of this.jobs) {
      yield job;
    }
  }

  /**
   * Access jobs by index
   */
  at(index: number): JobPost | undefined {
    return this.jobs[index];
  }

  /**
   * Slice the dataframe
   */
  slice(start?: number, end?: number): JobDataFrame {
    return new JobDataFrame(this.jobs.slice(start, end));
  }
}
