import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Readable, Transform } from "node:stream";

/** Public sources only. Every redirect is resolved again and pinned to its validated IP. */
export function isMaterialPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a! < 224 && !(a === 169 && b === 254) && !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && b === 168) && !(a === 100 && b! >= 64 && b! <= 127) && !(a === 198 && (b === 18 || b === 19)) && !(a === 192 && b === 0) && !(a === 192 && b === 88 && c === 99) && !(a === 198 && b === 51 && c === 100) && !(a === 203 && b === 0 && c === 113);
  }
  const normalized = address.toLowerCase();
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/u.test(normalized) && !normalized.startsWith("2001:db8:") && !normalized.startsWith("2001::") && !normalized.startsWith("2001:0:") && !normalized.startsWith("2002:");
}
/**
 * The corporate fake-IP proxy's block, 198.18.0.0/15 exactly (user decision 2026-09-27: plugins and Coding treat it as a normal address; the
 * proxy is required, and a plugin still reaches only domains it was approved). Not public by S-10's table; only a read that carries an allowed
 * list, once the host name passed the list, takes a lookup answer in it.
 */
function isFakeIpProxyAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 198 && (b === 18 || b === 19);
}
export interface MaterialPublicFetchOptions {
  maxBytes?: number; headers?: Record<string, string>; signal?: AbortSignal; beforeDispatch?(): void | Promise<void>;
  /** Exact host names (lowercase) the reader may contact: the first request and every redirect, before any lookup. Without it, every public host is allowed. */
  allowedHosts?: readonly string[];
}
export interface MaterialPublicResponse { data: Buffer; type: string; final_url: string; status: number }
/**
 * The source reader's error codes, every one `material.source.<reason>`. The kind is the sort of failure; the Host's edges turn it into the
 * status (plugin SDK `actionHttpStatus`). A source that cannot be read answered 422 before, which has no kind, so it is a request that
 * cannot be done (400) unless the code says too large (413) or cancelled (499).
 */
export const materialSourceErrors = defineErrorCodes("material.source", {
  cancelled: "cancelled",
  dns_unavailable: "invalid",
  domain_not_allowed: "forbidden",
  insufficient: "invalid",
  interrupted: "invalid",
  invalid_encoding: "invalid",
  invalid_json: "invalid",
  invalid_limit: "invalid",
  invalid_media: "invalid",
  invalid_url: "invalid",
  note_mismatch: "invalid",
  private_address: "invalid",
  redirect_invalid: "invalid",
  redirect_limit: "invalid",
  redirect_mismatch: "invalid",
  restricted: "invalid",
  timeout: "invalid",
  too_large: "too_large",
  unavailable: "invalid",
  unsupported: "invalid",
  unsupported_encoding: "invalid",
});
/** Whether a failure is one of the source reader's (read by its code, not its class). */
export function isMaterialSourceFailure(error: unknown): error is ActionError {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("material.source.");
}
export function validateMaterialPublicURL(value: string): URL {
  let url: URL; try { url = new URL(value); } catch { throw materialSourceErrors.invalid_url("来源网址无效"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw materialSourceErrors.invalid_url("只支持没有登录凭证的公开网页来源");
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || (isIP(host) && !isMaterialPublicAddress(host))) throw materialSourceErrors.private_address("不能读取本机或内网地址");
  return url;
}
/** Refuses a host outside the list the caller allowed, before anything is looked up or sent. */
export function assertMaterialHostAllowed(url: URL, allowedHosts: readonly string[] | undefined): void {
  if (allowedHosts && !allowedHosts.includes(url.hostname)) throw materialSourceErrors.domain_not_allowed(`来源地址不在允许的域名内：${url.hostname}`);
}
/** Where a redirect goes, if the reader may follow it: a location it can read, on a host the caller allowed. */
export function materialRedirectTarget(from: URL, location: string | undefined, allowedHosts: readonly string[] | undefined): string {
  if (!location) throw materialSourceErrors.redirect_invalid("来源跳转地址缺失");
  let target: URL; try { target = new URL(location, from); } catch { throw materialSourceErrors.redirect_invalid("来源跳转地址无效"); }
  assertMaterialHostAllowed(target, allowedHosts);
  return target.href;
}
interface Address { address: string; family: number }
interface MaterialSourceResolverPorts {
  lookup?: (hostname: string) => Promise<Address[]>;
  trustedDNS?: (hostname: string, signal?: AbortSignal) => Promise<Address[]>;
}
const dnsCache = new Map<string, { expires: number; addresses: Address[] }>();
function proxySynthetic(address: string): boolean {
  return (isIP(address) === 4 && /^198\.(?:18|19)\./u.test(address)) || (isIP(address) === 6 && address.toLowerCase().startsWith("fdfe:dcba:9876:"));
}
/** Fixed, TLS-authenticated resolver only; it never follows redirects or accepts a caller endpoint. */
async function trustedPublicDNS(hostname: string, signal?: AbortSignal): Promise<Address[]> {
  const cached = dnsCache.get(hostname); if (cached && cached.expires > Date.now()) return cached.addresses.map(value => ({ ...value }));
  const endpoint = new URL("https://dns.google/resolve"); endpoint.searchParams.set("name", hostname); endpoint.searchParams.set("type", "A");
  const addresses = await new Promise<Address[]>((resolve, reject) => {
    const req = httpsRequest(endpoint, { headers: { accept: "application/dns-json", "accept-encoding": "identity" }, signal }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(materialSourceErrors.dns_unavailable("可信 DNS 解析不可用")); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 65536) req.destroy(materialSourceErrors.dns_unavailable("可信 DNS 响应过大")); else chunks.push(chunk); });
      response.on("end", () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { Status?: number; Question?: { name?: string }[]; Answer?: { type?: number; data?: string }[] };
          if (value.Status !== 0 || value.Question?.[0]?.name?.replace(/\.$/u, "").toLowerCase() !== hostname.replace(/\.$/u, "").toLowerCase() || !Array.isArray(value.Answer)) throw new Error("invalid DNS answer");
          const results = value.Answer.filter(answer => answer.type === 1).map(answer => ({ address: answer.data ?? "", family: 4 }));
          if (!results.length || results.some(result => isIP(result.address) !== 4 || !isMaterialPublicAddress(result.address))) throw materialSourceErrors.private_address("可信 DNS 未返回完全公开的来源地址");
          resolve(results);
        } catch (error) { reject(isMaterialSourceFailure(error) ? error : materialSourceErrors.dns_unavailable("可信 DNS 响应无效")); }
      });
      response.on("error", reject); response.on("aborted", () => reject(materialSourceErrors.dns_unavailable("可信 DNS 读取中断")));
    });
    const timer = setTimeout(() => req.destroy(materialSourceErrors.dns_unavailable("可信 DNS 解析超时")), 6000);
    req.on("close", () => clearTimeout(timer)); req.on("error", error => reject(signal?.aborted ? materialSourceErrors.cancelled("来源读取已取消") : error)); req.end();
  });
  if (dnsCache.size >= 128) dnsCache.delete(dnsCache.keys().next().value!);
  dnsCache.set(hostname, { expires: Date.now() + 60000, addresses }); return addresses.map(value => ({ ...value }));
}
/** Resolver seams are test-only; HTTP requests never bind them. Private answers cannot opt into fallback. */
export async function resolveMaterialPublicAddresses(hostname: string, signal?: AbortSignal, ports: MaterialSourceResolverPorts = {}, beforeDispatch?: () => void | Promise<void>, fakeIpProxy = false): Promise<Address[]> {
  if (signal?.aborted) throw materialSourceErrors.cancelled("来源读取已取消");
  await beforeDispatch?.(); signal?.throwIfAborted();
  const system = await (ports.lookup ?? (value => lookup(value, { all: true, verbatim: true })))(hostname);
  await beforeDispatch?.(); signal?.throwIfAborted();
  let addresses = system;
  if (system.length && system.every(value => proxySynthetic(value.address)) && !(fakeIpProxy && system.every(value => isFakeIpProxyAddress(value.address)))) addresses = await (ports.trustedDNS ?? trustedPublicDNS)(hostname, signal);
  if (signal?.aborted) throw materialSourceErrors.cancelled("来源读取已取消");
  if (!addresses.length || addresses.some(value => isIP(value.address) !== value.family || !(isMaterialPublicAddress(value.address) || (fakeIpProxy && isFakeIpProxyAddress(value.address))))) throw materialSourceErrors.private_address("不能读取本机或内网地址");
  return addresses;
}
/** Both wire bytes and decoded bytes are bounded, including servers ignoring identity encoding. */
export function readMaterialPublicBody(source: Readable, encoding: string, maxBytes: number): Promise<Buffer> {
  const normalized = encoding.trim().toLowerCase();
  const decoded = !normalized || normalized === "identity" ? source : normalized === "gzip" ? createGunzip() : normalized === "br" ? createBrotliDecompress() : normalized === "deflate" ? createInflate() : null;
  if (!decoded) { source.destroy(); return Promise.reject(materialSourceErrors.unsupported_encoding("来源响应使用不支持的压缩格式")); }
  return new Promise((resolve, reject) => {
    let settled = false; let wireBytes = 0; let decodedBytes = 0; const chunks: Buffer[] = [];
    const fail = (error: Error) => { if (settled) return; settled = true; source.destroy(); if (decoded !== source) decoded.destroy(); reject(error); };
    source.on("error", fail); source.on("aborted", () => fail(materialSourceErrors.interrupted("来源读取中断")));
    source.on("data", (chunk: Buffer) => { wireBytes += chunk.length; if (wireBytes > maxBytes) fail(materialSourceErrors.too_large("来源超过读取限制")); });
    decoded.on("data", (chunk: Buffer) => { decodedBytes += chunk.length; if (decodedBytes > maxBytes) fail(materialSourceErrors.too_large("来源解压后超过读取限制")); else chunks.push(chunk); });
    decoded.on("error", error => fail(materialSourceErrors.invalid_encoding(`来源响应解压失败：${error.message}`)));
    decoded.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    if (decoded !== source) source.pipe(decoded as Transform);
  });
}
export async function fetchMaterialPublicBytes(value: string, options: MaterialPublicFetchOptions = {}, depth = 0): Promise<MaterialPublicResponse> {
  if (depth > 4) throw materialSourceErrors.redirect_limit("来源重定向过多");
  if (options.signal?.aborted) throw materialSourceErrors.cancelled("来源读取已取消");
  const url = validateMaterialPublicURL(value); const maxBytes = options.maxBytes ?? 4_000_000;
  assertMaterialHostAllowed(url, options.allowedHosts);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 25 * 1024 * 1024) throw materialSourceErrors.invalid_limit("来源读取上限无效");
  const addresses = await resolveMaterialPublicAddresses(url.hostname.replace(/^\[|\]$/gu, ""), options.signal, {}, options.beforeDispatch, options.allowedHosts !== undefined);
  const address = addresses[0]!;
  const headers: Record<string, string> = { accept: "text/html,text/plain,application/xhtml+xml,application/json", "accept-encoding": "identity", "user-agent": "MolisWork-Material/1.0" };
  // Site adapters can supply public representation headers, never credentials or cookies.
  for (const [key, value] of Object.entries(options.headers ?? {})) if (["accept", "accept-language", "user-agent", "referer"].includes(key.toLowerCase())) headers[key.toLowerCase()] = value;
  await options.beforeDispatch?.(); options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(url, { headers, signal: options.signal, lookup: (_hostname, lookupOptions, callback) => { if (lookupOptions.all) callback(null, [address]); else callback(null, address.address, address.family); } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.destroy();
        try { void fetchMaterialPublicBytes(materialRedirectTarget(url, response.headers.location, options.allowedHosts), options, depth + 1).then(resolve, reject); }
        catch (error) { reject(error); } return;
      }
      const status = response.statusCode ?? 0;
      if (status !== 200) { response.destroy(); reject(([401, 403, 412, 429].includes(status) ? materialSourceErrors.restricted : materialSourceErrors.unavailable)(`来源返回 ${status}；原链接保留，可以粘贴原文或上传文件继续整理`)); return; }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) { response.destroy(); reject(materialSourceErrors.too_large(`来源超过 ${Math.round(maxBytes / 1024 / 1024)} MB 读取限制`)); return; }
      void readMaterialPublicBody(response, response.headers["content-encoding"] ?? "", maxBytes).then(data => resolve({ data, type: response.headers["content-type"] ?? "", final_url: url.href, status }), reject);
    });
    const timer = setTimeout(() => req.destroy(materialSourceErrors.timeout("读取来源超时，请稍后重试")), 20_000);
    req.on("close", () => clearTimeout(timer)); req.on("error", error => reject(options.signal?.aborted ? materialSourceErrors.cancelled("来源读取已取消") : error)); req.end();
  });
}
export function decodeMaterialHTMLEntities(source: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return source.replace(/&(#(?:x[\da-f]+|\d+)|nbsp|amp|lt|gt|quot|apos);/giu, (whole, token: string) => { if (!token.startsWith("#")) return named[token.toLowerCase()] ?? whole; const code = token[1]?.toLowerCase() === "x" ? parseInt(token.slice(2), 16) : Number(token.slice(1)); return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ""; });
}
export function materialHTMLArticle(html: string): { text: string; title?: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  const article = html.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/iu)?.[2] ?? html;
  const text = decodeMaterialHTMLEntities(article.replace(/<(script|style|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "").replace(/<\/(?:p|div|h[1-6]|li|section)>|<br\s*\/?>/giu, "\n").replace(/<[^>]*>/gu, "")).replace(/[ \t]+/gu, " ").replace(/\n\s*\n\s*\n/gu, "\n\n").trim();
  if (text.length < 40) throw materialSourceErrors.insufficient("来源没有足够的可读正文，可能需要登录；原链接保留，可以粘贴原文继续");
  return { text, ...(title ? { title: decodeMaterialHTMLEntities(title) } : {}) };
}
