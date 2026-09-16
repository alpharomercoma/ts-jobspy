/**
 * Validation holes found by option fuzzing against the built package:
 *
 * - timeoutMs above 2^31-1 overflows Node's timer (TimeoutOverflowWarning, the
 *   timer fires after 1ms) so every site "timed out after 1000000000000ms".
 * - A null-prototype object anywhere threw TypeError ("Cannot convert object
 *   to primitive value") out of the error formatter instead of
 *   InvalidInputError.
 * - proxies that cannot form a URL, and a caCert path that is not a readable
 *   PEM file, passed validation and then failed every site at request time.
 * - Oversized searchTerm/location/userAgent/companyIds produced a request the
 *   server resets (EPIPE / ECONNRESET) instead of a validation error.
 */
import path from 'node:path';
import { InvalidInputError } from '../src/exception';
import { resolveOptions } from '../src/options';

const CA = path.join(__dirname, 'fixtures', 'tls', 'ca.pem');

function rejects(options: unknown, pattern: RegExp): void {
  expect(() => resolveOptions(options as never)).toThrow(InvalidInputError);
  expect(() => resolveOptions(options as never)).toThrow(pattern);
}

describe('timeoutMs upper bound', () => {
  it('rejects a value that does not fit a 32-bit timer', () => {
    rejects({ timeoutMs: 2_147_483_648 }, /timeoutMs.*2147483647/);
    rejects({ timeoutMs: 1e12 }, /timeoutMs/);
  });

  it('accepts the maximum timer value', () => {
    expect(resolveOptions({ timeoutMs: 2_147_483_647 }).timeoutMs).toBe(2_147_483_647);
  });
});

describe('values that cannot be stringified', () => {
  const nullProto = Object.create(null);

  it.each([
    ['sites', { sites: nullProto }],
    ['sites (plain object)', { sites: {} }],
    ['resultsWanted', { resultsWanted: nullProto }],
    ['userAgent', { userAgent: nullProto }],
    ['dedupe', { dedupe: nullProto }],
    ['verbose', { verbose: nullProto }],
    ['siteConcurrency', { siteConcurrency: [nullProto] }],
  ])('rejects %s with InvalidInputError, not TypeError', (_label, options) => {
    expect(() => resolveOptions(options as never)).toThrow(InvalidInputError);
  });
});

describe('proxies must form a URL', () => {
  it.each(['not a url', 'http://', 'socks5://', '://x', 'ftp://host:1', 'http://host:notaport'])(
    'rejects %j',
    (proxy) => {
      rejects({ proxies: proxy }, /proxies/);
      rejects({ proxies: ['http://ok:1', proxy] }, /proxies/);
    }
  );

  it.each([
    'host:1234',
    'user:pass@host:1',
    'http://h:1',
    'https://h:1',
    'socks5://h:1',
    'socks4://h:1',
  ])('accepts %j', (proxy) => {
    expect(resolveOptions({ proxies: proxy }).proxies).toEqual([proxy]);
  });
});

describe('caCert must be a readable PEM file', () => {
  it('rejects a missing file', () => {
    rejects({ caCert: '/nonexistent/ca.pem' }, /caCert.*readable/);
  });

  it('rejects a directory', () => {
    rejects({ caCert: __dirname }, /caCert.*readable/);
  });

  it('rejects a file that is not a PEM certificate', () => {
    rejects({ caCert: __filename }, /caCert.*PEM/);
  });

  it('accepts a PEM certificate', () => {
    expect(resolveOptions({ caCert: CA }).caCert).toBe(CA);
  });
});

describe('string and list size limits', () => {
  it('caps searchTerm, google.searchTerm and location', () => {
    rejects({ searchTerm: 'a'.repeat(1001) }, /searchTerm.*1000/);
    rejects({ google: { searchTerm: 'a'.repeat(1001) } }, /google\.searchTerm.*1000/);
    rejects({ location: 'a'.repeat(501) }, /location.*500/);
    expect(
      resolveOptions({ searchTerm: 'a'.repeat(1000), location: 'b'.repeat(500) }).searchTerm
    ).toHaveLength(1000);
  });

  it('caps userAgent and rejects control characters in it', () => {
    rejects({ userAgent: 'U'.repeat(1025) }, /userAgent.*1024/);
    rejects({ userAgent: 'evil\r\nX-Injected: 1' }, /userAgent.*control/);
    rejects({ userAgent: 'nul\u0000' }, /userAgent.*control/);
    expect(resolveOptions({ userAgent: 'Mozilla/5.0 (X11; Linux) ☃' }).userAgent).toContain('☃');
  });

  it('caps linkedin.companyIds at 100 entries', () => {
    rejects(
      { linkedin: { companyIds: Array.from({ length: 101 }, (_, i) => i) } },
      /companyIds.*100/
    );
    expect(
      resolveOptions({ linkedin: { companyIds: Array.from({ length: 100 }, (_, i) => i) } })
        .linkedin.companyIds
    ).toHaveLength(100);
  });
});
