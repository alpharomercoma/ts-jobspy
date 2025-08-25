# ts-jobspy

[![npm version](https://badge.fury.io/js/ts-jobspy.svg)](https://badge.fury.io/js/ts-jobspy)
[![GitHub issues](https://img.shields.io/github/issues/alpharomercoma/ts-jobspy.svg)](https://github.com/alpharomercoma/ts-jobspy/issues)
[![GitHub stars](https://img.shields.io/github/stars/alpharomercoma/ts-jobspy.svg)](https://github.com/alpharomercoma/ts-jobspy/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ts-jobspy** is a TypeScript job scraping library that aggregates job postings from popular job boards. This is a complete TypeScript rewrite of the original [python-jobspy](https://pypi.org/project/python-jobspy/) package with full API compatibility.

## 🙏 Attribution

This TypeScript package is a complete rewrite of the original [JobSpy Python package](https://github.com/cullenwatson/JobSpy) created by **Cullen Watson** and **Zachary Hampton**. All credit for the original concept, design, and implementation goes to the original authors.

- **Original Repository**: https://github.com/cullenwatson/JobSpy
- **Original PyPI Package**: https://pypi.org/project/python-jobspy/
- **Original Authors**: Cullen Watson & Zachary Hampton
- **TypeScript Rewrite**: Alpha Romer Coma (alpharomercoma@proton.me)
- **TypeScript Repository**: https://github.com/alpharomercoma/ts-jobspy

This TypeScript version maintains full API compatibility while providing type safety and modern JavaScript/TypeScript development experience.

## Features

- 🔍 Scrapes job postings from **Indeed** and **LinkedIn** (other sites currently under maintenance)
- 📊 Aggregates job postings in a structured format with pandas-like DataFrame functionality
- 🌐 Proxy support with rotation to bypass blocking
- 🔒 Fully type-safe with comprehensive TypeScript definitions
- ⚡ Modern async/await API with concurrent scraping
- 🛡️ Built-in rate limiting, error handling, and retry mechanisms
- 🌍 International support with region-specific scrapers
- 🎯 Advanced filtering by job type, location, salary, and posting date
- 📤 Export to CSV/JSON with configurable formatting options

## Installation

```bash
npm install ts-jobspy
```

**Node.js version >= 18.0.0 required**

## Usage

```typescript
import { scrapeJobs } from 'ts-jobspy';

const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin', 'ziprecruiter'], // 'glassdoor', 'google', 'bayt', 'naukri', 'bdjobs'
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
  escapeChar: '\\',
  includeIndex: false
});

// Export to JSON
await jobs.toJson('jobs.json', { pretty: true });
```

## API Reference

### `scrapeJobs(options)`

#### Parameters

```typescript
interface ScrapeJobsOptions {
  siteName?: string | string[] | Site | Site[];      // Job sites to scrape
  searchTerm?: string;                                // Search query
  googleSearchTerm?: string;                          // Google-specific search term
  location?: string;                                  // Job location
  distance?: number;                                  // Search radius in miles (default: 50)
  isRemote?: boolean;                                // Filter for remote jobs
  jobType?: string | JobType;                        // Job type filter
  easyApply?: boolean;                               // Easy apply filter
  resultsWanted?: number;                            // Number of results (default: 15)
  countryIndeed?: string;                            // Country for Indeed/Glassdoor
  proxies?: string[] | string;                       // Proxy configuration
  caCert?: string;                                   // CA certificate path
  descriptionFormat?: 'markdown' | 'html';          // Description format
  linkedinFetchDescription?: boolean;                // Fetch full LinkedIn descriptions
  linkedinCompanyIds?: number[];                     // LinkedIn company ID filter
  offset?: number;                                   // Result offset
  hoursOld?: number;                                 // Filter by posting age
  enforceAnnualSalary?: boolean;                     // Convert all salaries to annual
  verbose?: number;                                  // Logging level (0-2)
  userAgent?: string;                                // Custom user agent
}
```

#### Job Types

- `fulltime` / `full-time`
- `parttime` / `part-time`
- `contract`
- `temporary`
- `internship`

#### Supported Sites

- **LinkedIn**: Global search using `location` parameter
- **Indeed**: Supports 60+ countries with strongly typed `countryIndeed` parameter (required)
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
  searchTerm: 'python developer',
  location: 'New York, NY',
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
// Search Naukri (India)
const indiaJobs = await scrapeJobs({
  siteName: 'naukri',
  searchTerm: 'software engineer',
  location: 'Mumbai',
  resultsWanted: 20,
});

// Search Bayt (Middle East)
const middleEastJobs = await scrapeJobs({
  siteName: 'bayt',
  searchTerm: 'developer',
  location: 'Dubai',
  resultsWanted: 15,
});

// Search BDJobs (Bangladesh)
const bangladeshJobs = await scrapeJobs({
  siteName: 'bdjobs',
  searchTerm: 'programmer',
  location: 'Dhaka',
  resultsWanted: 10,
});
```

### Multi-Site with Error Handling

```typescript
const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin', 'glassdoor', 'google', 'naukri'],
  searchTerm: 'full stack developer',
  location: 'San Francisco, CA',
  resultsWanted: 100,
  hoursOld: 48,
  proxies: ['proxy1:port', 'proxy2:port'],
});

// Built-in error handling ensures partial results even if some sites fail
console.log(`Successfully scraped ${jobs.length} jobs from available sites`);
```

## Rate Limiting & Best Practices

- **Indeed**: Most reliable with minimal rate limiting
- **LinkedIn**: Most restrictive, requires proxies for large-scale scraping
- **ZipRecruiter**: Moderate rate limiting
- **Glassdoor**: Requires CSRF token handling, moderate rate limiting
- **Google**: Uses structured data parsing, generally reliable
- **Naukri**: API-based scraping, stable and efficient
- **Bayt**: HTML parsing with cheerio, moderate rate limiting
- **BDJobs**: HTML parsing with pagination support

### Recommendations:
- Use delays between requests (built-in rate limiting)
- Rotate proxies for large-scale scraping
- Respect robots.txt and terms of service
- Monitor for rate limiting responses (automatic retry mechanisms included)
- Use API endpoints where available (Naukri, Google structured data)
- Implement proper error handling for network failures

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

## Acknowledgments

- **Original Authors**: Cullen Watson & Zachary Hampton
- **Original Package**: [python-jobspy](https://pypi.org/project/python-jobspy/)
- **TypeScript Rewrite**: Community contribution

---

**Note**: This package is not affiliated with or endorsed by the original JobSpy authors. It is an independent TypeScript implementation of the same concept.
