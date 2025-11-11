# ts-jobspy

[![npm version](https://badge.fury.io/js/ts-jobspy.svg)](https://badge.fury.io/js/ts-jobspy)
[![GitHub issues](https://img.shields.io/github/issues/alpharomercoma/ts-jobspy.svg)](https://github.com/alpharomercoma/ts-jobspy/issues)
[![GitHub stars](https://img.shields.io/github/stars/alpharomercoma/ts-jobspy.svg)](https://github.com/alpharomercoma/ts-jobspy/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ts-jobspy** is a TypeScript job scraping library that aggregates job postings from popular job boards. This is a complete TypeScript rewrite of the original [python-jobspy](https://pypi.org/project/python-jobspy/) package with near full API compatibility.

## ⚠️ Current Status

**Currently, only Indeed and LinkedIn scrapers are fully operational.** Other scrapers (ZipRecruiter, Glassdoor, Google, Bayt, Naukri, BDJobs) are under maintenance and may not return results reliably. We recommend using only `['indeed', 'linkedin']` for the `siteName` parameter.

## 🙏 Attribution

This TypeScript package is a complete rewrite of the original [JobSpy Python package](https://github.com/cullenwatson/JobSpy) created by **Cullen Watson** and **Zachary Hampton**. All credit for the original concept, design, and implementation goes to the original authors.

- **Original Repository**: https://github.com/cullenwatson/JobSpy
- **Original PyPI Package**: https://pypi.org/project/python-jobspy/
- **Original Authors**: Cullen Watson & Zachary Hampton
- **TypeScript Rewrite**: Alpha Romer Coma (alpharomercoma@proton.me)
- **TypeScript Repository**: https://github.com/alpharomercoma/ts-jobspy

This TypeScript version maintains full API compatibility while providing type safety and modern JavaScript/TypeScript development experience.

## Features

- 🔍 **Active Scrapers**: Indeed and LinkedIn are fully operational and tested
- 🚧 **Maintenance Status**: Other scrapers (ZipRecruiter, Glassdoor, Google, Bayt, Naukri, BDJobs) are under maintenance
- 📊 Pandas-like DataFrame functionality for data manipulation
- 🌐 Proxy support with rotation
- 🔒 Fully type-safe with comprehensive TypeScript definitions
- ⚡ Modern async/await API with concurrent scraping
- 🌍 International support with 60+ countries for Indeed
- 🎯 Advanced filtering by job type, location, salary, and posting date
- 📤 Export to CSV/JSON with configurable formatting

## Installation

```bash
npm install ts-jobspy
```

**Node.js version >= 18.0.0 required**

## Usage

### JavaScript (ES Modules)

Create a file called `main.js`:

```javascript
import { scrapeJobs } from 'ts-jobspy';

async function main() {
  const jobs = await scrapeJobs({
    siteName: ['indeed', 'linkedin'], // Only these two are currently working
    searchTerm: 'software engineer',
    location: 'San Francisco, CA',
    countryIndeed: 'usa', // Required for Indeed - supports 60+ countries with autocomplete
    resultsWanted: 20,
    hoursOld: 72,

    // linkedinFetchDescription: true, // gets more info such as description, direct job url (slower)
    // proxies: ['208.195.175.46:65095', '208.195.175.45:65095', 'localhost'],
  });

  console.log(`Found ${jobs.length} jobs`);
  console.log(jobs.head(3)); // Show first 3 jobs (pandas-like)

  // Export to CSV (built-in functionality)
  await jobs.toCsv('jobs.csv', {
    quoting: 'nonnumeric',
    delimiter: ',',
    headers: true
  });

  // Export to JSON
  await jobs.toJson('jobs.json', { pretty: true });
}

main().catch(console.error);
```

**Run with:**
```bash
node main.js
```

### TypeScript

Create a file called `main.ts`:

```typescript
import { scrapeJobs } from 'ts-jobspy';

async function main() {
  const jobs = await scrapeJobs({
    siteName: ['indeed', 'linkedin'], // Only these two are currently working
    searchTerm: 'software engineer',
    location: 'San Francisco, CA',
    countryIndeed: 'usa', // Required for Indeed - supports 60+ countries with autocomplete
    resultsWanted: 20,
    hoursOld: 72,

    // linkedinFetchDescription: true, // gets more info such as description, direct job url (slower)
    // proxies: ['208.195.175.46:65095', '208.195.175.45:65095', 'localhost'],
  });

  console.log(`Found ${jobs.length} jobs`);
  console.log(jobs.head(3)); // Show first 3 jobs (pandas-like)

  // Export to CSV (built-in functionality)
  await jobs.toCsv('jobs.csv', {
    quoting: 'nonnumeric',
    delimiter: ',',
    headers: true
  });

  // Export to JSON
  await jobs.toJson('jobs.json', { pretty: true });
}

main().catch(console.error);
```

**Compile and run:**
```bash
npm install typescript
npx tsc main.ts --lib es2015 && node main.js
```

*Note: The `--lib es2015` flag is required to support iterators and modern JavaScript features.*

## API Reference

### `scrapeJobs(options)`

#### Parameters

```typescript
interface ScrapeJobsOptions {
  siteName?: SiteName | SiteName[];                  // Job sites to scrape (use string names)
  searchTerm?: string;                                // Search query
  googleSearchTerm?: string;                          // Google-specific search term
  location?: string;                                  // Job location
  distance?: number;                                  // Search radius in miles (default: 50)
  isRemote?: boolean;                                // Filter for remote jobs
  jobType?: string;                                  // Job type filter (see Job Types section)
  easyApply?: boolean;                               // Easy apply filter
  resultsWanted?: number;                            // Number of results (default: 15)
  countryIndeed?: string;                            // Country for Indeed/Glassdoor
  proxies?: string[] | string;                       // Proxy configuration
  caCert?: string;                                   // CA certificate path
  descriptionFormat?: 'markdown' | 'html';           // Description format (default: markdown)
  linkedinFetchDescription?: boolean;                // Fetch full LinkedIn descriptions
  linkedinCompanyIds?: number[];                     // LinkedIn company ID filter
  offset?: number;                                   // Result offset
  hoursOld?: number;                                 // Filter by posting age
  enforceAnnualSalary?: boolean;                     // Convert all salaries to annual
  // verbose?: number;                               // Not yet implemented
  userAgent?: string;                                // Custom user agent
}
```

#### Job Types

- `fulltime` / `full-time`
- `parttime` / `part-time`
- `contract`
- `temporary`
- `internship`
- `perdiem`
- `nights`
- `other`
- `summer`
- `volunteer`

#### Supported Sites

**✅ Currently Working:**
- **LinkedIn**: Global search using `location` parameter
- **Indeed**: Supports 60+ countries with strongly typed `countryIndeed` parameter (required)

**🚧 Under Maintenance (may not work reliably):**
- **ZipRecruiter**: US/Canada only, uses `location` parameter
- **Glassdoor**: Supports major countries (requires `countryIndeed`)
- **Google**: Global job search with advanced filtering
- **Naukri**: India-focused job portal with API integration
- **Bayt**: Middle East job portal with robust parsing
- **BDJobs**: Bangladesh job portal with comprehensive data extraction

#### Supported Countries (Indeed / Glassdoor)

The `countryIndeed` parameter is **required** for Indeed and used for Glassdoor. It is restricted to the countries supported by the original JobSpy package. Entries marked with ⭐ have Glassdoor support.

|                      |              |            |                |
|----------------------|--------------|------------|----------------|
| Argentina            | Australia ⭐  | Austria ⭐  | Bahrain        |
| Belgium ⭐            | Brazil ⭐     | Canada ⭐   | Chile          |
| China                | Colombia     | Costa Rica | Czech Republic |
| Denmark              | Ecuador      | Egypt      | Finland        |
| France ⭐             | Germany ⭐    | Greece     | Hong Kong ⭐    |
| Hungary              | India ⭐      | Indonesia  | Ireland ⭐      |
| Israel               | Italy ⭐      | Japan      | Kuwait         |
| Luxembourg           | Malaysia     | Mexico ⭐   | Morocco        |
| Netherlands ⭐        | New Zealand ⭐| Nigeria    | Norway         |
| Oman                 | Pakistan     | Panama     | Peru           |
| Philippines          | Poland       | Portugal   | Qatar          |
| Romania              | Saudi Arabia | Singapore ⭐| South Africa   |
| South Korea          | Spain ⭐      | Sweden     | Switzerland ⭐  |
| Taiwan               | Thailand     | Turkey     | Ukraine        |
| United Arab Emirates | UK ⭐         | USA ⭐      | Uruguay        |
| Venezuela            | Vietnam ⭐    |            |                |

**TypeScript Integration:**
- Your IDE provides full autocomplete for all supported country names
- Type-safe development with IntelliSense showing all valid options
- Use lowercase country names (e.g., `'usa'`, `'germany'`, `'united kingdom'`)
- Common aliases supported: `'us'` → `'usa'`, `'uk'` → `'united kingdom'`, `'czechia'` → `'czech republic'`
- Use `location` parameter to further narrow down by city/state

```typescript
// Using country names (with autocomplete for type safety)
import { scrapeJobs } from 'ts-jobspy';

const jobs = await scrapeJobs({
  siteName: ['indeed'],
  countryIndeed: 'germany', // Strongly typed with autocomplete
  searchTerm: 'software engineer',
  location: 'Berlin'
});

// Error handling for unsupported countries
try {
  const jobs = await scrapeJobs({
    siteName: ['indeed'],
    searchTerm: 'software engineer',
    countryIndeed: 'russia', // Not supported - will throw error
    resultsWanted: 10
  });
} catch (error) {
  console.error('Error:', error.message);
}
```

## Output Schema

```typescript
interface JobPost {
  id?: string;                    // Unique job identifier
  title: string;                  // Job title
  companyName?: string;           // Company name
  jobUrl: string;                 // Job posting URL
  jobUrlDirect?: string;          // Direct application URL
  location?: Location;            // Job location
  description?: string;           // Job description
  companyUrl?: string;            // Company profile URL
  companyUrlDirect?: string;      // Company website
  jobType?: JobType[];            // Employment types
  compensation?: Compensation;     // Salary information
  datePosted?: string;            // Posting date
  emails?: string[];              // Contact emails
  isRemote?: boolean;             // Remote work flag

  // Site-specific fields
  jobLevel?: string;              // LinkedIn: experience level
  companyIndustry?: string;       // LinkedIn/Indeed: industry
  companyLogo?: string;           // Company logo URL
  skills?: string[];              // Naukri: required skills
  // ... and more
}
```

## Examples

### Basic Search

```typescript
import { scrapeJobs } from 'ts-jobspy';

const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin'], // Only these two are currently working
  searchTerm: 'python developer',
  location: 'New York, NY',
  countryIndeed: 'usa', // Required for Indeed
  resultsWanted: 10,
});
```

### Advanced Search with Filters

```typescript
const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin'],
  searchTerm: 'senior software engineer',
  location: 'San Francisco, CA',
  distance: 25,
  jobType: 'fulltime',
  isRemote: true,
  hoursOld: 24,
  resultsWanted: 50,
  proxies: ['proxy1:port', 'proxy2:port'],
});
```

### LinkedIn-Specific Search

```typescript
const jobs = await scrapeJobs({
  siteName: 'linkedin',
  searchTerm: 'data scientist',
  location: 'Seattle, WA',
  linkedinFetchDescription: true,
  linkedinCompanyIds: [1035, 1441], // Microsoft, Google
  resultsWanted: 25,
});
```

### International Job Search

```typescript
// Indeed supports 60+ countries
const germanyJobs = await scrapeJobs({
  siteName: ['indeed'],
  searchTerm: 'software engineer',
  location: 'Berlin',
  countryIndeed: 'germany',
  resultsWanted: 20,
});

const indiaJobs = await scrapeJobs({
  siteName: ['indeed'],
  searchTerm: 'developer',
  location: 'Mumbai',
  countryIndeed: 'india',
  resultsWanted: 15,
});

// LinkedIn works globally
const ukJobs = await scrapeJobs({
  siteName: ['linkedin'],
  searchTerm: 'data scientist',
  location: 'London, UK',
  resultsWanted: 10,
});
```

### Multi-Site Scraping with Error Handling

```typescript
const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin'],
  searchTerm: 'full stack developer',
  location: 'San Francisco, CA',
  countryIndeed: 'usa',
  resultsWanted: 50,
  hoursOld: 48,
  proxies: ['proxy1:port', 'proxy2:port'],
});

// Built-in error handling ensures partial results even if some sites fail
console.log(`Successfully scraped ${jobs.length} jobs from available sites`);
```

## Rate Limiting & Best Practices

**Currently Working Scrapers:**
- **Indeed**: Most reliable with minimal rate limiting
- **LinkedIn**: Most restrictive, requires proxies for large-scale scraping

**Scrapers Under Maintenance:**
- ZipRecruiter, Glassdoor, Google, Bayt, Naukri, and BDJobs are currently not operational

### Recommendations:
- Use delays between requests (built-in)
- Rotate proxies for large-scale scraping
- Respect robots.txt and terms of service
- Built-in error handling ensures partial results even if some sites fail
- Monitor rate limiting responses (automatic retry mechanisms included)

## Error Handling

```typescript
try {
  const jobs = await scrapeJobs({
    searchTerm: 'software engineer',
    location: 'Invalid Location',
  });
} catch (error) {
  console.error('Scraping failed:', error.message);
}
```

## Contributing

This is a TypeScript rewrite of the original Python package. For feature requests or bug reports related to the core functionality, please consider contributing to the original project as well.

## License

MIT License - see LICENSE file for details.

## Disclaimer

**Note**: This package is not affiliated with or endorsed by the original JobSpy authors. It is an independent TypeScript implementation of the same concept.
