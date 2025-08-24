export { BaytScraper } from './bayt';
export { BDJobsScraper } from './bdjobs';
export { GlassdoorScraper } from './glassdoor';
export { GoogleScraper } from './google';
export { IndeedScraper } from './indeed';
export { LinkedInScraper } from './linkedin';
export { NaukriScraper } from './naukri';
export { ZipRecruiterScraper } from './ziprecruiter';

import { Scraper } from '../models';
import { Site } from '../types';
import { BaytScraper } from './bayt';
import { BDJobsScraper } from './bdjobs';
import { GlassdoorScraper } from './glassdoor';
import { GoogleScraper } from './google';
import { IndeedScraper } from './indeed';
import { LinkedInScraper } from './linkedin';
import { NaukriScraper } from './naukri';
import { ZipRecruiterScraper } from './ziprecruiter';

export const SCRAPER_MAPPING: Record<Site, new (config?: any) => Scraper> = {
  [Site.INDEED]: IndeedScraper,
  [Site.LINKEDIN]: LinkedInScraper,
  [Site.ZIP_RECRUITER]: ZipRecruiterScraper,
  [Site.GLASSDOOR]: GlassdoorScraper,
  [Site.GOOGLE]: GoogleScraper,
  [Site.BAYT]: BaytScraper,
  [Site.NAUKRI]: NaukriScraper,
  [Site.BDJOBS]: BDJobsScraper,
};
