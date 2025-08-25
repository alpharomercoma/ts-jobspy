import { SupportedCountry } from '../types';

export const TEST_COUNTRIES = {
  BASIC: ['usa', 'uk', 'canada', 'germany', 'france'] as SupportedCountry[],
  MAJOR: ['usa', 'uk', 'canada', 'germany', 'france', 'australia', 'india'] as SupportedCountry[],
  EXTENDED: ['usa', 'uk', 'canada', 'germany', 'france', 'australia', 'india', 'brazil', 'mexico', 'spain'] as SupportedCountry[],
  ALIASES: [
    { input: 'us' as SupportedCountry, expected: 'us' },
    { input: 'united states' as SupportedCountry, expected: 'united states' },
    { input: 'america' as SupportedCountry, expected: 'america' },
    { input: 'britain' as SupportedCountry, expected: 'britain' },
    { input: 'czechia' as SupportedCountry, expected: 'czechia' },
  ]
};