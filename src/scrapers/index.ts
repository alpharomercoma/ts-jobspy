export { IndeedScraper } from './indeed';
export { LinkedInScraper } from './linkedin';
export { ZipRecruiterScraper } from './ziprecruiter';

import { IndeedScraper } from './indeed';
import { LinkedInScraper } from './linkedin';
import { ZipRecruiterScraper } from './ziprecruiter';
import { Site } from '../types';
import { Scraper } from '../models';

export const SCRAPER_MAPPING: Record<Site, new (config?: any) => Scraper> = {
  [Site.INDEED]: IndeedScraper,
  [Site.LINKEDIN]: LinkedInScraper,
  [Site.ZIP_RECRUITER]: ZipRecruiterScraper,
  [Site.GLASSDOOR]: IndeedScraper, // Placeholder - would need separate implementation
  [Site.GOOGLE]: IndeedScraper, // Placeholder - would need separate implementation
  [Site.BAYT]: IndeedScraper, // Placeholder - would need separate implementation
  [Site.NAUKRI]: IndeedScraper, // Placeholder - would need separate implementation
  [Site.BDJOBS]: IndeedScraper, // Placeholder - would need separate implementation
};
