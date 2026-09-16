/**
 * ts-jobspy - TypeScript Job Scraper
 * Utility functions for HTTP sessions, proxy rotation, logging, and converters
 *
 * This is a TypeScript port of python-jobspy
 * Original: https://github.com/speedyapply/JobSpy
 */

import { readFileSync } from 'node:fs';
import type { ClientRequest } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { Socket } from 'node:net';
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import { CompensationInterval, JobType, JOB_TYPE_VARIATIONS, Site } from './model';

/**
 * Log levels
 */
enum LogLevel {
  ERROR = 0,
  WARNING = 1,
  INFO = 2,
  DEBUG = 3,
}

let globalLogLevel: LogLevel = LogLevel.INFO;

/**
 * Logger class for consistent logging
 */
export class Logger {
  private name: string;

  constructor(name: string) {
    this.name = `JobSpy:${name}`;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} - ${level} - ${this.name} - ${message}`;
  }

  error(message: string): void {
    if (globalLogLevel >= LogLevel.ERROR) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('ERROR', message));
    }
  }

  warning(message: string): void {
    if (globalLogLevel >= LogLevel.WARNING) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('WARNING', message));
    }
  }

  info(message: string): void {
    if (globalLogLevel >= LogLevel.INFO) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('INFO', message));
    }
  }

  debug(message: string): void {
    if (globalLogLevel >= LogLevel.DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('DEBUG', message));
    }
  }
}

/**
 * Create a logger instance
 */
export function createLogger(name: string): Logger {
  return new Logger(name);
}

/**
 * Set global logger level
 */
export function setLoggerLevel(verbose: number | undefined): void {
  if (verbose === undefined || verbose === null) return;
  const levelMap: Record<number, LogLevel> = {
    0: LogLevel.ERROR,
    1: LogLevel.WARNING,
    2: LogLevel.INFO,
    3: LogLevel.DEBUG,
  };
  globalLogLevel = levelMap[verbose] ?? LogLevel.INFO;
}

/**
 * Proxy configuration interface
 */
interface ProxyConfig {
  http: string;
  https: string;
}

type AgentConnectOpts = Parameters<HttpsProxyAgent<string>['connect']>[1];

/**
 * https-proxy-agent and socks-proxy-agent apply their constructor options to
 * the proxy hop only; the TLS connection tunneled through to the target host
 * reads its options from the request, which axios does not let us set. These
 * subclasses inject the custom CA there so `caCert` covers proxied HTTPS.
 */
class CaHttpsProxyAgent extends HttpsProxyAgent<string> {
  constructor(
    proxy: string,
    private readonly ca: Buffer
  ) {
    // The CA also vouches for an https:// proxy itself.
    super(proxy, { ca });
  }

  override connect(req: ClientRequest, opts: AgentConnectOpts): Promise<Socket> {
    return super.connect(req, opts.secureEndpoint ? { ...opts, ca: this.ca } : opts);
  }
}

class CaSocksProxyAgent extends SocksProxyAgent {
  constructor(
    proxy: string,
    private readonly ca: Buffer
  ) {
    super(proxy);
  }

  override connect(req: ClientRequest, opts: AgentConnectOpts): Promise<Socket> {
    return super.connect(req, opts.secureEndpoint ? { ...opts, ca: this.ca } : opts);
  }
}

/**
 * Format a proxy string into a config object
 */
function formatProxy(proxy: string): ProxyConfig {
  if (/^(https?|socks[45]):\/\//i.test(proxy)) {
    return { http: proxy, https: proxy };
  }
  return { http: `http://${proxy}`, https: `http://${proxy}` };
}

/**
 * Rotating proxy session for load balancing requests across proxies
 */
class RotatingProxySession {
  private proxies: ProxyConfig[];
  private proxyIndex: number = 0;

  constructor(proxies?: string | string[] | null) {
    this.proxies = [];
    if (proxies) {
      if (typeof proxies === 'string') {
        this.proxies = [formatProxy(proxies)];
      } else if (Array.isArray(proxies)) {
        this.proxies = proxies.map(formatProxy);
      }
    }
  }

  getNextProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.proxyIndex];
    this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  hasProxies(): boolean {
    return this.proxies.length > 0;
  }
}

/**
 * Session options for creating HTTP clients
 */
export interface SessionOptions {
  proxies?: string | string[] | null;
  caCert?: string | null;
  hasRetry?: boolean;
  retryDelay?: number;
  maxRetries?: number;
  clearCookies?: boolean;
  timeout?: number;
  userAgent?: string;
  /**
   * The board's registrable domain (e.g. 'indeed.com'), or a pattern for
   * boards that answer from several domains (Google's locale domains). When
   * set, a redirect whose destination host is not on the site fails the
   * request with an error naming the destination instead of being followed.
   */
  siteDomain?: string | RegExp;
}

/**
 * Failures that look like transport errors to axios-retry but cannot succeed on
 * a retry: a body over the cap would be downloaded again, a refused redirect
 * would be refused again, and an aborted request must stay aborted.
 */
const NON_TRANSIENT_ERROR_CODES = new Set([
  'ERR_DEADLINE',
  'ERR_BAD_RESPONSE',
  'ERR_FR_TOO_MANY_REDIRECTS',
  'ERR_FR_REDIRECTION_FAILURE',
  'ERR_CANCELED',
  'ECONNABORTED',
]);

/**
 * axios's `timeout` only bounds socket inactivity: an origin that trickles a
 * byte every few seconds keeps a request open indefinitely. Every request also
 * gets a total deadline of this many times its inactivity timeout.
 */
const DEADLINE_FACTOR = 2;

type DeadlineConfig = InternalAxiosRequestConfig & {
  deadline?: { signal: AbortSignal; ms: number; caller?: AbortSignal };
};

/** Largest decompressed response body a board is allowed to send us. */
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** Host equality or subdomain match (or pattern match), ignoring case and port. */
function isOnSite(host: string, siteDomain: string | RegExp): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (siteDomain instanceof RegExp) return siteDomain.test(h);
  const d = siteDomain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Create an axios session with optional proxy rotation and retry
 */
export function createSession(options: SessionOptions = {}): AxiosInstance {
  const {
    proxies,
    caCert,
    hasRetry = false,
    retryDelay = 1,
    maxRetries = 3,
    timeout = 30000,
    userAgent,
    siteDomain,
  } = options;

  const proxySession = new RotatingProxySession(proxies);

  // Custom CA: read once and attach to every request's agent.
  const ca = caCert ? readFileSync(caCert) : undefined;

  const instance = axios.create({
    timeout,
    // Cap the decompressed body: a 200KB gzip response that inflates to
    // hundreds of MB otherwise kills the consumer process with an out-of-memory
    // error. Nothing a board legitimately serves approaches this size.
    maxContentLength: MAX_RESPONSE_BYTES,
    // Resolve every HTTP status so scrapers can classify 429/4xx/5xx themselves
    // (see each scraper's status handling). Network errors still reject and are
    // subject to the retry policy below; HTTP status codes are not auto-retried,
    // which avoids turning a single 429 into a burst of blocked requests.
    validateStatus: () => true,
    ...(siteDomain !== undefined && {
      beforeRedirect: (redirect: { hostname?: string; host?: string }) => {
        const host = redirect.hostname ?? redirect.host ?? '';
        if (!isOnSite(host, siteDomain)) {
          const site = typeof siteDomain === 'string' ? siteDomain : 'expected';
          throw new Error(
            `redirected off-site to ${host}: the ${site} endpoint has moved or the request was blocked`
          );
        }
      },
    }),
    headers: {
      'User-Agent':
        userAgent ??
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  // Add request interceptor for proxy rotation
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    let agentAttached = false;
    if (proxySession.hasProxies()) {
      const proxy = proxySession.getNextProxy();
      if (proxy && proxy.http !== 'http://localhost') {
        const proxyUrl = proxy.https;
        if (/^socks/i.test(proxyUrl)) {
          config.httpsAgent = ca
            ? new CaSocksProxyAgent(proxyUrl, ca)
            : new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
        } else {
          // The CA-aware agent also vouches for an https:// proxy's own
          // certificate, which matters for plain-http targets too.
          config.httpsAgent = ca
            ? new CaHttpsProxyAgent(proxyUrl, ca)
            : new HttpsProxyAgent(proxyUrl);
          config.httpAgent = ca
            ? new CaHttpsProxyAgent(proxyUrl, ca)
            : new HttpsProxyAgent(proxyUrl);
        }
        agentAttached = true;
      }
    }

    // No proxy but a custom CA: attach a plain https agent carrying it.
    if (ca && !agentAttached) {
      config.httpsAgent = new HttpsAgent({ ca });
    }

    return config;
  });

  // Total per-request deadline (see DEADLINE_FACTOR), composed with the
  // caller's AbortSignal so a timeoutMs abort still wins immediately.
  instance.interceptors.request.use((config: DeadlineConfig) => {
    const ms = (config.timeout || timeout) * DEADLINE_FACTOR;
    const deadline = AbortSignal.timeout(ms);
    // On a retry the config still carries the previous attempt's composed
    // signal; compose from the original caller signal so layers do not nest.
    const caller = config.deadline
      ? config.deadline.caller
      : (config.signal as AbortSignal | undefined);
    config.deadline = { signal: deadline, ms, caller };
    config.signal = caller ? AbortSignal.any([caller, deadline]) : deadline;
    return config;
  });
  instance.interceptors.response.use(undefined, (error: unknown) => {
    const config = (error as { config?: DeadlineConfig } | null)?.config;
    const deadline = config?.deadline;
    if (axios.isCancel(error) && deadline?.signal.aborted && !deadline.caller?.aborted) {
      const failure: NodeJS.ErrnoException = new Error(
        `request exceeded its ${deadline.ms}ms deadline: the server kept the response open without finishing`
      );
      failure.code = 'ERR_DEADLINE';
      return Promise.reject(failure);
    }
    return Promise.reject(error);
  });

  // Configure retry if enabled
  if (hasRetry) {
    axiosRetry(instance, {
      retries: maxRetries,
      retryDelay: (retryCount) => retryCount * retryDelay * 1000,
      // Only retry transport-level failures. HTTP status codes (429/5xx) resolve
      // rather than throw (validateStatus above), so retrying them here would
      // both never fire and, if it did, amplify a block into repeated requests -
      // scrapers classify those statuses and back off by returning instead.
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) &&
        !NON_TRANSIENT_ERROR_CODES.has(error.code ?? ''),
    });
  }

  return instance;
}

/**
 * Turndown service for markdown conversion
 */
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});
// Script and style bodies are not description text; never let them through.
turndownService.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed']);

/**
 * Convert HTML to Markdown
 */
/**
 * Untrusted HTML that no tree parser should see: nesting deeper than this is
 * not content (turndown overflows the stack near 2000 levels, cheerio's
 * serializer near 5000, and parse5's cost grows quadratically with depth), and
 * a "description" longer than this is not a description.
 */
const MAX_HTML_DEPTH = 256;
const MAX_HTML_CHARS = 2_000_000;
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const RAW_TEXT_END: Record<string, RegExp> = { script: /<\/script/gi, style: /<\/style/gi };
/** Roots of foreign content, the only place self-closing syntax closes an element. */
const FOREIGN_ROOTS = new Set(['svg', 'math']);
/** Opening one of these closes an open <p> (HTML's implied end tags). */
const P_CLOSERS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);
/** Scope boundaries an implied close never crosses (HTML "has an element in scope"). */
const GENERAL_SCOPE = new Set([
  'html',
  'table',
  'td',
  'th',
  'caption',
  'button',
  'template',
  'svg',
  'math',
  'applet',
  'marquee',
  'object',
]);
const LIST_SCOPE = new Set([...GENERAL_SCOPE, 'ul', 'ol']);
const TABLE_SCOPE = new Set(['html', 'table', 'template']);
const SELECT_SCOPE = new Set(['select', 'html', 'template']);
/** Opening `name` first closes the nearest of `targets` within `scope`. */
const IMPLIED_CLOSE: Record<string, { targets: ReadonlySet<string>; scope: ReadonlySet<string> }> =
  {
    li: { targets: new Set(['li']), scope: LIST_SCOPE },
    dd: { targets: new Set(['dd', 'dt']), scope: LIST_SCOPE },
    dt: { targets: new Set(['dd', 'dt']), scope: LIST_SCOPE },
    td: { targets: new Set(['td', 'th']), scope: TABLE_SCOPE },
    th: { targets: new Set(['td', 'th']), scope: TABLE_SCOPE },
    tr: { targets: new Set(['tr']), scope: TABLE_SCOPE },
    thead: { targets: new Set(['thead', 'tbody', 'tfoot']), scope: TABLE_SCOPE },
    tbody: { targets: new Set(['thead', 'tbody', 'tfoot']), scope: TABLE_SCOPE },
    tfoot: { targets: new Set(['thead', 'tbody', 'tfoot']), scope: TABLE_SCOPE },
    option: { targets: new Set(['option']), scope: SELECT_SCOPE },
    optgroup: { targets: new Set(['optgroup']), scope: SELECT_SCOPE },
    a: { targets: new Set(['a']), scope: GENERAL_SCOPE },
  };
const P_TARGET = new Set(['p']);
const TAG_NAME = /[a-zA-Z][^\s/>]*/y;

/**
 * Walk the markup once, calling `onTag` for each tag (return false to stop)
 * and `onText` for the text between tags. Linear in the input: every
 * character is visited once, quoted attribute values are skipped as a unit,
 * comments run to their real terminator, raw-text elements (script, style)
 * are skipped to their end tag with a case-insensitive search, and a '>' for a
 * bogus comment is searched for at most once per position.
 */
function scanHtml(
  html: string,
  onTag: (name: string, closing: boolean, selfClosing: boolean) => boolean | undefined,
  onText?: (text: string) => void
): void {
  const n = html.length;
  let i = 0;
  let textStart = 0;
  let nextGt = -1;
  const flushText = (end: number) => {
    if (onText && end > textStart) onText(html.slice(textStart, end));
  };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    const next = html.charCodeAt(lt + 1);
    if (next === 33 /* ! */ || next === 63 /* ? */) {
      // Comment, doctype, or bogus comment (parse5 ends the latter at '>').
      flushText(lt);
      if (html.startsWith('<!--', lt)) {
        const close = html.indexOf('-->', lt + 4);
        if (close === -1) return;
        i = close + 3;
      } else {
        if (nextGt < lt) nextGt = html.indexOf('>', lt);
        if (nextGt === -1) return;
        i = nextGt + 1;
      }
      textStart = i;
      continue;
    }
    const closing = next === 47; /* / */
    TAG_NAME.lastIndex = closing ? lt + 2 : lt + 1;
    const nameMatch = TAG_NAME.exec(html);
    if (!nameMatch) {
      // A lone '<' is text.
      i = lt + 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    // Find the end of the tag; a quoted attribute value may contain '>' or '<'.
    let j = TAG_NAME.lastIndex;
    let ended = false;
    while (j < n) {
      const ch = html.charCodeAt(j);
      if (ch === 62 /* > */) {
        ended = true;
        break;
      }
      if (ch === 61 /* = */) {
        j += 1;
        while (
          j < n &&
          (html.charCodeAt(j) === 32 ||
            html.charCodeAt(j) === 10 ||
            html.charCodeAt(j) === 9 ||
            html.charCodeAt(j) === 13)
        )
          j += 1;
        const quote = html.charCodeAt(j);
        if (quote === 34 || quote === 39) {
          const closeQuote = html.indexOf(quote === 34 ? '"' : "'", j + 1);
          if (closeQuote === -1) return; // unterminated attribute: parse5 drops the rest
          j = closeQuote + 1;
        }
        continue;
      }
      j += 1;
    }
    if (!ended) return; // unterminated tag: nothing after it is content
    const selfClosing = html.charCodeAt(j - 1) === 47;
    flushText(lt);
    i = j + 1;
    textStart = i;
    if (onTag(name, closing, selfClosing) === false) return;
    if (!closing && name in RAW_TEXT_END) {
      const endTag = RAW_TEXT_END[name];
      endTag.lastIndex = i;
      const found = endTag.exec(html);
      if (!found) return; // unterminated script/style swallows the rest
      i = found.index;
      textStart = i;
    }
  }
  flushText(n);
}

/** Truncate the stack to the nearest of `targets` within `scope`; false if none. */
function closeUpTo(
  stack: string[],
  targets: ReadonlySet<string>,
  scope: ReadonlySet<string>
): boolean {
  for (let k = stack.length - 1; k >= 0; k -= 1) {
    const element = stack[k];
    if (targets.has(element)) {
      stack.length = k;
      return true;
    }
    if (scope.has(element)) return false;
  }
  return false;
}

/**
 * Maximum element nesting depth as the HTML parser will build it, stopping
 * early once `limit` is exceeded. Follows the rules that matter for depth:
 * self-closing syntax only closes foreign (svg/math) elements, a stray end tag
 * is ignored, and the common optional end tags (p, li, dt, dd, table parts,
 * option, a) are implied when a sibling opens.
 */
function htmlDepth(html: string, limit: number): number {
  const stack: string[] = [];
  let foreign = 0;
  let max = 0;
  const truncate = (length: number) => {
    for (let k = length; k < stack.length; k += 1) if (FOREIGN_ROOTS.has(stack[k])) foreign -= 1;
    stack.length = length;
  };
  scanHtml(html, (name, closing, selfClosing) => {
    if (closing) {
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if (stack[k] === name) {
          truncate(k);
          break;
        }
        if (foreign === 0 && GENERAL_SCOPE.has(stack[k])) break;
      }
      return undefined;
    }
    if (foreign > 0) {
      if (selfClosing) return undefined;
    } else {
      if (VOID_ELEMENTS.has(name)) return undefined;
      const implied = IMPLIED_CLOSE[name];
      if (implied) closeUpTo(stack, implied.targets, implied.scope);
      if (P_CLOSERS.has(name)) closeUpTo(stack, P_TARGET, GENERAL_SCOPE);
    }
    stack.push(name);
    if (FOREIGN_ROOTS.has(name)) foreign += 1;
    if (stack.length > max) max = stack.length;
    return max > limit ? false : undefined;
  });
  return max;
}

const BASIC_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/**
 * Linear tag strip for markup we refuse to hand to a tree parser. 'text'
 * returns plain text; 'html' returns that text HTML-escaped, so a caller that
 * treats the result as markup gets inert content, never a decoded tag.
 */
function stripTags(html: string, mode: 'text' | 'html'): string {
  const parts: string[] = [];
  scanHtml(
    html,
    () => undefined,
    (text) => parts.push(text)
  );
  const text = parts
    .join(' ')
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (entity) => BASIC_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
  return mode === 'html' ? escapeHtml(text) : text;
}

/**
 * The text of markup that is too deep or too long for the tree parsers (as
 * plain text, or HTML-escaped for callers that return markup), or null when
 * the markup is ordinary and should be parsed normally.
 */
function pathologicalHtmlText(html: string, mode: 'text' | 'html'): string | null {
  if (html.length <= MAX_HTML_CHARS && htmlDepth(html, MAX_HTML_DEPTH) <= MAX_HTML_DEPTH) {
    return null;
  }
  return stripTags(html, mode);
}

/**
 * Parse a full page from a board with cheerio, refusing markup that is too deep
 * or too long to hand to a tree parser (parse5 is quadratic in nesting depth,
 * so a 2-million-character page of nested tags would keep the event loop busy
 * for hours). The scrapers' page-level error handling turns the throw into an
 * honest error.
 */
export function loadHtml(html: string): cheerio.CheerioAPI {
  if (html.length > MAX_HTML_CHARS) {
    throw new Error(
      `page is too long to parse safely (${html.length} characters; limit ${MAX_HTML_CHARS}): not a results page`
    );
  }
  if (htmlDepth(html, MAX_HTML_DEPTH) > MAX_HTML_DEPTH) {
    throw new Error(
      `page markup is nested too deep to parse safely (over ${MAX_HTML_DEPTH} levels): a bot wall or a hostile page, not a results page`
    );
  }
  return cheerio.load(html);
}

export function markdownConverter(html: string | null): string | null {
  if (!html) return null;
  return pathologicalHtmlText(html, 'text') ?? turndownService.turndown(html).trim();
}

/**
 * Convert HTML to plain text
 */
export function plainConverter(html: string | null): string | null {
  if (!html) return null;
  const fallback = pathologicalHtmlText(html, 'text');
  if (fallback !== null) return fallback;
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, object, embed').remove();
  const text = $.text();
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract emails from text
 */
export function extractEmailsFromText(text: string | null): string[] | null {
  if (!text) return null;
  // Local part and domain are bounded (RFC 5321: 64 and 255 octets) so a long
  // run of address characters is scanned in linear time instead of backtracking
  // quadratically (100k characters around an '@' took ~55s unbounded).
  // The lookbehind pins the candidate to a token start, so an overlong local
  // part is rejected rather than reported as its last 64 characters.
  const emailRegex =
    /(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}/g;
  const matches = text.match(emailRegex);
  return matches && matches.length > 0 ? matches : null;
}

/**
 * Get JobType enum from string value
 */
export function getEnumFromJobType(jobTypeStr: string): JobType | null {
  const normalized = jobTypeStr.toLowerCase().replace(/[-\s]/g, '');
  for (const [jobType, variations] of Object.entries(JOB_TYPE_VARIATIONS)) {
    if (variations.includes(normalized)) {
      return jobType as JobType;
    }
  }
  return null;
}

/**
 * Map string to Site enum
 */
export function mapStrToSite(siteName: string): Site {
  const siteMap: Record<string, Site> = {
    linkedin: Site.LINKEDIN,
    indeed: Site.INDEED,
    zip_recruiter: Site.ZIP_RECRUITER,
    ziprecruiter: Site.ZIP_RECRUITER,
    glassdoor: Site.GLASSDOOR,
    google: Site.GOOGLE,
    bayt: Site.BAYT,
    naukri: Site.NAUKRI,
    bdjobs: Site.BDJOBS,
  };
  const site = siteMap[siteName.toLowerCase()];
  if (!site) {
    throw new Error(`Unknown site: ${siteName}`);
  }
  return site;
}

/**
 * Parse a currency figure such as "$100,000", "$50.50" or "$120K" into a number.
 *
 * A magnitude suffix directly after the digits ("$120K", "95k/yr") scales the
 * figure. It must be detected before the non-numeric cleanup below, which would
 * otherwise silently drop it and report 120 for a 120000 salary (LinkedIn's
 * compact salary cards use this form).
 */
export function currencyParser(currencyStr: string): number {
  const magnitude = /\d\s*[kK](?!\p{L})/u.test(currencyStr) ? 1000 : 1;

  // Remove any non-numerical characters except for ',' '.' or '-'
  let cleaned = currencyStr.replace(/[^-0-9.,]/g, '');

  // Remove thousands separators (either , or .)
  if (cleaned.length > 3) {
    const lastThree = cleaned.slice(-3);
    const beforeLastThree = cleaned.slice(0, -3);
    cleaned = beforeLastThree.replace(/[.,]/g, '') + lastThree;
  }

  // Handle decimal separator
  let value: number;
  if (cleaned.includes('.') && cleaned.indexOf('.') >= cleaned.length - 3) {
    value = Math.round(parseFloat(cleaned) * 100) / 100;
  } else if (cleaned.includes(',') && cleaned.indexOf(',') >= cleaned.length - 3) {
    value = Math.round(parseFloat(cleaned.replace(',', '.')) * 100) / 100;
  } else {
    value = parseFloat(cleaned);
  }

  return value * magnitude;
}

/**
 * Map a leading currency symbol to an ISO 4217 code so the public `currency`
 * field is always an ISO code (matching Indeed's output), never a raw symbol.
 *
 * A bare '$' is inherently ambiguous (USD, CAD, AUD, SGD, ...); we default it
 * to USD as a best effort since it is by far the most common on the boards we
 * scrape, but genuinely ambiguous or unknown symbols return null rather than
 * inventing a wrong ISO code. Callers should treat null as "unknown currency".
 */
export function currencyFromSymbol(text: string): string | null {
  const trimmed = text.trim();
  // Multi-character prefixes must be checked before the single leading char,
  // so "CA$" is CAD (not C...) and "A$" is AUD (not A...).
  const prefixToIso: Array<[string, string]> = [
    ['CA$', 'CAD'],
    ['C$', 'CAD'],
    ['A$', 'AUD'],
    ['AU$', 'AUD'],
    ['NZ$', 'NZD'],
    ['HK$', 'HKD'],
    ['S$', 'SGD'],
    ['US$', 'USD'],
    ['R$', 'BRL'],
    ['CHF', 'CHF'],
    ['MX$', 'MXN'],
  ];
  for (const [prefix, iso] of prefixToIso) {
    if (trimmed.startsWith(prefix)) return iso;
  }
  // South African Rand: only when 'R' directly precedes an amount (e.g. 'R85,000'),
  // never for words that merely start with R ('Rate:', 'Range:', 'Remote:').
  if (/^R\s?\d/.test(trimmed)) return 'ZAR';
  const symbolToIso: Record<string, string> = {
    $: 'USD',
    '£': 'GBP',
    '€': 'EUR',
    '₹': 'INR',
    '₩': 'KRW',
    '₺': 'TRY',
    '₪': 'ILS',
    '₽': 'RUB',
  };
  return symbolToIso[trimmed[0]] ?? null;
}

/**
 * Remove all attributes from HTML element (for clean output)
 */
export function removeAttributes(html: string): string {
  const fallback = pathologicalHtmlText(html, 'html');
  if (fallback !== null) return fallback;
  const $ = cheerio.load(html);
  $('*').each((_, el) => {
    const element = $(el);
    const attrs = element.attr();
    if (attrs) {
      Object.keys(attrs).forEach((attr) => {
        element.removeAttr(attr);
      });
    }
  });
  return $.html();
}

/**
 * Elements that execute or embed code, or that make no sense inside a job
 * description handed to a consumer. Everything else (formatting, lists, links)
 * survives so descriptionFormat 'html' stays useful.
 */
const UNSAFE_ELEMENTS =
  'script, style, noscript, iframe, frame, object, embed, applet, link, meta, base, form, input, button, textarea, select, template';
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'poster',
  'srcset',
]);

/**
 * Make board HTML safe to render: drop the elements above, every event-handler
 * attribute, and URL attributes with a script or data scheme (data:image is
 * kept). A consumer rendering `description` with innerHTML must never execute
 * markup that came from a job board.
 */
export function sanitizeHtml(html: string): string {
  const fallback = pathologicalHtmlText(html, 'html');
  if (fallback !== null) return fallback;
  const $ = cheerio.load(html, null, false);
  $(UNSAFE_ELEMENTS).remove();
  $('*').each((_, el) => {
    const element = $(el);
    for (const name of Object.keys(element.attr() ?? {})) {
      const lower = name.toLowerCase();
      // Whitespace and control characters are stripped before the scheme check
      // so "java\nscript:" cannot slip through.
      const scheme = (element.attr(name) ?? '').replace(/[\s\p{Cc}]+/gu, '').toLowerCase();
      const scriptScheme =
        /^(javascript|vbscript):/.test(scheme) ||
        (scheme.startsWith('data:') && !scheme.startsWith('data:image/'));
      if (lower.startsWith('on') || (URL_ATTRIBUTES.has(lower) && scriptScheme)) {
        element.removeAttr(name);
      }
    }
  });
  return $.html();
}

/**
 * Extract job type from description
 */
export function extractJobType(description: string | null): JobType[] | null {
  if (!description) return null;

  const keywords: Record<JobType, RegExp> = {
    [JobType.FULL_TIME]: /full\s?time/i,
    [JobType.PART_TIME]: /part\s?time/i,
    [JobType.INTERNSHIP]: /internship/i,
    [JobType.CONTRACT]: /contract/i,
    [JobType.TEMPORARY]: /temporary/i,
    [JobType.PER_DIEM]: /per\s?diem/i,
    [JobType.NIGHTS]: /nights/i,
    [JobType.OTHER]: /other/i,
    [JobType.SUMMER]: /summer/i,
    [JobType.VOLUNTEER]: /volunteer/i,
  };

  const types: JobType[] = [];
  for (const [jobType, pattern] of Object.entries(keywords)) {
    if (pattern.test(description)) {
      types.push(jobType as JobType);
    }
  }

  return types.length > 0 ? types : null;
}

/** Factor that turns one interval's amount into a yearly amount. */
const ANNUAL_FACTOR: Record<CompensationInterval, number> = {
  [CompensationInterval.YEARLY]: 1,
  [CompensationInterval.MONTHLY]: 12,
  [CompensationInterval.WEEKLY]: 52,
  [CompensationInterval.DAILY]: 260,
  [CompensationInterval.HOURLY]: 2080,
};

/**
 * Detect the pay interval from an explicit unit in the text (e.g. "per hour",
 * "/yr", "a week", "P.A."). Returns null when the text states no unit, so the
 * caller can fall back to a magnitude heuristic rather than guessing wrongly.
 */
export function intervalFromText(text: string): CompensationInterval | null {
  const t = text.toLowerCase();
  if (/(per\s*hour|\/\s*h(ou)?r|hourly|an?\s+hour)/.test(t)) return CompensationInterval.HOURLY;
  if (/(per\s*day|\/\s*day|daily|an?\s+day)/.test(t)) return CompensationInterval.DAILY;
  if (/(per\s*week|\/\s*w(ee)?k|weekly|an?\s+week)/.test(t)) return CompensationInterval.WEEKLY;
  if (/(per\s*month|\/\s*mo(nth)?|monthly|an?\s+month)/.test(t))
    return CompensationInterval.MONTHLY;
  // "p.a." requires the dot between p and a so it does not match "pa" inside
  // words like "part-time", "company", or "package".
  if (/(per\s*(year|annum)|\/\s*y(ea)?r|\bp\.a\.?|yearly|annual|an?\s+year)/.test(t))
    return CompensationInterval.YEARLY;
  return null;
}

/**
 * Extract a salary range from free text.
 *
 * The interval comes from an explicit unit in the text when present ("per week",
 * "/yr", "P.A."); only when the text states none do we fall back to a magnitude
 * heuristic. Amounts are parsed with parseFloat so cents are preserved. With
 * enforceAnnualSalary the amounts are annualized and the interval is reported as
 * 'yearly' (never the pre-conversion unit).
 */
export function extractSalary(
  salaryStr: string | null,
  options: {
    lowerLimit?: number;
    upperLimit?: number;
    hourlyThreshold?: number;
    monthlyThreshold?: number;
    enforceAnnualSalary?: boolean;
  } = {}
): {
  interval: CompensationInterval | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
} {
  const {
    lowerLimit = 1000,
    upperLimit = 700000,
    hourlyThreshold = 350,
    monthlyThreshold = 30000,
    enforceAnnualSalary = false,
  } = options;

  const nullResult = { interval: null, minAmount: null, maxAmount: null, currency: null };

  if (!salaryStr) return nullResult;

  const minMaxPattern =
    /\$(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)\s*[-\u2013\u2014]\s*(?:\$)?(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)/;

  const toNum = (s: string): number => parseFloat(s.replace(/,/g, ''));

  const match = salaryStr.match(minMaxPattern);

  if (!match) return nullResult;

  let minSalary = toNum(match[1]);
  let maxSalary = toNum(match[3]);

  // Handle 'k' suffix
  if (match[2].toLowerCase() === 'k' || match[4].toLowerCase() === 'k') {
    minSalary *= 1000;
    maxSalary *= 1000;
  }

  // Prefer an explicit unit stated in the text; fall back to magnitude only when
  // the text gives no unit at all.
  let interval = intervalFromText(salaryStr);
  if (interval === null) {
    if (minSalary < hourlyThreshold) interval = CompensationInterval.HOURLY;
    else if (minSalary < monthlyThreshold) interval = CompensationInterval.MONTHLY;
    else interval = CompensationInterval.YEARLY;
  }

  const factor = ANNUAL_FACTOR[interval];
  const annualMinSalary = minSalary * factor;
  const annualMaxSalary = maxSalary * factor;

  // Validate the annualized range so hourly/annual figures share one scale.
  if (
    annualMinSalary >= lowerLimit &&
    annualMinSalary <= upperLimit &&
    annualMaxSalary >= lowerLimit &&
    annualMaxSalary <= upperLimit &&
    annualMinSalary < annualMaxSalary
  ) {
    if (enforceAnnualSalary) {
      return {
        interval: CompensationInterval.YEARLY,
        minAmount: annualMinSalary,
        maxAmount: annualMaxSalary,
        currency: 'USD',
      };
    }
    return {
      interval,
      minAmount: minSalary,
      maxAmount: maxSalary,
      currency: 'USD',
    };
  }

  return nullResult;
}

/**
 * Convert compensation to annual salary
 */
export function convertToAnnual(jobData: {
  interval?: string;
  minAmount?: number;
  maxAmount?: number;
}): void {
  if (!jobData.interval || (!jobData.minAmount && !jobData.maxAmount)) return;

  const factor = ANNUAL_FACTOR[jobData.interval as CompensationInterval];
  if (!factor || factor === 1) {
    // Unknown or already-yearly interval: still label it yearly if convertible.
    if (jobData.interval in ANNUAL_FACTOR) jobData.interval = 'yearly';
    return;
  }
  // Convert each bound that is actually present (a one-sided range is valid).
  if (jobData.minAmount) jobData.minAmount *= factor;
  if (jobData.maxAmount) jobData.maxAmount *= factor;
  jobData.interval = 'yearly';
}

/**
 * Sleep utility for delays. When a signal is given, the sleep rejects with an
 * AbortError the moment the signal aborts, so paced scrapers stop promptly on a
 * timeout instead of finishing their delay first.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Random delay between min and max seconds. Abortable via the optional signal.
 */
export function randomDelay(min: number, max: number, signal?: AbortSignal): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  return sleep(delay * 1000, signal);
}

/**
 * Check if job is remote based on text content
 */
export function isJobRemote(
  title: string,
  description: string | null,
  location: string | null
): boolean {
  const remoteKeywords = ['remote', 'work from home', 'wfh'];
  const fullString = `${title} ${description ?? ''} ${location ?? ''}`.toLowerCase();
  return remoteKeywords.some((keyword) => fullString.includes(keyword));
}

/**
 * Get enum value from string
 */
export function getEnumFromValue(valueStr: string): JobType {
  const normalized = valueStr.toLowerCase().replace(/[-\s]/g, '');
  for (const [jobType, variations] of Object.entries(JOB_TYPE_VARIATIONS)) {
    if (variations.includes(normalized)) {
      return jobType as JobType;
    }
  }
  throw new Error(`Invalid job type: ${valueStr}`);
}
