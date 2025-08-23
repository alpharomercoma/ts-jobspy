# ts-jobspy

**ts-jobspy** is a TypeScript job scraping library that aggregates job postings from popular job boards. This is a complete TypeScript rewrite of the original [python-jobspy](https://pypi.org/project/python-jobspy/) package.

## ⚠️ Attribution

This package is a TypeScript rewrite of the original **JobSpy** Python package created by Cullen Watson and Zachary Hampton. The original package can be found at:
- **PyPI**: https://pypi.org/project/python-jobspy/
- **GitHub**: https://github.com/cullenwatson/JobSpy

All credit for the original concept, design, and implementation goes to the original authors. This TypeScript version aims to provide the same functionality for Node.js/TypeScript developers.

## Features

- 🔍 Scrapes job postings from **Indeed**, **LinkedIn**, **ZipRecruiter** & other job boards concurrently
- 📊 Aggregates job postings in a structured format
- 🌐 Proxy support to bypass blocking
- 🔒 Fully type-safe with comprehensive TypeScript definitions
- ⚡ Modern async/await API
- 🛡️ Built-in rate limiting and error handling

## Installation

```bash
npm install ts-jobspy
```

**Node.js version >= 18.0.0 required**

## Usage

```typescript
import { scrapeJobs } from 'ts-jobspy';

const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin', 'zip_recruiter'], // 'glassdoor', 'google', 'bayt', 'naukri', 'bdjobs'
  searchTerm: 'software engineer',
  location: 'San Francisco, CA',
  resultsWanted: 20,
  hoursOld: 72,
  countryIndeed: 'USA',
  
  // linkedinFetchDescription: true, // gets more info such as description, direct job url (slower)
  // proxies: ['208.195.175.46:65095', '208.195.175.45:65095', 'localhost'],
});

console.log(`Found ${jobs.length} jobs`);
console.log(jobs.slice(0, 3)); // Show first 3 jobs

// Export to CSV (you'll need to install csv-writer)
import createCsvWriter from 'csv-writer';

const csvWriter = createCsvWriter.createObjectCsvWriter({
  path: 'jobs.csv',
  header: [
    { id: 'site', title: 'SITE' },
    { id: 'title', title: 'TITLE' },
    { id: 'company', title: 'COMPANY' },
    { id: 'location', title: 'LOCATION' },
    { id: 'jobType', title: 'JOB_TYPE' },
    { id: 'datePosted', title: 'DATE_POSTED' },
    { id: 'jobUrl', title: 'JOB_URL' },
    { id: 'description', title: 'DESCRIPTION' },
  ],
});

await csvWriter.writeRecords(jobs);
```

## API Reference

### `scrapeJobs(options)`

#### Parameters

```typescript
interface ScrapeJobsOptions {
  siteName?: string | string[] | Site | Site[];     // Job sites to scrape
  searchTerm?: string;                               // Search query
  googleSearchTerm?: string;                         // Google-specific search term
  location?: string;                                 // Job location
  distance?: number;                                 // Search radius in miles (default: 50)
  isRemote?: boolean;                               // Filter for remote jobs
  jobType?: string | JobType;                       // Job type filter
  easyApply?: boolean;                              // Easy apply filter
  resultsWanted?: number;                           // Number of results (default: 15)
  countryIndeed?: string;                           // Country for Indeed/Glassdoor
  proxies?: string[] | string;                      // Proxy configuration
  caCert?: string;                                  // CA certificate path
  descriptionFormat?: 'markdown' | 'html';         // Description format
  linkedinFetchDescription?: boolean;               // Fetch full LinkedIn descriptions
  linkedinCompanyIds?: number[];                    // LinkedIn company ID filter
  offset?: number;                                  // Result offset
  hoursOld?: number;                                // Filter by posting age
  enforceAnnualSalary?: boolean;                    // Convert all salaries to annual
  verbose?: number;                                 // Logging level (0-2)
  userAgent?: string;                               // Custom user agent
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
- **Indeed**: Supports most countries with `countryIndeed` parameter
- **ZipRecruiter**: US/Canada only, uses `location` parameter
- **Glassdoor**: Supports major countries (requires `countryIndeed`)

#### Supported Countries

| Country | Indeed | Glassdoor |
|---------|--------|-----------|
| USA | ✅ | ✅ |
| Canada | ✅ | ✅ |
| UK | ✅ | ✅ |
| Germany | ✅ | ✅ |
| France | ✅ | ✅ |
| Australia | ✅ | ✅ |
| India | ✅ | ✅ |
| And many more... | | |

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

## Rate Limiting & Best Practices

- **Indeed**: Most reliable with minimal rate limiting
- **LinkedIn**: Most restrictive, requires proxies for large-scale scraping
- **ZipRecruiter**: Moderate rate limiting

### Recommendations:
- Use delays between requests
- Rotate proxies for large-scale scraping
- Respect robots.txt and terms of service
- Monitor for rate limiting responses

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
