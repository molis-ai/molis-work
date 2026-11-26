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
import { isPublicAddress } from '@molis-ai/molis-work-contracts/platform/public-address';

const TIMEOUT_MS = 15_000, MAX_BODY = 1024 * 1024;
const NO_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Loopback, private, link-local, shared, multicast and reserved ranges, in both families: the sandbox proxy's own policy
 * (IPv6 only inside 2000::/3, so every mapped, embedded and transition spelling of a private address is refused), with one
 * exception.
 */
export function publicAddress(address: string): boolean {
  // 198.18.0.0/15 stays reachable (the user's decision, 2026-09-27): a proxy in fake-IP mode (Clash, Surge, Stash)
  // answers every name from it and connects by that name; without such a proxy nothing is routed there. Plugins
  // reach sites only by an approved name, never by an address they write themselves.
  return isPublicAddress(address, { fakeIpProxy: true });
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
  failure(reason: PublicHttpsFailure, detail: string, outcome?: 'unknown'): Error;
}

export interface PublicHttpsResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

export async function sendPublicHttps(request: PublicHttpsRequest): Promise<PublicHttpsResponse> {
  const { url, method, body, signal, failure } = request;
  let dispatched = false;
  const problem = (reason: PublicHttpsFailure, detail: string) => failure(reason, detail,
    dispatched && (reason === 'read' || reason === 'connect' || reason === 'timeout') ? 'unknown' : undefined);
  signal.throwIfAborted();
  const allowed = request.allowAddress ?? publicAddress;
  const resolve: PublicLookup = request.lookup ?? ((hostname, callback) => dnsLookup(hostname, { all: true, verbatim: true }, callback));
  const headers = { ...request.headers, ...(body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) }) };
  const timeout = AbortSignal.timeout(TIMEOUT_MS), stop = AbortSignal.any([signal, timeout]);
  let abort!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(timeout.aborted ? problem('timeout', '网站在 15 秒内没有响应') : signal.reason);
    stop.addEventListener('abort', abort, { once: true });
  });
  try {
    const addresses = await Promise.race([new Promise<LookupAddress[]>((done, fail) => resolve(url.hostname, (error, rows) => {
      if (error) fail(problem('connect', '网站地址解析失败')); else done(rows);
    })), stopped]);
    if (!addresses.length || addresses.some(item => !allowed(item.address))) throw problem('private_address', '不能访问本机或内网地址');
    await Promise.race([Promise.resolve(request.beforeEffect?.()), stopped]);
    stop.throwIfAborted(); request.current();
    // No wait between the final current check and constructing the actual request. DNS is pinned to the addresses checked above.
    return await Promise.race([new Promise<PublicHttpsResponse>((done, fail) => {
      let revoked: { error: unknown } | undefined;
      const lookup = (_hostname: string, lookupOptions: { all?: boolean } | undefined, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void) => {
        try {
          stop.throwIfAborted(); request.current();
          if (lookupOptions?.all) callback(null, addresses); else callback(null, addresses[0]!.address, addresses[0]!.family);
        } catch (error) {
          revoked = { error };
          callback(Object.assign(new Error('原调用已取消或授权已失效'), { code: 'INVOCATION_REVOKED' }), []);
        }
      };
    const outgoing = httpsRequest({ protocol: 'https:', hostname: url.hostname, port: request.testServer?.port ?? 443, path: url.pathname + url.search, method, headers,
      lookup: lookup as never, signal: stop, agent: false, ...(request.testServer ? { ca: request.testServer.ca } : {}) }, response => {
      // A response proves this transport reached the server, including an early response during an upload.
      dispatched = true;
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) { response.destroy(); fail(problem('too_large', '网站返回的内容太大（超过 1MB）')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => done({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', error => fail(signal.aborted ? signal.reason : problem('read', '读取网站返回的内容失败：' + error.message)));
    });
    // ClientRequest finish means flushed to the underlying system; constructing or queueing the request is not dispatch evidence.
    outgoing.once('finish', () => { dispatched = true; });
    // Nothing is written before the socket is handed over; a reused one would have skipped the recheck, so it is never written to.
    outgoing.once('socket', () => { if (outgoing.reusedSocket) outgoing.destroy(new Error('连接被复用，发出前没有复核原调用')); });
    outgoing.on('error', error => {
      if ((error as { code?: string }).code === 'INVOCATION_REVOKED') fail(revoked ? revoked.error : error);
      else if ((error as { code?: string }).code === 'PRIVATE_ADDRESS') fail(problem('private_address', '不能访问本机或内网地址'));
      else if (timeout.aborted) fail(problem('timeout', '网站在 15 秒内没有响应'));
      else if (signal.aborted) fail(signal.reason);
      else fail(problem('connect', '访问网站失败：' + error.message));
    });
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
    }), stopped]);
  } finally { stop.removeEventListener('abort', abort); }
}

export interface PublicHttpsStreamRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
  readonly signal: AbortSignal;
  readonly timeoutMs?: number;
  beforeEffect?(): Promise<void>;
  current(): void;
  readonly lookup?: PublicLookup;
  allowAddress?(address: string): boolean;
  failure(reason: PublicHttpsFailure, detail: string): Error;
}

/**
 * Streaming DNS-pinned HTTPS request returning a Web `Response` (for remote MCP Streamable HTTP / SSE / OAuth discovery, S-10).
 * Validates every resolved IP via `publicAddress`, re-checks authority before connecting, disables socket reuse, and refuses redirects.
 */
export async function sendPublicHttpsResponse(request: PublicHttpsStreamRequest): Promise<Response> {
  const { url, method, body, signal, failure, timeoutMs = 30_000 } = request;
  signal.throwIfAborted();
  const allowed = request.allowAddress ?? publicAddress;
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  const resolveHost: PublicLookup = request.lookup ?? ((hostname, callback) => dnsLookup(hostname, { all: true, verbatim: true }, callback));
  const connectTimeout = AbortSignal.timeout(timeoutMs);
  const connectStop = AbortSignal.any([signal, connectTimeout]);
  let abortConnect!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    abortConnect = () => reject(connectTimeout.aborted ? failure('timeout', '远程服务响应超时') : signal.reason);
    connectStop.addEventListener('abort', abortConnect, { once: true });
  });
  stopped.catch(() => {});
  try {
    const literalFamily = isIP(host);
    const addresses: LookupAddress[] = literalFamily
      ? [{ address: host, family: literalFamily as 4 | 6 }]
      : await Promise.race([new Promise<LookupAddress[]>((done, fail) => resolveHost(host, (error, rows) => {
          if (error) fail(failure('connect', '网站地址解析失败')); else done(rows);
        })), stopped]);
    if (!addresses.length || addresses.some(item => !allowed(item.address))) {
      throw failure('private_address', '不能访问本机或内网地址');
    }
    await Promise.race([Promise.resolve(request.beforeEffect?.()), stopped]);
    connectStop.throwIfAborted();
    request.current();
    const headers: Record<string, string> = { ...request.headers };
    if (body !== undefined && !Object.keys(headers).some(key => key.toLowerCase() === 'content-length')) {
      headers['content-length'] = String(body.byteLength);
    }
    return await Promise.race([new Promise<Response>((done, fail) => {
      let settled = false;
      let revoked: { error: unknown } | undefined;
      const finishError = (error: unknown) => {
        if (settled) return;
        settled = true;
        connectTimeout.removeEventListener('abort', onConnectTimeout);
        fail(error);
      };
      const lookup = (_hostname: string, lookupOptions: { all?: boolean } | undefined, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void) => {
        try {
          connectStop.throwIfAborted();
          request.current();
          if (lookupOptions?.all) callback(null, addresses);
          else callback(null, addresses[0]!.address, addresses[0]!.family);
        } catch (error) {
          revoked = { error };
          callback(Object.assign(new Error('原调用已取消或授权已失效'), { code: 'INVOCATION_REVOKED' }), []);
        }
      };
      const outgoing = httpsRequest({
        protocol: 'https:',
        hostname: host,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        method,
        headers,
        lookup: lookup as never,
        servername: literalFamily ? undefined : host,
        signal,
        agent: false,
      }, incoming => {
        if (settled) {
          incoming.destroy();
          return;
        }
        settled = true;
        connectTimeout.removeEventListener('abort', onConnectTimeout);
        const status = incoming.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          incoming.destroy();
          fail(failure('private_address', '远程服务返回了未允许的重定向'));
          return;
        }
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (typeof value === 'string') {
            responseHeaders.set(name, value);
          }
        }
        const bodyStream = NO_BODY_STATUSES.has(status) || method.toUpperCase() === 'HEAD'
          ? (incoming.resume(), null)
          : new ReadableStream<Uint8Array>({
            start(controller) {
              incoming.on('data', (chunk: Buffer | Uint8Array) => {
                controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
              });
              incoming.on('end', () => controller.close());
              incoming.on('error', error => controller.error(error));
            },
            cancel() {
              incoming.destroy();
            },
          });
        done(new Response(bodyStream, { status, statusText: incoming.statusMessage ?? '', headers: responseHeaders }));
      });
      const onConnectTimeout = () => {
        outgoing.destroy();
        finishError(failure('timeout', '远程服务响应超时'));
      };
      connectTimeout.addEventListener('abort', onConnectTimeout, { once: true });
      outgoing.once('socket', () => {
        if (outgoing.reusedSocket) outgoing.destroy(new Error('连接被复用，发出前没有复核原调用'));
      });
      outgoing.on('error', error => {
        if ((error as { code?: string }).code === 'INVOCATION_REVOKED') finishError(revoked ? revoked.error : error);
        else if ((error as { code?: string }).code === 'PRIVATE_ADDRESS') finishError(failure('private_address', '不能访问本机或内网地址'));
        else if (connectTimeout.aborted) finishError(failure('timeout', '远程服务响应超时'));
        else if (signal.aborted) finishError(signal.reason);
        else finishError(failure('connect', '访问网站失败：' + error.message));
      });
      if (body !== undefined) outgoing.write(body);
      outgoing.end();
    }), stopped]);
  } finally {
    connectStop.removeEventListener('abort', abortConnect);
  }
}
