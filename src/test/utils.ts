import { SupportedCountry } from '../types';

/**
 * Shared test utilities and constants to avoid duplication across test files.
 */

// Common country sets for testing
export const TEST_COUNTRIES = {
  BASIC: ['usa', 'uk', 'canada', 'australia'] as SupportedCountry[],
  EXTENDED: ['usa', 'uk', 'canada', 'australia', 'germany'] as SupportedCountry[],
  MAJOR: [
    'usa', 'uk', 'canada', 'australia', 'germany', 'france',
    'japan', 'india', 'brazil', 'mexico', 'spain', 'italy'
  ] as SupportedCountry[],
  ALIASES: [
    { input: 'us' as SupportedCountry, expected: 'us' },
    { input: 'united states' as SupportedCountry, expected: 'united states' },
    { input: 'britain' as SupportedCountry, expected: 'britain' },
  ]
};

// Common test job expectations
export const EXPECTED_JOB_STRUCTURE = {
  title: expect.any(String),
  companyName: expect.any(String),
  jobUrl: expect.any(String),
  location: expect.objectContaining({
    city: expect.any(String),
    country: expect.any(String)
  })
};

// Common scraping options for tests
export const BASE_SCRAPE_OPTIONS = {
  siteName: ['indeed'] as const,
  searchTerm: 'software engineer',
  resultsWanted: 1
};
