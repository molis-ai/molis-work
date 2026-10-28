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
import { isIP } from 'node:net';
import type { SandboxIdentity, SandboxNetworkResponse } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SandboxError, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { publicAddress, sendPublicHttps, type PublicHttpsFailure, type PublicHttpsTestServer, type PublicLookup } from '../public-https.js';

export { publicAddress };

const MAX_REQUEST_BODY = 256 * 1024;
/** Headers the host sets or forbids; a plugin cannot choose them. */
const RESERVED = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'keep-alive', 'te', 'trailer', 'proxy-authorization', 'proxy-connection', 'cookie', 'expect']);
/** Response headers a plugin may see. */
const VISIBLE = ['content-type', 'content-language', 'etag', 'last-modified', 'location', 'retry-after', 'cache-control', 'date'];
export const NETWORK_STAND_IN: SandboxNetworkResponse = { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-molis-stand-in': '1' }, body: '' };
const FAILURE_CODES: Record<PublicHttpsFailure, string> = { private_address: 'plugin_builder.not_authorized', timeout: 'plugin_builder.timeout',
  too_large: 'plugin_builder.invalid_request', read: 'plugin_builder.invalid_request', connect: 'plugin_builder.invalid_request' };

interface HostNetworkOptions {
  /** How names resolve; the default is the system resolver. Tests pass their own. */
  lookup?: PublicLookup;
  /** A secret the person saved for this plugin, by its reference: the header to set and its value. */
  secret?(pluginId: string, reference: string): Promise<{ header: string; value: string } | null>;
  /** Whether this identity may reach the network, and with which methods ('read' = GET/HEAD only). */
  reach(identity: Readonly<SandboxIdentity>): 'none' | 'read' | 'all';
  /** Only for tests: a local TLS server standing in for the site, and which addresses a connection may use. */
  testServer?: PublicHttpsTestServer;
  allowAddress?(address: string): boolean;
}

export function hostNetwork(options: HostNetworkOptions): NonNullable<SandboxServices['network']> {
  return {
    async request(context, request, authorization) {
      const reach = options.reach(context.identity), method = request.method ?? 'GET';
      if (reach === 'none' || reach === 'read' && method !== 'GET' && method !== 'HEAD') return NETWORK_STAND_IN;
      let url: URL;
      try { url = new URL(request.url); } catch { throw new SandboxError('plugin_builder.invalid_request', '网址无效'); }
      if (url.protocol !== 'https:') throw new SandboxError('plugin_builder.not_authorized', '插件只能访问 https 网址');
      if (url.username || url.password) throw new SandboxError('plugin_builder.not_authorized', '网址里不能带用户名或密码');
      if (url.port && url.port !== '443') throw new SandboxError('plugin_builder.not_authorized', '插件只能访问标准 https 端口');
      if (!authorization.domains.includes(url.hostname)) throw new SandboxError('plugin_builder.not_authorized', '没有批准访问 ' + url.hostname);
      if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new SandboxError('plugin_builder.not_authorized', '插件只能按域名访问网站，不能直接访问 IP 地址');
      if (request.body !== undefined && (typeof request.body !== 'string' || Buffer.byteLength(request.body) > MAX_REQUEST_BODY)) throw new SandboxError('plugin_builder.invalid_request', '请求内容太大');
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers ?? {})) {
        const key = name.toLowerCase();
        if (RESERVED.has(key) || key === 'authorization' && authorization.secretRefs.length) continue;
        if (typeof value !== 'string' || /[\r\n]/.test(value) || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) throw new SandboxError('plugin_builder.invalid_request', '请求头无效：' + name);
        headers[key] = value;
      }
      for (const reference of authorization.secretRefs) {
        const secret = await options.secret?.(context.identity.pluginId, reference);
        if (!secret) throw new SandboxError('plugin_builder.not_authorized', '还没有为这个插件保存密钥「' + reference + '」');
        headers[secret.header.toLowerCase()] = secret.value;
      }
      context.signal.throwIfAborted(); await context.beforeEffect?.(); context.signal.throwIfAborted();
      const current = () => {
        context.signal.throwIfAborted();
        const now = options.reach(context.identity);
        if (now === 'none' || now === 'read' && method !== 'GET' && method !== 'HEAD') throw new SandboxError('plugin_builder.not_authorized', '插件的联网授权已改变');
      };
      const response = await sendPublicHttps({ url, method, headers, ...(request.body === undefined ? {} : { body: request.body }), signal: context.signal, current,
        ...(context.beforeEffect ? { beforeEffect: context.beforeEffect } : {}), ...(options.lookup ? { lookup: options.lookup } : {}),
        ...(options.allowAddress ? { allowAddress: options.allowAddress } : {}), ...(options.testServer ? { testServer: options.testServer } : {}),
        failure: (reason, detail) => new SandboxError(FAILURE_CODES[reason], detail) });
      const visible: Record<string, string> = {};
      for (const name of VISIBLE) { const value = response.headers[name]; if (typeof value === 'string') visible[name] = value; }
      const result: SandboxNetworkResponse = { status: response.status, headers: visible, body: response.body };
      await context.beforeEffect?.(); context.signal.throwIfAborted();
      return result;
    },
  };
}
