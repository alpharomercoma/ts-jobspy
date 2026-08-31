import { InvalidInputError } from '../src/exception';
import { Country, DescriptionFormat, JobType, Site } from '../src/model';
import { resolveOptions, WORKING_SITES } from '../src/options';

describe('resolveOptions', () => {
  it('defaults to the working sites only', () => {
    const resolved = resolveOptions({});
    expect(resolved.sites).toEqual([Site.INDEED, Site.LINKEDIN]);
    expect(WORKING_SITES).toEqual(['indeed', 'linkedin']);
  });

  it('accepts a single site string', () => {
    expect(resolveOptions({ sites: 'linkedin' }).sites).toEqual([Site.LINKEDIN]);
  });

  it('accepts ziprecruiter spelling without underscore', () => {
    expect(resolveOptions({ sites: 'ziprecruiter' }).sites).toEqual([Site.ZIP_RECRUITER]);
  });

  it('accepts the Site enum value zip_recruiter as an alias', () => {
    expect(resolveOptions({ sites: 'zip_recruiter' as never }).sites).toEqual([Site.ZIP_RECRUITER]);
  });

  it('deduplicates requested sites', () => {
    expect(resolveOptions({ sites: ['indeed', 'indeed'] }).sites).toEqual([Site.INDEED]);
  });

  it('throws on unknown site', () => {
    expect(() => resolveOptions({ sites: 'monster' as never })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ sites: 'monster' as never })).toThrow(/valid sites/);
  });

  it('throws on empty sites array', () => {
    expect(() => resolveOptions({ sites: [] })).toThrow(InvalidInputError);
  });

  it('throws on unknown jobType instead of silently ignoring it', () => {
    expect(() => resolveOptions({ jobType: 'gig-economy' })).toThrow(InvalidInputError);
  });

  it('parses valid jobType', () => {
    expect(resolveOptions({ jobType: 'full-time' }).jobType).toBe(JobType.FULL_TIME);
  });

  it('throws on unknown country instead of defaulting to USA', () => {
    expect(() => resolveOptions({ country: 'atlantis' })).toThrow(InvalidInputError);
  });

  it('parses country', () => {
    expect(resolveOptions({ country: 'uk' }).country).toBe(Country.UK);
    expect(resolveOptions({}).country).toBe(Country.USA);
  });

  it('throws on unknown descriptionFormat', () => {
    expect(() => resolveOptions({ descriptionFormat: 'yaml' as never })).toThrow(InvalidInputError);
  });

  it('parses descriptionFormat', () => {
    expect(resolveOptions({ descriptionFormat: 'html' }).descriptionFormat).toBe(
      DescriptionFormat.HTML
    );
  });

  it('normalizes dedupe booleans', () => {
    expect(resolveOptions({}).dedupe).toBe('none');
    expect(resolveOptions({ dedupe: true }).dedupe).toBe('content');
    expect(resolveOptions({ dedupe: false }).dedupe).toBe('none');
    expect(resolveOptions({ dedupe: 'url' }).dedupe).toBe('url');
  });

  it('throws on invalid dedupe mode', () => {
    expect(() => resolveOptions({ dedupe: 'fuzzy' as never })).toThrow(InvalidInputError);
  });

  it('throws on negative numeric options', () => {
    expect(() => resolveOptions({ resultsWanted: -1 })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ offset: -5 })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ distance: Number.NaN })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ hoursOld: -2 })).toThrow(InvalidInputError);
  });

  it('applies numeric defaults', () => {
    const resolved = resolveOptions({});
    expect(resolved.resultsWanted).toBe(15);
    expect(resolved.offset).toBe(0);
    expect(resolved.distance).toBe(50);
    expect(resolved.hoursOld).toBeUndefined();
  });

  it('normalizes a single proxy string to an array', () => {
    expect(resolveOptions({ proxies: 'http://proxy:8080' }).proxies).toEqual(['http://proxy:8080']);
  });

  it('rejects empty proxy strings', () => {
    expect(() => resolveOptions({ proxies: [''] })).toThrow(InvalidInputError);
  });

  it('throws on invalid verbose level', () => {
    expect(() => resolveOptions({ verbose: 5 as never })).toThrow(InvalidInputError);
  });

  it('carries site-scoped options through', () => {
    const resolved = resolveOptions({
      linkedin: { fetchDescription: true, companyIds: [1, 2] },
      google: { searchTerm: 'x jobs' },
    });
    expect(resolved.linkedin).toEqual({ fetchDescription: true, companyIds: [1, 2] });
    expect(resolved.google).toEqual({ searchTerm: 'x jobs' });
  });
});

describe('resolveOptions hardening (adversarial review fixes)', () => {
  it('rejects non-integer numbers instead of flooring', () => {
    expect(() => resolveOptions({ resultsWanted: 0.9 })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ offset: Number.MAX_VALUE })).toThrow(InvalidInputError);
  });

  it('rejects hoursOld 0 (would silently disable the filter)', () => {
    expect(() => resolveOptions({ hoursOld: 0 })).toThrow(InvalidInputError);
    expect(resolveOptions({ hoursOld: 1 }).hoursOld).toBe(1);
  });

  it('rejects an empty proxies array', () => {
    expect(() => resolveOptions({ proxies: [] })).toThrow(InvalidInputError);
  });

  it('rejects non-boolean flags', () => {
    expect(() => resolveOptions({ isRemote: 'false' as never })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ strict: 1 as never })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ linkedin: { fetchDescription: 'true' as never } })).toThrow(
      InvalidInputError
    );
  });

  it('rejects a non-string descriptionFormat with InvalidInputError, not TypeError', () => {
    expect(() => resolveOptions({ descriptionFormat: 7 as never })).toThrow(InvalidInputError);
  });

  it('rejects invalid linkedin.companyIds', () => {
    expect(() => resolveOptions({ linkedin: { companyIds: [1.5] } })).toThrow(InvalidInputError);
    expect(() => resolveOptions({ linkedin: { companyIds: ['a' as never] } })).toThrow(
      InvalidInputError
    );
  });

  it('validates timeoutMs as a positive integer', () => {
    expect(() => resolveOptions({ timeoutMs: 0 })).toThrow(InvalidInputError);
    expect(resolveOptions({ timeoutMs: 5000 }).timeoutMs).toBe(5000);
  });
});
