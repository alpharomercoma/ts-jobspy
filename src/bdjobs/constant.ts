/**
 * BDJobs scraper constants
 */

export const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  Connection: 'keep-alive',
  Referer: 'https://jobs.bdjobs.com/',
  'Cache-Control': 'max-age=0',
};

export const SEARCH_PARAMS: Record<string, string> = {
  hidJobSearch: 'jobsearch',
};

export const JOB_SELECTORS: string[] = [
  'div.job-item',
  'div.sout-jobs-wrapper',
  'div.norm-jobs-wrapper',
  'div.featured-wrap',
];

export const DATE_FORMATS: string[] = [
  'DD MMM YYYY',
  'DD-MMM-YYYY',
  'DD MMMM YYYY',
  'MMMM DD, YYYY',
  'DD/MM/YYYY',
];
