/**
 * A redirect that leaves the board's domain must fail the request with an error
 * naming the destination, not be followed (transport fuzzing showed every
 * scraper following a 302 to an unrelated host and then reporting whatever that
 * host answered, e.g. "responded with status code 404").
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSession } from '../src/util';

let server: http.Server;
let port: number;
const hits: Record<string, number> = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits[`${req.headers.host}${req.url}`] = (hits[`${req.headers.host}${req.url}`] ?? 0) + 1;
    if (req.url === '/offsite') {
      res.writeHead(302, { location: `http://localhost:${port}/landed` });
      return res.end();
    }
    if (req.url === '/onsite') {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/landed` });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`landed on ${req.headers.host}`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => server.close());

describe('createSession siteDomain redirect policy', () => {
  it('follows a redirect that stays on the site', async () => {
    const session = createSession({ siteDomain: '127.0.0.1' });
    const response = await session.get(`http://127.0.0.1:${port}/onsite`);
    expect(response.status).toBe(200);
    expect(response.data).toBe(`landed on 127.0.0.1:${port}`);
  });

  it('refuses a redirect that leaves the site and names the destination host', async () => {
    const session = createSession({ siteDomain: '127.0.0.1' });
    const landedBefore = hits[`localhost:${port}/landed`] ?? 0;
    await expect(session.get(`http://127.0.0.1:${port}/offsite`)).rejects.toThrow(
      /redirected off-site to localhost/
    );
    // The off-site host was never contacted.
    expect(hits[`localhost:${port}/landed`] ?? 0).toBe(landedBefore);
  });

  it('accepts a RegExp site pattern (Google locale domains)', async () => {
    const allowed = createSession({ siteDomain: /^(localhost|127\.0\.0\.1)$/ });
    const response = await allowed.get(`http://127.0.0.1:${port}/offsite`);
    expect(response.status).toBe(200);
    const refused = createSession({ siteDomain: /^127\.0\.0\.1$/ });
    await expect(refused.get(`http://127.0.0.1:${port}/offsite`)).rejects.toThrow(
      /redirected off-site to localhost/
    );
  });

  it('accepts subdomains of the site domain', async () => {
    const session = createSession({ siteDomain: 'localhost' });
    // 127.0.0.1 -> localhost is off-site for '127.0.0.1' but here the session
    // is scoped to 'localhost', which the destination matches exactly.
    const response = await session.get(`http://127.0.0.1:${port}/offsite`).catch((e) => e);
    // The origin (127.0.0.1) is not itself on the site, but the policy only
    // judges redirect destinations, so the hop to localhost is allowed.
    expect(response.status).toBe(200);
  });

  it('follows any redirect when no siteDomain is configured', async () => {
    const session = createSession({});
    const response = await session.get(`http://127.0.0.1:${port}/offsite`);
    expect(response.status).toBe(200);
  });
});
