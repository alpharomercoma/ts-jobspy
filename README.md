# ts-jobspy

**ts-jobspy** is a TypeScript job scraping library that aggregates job postings from popular job boards with one tool.

This is a TypeScript port of [python-jobspy](https://github.com/speedyapply/JobSpy).

## Features

- Scrapes job postings from **LinkedIn**, **Indeed**, **Glassdoor**, **Google**, **ZipRecruiter**, **Bayt**, **Naukri**, & **BDJobs** concurrently
- Returns structured job data as an array of objects
- Full TypeScript support with strict types
- Proxy support to bypass blocking
- Customizable output format (Markdown, HTML, or plain text descriptions)

## Installation

```bash
npm install ts-jobspy
```

**Node.js version >= 18.0.0 required**

## Quick Start

```typescript
import { scrapeJobs } from 'ts-jobspy';

const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin', 'zip_recruiter', 'google'],
  searchTerm: 'software engineer',
  location: 'San Francisco, CA',
  resultsWanted: 20,
  hoursOld: 72,
  countryIndeed: 'USA',
});

console.log(`Found ${jobs.length} jobs`);
console.log(jobs);
```

## API Reference

### `scrapeJobs(options)`

Main function to scrape jobs from multiple job boards concurrently.

#### Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `siteName` | `string \| string[] \| Site \| Site[]` | All sites | Sites to scrape |
| `searchTerm` | `string` | - | Job search term |
| `googleSearchTerm` | `string` | - | Custom search term for Google Jobs |
| `location` | `string` | - | Job location |
| `distance` | `number` | `50` | Search radius in miles |
| `isRemote` | `boolean` | `false` | Filter for remote jobs |
| `jobType` | `string` | - | Job type: fulltime, parttime, internship, contract |
| `easyApply` | `boolean` | - | Filter for easy apply jobs |
| `resultsWanted` | `number` | `15` | Number of results per site |
| `countryIndeed` | `string` | `'usa'` | Country for Indeed/Glassdoor |
| `proxies` | `string \| string[]` | - | Proxy URLs for requests |
| `caCert` | `string` | - | CA certificate path for proxies |
| `descriptionFormat` | `string` | `'markdown'` | Format: markdown, html, plain |
| `linkedinFetchDescription` | `boolean` | `false` | Fetch full LinkedIn descriptions |
| `linkedinCompanyIds` | `number[]` | - | Filter by LinkedIn company IDs |
| `offset` | `number` | `0` | Start offset for pagination |
| `hoursOld` | `number` | - | Filter jobs posted within hours |
| `enforceAnnualSalary` | `boolean` | `false` | Convert salaries to annual |
| `verbose` | `number` | `0` | Log level: 0=error, 1=warning, 2=info |
| `userAgent` | `string` | - | Custom user agent |

#### Returns

`Promise<JobData[]>` - Array of job objects

### Job Data Structure

```typescript
interface JobData {
  id: string | null;
  site: string;
  jobUrl: string;
  jobUrlDirect: string | null;
  title: string;
  company: string | null;
  location: string | null;
  datePosted: string | null;
  jobType: string | null;
  salarySource: string | null;
  interval: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
  isRemote: boolean | null;
  jobLevel: string | null;
  jobFunction: string | null;
  listingType: string | null;
  emails: string | null;
  description: string | null;
  companyIndustry: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  companyUrlDirect: string | null;
  companyAddresses: string | null;
  companyNumEmployees: string | null;
  companyRevenue: string | null;
  companyDescription: string | null;
  // Naukri-specific
  skills: string | null;
  experienceRange: string | null;
  companyRating: number | null;
  companyReviewsCount: number | null;
  vacancyCount: number | null;
  workFromHomeType: string | null;
}
```

## Supported Sites

| Site | Value | Notes |
|------|-------|-------|
| LinkedIn | `'linkedin'` | Rate limits aggressively, use proxies |
| Indeed | `'indeed'` | Best scraper, supports many countries |
| ZipRecruiter | `'zip_recruiter'` | US/Canada only |
| Glassdoor | `'glassdoor'` | Supports many countries |
| Google | `'google'` | Global, use googleSearchTerm for best results |
| Bayt | `'bayt'` | Middle East focused |
| Naukri | `'naukri'` | India focused |
| BDJobs | `'bdjobs'` | Bangladesh focused |

## Supported Countries

Use with `countryIndeed` parameter for Indeed and Glassdoor:

| Region | Countries |
|--------|-----------|
| Americas | Argentina, Brazil, Canada, Chile, Colombia, Costa Rica, Ecuador, Mexico, Panama, Peru, USA, Uruguay, Venezuela |
| Europe | Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden, Switzerland, UK, Ukraine |
| Asia Pacific | Australia, China, Hong Kong, India, Indonesia, Japan, Malaysia, New Zealand, Pakistan, Philippines, Singapore, South Korea, Taiwan, Thailand, Vietnam |
| Middle East | Bahrain, Egypt, Israel, Kuwait, Morocco, Oman, Qatar, Saudi Arabia, Turkey, UAE |

## Examples

### Basic Search

```typescript
const jobs = await scrapeJobs({
  siteName: 'indeed',
  searchTerm: 'python developer',
  location: 'New York',
  resultsWanted: 10,
});
```

### Multiple Sites

```typescript
const jobs = await scrapeJobs({
  siteName: ['linkedin', 'indeed', 'glassdoor'],
  searchTerm: 'data scientist',
  location: 'Seattle, WA',
  resultsWanted: 50,
});
```

### With Proxies

```typescript
const jobs = await scrapeJobs({
  siteName: 'linkedin',
  searchTerm: 'software engineer',
  proxies: [
    'http://user:pass@proxy1.example.com:8080',
    'http://user:pass@proxy2.example.com:8080',
  ],
  resultsWanted: 100,
});
```

### Remote Jobs

```typescript
const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin'],
  searchTerm: 'frontend developer',
  isRemote: true,
  resultsWanted: 25,
});
```

### Export to CSV

```typescript
import { scrapeJobs } from 'ts-jobspy';
import { writeFileSync } from 'fs';

const jobs = await scrapeJobs({
  siteName: 'indeed',
  searchTerm: 'software engineer',
  resultsWanted: 100,
});

// Convert to CSV
const headers = Object.keys(jobs[0]).join(',');
const rows = jobs.map(job =>
  Object.values(job).map(v =>
    typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
  ).join(',')
);
const csv = [headers, ...rows].join('\n');

writeFileSync('jobs.csv', csv);
```

## Known Limitations

1. **LinkedIn**: Rate limits at ~10th page. Proxies required for large scrapes.
2. **ZipRecruiter**: Only works in US/Canada.
3. **Indeed**: Mutually exclusive filters - can only use one of: hoursOld, jobType+isRemote, easyApply.
4. **All sites**: Results capped at ~1000 jobs per search.

## Frequently Asked Questions

**Q: Why am I getting a 429 response?**

A: You've been rate limited. Wait some time between scrapes and consider using proxies.

**Q: Why is Indeed giving unrelated roles?**

A: Indeed searches the description too. Use quotes for exact matches and `-` to exclude words:
```typescript
searchTerm: '"software engineer" python -senior -lead'
```

**Q: Why no results from Google?**

A: Google Jobs requires specific syntax. Search on Google Jobs in your browser first, then copy the exact search term to `googleSearchTerm`.

## Credits

This package is a TypeScript port of [python-jobspy](https://github.com/speedyapply/JobSpy).

**Original Authors:**
- Cullen Watson (cullen@cullenwatson.com)
- Zachary Hampton (zachary@zacharysproducts.com)

## License

MIT License - see [LICENSE](LICENSE) for details.
