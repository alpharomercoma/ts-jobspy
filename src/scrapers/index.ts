export { IndeedScraper } from './indeed';
export { LinkedInScraper } from './linkedin';
export { ZipRecruiterScraper } from './ziprecruiter';
export { GlassdoorScraper } from './glassdoor';
export { GoogleScraper } from './google';
export { BaytScraper } from './bayt';
export { NaukriScraper } from './naukri';
export { BDJobsScraper } from './bdjobs';

import { IndeedScraper } from './indeed';
import { LinkedInScraper } from './linkedin';
import { ZipRecruiterScraper } from './ziprecruiter';
import { GlassdoorScraper } from './glassdoor';
import { GoogleScraper } from './google';
import { BaytScraper } from './bayt';
import { NaukriScraper } from './naukri';
import { BDJobsScraper } from './bdjobs';
import { Site } from '../types';
import { Scraper } from '../models';

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
