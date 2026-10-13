/**
 * Network access for generated plugins. The sandbox broker has already checked the request's host against what the
 * operation declared and the person approved; this is the host's side of the door:
 *
 * - https only, on the default port, no credentials in the address;
 * - every address the connection actually uses is public (resolved inside the connection, so DNS cannot be switched
 *   to a private address between a check and the connect);
 * - redirects are not followed: the plugin sees the redirect and may ask again, which is checked again;
 * - bounded time and response size; hop-by-hop and identity headers are the host's.
 *
 * Checks and acceptance never reach the network (they get a fixed stand-in); a person's trial reaches it for reading
 * (GET/HEAD) only; the installed plugin reaches it fully.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpsRequest, type Agent } from 'node:https';
import { isIP } from 'node:net';
import type { SandboxIdentity, SandboxNetworkResponse } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SandboxError, isPublicAddress, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';

const TIMEOUT_MS = 15_000, MAX_BODY = 1024 * 1024, MAX_REQUEST_BODY = 256 * 1024;
/** Headers the host sets or forbids; a plugin cannot choose them. */
const RESERVED = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'keep-alive', 'te', 'trailer', 'proxy-authorization', 'proxy-connection', 'cookie', 'expect']);
/** Response headers a plugin may see. */
const VISIBLE = ['content-type', 'content-language', 'etag', 'last-modified', 'location', 'retry-after', 'cache-control', 'date'];
export const NETWORK_STAND_IN: SandboxNetworkResponse = { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-molis-stand-in': '1' }, body: '' };

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

type Lookup = (hostname: string, callback: (error: Error | null, addresses: LookupAddress[]) => void) => void;
export interface HostNetworkOptions {
  /** How names resolve; the default is the system resolver. Tests pass their own. */
  lookup?: Lookup;
  /** A secret the person saved for this plugin, by its reference: the header to set and its value. */
  secret?(pluginId: string, reference: string): Promise<{ header: string; value: string } | null>;
  /** Whether this identity may reach the network, and with which methods ('read' = GET/HEAD only). */
  reach(identity: Readonly<SandboxIdentity>): 'none' | 'read' | 'all';
  /** Only for tests: how TLS connections are made (a local server), and which addresses they allow. */
  agent?: Agent;
  allowAddress?(address: string): boolean;
}

export function hostNetwork(options: HostNetworkOptions): NonNullable<SandboxServices['network']> {
  const resolve: Lookup = options.lookup ?? ((hostname, callback) => dnsLookup(hostname, { all: true, verbatim: true }, callback));
  return {
    async request(context, request, authorization) {
      const reach = options.reach(context.identity), method = request.method ?? 'GET';
      if (reach === 'none' || reach === 'read' && method !== 'GET' && method !== 'HEAD') return NETWORK_STAND_IN;
      let url: URL;
      try { url = new URL(request.url); } catch { throw new SandboxError('INVALID_REQUEST', '网址无效'); }
      if (url.protocol !== 'https:') throw new SandboxError('NOT_AUTHORIZED', '插件只能访问 https 网址');
      if (url.username || url.password) throw new SandboxError('NOT_AUTHORIZED', '网址里不能带用户名或密码');
      if (url.port && url.port !== '443') throw new SandboxError('NOT_AUTHORIZED', '插件只能访问标准 https 端口');
      if (!authorization.domains.includes(url.hostname)) throw new SandboxError('NOT_AUTHORIZED', '没有批准访问 ' + url.hostname);
      if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new SandboxError('NOT_AUTHORIZED', '插件只能按域名访问网站，不能直接访问 IP 地址');
      if (request.body !== undefined && (typeof request.body !== 'string' || Buffer.byteLength(request.body) > MAX_REQUEST_BODY)) throw new SandboxError('INVALID_REQUEST', '请求内容太大');
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers ?? {})) {
        const key = name.toLowerCase();
        if (RESERVED.has(key) || key === 'authorization' && authorization.secretRefs.length) continue;
        if (typeof value !== 'string' || /[\r\n]/.test(value) || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) throw new SandboxError('INVALID_REQUEST', '请求头无效：' + name);
        headers[key] = value;
      }
      for (const reference of authorization.secretRefs) {
        const secret = await options.secret?.(context.identity.pluginId, reference);
        if (!secret) throw new SandboxError('NOT_AUTHORIZED', '还没有为这个插件保存密钥「' + reference + '」');
        headers[secret.header.toLowerCase()] = secret.value;
      }
      if (request.body !== undefined) headers['content-length'] = String(Buffer.byteLength(request.body));
      context.signal.throwIfAborted(); await context.beforeEffect?.(); context.signal.throwIfAborted();
      const result = await send(url, method, headers, request.body, context.signal, resolve, options.allowAddress ?? publicAddress, options.agent, context.beforeEffect);
      await context.beforeEffect?.(); context.signal.throwIfAborted();
      return result;
    },
  };
}

function send(url: URL, method: string, headers: Record<string, string>, body: string | undefined, signal: AbortSignal, resolve: Lookup, allowed: (address: string) => boolean, agent?: Agent, beforeEffect?: () => Promise<void>): Promise<SandboxNetworkResponse> {
  return new Promise((done, fail) => {
    const timeout = AbortSignal.timeout(TIMEOUT_MS), stop = AbortSignal.any([signal, timeout]);
    // The connection's own lookup: whatever address it is about to use must be public.
    // Node asks for every address when it races the families (`all`), otherwise for one.
    const lookup = (hostname: string, lookupOptions: { all?: boolean } | undefined, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void) => resolve(hostname, (error, addresses) => {
      if (error) return callback(error, []);
      if (!addresses.length || addresses.some(item => !allowed(item.address))) return callback(Object.assign(new Error('不能访问本机或内网地址'), { code: 'PRIVATE_ADDRESS' }), []);
      // DNS is asynchronous. Recheck the original invocation before allowing the socket to connect.
      Promise.resolve().then(async () => {
        stop.throwIfAborted(); await beforeEffect?.(); stop.throwIfAborted();
        if (lookupOptions?.all) callback(null, addresses); else callback(null, addresses[0]!.address, addresses[0]!.family);
      }).catch(() => callback(Object.assign(new Error('原调用已取消或授权已失效'), { code: 'INVOCATION_REVOKED' }), []));
    });
    const outgoing = httpsRequest({ protocol: 'https:', hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers, lookup: lookup as never, signal: stop, ...(agent ? { agent } : {}) }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) { response.destroy(); fail(new SandboxError('INVALID_REQUEST', '网站返回的内容太大（超过 1MB）')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const visible: Record<string, string> = {};
        for (const name of VISIBLE) { const value = response.headers[name]; if (typeof value === 'string') visible[name] = value; }
        done({ status: response.statusCode ?? 0, headers: visible, body: Buffer.concat(chunks).toString('utf8') });
      });
      response.on('error', error => fail(new SandboxError('INVALID_REQUEST', '读取网站返回的内容失败：' + error.message)));
    });
    outgoing.on('error', error => {
      if ((error as { code?: string }).code === 'PRIVATE_ADDRESS') fail(new SandboxError('NOT_AUTHORIZED', '不能访问本机或内网地址'));
      else if (timeout.aborted) fail(new SandboxError('TIMEOUT', '网站在 15 秒内没有响应'));
      else fail(new SandboxError('INVALID_REQUEST', '访问网站失败：' + error.message));
    });
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}
