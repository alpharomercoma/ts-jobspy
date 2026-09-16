/**
 * caCert must apply to the TLS connection to the target host when the request
 * is tunneled through an http proxy (README: caCert covers direct HTTPS and
 * http(s) proxies). https-proxy-agent only applies its constructor options to
 * the proxy hop, so without extra care the tunneled TLS uses the system store
 * and a custom CA is silently ignored.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createSession } from '../src/util';

const TLS_DIR = path.join(__dirname, 'fixtures', 'tls');
const CA = path.join(TLS_DIR, 'ca.pem');

/** An origin that only our test CA can vouch for. */
function startOrigin(): Promise<{ port: number; close: () => void }> {
  const server = https.createServer(
    {
      key: fs.readFileSync(path.join(TLS_DIR, 'server.key')),
      cert: fs.readFileSync(path.join(TLS_DIR, 'server.pem')),
    },
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('tunneled ok');
    }
  );
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() })
    )
  );
}

/** A plain forward proxy: CONNECT opens a TCP pipe to the requested host. */
function startProxy(): Promise<{ url: string; connects: number[]; close: () => void }> {
  const connects: number[] = [];
  const proxy = http.createServer((_req, res) => {
    res.writeHead(405);
    res.end();
  });
  proxy.on('connect', (req, clientSocket, head) => {
    const [host, port] = String(req.url).split(':');
    connects.push(Number(port));
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  return new Promise((resolve) =>
    proxy.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
        connects,
        close: () => proxy.close(),
      })
    )
  );
}

/** A minimal SOCKS5 server (no auth, CONNECT only) that pipes to the target. */
function startSocks(): Promise<{ url: string; connects: number[]; close: () => void }> {
  const connects: number[] = [];
  const server = net.createServer((client) => {
    // Accumulate bytes so a fragmented greeting or request still parses.
    let buffer = Buffer.alloc(0);
    let stage: 'greeting' | 'request' | 'piping' = 'greeting';
    client.on('data', (chunk) => {
      if (stage === 'piping') return;
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 'greeting') {
        if (buffer.length < 2) return;
        if (buffer[0] !== 5) return client.destroy();
        const methods = buffer[1];
        if (buffer.length < 2 + methods) return;
        buffer = buffer.subarray(2 + methods);
        stage = 'request';
        client.write(Buffer.from([5, 0]));
      }
      if (stage === 'request') {
        // VER CMD RSV ATYP(1=IPv4,3=domain) ... PORT
        if (buffer.length < 5) return;
        if (buffer[0] !== 5 || buffer[1] !== 1) return client.destroy();
        let host: string;
        let offset: number;
        if (buffer[3] === 1) {
          if (buffer.length < 10) return;
          host = Array.from(buffer.subarray(4, 8)).join('.');
          offset = 8;
        } else if (buffer[3] === 3) {
          const len = buffer[4];
          if (buffer.length < 5 + len + 2) return;
          host = buffer.subarray(5, 5 + len).toString();
          offset = 5 + len;
        } else return client.destroy();
        const port = buffer.readUInt16BE(offset);
        const rest = buffer.subarray(offset + 2);
        stage = 'piping';
        connects.push(port);
        const upstream = net.connect(port, host, () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          if (rest.length) upstream.write(rest);
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `socks5://127.0.0.1:${(server.address() as AddressInfo).port}`,
        connects,
        close: () => server.close(),
      })
    )
  );
}

/** A forward proxy that itself speaks TLS (an https:// proxy URL). */
function startTlsProxy(): Promise<{ url: string; close: () => void }> {
  const proxy = https.createServer(
    {
      key: fs.readFileSync(path.join(TLS_DIR, 'server.key')),
      cert: fs.readFileSync(path.join(TLS_DIR, 'server.pem')),
    },
    (_req, res) => {
      res.writeHead(405);
      res.end();
    }
  );
  proxy.on('connect', (req, clientSocket, head) => {
    const [host, port] = String(req.url).split(':');
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  return new Promise((resolve) =>
    proxy.listen(0, '127.0.0.1', () =>
      resolve({
        url: `https://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
        close: () => proxy.close(),
      })
    )
  );
}

describe('caCert for the TLS hop to an https:// proxy', () => {
  let plainOrigin: http.Server;
  let plainPort: number;
  let tlsProxy: Awaited<ReturnType<typeof startTlsProxy>>;

  beforeAll(async () => {
    plainOrigin = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('plain ok');
    });
    await new Promise<void>((resolve) => plainOrigin.listen(0, '127.0.0.1', () => resolve()));
    plainPort = (plainOrigin.address() as AddressInfo).port;
    tlsProxy = await startTlsProxy();
  });

  afterAll(() => {
    plainOrigin.close();
    tlsProxy.close();
  });

  it('trusts the custom CA for the proxy connection when the target is plain http', async () => {
    const session = createSession({ proxies: [tlsProxy.url], caCert: CA });
    const response = await session.get(`http://127.0.0.1:${plainPort}/`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('plain ok');
  });

  it('rejects the proxy certificate without caCert', async () => {
    const session = createSession({ proxies: [tlsProxy.url] });
    await expect(session.get(`http://127.0.0.1:${plainPort}/`)).rejects.toThrow(
      /certificate|self.signed/i
    );
  });
});

describe('caCert through a SOCKS5 proxy', () => {
  let origin: Awaited<ReturnType<typeof startOrigin>>;
  let socks: Awaited<ReturnType<typeof startSocks>>;

  beforeAll(async () => {
    origin = await startOrigin();
    socks = await startSocks();
  });

  afterAll(() => {
    origin.close();
    socks.close();
  });

  it('trusts the custom CA for the TLS connection made through the SOCKS tunnel', async () => {
    const session = createSession({ proxies: [socks.url], caCert: CA });
    const response = await session.get(`https://127.0.0.1:${origin.port}/`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('tunneled ok');
    expect(socks.connects).toContain(origin.port);
  });

  it('still rejects an untrusted origin through SOCKS when no caCert is given', async () => {
    const session = createSession({ proxies: [socks.url] });
    await expect(session.get(`https://127.0.0.1:${origin.port}/`)).rejects.toThrow(
      /certificate|self.signed/i
    );
  });
});

describe('caCert through an http proxy', () => {
  let origin: Awaited<ReturnType<typeof startOrigin>>;
  let proxy: Awaited<ReturnType<typeof startProxy>>;

  beforeAll(async () => {
    origin = await startOrigin();
    proxy = await startProxy();
  });

  afterAll(() => {
    origin.close();
    proxy.close();
  });

  it('trusts the custom CA for the tunneled TLS connection', async () => {
    const session = createSession({ proxies: [proxy.url], caCert: CA });
    const response = await session.get(`https://127.0.0.1:${origin.port}/`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('tunneled ok');
    // The request really went through the proxy, not directly.
    expect(proxy.connects).toContain(origin.port);
  });

  it('accepts an uppercase proxy scheme', async () => {
    // Validation accepts HTTP://; the session must not mangle it into
    // http://HTTP://... when it builds the agent.
    const session = createSession({
      proxies: [proxy.url.replace('http://', 'HTTP://')],
      caCert: CA,
    });
    const response = await session.get(`https://127.0.0.1:${origin.port}/`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('tunneled ok');
  });

  it('still rejects an untrusted origin when no caCert is given', async () => {
    const session = createSession({ proxies: [proxy.url] });
    await expect(session.get(`https://127.0.0.1:${origin.port}/`)).rejects.toThrow(
      /certificate|self.signed/i
    );
  });
});
