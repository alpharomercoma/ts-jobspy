/**
 * Findings from the codex + agy re-review of the stress round, each verified
 * against parse5/cheerio behavior or the actual code path before being fixed:
 *
 * - sanitizeHtml's fallback decoded entities into live markup.
 * - The depth guard could be bypassed: parse5 nests `<div/>` (a non-void
 *   self-closing tag is an open tag in HTML) and ignores stray end tags.
 * - scanHtml lowercased the whole input per <script>/<style> (quadratic).
 * - The tokenizer ended a tag at a '>' inside a quoted attribute.
 * - The bounded email regex matched a 64-character suffix of an overlong
 *   local part as if it were an address.
 * - A bare `<!DOCTYPE html>` counted as LinkedIn's end-of-results marker.
 * - Option holes: jobType errors interpolated non-strings, explicit null
 *   silently took the default, proxies had no count/length bound, an
 *   uppercase proxy scheme was accepted then mangled, a bad percent-escape in
 *   proxy credentials failed at request time, caCert accepted any file with a
 *   BEGIN marker, and Google's locale redirects were refused.
 * - A corrupted direct salary range shadowed a valid description salary.
 */
import path from 'node:path';
import { InvalidInputError } from '../src/exception';
import { isEndOfResultsPage } from '../src/linkedin/util';
import { resolveOptions } from '../src/options';
import {
  extractEmailsFromText,
  loadHtml,
  markdownConverter,
  plainConverter,
  removeAttributes,
  sanitizeHtml,
} from '../src/util';

const BUDGET_MS = 2000;
const TLS_DIR = path.join(__dirname, 'fixtures', 'tls');

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

describe('sanitizeHtml fallback stays inert markup', () => {
  it('escapes text so an entity-encoded tag cannot become live', () => {
    const html = `${'<div>'.repeat(300)}&lt;img src=x onerror=alert(1)&gt;`;
    const out = sanitizeHtml(html);
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('removeAttributes is guarded the same way', () => {
    const { value, ms } = timed(() => removeAttributes(`${'<div>'.repeat(50_000)}payload`));
    expect(value).toContain('payload');
    expect(value).not.toContain('<div');
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});

describe('depth guard follows HTML parsing rules', () => {
  it.each([
    ['self-closing syntax on a non-void element', '<div/>'.repeat(50_000)],
    ['stray end tags between open tags', '<div></span>'.repeat(50_000)],
    ['uppercase tags', '<DIV>'.repeat(50_000)],
  ])('refuses %s as a full page', (_label, html) => {
    const { ms } = timed(() => expect(() => loadHtml(html)).toThrow(/nested too deep/));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it.each([
    ['self-closing syntax on a non-void element', `${'<div/>'.repeat(50_000)}payload`],
    ['stray end tags between open tags', `${'<div></span>'.repeat(50_000)}payload`],
  ])('converters fall back on %s', (_label, html) => {
    for (const convert of [markdownConverter, plainConverter, sanitizeHtml]) {
      const { value, ms } = timed(() => convert(html));
      expect(value).toContain('payload');
      expect(ms).toBeLessThan(BUDGET_MS);
    }
  });

  it('does not count implied closes as nesting', () => {
    // parse5 closes each <p>, <li>, <td>, <tr>, <option> when its sibling
    // opens, and closes an open <a> when a new one starts.
    const html = [
      '<p>'.repeat(300),
      `<ul>${'<li>item'.repeat(300)}</ul>`,
      `<table>${'<tr><td>x'.repeat(300)}</table>`,
      `<select>${'<option>o'.repeat(300)}</select>`,
      '<a href="#">'.repeat(300),
      '<div>'.repeat(200),
    ].join('');
    expect(() => loadHtml(html)).not.toThrow();
    expect(plainConverter(html)).toContain('item');
  });

  it('honors self-closing syntax inside svg and math', () => {
    const html = `<div><svg>${'<g/>'.repeat(300)}</svg>payload</div>`;
    expect(() => loadHtml(html)).not.toThrow();
    expect(plainConverter(html)).toBe('payload');
  });
});

describe('scanHtml is linear and quote-aware', () => {
  it('handles 50k script elements within budget', () => {
    const html = `${'<script></script>'.repeat(50_000)}${'<div>'.repeat(300)}payload`;
    const { value, ms } = timed(() => plainConverter(html));
    expect(value).toContain('payload');
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('handles 50k unterminated bogus comments within budget', () => {
    const html = `${'<!x'.repeat(50_000)}`;
    const { ms } = timed(() => plainConverter(html));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('keeps a ">" inside a quoted attribute out of the fallback text', () => {
    const html = `${'<div>'.repeat(300)}<p title="a>b" data-x='c>d'>hello</p>`;
    const text = plainConverter(html);
    expect(text).toBe('hello');
  });

  it('counts depth correctly when an attribute value contains "<"', () => {
    // A '<' inside a quoted attribute is not a tag; 300 of them must not
    // push a shallow page over the limit.
    const html = `<div>${'<p data-x="<div><div>">x</p>'.repeat(300)}</div>`;
    expect(() => loadHtml(html)).not.toThrow();
  });
});

describe('email extraction respects token boundaries', () => {
  it('does not report a suffix of an overlong local part', () => {
    expect(extractEmailsFromText(`${'a'.repeat(100)}@example.com`)).toBeNull();
    expect(extractEmailsFromText(`Contact:${'b'.repeat(70)}@example.com now`)).toBeNull();
  });

  it('still reports a maximal valid local part', () => {
    const address = `${'x'.repeat(64)}@example.com`;
    expect(extractEmailsFromText(`mail ${address} today`)).toEqual([address]);
  });
});

describe('LinkedIn end-of-results marker', () => {
  it('requires the empty comment, not just a doctype', () => {
    expect(isEndOfResultsPage('<!DOCTYPE html>')).toBe(false);
    expect(isEndOfResultsPage('<!DOCTYPE html>\n<!---->\n')).toBe(true);
    expect(isEndOfResultsPage('<!DOCTYPE html><!----><!---->')).toBe(true);
  });
});

describe('option validation holes', () => {
  const rejects = (options: unknown, pattern: RegExp) => {
    expect(() => resolveOptions(options as never)).toThrow(InvalidInputError);
    expect(() => resolveOptions(options as never)).toThrow(pattern);
  };

  it('reports a non-string jobType as InvalidInputError', () => {
    rejects({ jobType: Object.create(null) }, /jobType/);
    rejects({ jobType: Symbol('s') }, /jobType/);
    rejects({ jobType: 42 }, /jobType/);
  });

  it('rejects an explicit null instead of silently taking the default', () => {
    rejects({ sites: null }, /sites.*null/);
    rejects({ country: null }, /country.*null/);
    rejects({ verbose: null }, /verbose.*null/);
    rejects({ linkedin: { fetchDescription: null } }, /linkedin\.fetchDescription.*null/);
  });

  it('bounds the proxies list and entry length', () => {
    rejects({ proxies: Array.from({ length: 1001 }, (_, i) => `http://h${i}:1`) }, /proxies.*1000/);
    rejects({ proxies: `http://${'h'.repeat(2100)}:1` }, /proxies.*2048/);
  });

  it('accepts an uppercase scheme and keeps it usable', () => {
    expect(resolveOptions({ proxies: 'HTTP://host:8080' }).proxies).toEqual(['HTTP://host:8080']);
    expect(resolveOptions({ proxies: 'SOCKS5://host:1080' }).proxies).toEqual([
      'SOCKS5://host:1080',
    ]);
  });

  it('rejects credentials that cannot be percent-decoded', () => {
    rejects({ proxies: 'http://u:100%pass@host:1' }, /proxies.*percent/);
    expect(resolveOptions({ proxies: 'http://u:p%40ss@host:1' }).proxies).toEqual([
      'http://u:p%40ss@host:1',
    ]);
  });

  it('rejects a caCert whose PEM block is not a certificate', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const os = require('node:os') as typeof import('node:os');
    const fake = path.join(os.tmpdir(), `ts-jobspy-fake-${process.pid}.pem`);
    fs.writeFileSync(
      fake,
      '-----BEGIN CERTIFICATE-----\nbm90IGEgY2VydGlmaWNhdGU=\n-----END CERTIFICATE-----\n'
    );
    try {
      rejects({ caCert: fake }, /caCert.*PEM/);
    } finally {
      fs.unlinkSync(fake);
    }
    expect(resolveOptions({ caCert: path.join(TLS_DIR, 'ca.pem') }).caCert).toBe(
      path.join(TLS_DIR, 'ca.pem')
    );
  });
});
