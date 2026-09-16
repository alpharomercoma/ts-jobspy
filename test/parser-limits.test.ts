/**
 * Parser limits found by fuzzing the internal converters with adversarial
 * inputs (a job description is untrusted content served by a third party):
 *
 * - The email regex backtracked quadratically: a 20k-character token followed
 *   by '@' and another token took ~1.7s; 100k characters would stall the
 *   event loop for a minute. Bounding the local part and domain (RFC 5321
 *   limits) keeps it linear.
 * - Deeply nested HTML overflowed the stack in turndown (at ~2000 levels) and
 *   in cheerio's serializer (~5000), and parse5 spends quadratic time on deep
 *   nesting (50k levels: 18s). Nothing real nests past a few dozen levels, so
 *   past a fixed depth the converters fall back to a linear tag strip.
 */

import {
  extractEmailsFromText,
  markdownConverter,
  plainConverter,
  sanitizeHtml,
} from '../src/util';

const BUDGET_MS = 2000;

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

describe('extractEmailsFromText: linear on adversarial input', () => {
  it('handles a 200k-character token pair around "@" within budget', () => {
    const text = `${'a'.repeat(100_000)}@${'b'.repeat(100_000)}`;
    const { value, ms } = timed(() => extractEmailsFromText(text));
    expect(value).toBeNull();
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('still finds ordinary addresses', () => {
    expect(extractEmailsFromText('Contact jobs@acme-corp.co.uk or hr.team+x@example.com')).toEqual([
      'jobs@acme-corp.co.uk',
      'hr.team+x@example.com',
    ]);
  });
});

describe('HTML converters: bounded work on pathological nesting', () => {
  const deep = `<div>${'<div>'.repeat(50_000)}payload${'</div>'.repeat(50_000)}</div>`;
  const unclosed = `<html><body>${'<div>'.repeat(50_000)}payload`;

  it.each([
    ['markdownConverter', markdownConverter],
    ['plainConverter', plainConverter],
    ['sanitizeHtml', sanitizeHtml],
  ])('%s survives 50k nested elements and keeps the text', (_name, convert) => {
    for (const html of [deep, unclosed]) {
      const { value, ms } = timed(() => convert(html));
      expect(typeof value).toBe('string');
      expect(value).toContain('payload');
      expect(value).not.toContain('<div');
      expect(ms).toBeLessThan(BUDGET_MS);
    }
  });

  it('keeps comment bodies out of the fallback text', () => {
    // The fallback is a tag strip; a comment containing '>' must not leak.
    const html = `${'<div>'.repeat(300)}<!-- secret > token -->visible${'</div>'.repeat(300)}`;
    const text = plainConverter(html);
    expect(text).toContain('visible');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('token');
  });

  it('converts ordinary nesting normally', () => {
    const html = '<div><ul><li><p>Build <b>things</b></p></li></ul></div>';
    expect(markdownConverter(html)).toContain('**things**');
    expect(plainConverter(html)).toBe('Build things');
    expect(sanitizeHtml(html)).toContain('<b>things</b>');
  });
});
