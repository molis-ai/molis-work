import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import type { SandboxNetworkRequest, SandboxNetworkResponse } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxServiceContext, SandboxServices } from './broker.js';
import { SandboxError } from './schema.js';

export interface SandboxSecret { value: string; header: string; prefix?: string; domains: string[] }
export interface HttpsProxyOptions {
  resolveSecret?: (context: SandboxServiceContext, reference: string) => Promise<SandboxSecret | undefined>;
  /** Trusted host only. Return every DNS answer; the proxy still validates and pins it. */
  resolveHostname?: (hostname: string, signal: AbortSignal) => Promise<readonly { address: string; family: number }[]>;
  requestBytes?: number; responseBytes?: number; timeoutMs?: number;
}

/** Conservative public-unicast policy. IPv6 only permits global 2000::/3, excluding transition ranges. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number) as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))) return false;
    if ((a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || (a === 192 && b === 88 && c === 99)) return false;
    return true;
  }
  if (family === 6) {
    // Mapped IPv4, ULA, link-local, multicast, loopback and NAT64 are outside this range.
    const first = Number.parseInt(address.split(':')[0]!, 16);
    if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
    const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1).toLowerCase();
    const second = Number.parseInt(normalized.split(':')[1] || '0', 16);
    if (normalized.startsWith('2001:db8:') || first === 0x2002 || first === 0x3fff || (first === 0x2001 && second < 0x200)) return false;
    return true;
  }
  return false;
}

export function validateNetworkRequest(request: SandboxNetworkRequest, approvedDomains: string[], limit: number): URL {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(k => !['url', 'method', 'headers', 'body', 'secretRefs'].includes(k))) throw new SandboxError('INVALID_REQUEST', 'Invalid network request fields');
  let url: URL;
  try { url = new URL(request.url); } catch { throw new SandboxError('INVALID_REQUEST', 'Invalid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || isIP(url.hostname) || url.hostname.endsWith('.') || !approvedDomains.includes(url.hostname)) throw new SandboxError('NETWORK_DENIED', 'HTTPS destination is not approved');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(url.hostname)) throw new SandboxError('NETWORK_DENIED', 'Destination must be an exact DNS domain');
  if (request.method !== undefined && !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) throw new SandboxError('INVALID_REQUEST', 'Unsupported HTTP method');
  if (request.body !== undefined && typeof request.body !== 'string') throw new SandboxError('INVALID_REQUEST', 'HTTP body must be text');
  if (Buffer.byteLength(JSON.stringify(request)) > limit) throw new SandboxError('REQUEST_TOO_LARGE', 'HTTPS request exceeds size limit');
  if (request.headers !== undefined && (!request.headers || typeof request.headers !== 'object' || Array.isArray(request.headers))) throw new SandboxError('INVALID_REQUEST', 'Invalid headers');
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || typeof value !== 'string' || /[\r\n\0]/.test(value) || ['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-connection', 'accept-encoding', 'te', 'trailer'].includes(name.toLowerCase())) throw new SandboxError('INVALID_REQUEST', 'Unsafe HTTP header');
  }
  if (request.secretRefs !== undefined && (!Array.isArray(request.secretRefs) || request.secretRefs.length > 8 || request.secretRefs.some(r => typeof r !== 'string') || new Set(request.secretRefs).size !== request.secretRefs.length)) throw new SandboxError('INVALID_REQUEST', 'Invalid secret references');
  return url;
}

export function createHttpsProxy(options: HttpsProxyOptions = {}): NonNullable<SandboxServices['network']> {
  const requestBytes = options.requestBytes ?? 256 * 1024;
  const responseBytes = options.responseBytes ?? 512 * 1024;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return { async request(context, input, authorization): Promise<SandboxNetworkResponse> {
    const url = validateNetworkRequest(input, authorization.domains, requestBytes);
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)]);
    const bounded = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
      const abort = () => reject(new SandboxError('NETWORK_TIMEOUT', 'HTTPS request cancelled or timed out'));
      signal.addEventListener('abort', abort, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => {});
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    const addresses = await bounded(options.resolveHostname
      ? options.resolveHostname(url.hostname, signal)
      : lookup(url.hostname, { all: true, verbatim: true }));
    if (!Array.isArray(addresses) || !addresses.length || addresses.some(a => !a || typeof a.address !== 'string' || (a.family !== 4 && a.family !== 6) || isIP(a.address) !== a.family || !isPublicAddress(a.address))) throw new SandboxError('NETWORK_DENIED', 'DNS resolved to an invalid or non-public address');
    // Snapshot a host resolver's answer before awaiting secrets; later cache mutations
    // cannot replace the already-approved connection target.
    const selected = { ...addresses[0]! };
    const headers: Record<string, string> = Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    headers['accept-encoding'] = 'identity';
    const secrets: string[] = [];
    for (const reference of input.secretRefs ?? []) {
      if (!authorization.secretRefs.includes(reference) || !options.resolveSecret) throw new SandboxError('NOT_AUTHORIZED', 'Secret reference is not approved');
      const secret = await bounded(options.resolveSecret(context, reference));
      if (!secret || !secret.value || !secret.domains.includes(url.hostname) || !/^[a-z][a-z0-9-]*$/i.test(secret.header) || /[\r\n\0]/.test((secret.prefix ?? '') + secret.value) || ['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'accept-encoding'].includes(secret.header.toLowerCase())) throw new SandboxError('NOT_AUTHORIZED', 'Secret is unavailable for this destination');
      headers[secret.header.toLowerCase()] = (secret.prefix ?? '') + secret.value;
      secrets.push(secret.value);
    }
    if (Buffer.byteLength(JSON.stringify(headers)) + Buffer.byteLength(input.body ?? '') > requestBytes) throw new SandboxError('REQUEST_TOO_LARGE', 'Injected HTTPS request exceeds limit');
    signal.throwIfAborted();
    return bounded(new Promise<SandboxNetworkResponse>((resolve, reject) => {
      // Fixed IP connection, original hostname for TLS certificate verification and SNI.
      // No global agent, proxy environment, redirects, or second DNS lookup.
      const req = httpsRequest({ hostname: url.hostname, servername: url.hostname, family: selected.family, port: 443, path: url.pathname + url.search, method: input.method ?? 'GET', headers, agent: false, signal, maxHeaderSize: 16 * 1024,
        lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
      }, res => {
        if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) { res.destroy(); reject(new SandboxError('REDIRECT_DENIED', 'HTTPS redirects are not followed')); return; }
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); reject(new SandboxError('ENCODING_DENIED', 'HTTPS response must use identity encoding')); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > responseBytes) { res.destroy(new SandboxError('RESPONSE_TOO_LARGE', 'HTTPS response exceeds limit')); return; }
          chunks.push(chunk);
        });
        res.on('error', error => reject(error instanceof SandboxError ? error : new SandboxError('NETWORK_ERROR', 'HTTPS response failed')));
        res.on('end', () => {
          const responseHeaders = Object.fromEntries(Object.entries(res.headers).filter(([k]) => !['set-cookie', 'set-cookie2'].includes(k)).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? '']));
          const response = { status: res.statusCode ?? 0, headers: responseHeaders, body: Buffer.concat(chunks).toString('utf8') };
          const serialized = JSON.stringify(response);
          for (const secret of secrets) {
            const variants = [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('base64url'), Buffer.from(secret).toString('hex'), JSON.stringify(secret).slice(1, -1)];
            if (variants.some(v => serialized.includes(v))) { reject(new SandboxError('SECRET_IN_RESPONSE', 'Upstream response contains a secret')); return; }
          }
          resolve(response);
        });
      });
      req.on('error', error => reject(error instanceof SandboxError ? error : new SandboxError('NETWORK_ERROR', 'HTTPS connection failed')));
      req.end(input.body);
    }));
  } };
}
