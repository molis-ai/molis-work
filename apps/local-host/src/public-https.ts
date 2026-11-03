/**
 * One https request to a public address: the Host's side of every door a plugin has to the network (generated plugins'
 * `hostNetwork`, `services.connections`). The caller has settled the address and the headers; this decides only how it leaves:
 *
 * - every address the connection actually uses is public (resolved inside the connection, so DNS cannot be switched
 *   to a private address between a check and the connect), and the call is rechecked after DNS, right before the connect;
 * - every request opens its own connection, never one from a pool: a reused connection does not resolve the name again,
 *   so the recheck after DNS would not run and a call that lost its authority meanwhile would still be sent;
 * - always port 443 (a test's stand-in server aside): each caller refuses an address with another port before it gets here;
 * - redirects are not followed: the answer comes back as it is;
 * - bounded time (15 s) and response size (1 MiB).
 *
 * It holds no error codes of its own: each caller turns a failure into its own refusal (`failure`).
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { isPublicAddress } from '@molis-ai/molis-work-plugin-sandbox';

const TIMEOUT_MS = 15_000, MAX_BODY = 1024 * 1024;

/**
 * Loopback, private, link-local, shared, multicast and reserved ranges, in both families: the sandbox proxy's own policy
 * (IPv6 only inside 2000::/3, so every mapped, embedded and transition spelling of a private address is refused), with one
 * exception.
 */
export function publicAddress(address: string): boolean {
  // 198.18.0.0/15 stays reachable (the user's decision, 2026-09-27): a proxy in fake-IP mode (Clash, Surge, Stash)
  // answers every name from it and connects by that name; without such a proxy nothing is routed there. Plugins
  // reach sites only by an approved name, never by an address they write themselves.
  return isPublicAddress(address) || (isIP(address) === 4 && /^198\.1[89]\./.test(address));
}

export type PublicLookup = (hostname: string, callback: (error: Error | null, addresses: LookupAddress[]) => void) => void;
/** Why a request did not come back: a private address, the 15 s limit, an answer over 1 MiB, reading it, or anything else on the way. */
export type PublicHttpsFailure = 'private_address' | 'timeout' | 'too_large' | 'read' | 'connect';
/** Only for tests: a local TLS server standing in for the site, by its port and the certificate to trust. */
export interface PublicHttpsTestServer { readonly port: number; readonly ca: string | Buffer; }

export interface PublicHttpsRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
  /** Rechecked after the address is known, right before the connection opens. */
  beforeEffect?(): Promise<void>;
  current(): void;
  /** How names resolve; the default is the system resolver. Tests pass their own. */
  readonly lookup?: PublicLookup;
  /** Only for tests: which addresses a connection may use (a local server), and that server. The request still opens its own connection. */
  allowAddress?(address: string): boolean;
  readonly testServer?: PublicHttpsTestServer;
  failure(reason: PublicHttpsFailure, detail: string): Error;
}

export interface PublicHttpsResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

export async function sendPublicHttps(request: PublicHttpsRequest): Promise<PublicHttpsResponse> {
  const { url, method, body, signal, failure } = request;
  signal.throwIfAborted();
  const allowed = request.allowAddress ?? publicAddress;
  const resolve: PublicLookup = request.lookup ?? ((hostname, callback) => dnsLookup(hostname, { all: true, verbatim: true }, callback));
  const headers = { ...request.headers, ...(body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) }) };
  const timeout = AbortSignal.timeout(TIMEOUT_MS), stop = AbortSignal.any([signal, timeout]);
  let abort!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(timeout.aborted ? failure('timeout', '网站在 15 秒内没有响应') : signal.reason);
    stop.addEventListener('abort', abort, { once: true });
  });
  try {
    const addresses = await Promise.race([new Promise<LookupAddress[]>((done, fail) => resolve(url.hostname, (error, rows) => {
      if (error) fail(failure('connect', '网站地址解析失败')); else done(rows);
    })), stopped]);
    if (!addresses.length || addresses.some(item => !allowed(item.address))) throw failure('private_address', '不能访问本机或内网地址');
    await Promise.race([Promise.resolve(request.beforeEffect?.()), stopped]);
    stop.throwIfAborted(); request.current();
    // No wait between the final current check and constructing the actual request. DNS is pinned to the addresses checked above.
    return await Promise.race([new Promise<PublicHttpsResponse>((done, fail) => {
      const lookup = (_hostname: string, lookupOptions: { all?: boolean } | undefined, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void) => {
        try {
          stop.throwIfAborted(); request.current();
          if (lookupOptions?.all) callback(null, addresses); else callback(null, addresses[0]!.address, addresses[0]!.family);
        } catch { callback(Object.assign(new Error('原调用已取消或授权已失效'), { code: 'INVOCATION_REVOKED' }), []); }
      };
    const outgoing = httpsRequest({ protocol: 'https:', hostname: url.hostname, port: request.testServer?.port ?? 443, path: url.pathname + url.search, method, headers,
      lookup: lookup as never, signal: stop, agent: false, ...(request.testServer ? { ca: request.testServer.ca } : {}) }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) { response.destroy(); fail(failure('too_large', '网站返回的内容太大（超过 1MB）')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => done({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', error => fail(failure('read', '读取网站返回的内容失败：' + error.message)));
    });
    // Nothing is written before the socket is handed over; a reused one would have skipped the recheck, so it is never written to.
    outgoing.once('socket', () => { if (outgoing.reusedSocket) outgoing.destroy(new Error('连接被复用，发出前没有复核原调用')); });
    outgoing.on('error', error => {
      if ((error as { code?: string }).code === 'PRIVATE_ADDRESS') fail(failure('private_address', '不能访问本机或内网地址'));
      else if (timeout.aborted) fail(failure('timeout', '网站在 15 秒内没有响应'));
      else fail(failure('connect', '访问网站失败：' + error.message));
    });
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
    }), stopped]);
  } finally { stop.removeEventListener('abort', abort); }
}
