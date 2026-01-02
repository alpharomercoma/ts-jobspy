# TypeScript Job Scraper 📝

**ts-jobspy** is a job scraping library for JavaScript/TypeScript with the goal of aggregating jobs from popular job boards with one tool.

This is a TypeScript port of [python-jobspy](https://github.com/speedyapply/JobSpy).

## Features

- Scrapes job postings from **LinkedIn** & **Indeed** concurrently
- Returns structured job data as an array of objects
- Proxies support to bypass blocking
- Works with both JavaScript and TypeScript

## Installation

```bash
npm install ts-jobspy
# or
yarn add ts-jobspy
# or
pnpm add ts-jobspy
```

_Node.js version >= [20.0.0](https://nodejs.org/) required_

## Usage

```javascript
import { scrapeJobs } from 'ts-jobspy';
import fs from 'fs';

const jobs = await scrapeJobs({
  siteName: ['indeed', 'linkedin'],
  searchTerm: 'software engineer',
  location: 'San Francisco, CA',
  resultsWanted: 20,
  hoursOld: 72,
  countryIndeed: 'USA',

  // linkedinFetchDescription: true // gets more info such as description, direct job url (slower)
});

console.log(`Found ${jobs.length} jobs`);
fs.writeFileSync('jobs.json', JSON.stringify(jobs, null, 2));
```

### Example Output

| site     | company | title                                                            | location          | datePosted | description                                                                      | jobUrl                                        | jobUrlDirect                                       | salarySource | interval | minAmount | maxAmount | currency | isRemote |
|----------|---------|------------------------------------------------------------------|-------------------|------------|----------------------------------------------------------------------------------|-----------------------------------------------|----------------------------------------------------|--------------|----------|-----------|-----------|----------|----------|
| indeed   | Adobe   | Software Development Engineer                                    | San Jose, CA, US  | 2026-01-02 | Our Company <br>Changing the world through digital experiences...         | https://www.indeed.com/viewjob?jk=17cf2...    | https://careers.adobe.com/us/en/job/ADOBUSR1633... | direct_data  | yearly   | 139000    | 257550    | USD      | false    |
| linkedin | Google  | Software Engineer, Infrastructure, User Personalization          | Mountain View, CA | 2025-12-31 | Minimum qualifications:  Bachelor's degree ...         | https://www.linkedin.com/jobs/view/4326...    | https://careers.google.com/jobs/results/10592...   | description  | yearly   | 141000    | 202000    | USD      | false    |
| linkedin | Twitch  | Software Development Engineer                                    | San Francisco, CA | 2026-01-01 | About Us  <br> Twitch is the world's biggest live streaming service...  | https://www.linkedin.com/jobs/view/4319...    | null                                               | description  | yearly   | 99500     | 200000    | USD      | false    |
| linkedin | Netflix | Full Stack Software Engineer (L5), Studio Orchestration Platform | Los Gatos, CA     | 2026-01-01 | Netflix is one of the world's leading entertainment services...                     | https://www.linkedin.com/jobs/view/4349506141 | null                                               | null         | null     | null      | null      | null     | false    |
| linkedin | Meta    | Software Engineer, Machine Learning                              | Sunnyvale, CA     | null       | Meta is seeking talented engineers to join our teams in building cutting-edge... | https://www.linkedin.com/jobs/view/4254...    | https://jsv3.recruitics.com/redirect?rx_cid=...    | null         | null     | null      | null      | null     | false    |

### Parameters for `scrapeJobs()`

```plaintext
Optional
├── siteName (string | string[]):
│    linkedin, indeed
│    (default is all available)
│
├── searchTerm (string)
│
├── location (string)
│
├── distance (number):
│    in miles, default 50
│
├── jobType (string):
│    fulltime, parttime, internship, contract
│
├── proxies (string | string[]):
│    in format ['user:pass@host:port', 'localhost']
│    each job board scraper will round robin through the proxies
│
├── isRemote (boolean)
│
├── resultsWanted (number):
│    number of job results to retrieve for each site specified in 'siteName'
│
├── easyApply (boolean):
│    filters for jobs that are hosted on the job board site
│
├── descriptionFormat (string):
│    markdown, html (default is markdown)
│
├── offset (number):
│    starts the search from an offset
│
├── hoursOld (number):
│    filters jobs by the number of hours since the job was posted
│
├── linkedinFetchDescription (boolean):
│    fetches full description and direct job url for LinkedIn (slower)
│
├── linkedinCompanyIds (number[]):
│    searches for linkedin jobs with specific company ids
│
├── countryIndeed (string):
│    filters the country on Indeed (see supported countries below)
│
├── enforceAnnualSalary (boolean):
│    converts wages to annual salary
│
└── caCert (string)
     path to CA Certificate file for proxies
```

### Limitations

```plaintext
├── Indeed limitations:
│    Only one from this list can be used in a search:
│    - hoursOld
│    - jobType & isRemote
│    - easyApply
│
└── LinkedIn limitations:
     - Rate limits at ~10th page. Proxies are recommended for large scrapes.
```

## Supported Countries for Job Searching

### LinkedIn

LinkedIn searches globally & uses only the `location` parameter.

### Indeed

Indeed supports most countries. The `countryIndeed` parameter is required. Use the `location` parameter to narrow down by city/state.

|                      |              |            |                |
|----------------------|--------------|------------|----------------|
| Argentina            | Australia    | Austria    | Bahrain        |
| Belgium              | Brazil       | Canada     | Chile          |
| China                | Colombia     | Costa Rica | Czech Republic |
| Denmark              | Ecuador      | Egypt      | Finland        |
| France               | Germany      | Greece     | Hong Kong      |
| Hungary              | India        | Indonesia  | Ireland        |
| Israel               | Italy        | Japan      | Kuwait         |
| Luxembourg           | Malaysia     | Mexico     | Morocco        |
| Netherlands          | New Zealand  | Nigeria    | Norway         |
| Oman                 | Pakistan     | Panama     | Peru           |
| Philippines          | Poland       | Portugal   | Qatar          |
| Romania              | Saudi Arabia | Singapore  | South Africa   |
| South Korea          | Spain        | Sweden     | Switzerland    |
| Taiwan               | Thailand     | Turkey     | Ukraine        |
| United Arab Emirates | UK           | USA        | Uruguay        |
| Venezuela            | Vietnam      |            |                |

## Notes

- Indeed is the best scraper currently with minimal rate limiting.
- All job board endpoints are capped at around 1000 jobs on a given search.
- LinkedIn is the most restrictive and usually rate limits around the 10th page. Proxies are recommended.

## Frequently Asked Questions

**Q: Why is Indeed giving unrelated roles?**
**A:** Indeed searches the description too.

- use `-` to remove words
- use `""` for exact match

Example of a good Indeed query:

```javascript
searchTerm: '"engineering intern" software summer (java OR python OR c++) 2025 -tax -marketing'
```

---

**Q: Received a response code 429?**
**A:** This indicates you have been rate limited. We recommend:

- Wait some time between scrapes (site-dependent)
- Try using the `proxies` parameter to rotate IP addresses

---

### JobPost Schema

```plaintext
JobPost
├── title
├── company
├── companyUrl
├── jobUrl
├── jobUrlDirect
├── location
├── isRemote
├── description
├── jobType: fulltime, parttime, internship, contract
├── compensation
│   ├── interval: yearly, monthly, weekly, daily, hourly
│   ├── minAmount
│   ├── maxAmount
│   ├── currency
│   └── salarySource: direct_data, description (parsed from posting)
├── datePosted
└── emails

LinkedIn specific
└── jobLevel

LinkedIn & Indeed specific
└── companyIndustry

Indeed specific
├── companyAddresses
├── companyNumEmployees
├── companyRevenue
├── companyDescription
└── companyLogo
```

## Roadmap

> **Note:** Only LinkedIn and Indeed scrapers are currently working. Support for Glassdoor, ZipRecruiter, Google, and other job boards is coming soon.

Future features planned:

- **Glassdoor support** - Scraper currently under maintenance
- **ZipRecruiter support** - US/Canada job board (under maintenance)
- **Google Jobs support** - Global job search (under maintenance)
- **Additional job boards** - Bayt, Naukri, BDJobs (under maintenance)

## Credits

This package is a TypeScript port of [python-jobspy](https://github.com/speedyapply/JobSpy).

**TypeScript Port Author:**
- Alpha Romer Coma (alpharomercoma@proton.me)

**Original python-jobspy Authors:**
- Cullen Watson (cullen@cullenwatson.com)
- Zachary Hampton (zachary@zacharysproducts.com)

## License

MIT License - see [LICENSE](LICENSE) for details.
