/**
 * Google answers a search from a locale domain (www.google.com -> www.google.com.ph,
 * consent.google.com for the consent interstitial). A fixed 'google.com' site
 * domain refused those redirects as off-site; the scraper must hand the session
 * a pattern that covers Google's country domains without covering look-alikes.
 */
import { Google } from '../src/google';
import { createSession } from '../src/util';

jest.mock('../src/util', () => {
  const actual = jest.requireActual('../src/util');
  return { ...actual, createSession: jest.fn() };
});

describe('Google site domain pattern', () => {
  it('matches Google country domains and the consent host but not look-alikes', async () => {
    const get = jest.fn().mockResolvedValue({ status: 403, data: '' });
    (createSession as jest.Mock).mockReturnValue({ defaults: { headers: {} }, get });
    await new Google({})
      .scrape({ searchTerm: 'x', resultsWanted: 1 } as never)
      .catch(() => undefined);
    const options = (createSession as jest.Mock).mock.calls[0][0] as { siteDomain: RegExp };
    expect(options.siteDomain).toBeInstanceOf(RegExp);
    for (const host of [
      'www.google.com',
      'www.google.com.ph',
      'www.google.co.uk',
      'www.google.de',
      'consent.google.com',
      'google.com',
    ]) {
      expect(options.siteDomain.test(host)).toBe(true);
    }
    for (const host of [
      'www.google.evil',
      'google.com.evil.example',
      'notgoogle.com',
      'evil.test',
    ]) {
      expect(options.siteDomain.test(host)).toBe(false);
    }
  });
});
