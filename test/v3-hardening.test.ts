/**
 * Unit tests for the v3 hardening pass: currency/interval parsing, salary
 * annualization, and strict option-key validation.
 */
import { InvalidInputError } from '../src/exception';
import { CompensationInterval } from '../src/model';
import { resolveOptions } from '../src/options';
import { convertToAnnual, currencyFromSymbol, extractSalary, intervalFromText } from '../src/util';

describe('currencyFromSymbol', () => {
  it('maps common symbols to ISO codes', () => {
    expect(currencyFromSymbol('$100,000')).toBe('USD');
    expect(currencyFromSymbol('£50,000')).toBe('GBP');
    expect(currencyFromSymbol('€85,000 - €95,000')).toBe('EUR');
    expect(currencyFromSymbol('₹1,200,000')).toBe('INR');
  });

  it('handles multi-character prefixes before the single leading char', () => {
    expect(currencyFromSymbol('CA$120,000')).toBe('CAD');
    expect(currencyFromSymbol('A$130,000')).toBe('AUD');
    expect(currencyFromSymbol('S$90,000')).toBe('SGD');
    expect(currencyFromSymbol('R$8,000')).toBe('BRL');
  });

  it('returns null for unknown or ambiguous symbols (never a raw char)', () => {
    expect(currencyFromSymbol('¥5,000,000')).toBeNull();
    expect(currencyFromSymbol('100000')).toBeNull();
  });

  it('only treats a leading R as ZAR when it precedes an amount', () => {
    expect(currencyFromSymbol('R85,000')).toBe('ZAR');
    expect(currencyFromSymbol('R 85,000')).toBe('ZAR');
    // Words that merely start with R must not be misread as Rand.
    expect(currencyFromSymbol('Rate: $50/hr')).toBeNull();
    expect(currencyFromSymbol('Range: $100k')).toBeNull();
  });
});

describe('intervalFromText', () => {
  it('reads an explicit unit from the text', () => {
    expect(intervalFromText('$25 per hour')).toBe(CompensationInterval.HOURLY);
    expect(intervalFromText('$2,000-$3,000 per week')).toBe(CompensationInterval.WEEKLY);
    expect(intervalFromText('$120,000/yr')).toBe(CompensationInterval.YEARLY);
    expect(intervalFromText('₹12,00,000 P.A.')).toBe(CompensationInterval.YEARLY);
  });

  it('returns null when the text states no unit', () => {
    expect(intervalFromText('$100,000 - $120,000')).toBeNull();
  });

  it('does not match "pa" inside ordinary words (anchored p.a. only)', () => {
    // Regression: an unanchored p.a. pattern matched "part", "package", "company".
    expect(intervalFromText('$30 - $45 (part-time role)')).toBeNull();
    expect(intervalFromText('great pay and package at this company')).toBeNull();
  });
});

describe('extractSalary', () => {
  it('classifies by explicit unit rather than magnitude', () => {
    // Magnitude alone would call 2000-3000 "monthly"; the text says weekly.
    const weekly = extractSalary('$2,000 - $3,000 per week');
    expect(weekly.interval).toBe(CompensationInterval.WEEKLY);
    expect(weekly.minAmount).toBe(2000);
    expect(weekly.maxAmount).toBe(3000);
  });

  it('preserves cents with parseFloat', () => {
    const hourly = extractSalary('$25.50 - $30.75 per hour');
    expect(hourly.interval).toBe(CompensationInterval.HOURLY);
    expect(hourly.minAmount).toBe(25.5);
    expect(hourly.maxAmount).toBe(30.75);
  });

  it('does not drop an unlabeled hourly-magnitude range near a "pa" word', () => {
    // Previously "part-time" matched p.a. -> YEARLY -> 30 < lowerLimit -> null.
    const r = extractSalary('$30 - $45 (part-time role)');
    expect(r.interval).toBe(CompensationInterval.HOURLY);
    expect(r.minAmount).toBe(30);
    expect(r.maxAmount).toBe(45);
  });

  it('reports yearly interval after annualizing with enforceAnnualSalary', () => {
    const annual = extractSalary('$2,000 - $3,000 per week', { enforceAnnualSalary: true });
    expect(annual.interval).toBe(CompensationInterval.YEARLY);
    expect(annual.minAmount).toBe(2000 * 52);
    expect(annual.maxAmount).toBe(3000 * 52);
  });
});

describe('convertToAnnual', () => {
  it('converts a one-sided range and labels it yearly', () => {
    const data: { interval?: string; minAmount?: number; maxAmount?: number } = {
      interval: 'hourly',
      minAmount: 50,
    };
    convertToAnnual(data);
    expect(data.interval).toBe('yearly');
    expect(data.minAmount).toBe(50 * 2080);
    expect(data.maxAmount).toBeUndefined();
  });
});

describe('resolveOptions strict key validation', () => {
  it('rejects unknown top-level keys', () => {
    expect(() => resolveOptions({ foo: 1 } as never)).toThrow(InvalidInputError);
  });

  it('rejects a non-object linkedin/google value', () => {
    expect(() => resolveOptions({ linkedin: [] as never })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ google: 'x' as never })).toThrow(InvalidInputError);
  });

  it('rejects unknown nested keys under linkedin', () => {
    expect(() => resolveOptions({ linkedin: { bogus: true } as never })).toThrow(InvalidInputError);
  });

  it('accepts a valid options object', () => {
    expect(() =>
      resolveOptions({ sites: 'indeed', linkedin: { fetchDescription: true } })
    ).not.toThrow();
  });
});
