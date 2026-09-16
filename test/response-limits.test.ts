/**
 * A response body must be capped after decompression. Transport fuzzing served
 * a 200KB gzip body that inflated to 200MB and the consumer process died with
 * "FATAL ERROR: JavaScript heap out of memory": a hostile or compromised board
 * (or proxy) could kill any process that uses the library.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { createSession } from '../src/util';

let server: http.Server;
let port: number;
const BOMB = zlib.gzipSync(Buffer.alloc(24 * 1024 * 1024, 0x20)); // 24MB of spaces
const hits: Record<string, number> = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits[req.url ?? ''] = (hits[req.url ?? ''] ?? 0) + 1;
    if (req.url === '/offsite') {
      res.writeHead(302, { location: `http://localhost:${port}/small` });
      return res.end();
    }
    if (req.url === '/bomb') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      return res.end(BOMB);
    }
    if (req.url === '/trickle') {
      // One byte every 100ms, forever: never idle long enough for axios's
      // inactivity `timeout` to fire, never finished.
      res.writeHead(200, { 'content-type': 'text/html' });
      const timer = setInterval(() => res.write('x'), 100);
      res.on('close', () => clearInterval(timer));
      return;
    }
    if (req.url === '/reset-then-trickle') {
      // First attempt: connection dropped (a transient error axios-retry
      // retries). Second attempt: a trickle that must hit the deadline.
      if (hits['/reset-then-trickle'] === 1) return req.socket.destroy();
      res.writeHead(200, { 'content-type': 'text/html' });
      const timer = setInterval(() => res.write('x'), 50);
      res.on('close', () => clearInterval(timer));
      return;
    }
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      const chunk = Buffer.alloc(1024 * 1024, 0x41);
      let sent = 0;
      const write = () => {
        while (sent < 24) {
          sent += 1;
          if (!res.write(chunk)) return res.once('drain', write);
        }
        res.end();
      };
      return write();
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>small</html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

/**
 * Summarize the outcome instead of letting jest pretty-print a 24MB body into
 * an assertion message when the cap is missing (that takes minutes).
 */
function outcome(promise: Promise<{ data: unknown }>) {
  return promise.then(
    (r) => ({ ok: true as const, bytes: String(r.data).length }),
    (e: Error) => ({ ok: false as const, message: e.message })
  );
}

describe('createSession response size cap', () => {
  it('rejects a gzip bomb once the inflated body passes the cap', async () => {
    const session = createSession();
    await expect(outcome(session.get(`http://127.0.0.1:${port}/bomb`))).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/maxContentLength/),
    });
  });

  it('rejects a 24MB plain body', async () => {
    const session = createSession();
    await expect(outcome(session.get(`http://127.0.0.1:${port}/big`))).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/maxContentLength/),
    });
  });

  it('does not retry a body that exceeded the cap', async () => {
    // A retried bomb is downloaded again: the failure is not transient.
    const session = createSession({ hasRetry: true, maxRetries: 3, retryDelay: 0 });
    const before = hits['/bomb'] ?? 0;
    await outcome(session.get(`http://127.0.0.1:${port}/bomb`));
    expect(hits['/bomb'] - before).toBe(1);
  });

  it('does not retry an off-site redirect', async () => {
    const session = createSession({
      hasRetry: true,
      maxRetries: 3,
      retryDelay: 0,
      siteDomain: '127.0.0.1',
    });
    await outcome(session.get(`http://127.0.0.1:${port}/offsite`));
    expect(hits['/offsite']).toBe(1);
  });

  it('bounds a trickling response with a total deadline, not just inactivity', async () => {
    // axios `timeout` is an inactivity timeout; a byte every 100ms keeps the
    // socket busy indefinitely. The deadline is a multiple of `timeout`.
    const session = createSession({ timeout: 300 });
    const start = Date.now();
    const result = await Promise.race([
      outcome(session.get(`http://127.0.0.1:${port}/trickle`)),
      new Promise<{ ok: 'hung' }>((resolve) => setTimeout(() => resolve({ ok: 'hung' }), 3000)),
    ]);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/deadline/) });
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('does not retry a request that hit its deadline', async () => {
    const session = createSession({ timeout: 200, hasRetry: true, maxRetries: 3, retryDelay: 0 });
    const before = hits['/trickle'] ?? 0;
    await Promise.race([
      outcome(session.get(`http://127.0.0.1:${port}/trickle`)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    expect(hits['/trickle'] - before).toBe(1);
  });

  it('reports the deadline, not a bare cancel, when a retried attempt trickles', async () => {
    // The first attempt's deadline keeps ticking during the retry; the retry
    // must not treat that stale deadline as a caller abort.
    const session = createSession({ timeout: 200, hasRetry: true, maxRetries: 2, retryDelay: 0 });
    const before = hits['/reset-then-trickle'] ?? 0;
    const result = await Promise.race([
      outcome(session.get(`http://127.0.0.1:${port}/reset-then-trickle`)),
      new Promise<{ ok: 'hung' }>((resolve) => setTimeout(() => resolve({ ok: 'hung' }), 3000)),
    ]);
    expect(hits['/reset-then-trickle'] - before).toBe(2);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/deadline/) });
  });

  it('still serves ordinary bodies', async () => {
    const session = createSession();
    const response = await session.get(`http://127.0.0.1:${port}/small`);
    expect(response.data).toBe('<html>small</html>');
  });
});
