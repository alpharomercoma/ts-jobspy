import { JobPost } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface CsvOptions {
  quoting?: 'minimal' | 'all' | 'nonnumeric' | 'none';
  headers?: boolean;
  delimiter?: string;
}

export interface JsonOptions {
  pretty?: boolean;
}

export class JobDataFrame {
  private jobs: JobPost[];

  constructor (jobs: JobPost[] = []) {
    this.jobs = jobs;
  }

  get length(): number {
    return this.jobs.length;
  }

  head(n: number = 5): JobPost[] {
    return this.jobs.slice(0, n);
  }

  tail(n: number = 5): JobPost[] {
    return this.jobs.slice(-n);
  }

  filter(predicate: (job: JobPost) => boolean): JobDataFrame {
    return new JobDataFrame(this.jobs.filter(predicate));
  }

  groupBy(field: keyof JobPost): Record<string, JobPost[]> {
    const groups: Record<string, JobPost[]> = {};

    for (const job of this.jobs) {
      const key = String(job[field] || 'undefined');
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(job);
    }

    return groups;
  }

  async toCsv(filename: string, options: CsvOptions = {}): Promise<void> {
    const {
      quoting = 'minimal',
      headers = true,
      delimiter = ','
    } = options;

    if (this.jobs.length === 0) {
      await fs.promises.writeFile(filename, '');
      return;
    }

    const csvLines: string[] = [];

    // Get all unique keys from all jobs
    const allKeys = new Set<string>();
    this.jobs.forEach(job => {
      Object.keys(job).forEach(key => allKeys.add(key));
    });

    const keys = Array.from(allKeys).sort();

    // Add headers if requested
    if (headers) {
      csvLines.push(keys.map(key => this.escapeCsvValue(key, quoting)).join(delimiter));
    }

    // Add data rows
    for (const job of this.jobs) {
      const row = keys.map(key => {
        const value = job[key as keyof JobPost];
        return this.escapeCsvValue(this.formatValue(value), quoting);
      });
      csvLines.push(row.join(delimiter));
    }

    await fs.promises.writeFile(filename, csvLines.join('\n'));
  }

  async toJson(filename: string, options: JsonOptions = {}): Promise<void> {
    const { pretty = false } = options;

    const jsonString = pretty
      ? JSON.stringify(this.jobs, null, 2)
      : JSON.stringify(this.jobs);

    await fs.promises.writeFile(filename, jsonString);
  }

  toArray(): JobPost[] {
    return [...this.jobs];
  }

  at(index: number): JobPost | undefined {
    if (index < 0) {
      return this.jobs[this.jobs.length + index];
    }
    return this.jobs[index];
  }

  describe(): string {
    if (this.jobs.length === 0) {
      return 'Empty JobDataFrame';
    }

    const companies = new Set(this.jobs.map(job => job.companyName).filter(Boolean));
    const locations = new Set(this.jobs.map(job => job.location?.city).filter(Boolean));
    const remoteJobs = this.jobs.filter(job => job.isRemote).length;

    return `JobDataFrame Summary:
- Total jobs: ${this.jobs.length}
- Unique companies: ${companies.size}
- Unique locations: ${locations.size}
- Remote jobs: ${remoteJobs}`;
  }

  sortBy(field: keyof JobPost): JobDataFrame {
    const sorted = [...this.jobs].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      return String(aVal).localeCompare(String(bVal));
    });

    return new JobDataFrame(sorted);
  }

  unique(field: keyof JobPost): any[] {
    const values = this.jobs.map(job => job[field]).filter(val => val !== undefined);
    return [...new Set(values)];
  }

  slice(start: number, end?: number): JobDataFrame {
    return new JobDataFrame(this.jobs.slice(start, end));
  }

  // Iterator support
  [Symbol.iterator](): Iterator<JobPost> {
    return this.jobs[Symbol.iterator]();
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.join('; ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private escapeCsvValue(value: string, quoting: CsvOptions['quoting']): string {
    if (!value) return '';

    const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r');

    let escaped = value.replace(/"/g, '""');

    switch (quoting) {
      case 'all':
        return `"${escaped}"`;
      case 'nonnumeric':
        return isNaN(Number(value)) ? `"${escaped}"` : value;
      case 'none':
        return escaped;
      case 'minimal':
      default:
        return needsQuoting ? `"${escaped}"` : value;
    }
  }
}
