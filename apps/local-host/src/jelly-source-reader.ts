import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable, Transform } from "node:stream";

/** Public sources only. Every redirect is resolved again and pinned to its validated IP. */
export function isJellyPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a! < 224 && !(a === 169 && b === 254) && !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && b === 168) && !(a === 100 && b! >= 64 && b! <= 127) && !(a === 198 && (b === 18 || b === 19)) && !(a === 192 && b === 0) && !(a === 192 && b === 88 && c === 99) && !(a === 198 && b === 51 && c === 100) && !(a === 203 && b === 0 && c === 113);
  }
  const normalized = address.toLowerCase();
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/u.test(normalized) && !normalized.startsWith("2001:db8:") && !normalized.startsWith("2001::") && !normalized.startsWith("2001:0:") && !normalized.startsWith("2002:");
}
export interface JellyPublicFetchOptions { maxBytes?: number; headers?: Record<string, string>; signal?: AbortSignal }
export interface JellyPublicResponse { data: Buffer; type: string; final_url: string; status: number }
export class JellySourceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 422) { super(message); this.name = "JellySourceError"; }
}
export function validateJellyPublicURL(value: string): URL {
  let url: URL; try { url = new URL(value); } catch { throw new JellySourceError("jelly.source.invalid_url", "来源网址无效", 400); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new JellySourceError("jelly.source.invalid_url", "只支持没有登录凭证的公开网页来源", 400);
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || (isIP(host) && !isJellyPublicAddress(host))) throw new JellySourceError("jelly.source.private_address", "不能读取本机或内网地址", 400);
  return url;
}
interface Address { address: string; family: number }
export interface JellySourceResolverPorts {
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
      if (response.statusCode !== 200) { response.destroy(); reject(new JellySourceError("jelly.source.dns_unavailable", "可信 DNS 解析不可用")); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 65536) req.destroy(new JellySourceError("jelly.source.dns_unavailable", "可信 DNS 响应过大")); else chunks.push(chunk); });
      response.on("end", () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { Status?: number; Question?: { name?: string }[]; Answer?: { type?: number; data?: string }[] };
          if (value.Status !== 0 || value.Question?.[0]?.name?.replace(/\.$/u, "").toLowerCase() !== hostname.replace(/\.$/u, "").toLowerCase() || !Array.isArray(value.Answer)) throw new Error("invalid DNS answer");
          const results = value.Answer.filter(answer => answer.type === 1).map(answer => ({ address: answer.data ?? "", family: 4 }));
          if (!results.length || results.some(result => isIP(result.address) !== 4 || !isJellyPublicAddress(result.address))) throw new JellySourceError("jelly.source.private_address", "可信 DNS 未返回完全公开的来源地址", 400);
          resolve(results);
        } catch (error) { reject(error instanceof JellySourceError ? error : new JellySourceError("jelly.source.dns_unavailable", "可信 DNS 响应无效")); }
      });
      response.on("error", reject); response.on("aborted", () => reject(new JellySourceError("jelly.source.dns_unavailable", "可信 DNS 读取中断")));
    });
    const timer = setTimeout(() => req.destroy(new JellySourceError("jelly.source.dns_unavailable", "可信 DNS 解析超时")), 6000);
    req.on("close", () => clearTimeout(timer)); req.on("error", error => reject(signal?.aborted ? new JellySourceError("jelly.source.cancelled", "来源读取已取消", 499) : error)); req.end();
  });
  if (dnsCache.size >= 128) dnsCache.delete(dnsCache.keys().next().value!);
  dnsCache.set(hostname, { expires: Date.now() + 60000, addresses }); return addresses.map(value => ({ ...value }));
}
/** Resolver seams are test-only; HTTP requests never bind them. Private answers cannot opt into fallback. */
export async function resolveJellyPublicAddresses(hostname: string, signal?: AbortSignal, ports: JellySourceResolverPorts = {}): Promise<Address[]> {
  if (signal?.aborted) throw new JellySourceError("jelly.source.cancelled", "来源读取已取消", 499);
  const system = await (ports.lookup ?? (value => lookup(value, { all: true, verbatim: true })))(hostname);
  let addresses = system;
  if (system.length && system.every(value => proxySynthetic(value.address))) addresses = await (ports.trustedDNS ?? trustedPublicDNS)(hostname, signal);
  if (signal?.aborted) throw new JellySourceError("jelly.source.cancelled", "来源读取已取消", 499);
  if (!addresses.length || addresses.some(value => isIP(value.address) !== value.family || !isJellyPublicAddress(value.address))) throw new JellySourceError("jelly.source.private_address", "不能读取本机或内网地址", 400);
  return addresses;
}
/** Both wire bytes and decoded bytes are bounded, including servers ignoring identity encoding. */
export function readJellyPublicBody(source: Readable, encoding: string, maxBytes: number): Promise<Buffer> {
  const normalized = encoding.trim().toLowerCase();
  const decoded = !normalized || normalized === "identity" ? source : normalized === "gzip" ? createGunzip() : normalized === "br" ? createBrotliDecompress() : normalized === "deflate" ? createInflate() : null;
  if (!decoded) { source.destroy(); return Promise.reject(new JellySourceError("jelly.source.unsupported_encoding", "来源响应使用不支持的压缩格式")); }
  return new Promise((resolve, reject) => {
    let settled = false; let wireBytes = 0; let decodedBytes = 0; const chunks: Buffer[] = [];
    const fail = (error: Error) => { if (settled) return; settled = true; source.destroy(); if (decoded !== source) decoded.destroy(); reject(error); };
    source.on("error", fail); source.on("aborted", () => fail(new JellySourceError("jelly.source.interrupted", "来源读取中断")));
    source.on("data", (chunk: Buffer) => { wireBytes += chunk.length; if (wireBytes > maxBytes) fail(new JellySourceError("jelly.source.too_large", "来源超过读取限制")); });
    decoded.on("data", (chunk: Buffer) => { decodedBytes += chunk.length; if (decodedBytes > maxBytes) fail(new JellySourceError("jelly.source.too_large", "来源解压后超过读取限制")); else chunks.push(chunk); });
    decoded.on("error", error => fail(new JellySourceError("jelly.source.invalid_encoding", `来源响应解压失败：${error.message}`)));
    decoded.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    if (decoded !== source) source.pipe(decoded as Transform);
  });
}
export async function fetchJellyPublicBytes(value: string, options: JellyPublicFetchOptions = {}, depth = 0): Promise<JellyPublicResponse> {
  if (depth > 4) throw new JellySourceError("jelly.source.redirect_limit", "来源重定向过多");
  if (options.signal?.aborted) throw new JellySourceError("jelly.source.cancelled", "来源读取已取消", 499);
  const url = validateJellyPublicURL(value); const maxBytes = options.maxBytes ?? 4_000_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 25 * 1024 * 1024) throw new JellySourceError("jelly.source.invalid_limit", "来源读取上限无效", 400);
  const addresses = await resolveJellyPublicAddresses(url.hostname.replace(/^\[|\]$/gu, ""), options.signal);
  const address = addresses[0]!;
  const headers: Record<string, string> = { accept: "text/html,text/plain,application/xhtml+xml,application/json", "accept-encoding": "identity", "user-agent": "MolisWork-Jelly/1.0" };
  // Site adapters can supply public representation headers, never credentials or cookies.
  for (const [key, value] of Object.entries(options.headers ?? {})) if (["accept", "accept-language", "user-agent", "referer"].includes(key.toLowerCase())) headers[key.toLowerCase()] = value;
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(url, { headers, signal: options.signal, lookup: (_hostname, lookupOptions, callback) => { if (lookupOptions.all) callback(null, [address]); else callback(null, address.address, address.family); } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.destroy(); if (!response.headers.location) { reject(new JellySourceError("jelly.source.redirect_invalid", "来源跳转地址缺失")); return; }
        try { void fetchJellyPublicBytes(new URL(response.headers.location, url).href, options, depth + 1).then(resolve, reject); }
        catch { reject(new JellySourceError("jelly.source.redirect_invalid", "来源跳转地址无效")); } return;
      }
      const status = response.statusCode ?? 0;
      if (status !== 200) { response.destroy(); reject(new JellySourceError([401, 403, 412, 429].includes(status) ? "jelly.source.restricted" : "jelly.source.unavailable", `来源返回 ${status}；原链接保留，可以粘贴原文或上传文件继续整理`)); return; }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) { response.destroy(); reject(new JellySourceError("jelly.source.too_large", `来源超过 ${Math.round(maxBytes / 1024 / 1024)} MB 读取限制`)); return; }
      void readJellyPublicBody(response, response.headers["content-encoding"] ?? "", maxBytes).then(data => resolve({ data, type: response.headers["content-type"] ?? "", final_url: url.href, status }), reject);
    });
    const timer = setTimeout(() => req.destroy(new JellySourceError("jelly.source.timeout", "读取来源超时，请稍后重试")), 20_000);
    req.on("close", () => clearTimeout(timer)); req.on("error", error => reject(options.signal?.aborted ? new JellySourceError("jelly.source.cancelled", "来源读取已取消", 499) : error)); req.end();
  });
}
export function decodeJellyHTMLEntities(source: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return source.replace(/&(#(?:x[\da-f]+|\d+)|nbsp|amp|lt|gt|quot|apos);/giu, (whole, token: string) => { if (!token.startsWith("#")) return named[token.toLowerCase()] ?? whole; const code = token[1]?.toLowerCase() === "x" ? parseInt(token.slice(2), 16) : Number(token.slice(1)); return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ""; });
}
export function jellyHTMLArticle(html: string): { text: string; title?: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  const article = html.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/iu)?.[2] ?? html;
  const text = decodeJellyHTMLEntities(article.replace(/<(script|style|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "").replace(/<\/(?:p|div|h[1-6]|li|section)>|<br\s*\/?>/giu, "\n").replace(/<[^>]*>/gu, "")).replace(/[ \t]+/gu, " ").replace(/\n\s*\n\s*\n/gu, "\n\n").trim();
  if (text.length < 40) throw new JellySourceError("jelly.source.insufficient", "来源没有足够的可读正文，可能需要登录；原链接保留，可以粘贴原文继续");
  return { text, ...(title ? { title: decodeJellyHTMLEntities(title) } : {}) };
}
export async function readJellyPublicSource(url: string): Promise<{ text: string; title?: string }> {
  const result = await fetchJellyPublicBytes(url);
  if (/html/iu.test(result.type)) return jellyHTMLArticle(result.data.toString("utf8"));
  if (/text\/(plain|markdown)/iu.test(result.type)) return { text: result.data.toString("utf8") };
  throw new JellySourceError("jelly.source.unsupported", "这个来源不是网页或文字，请导入文件");
}
