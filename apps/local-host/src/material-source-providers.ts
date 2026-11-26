import { decodeMaterialHTMLEntities, fetchMaterialPublicBytes, isMaterialSourceFailure, materialHTMLArticle, materialSourceErrors, validateMaterialPublicURL, type MaterialPublicFetchOptions, type MaterialPublicResponse } from "./material-source-reader.js";
import { extractUploadedMaterial, type UploadedMaterial, type MaterialUploadOptions } from "./material-upload.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isMaterialFailure } from "./material-text.js";
import type { MaterialSourceContent } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";
import { activeLocale, DEFAULT_WEB_LOCALE, pageLocale, webLanguage } from "./web-locale.js";

type MaterialSourceMaterial = MaterialSourceContent;
export interface MaterialSourceOptions extends MaterialUploadOptions {
  /** Exact host names the whole read may contact (the page, its redirects, the API and images it follows to); unset, every public host. */
  allowed_hosts?: readonly string[];
  /** Dependency seams for offline parser/adapter regressions; HTTP routes never bind these fields. */
  fetch?: (url: string, options?: MaterialPublicFetchOptions) => Promise<MaterialPublicResponse>;
  extractMaterial?: (upload: MaterialUpload, options?: MaterialUploadOptions) => Promise<UploadedMaterial>;
}
const desktopAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
function acceptLanguageHeader(): string {
  const tag = activeLocale() ?? pageLocale() ?? DEFAULT_WEB_LOCALE;
  const intl = webLanguage(tag)?.intl ?? tag;
  const base = tag.split("-")[0]?.toLowerCase() ?? "en";
  if (base === "en") return `${intl},en;q=0.9`;
  return `${intl},${base};q=0.9,en;q=0.5`;
}
function pageHeaders(): Record<string, string> {
  return { "user-agent": desktopAgent, "accept-language": acceptLanguageHeader(), accept: "text/html,application/xhtml+xml,application/json" };
}
const maxBinary = 25 * 1024 * 1024;
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function firstString(value: Record<string, unknown>, keys: string[]): string | undefined { return keys.map(key => value[key]).find((part): part is string => typeof part === "string"); }
function domain(host: string, base: string): boolean { return host === base || host.endsWith(`.${base}`); }
function https(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // A value that is not a public https address is not an address to fetch.
  try { const url = validateMaterialPublicURL(value.startsWith("//") ? `https:${value}` : value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
function safeReferer(value: string): string { const url = new URL(value); url.search = ""; url.hash = ""; return url.href; }
function responseJSON(response: MaterialPublicResponse): unknown { try { return JSON.parse(response.data.toString("utf8")); } catch { throw materialSourceErrors.invalid_json("来源返回的数据无法解析；原链接保留"); } }
function checkAborted(options: MaterialSourceOptions): void { if (options.signal?.aborted) throw materialSourceErrors.cancelled("来源提取已取消"); }
export function materialXiaohongshuNoteID(value: string): string | null {
  // Not a URL is not a Xiaohongshu note.
  let url: URL; try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !domain(url.hostname, "xiaohongshu.com")) return null;
  const match = url.pathname.match(/^\/(?:explore|discovery\/item)\/([A-Za-z\d_-]{1,128})\/?$/u);
  return match?.[1] ?? null;
}
export function classifyMaterialSource(value: string): "bilibili" | "xiaohongshu" | "article" {
  const url = validateMaterialPublicURL(value);
  if (url.protocol === "https:" && (url.hostname === "b23.tv" || (domain(url.hostname, "bilibili.com") && /^\/video\//u.test(url.pathname)))) return "bilibili";
  return materialXiaohongshuNoteID(value) ? "xiaohongshu" : "article";
}
/** Balanced JSON extraction with literal-only undefined handling. Never executes source JavaScript. */
export function materialSourceEmbeddedJSON(html: string, name: string): unknown | null {
  const marker = html.indexOf(name); if (marker < 0) return null;
  const brace = html.indexOf("{", marker + name.length); if (brace < 0 || brace - marker > 300) return null;
  let depth = 0; let quoted = false; let escaped = false; let end = -1;
  for (let index = brace; index < html.length && index - brace <= 2_000_000; index++) {
    const char = html[index];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true; else if (char === "{") depth++; else if (char === "}" && --depth === 0) { end = index + 1; break; }
  }
  if (end < 0) return null;
  const raw = html.slice(brace, end); let sanitized = ""; quoted = false; escaped = false;
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index]!;
    if (quoted) { sanitized += char; if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; sanitized += char; continue; }
    if (raw.startsWith("undefined", index) && !/[\w$]/u.test(raw[index - 1] ?? " ") && !/[\w$]/u.test(raw[index + 9] ?? " ")) { sanitized += "null"; index += 8; } else sanitized += char;
  }
  // A page whose embedded state does not parse has no state to read; the caller tries the page's other representations.
  try { return JSON.parse(sanitized); } catch { return null; }
}
function walk(root: unknown, accept: (value: Record<string, unknown>) => unknown): unknown {
  let visited = 0;
  function visit(value: unknown, depth: number): unknown {
    if (depth > 16 || ++visited > 50_000) return undefined;
    if (Array.isArray(value)) { for (const child of value) { const result = visit(child, depth + 1); if (result !== undefined) return result; } return undefined; }
    const record = object(value); const found = accept(record); if (found !== undefined) return found;
    for (const key of Object.keys(record).sort()) { const result = visit(record[key], depth + 1); if (result !== undefined) return result; } return undefined;
  }
  return visit(root, 0);
}
interface MaterialXiaohongshuPayload { id: string; title?: string; body?: string; tags: string[]; images: string[]; kind: "image" | "video" }
export function parseMaterialXiaohongshu(html: string, expectedID: string): MaterialXiaohongshuPayload {
  const root = materialSourceEmbeddedJSON(html, "__INITIAL_STATE__");
  if (!root) throw (/登录|login|captcha|验证/iu.test(html) ? materialSourceErrors.restricted : materialSourceErrors.unavailable)("小红书公开页没有可读内容；原链接保留，可以粘贴文字、上传文件或重试");
  const rootObject = object(root); let chosen: Record<string, unknown> | undefined;
  for (const container of [object(rootObject.note).noteDetailMap, rootObject.noteDetailMap]) {
    const entry = object(object(container)[expectedID]); if (Object.keys(entry).length === 0) continue;
    const note = Object.keys(object(entry.note)).length ? object(entry.note) : entry;
    const embeddedID = firstString(note, ["noteId", "noteID", "note_id"]); if (!embeddedID || embeddedID === expectedID) { chosen = note; break; }
  }
  chosen ??= walk(root, value => firstString(value, ["noteId", "noteID", "note_id"]) === expectedID ? value : undefined) as Record<string, unknown> | undefined;
  if (!chosen) throw materialSourceErrors.note_mismatch("小红书页面与请求的笔记 ID 不一致；未读取其他笔记");
  const title = firstString(chosen, ["title", "displayTitle"])?.trim().slice(0, 500);
  const body = firstString(chosen, ["desc", "description"])?.trim().slice(0, 200_000);
  const tags = [...new Set(array(chosen.tagList ?? chosen.tags).map(value => typeof value === "string" ? value : firstString(object(value), ["name", "title"])).filter((value): value is string => !!value).map(value => value.trim().slice(0, 100)))];
  const images = [...new Set(array(chosen.imageList ?? chosen.images).map(value => https(firstString(object(value), ["urlDefault", "urlPre", "url"]))).filter((value): value is string => !!value))];
  // Videos are not transcribed; all that matters is whether the note carries one (any https address under its video block).
  let visited = 0;
  function hasVideoURL(value: unknown, depth = 0): boolean {
    if (depth > 16 || ++visited > 50_000) return false;
    if (typeof value === "string") return !!https(value);
    return (Array.isArray(value) ? value : Object.values(object(value))).some(child => hasVideoURL(child, depth + 1));
  }
  const declared = firstString(chosen, ["type", "noteType"]);
  return { id: expectedID, title, body, tags, images, kind: declared?.toLowerCase() === "video" || hasVideoURL(chosen.video ?? chosen.videoInfo) ? "video" : "image" };
}
function metadata(html: string, property: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0]; const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (key?.toLowerCase() === property.toLowerCase()) { const content = tag.match(/content\s*=\s*["']([^"']+)["']/iu)?.[1]; return content ? decodeMaterialHTMLEntities(content) : undefined; }
  }
  return undefined;
}
function coverage(issues: string[], sufficient: boolean, processed = 1, total = 1): UploadedMaterial["coverage"] { return { status: !sufficient ? "insufficient" : issues.length ? "partial" : "sufficient", processed_pages: processed, total_pages: total, issues }; }
function fetcher(options: MaterialSourceOptions) {
  return async (url: string, request: MaterialPublicFetchOptions) => {
    checkAborted(options); await options.beforeEffect?.(); checkAborted(options);
    return (options.fetch ?? fetchMaterialPublicBytes)(url, { ...request, ...(options.allowed_hosts ? { allowedHosts: options.allowed_hosts } : {}), beforeDispatch: options.beforeEffect });
  };
}
async function readPage(url: string, options: MaterialSourceOptions): Promise<{ html: string; response: MaterialPublicResponse }> {
  checkAborted(options); const response = await fetcher(options)(url, { maxBytes: 4_000_000, headers: pageHeaders(), signal: options.signal });
  if (!/text\/html|application\/xhtml\+xml/iu.test(response.type)) throw materialSourceErrors.unsupported("来源没有返回公开网页");
  return { html: response.data.toString("utf8"), response };
}
function extensionFor(type: string): string {
  const mime = type.split(";")[0]!.toLowerCase();
  const types: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif" };
  if (types[mime]) return types[mime]!;
  if (mime && mime !== "application/octet-stream" && !mime.startsWith("image/")) throw materialSourceErrors.invalid_media("来源图片响应类型不符");
  return "jpg";
}
/** A public image the page shows, read for its text. Audio and video are not transcribed on this machine (batch 112). */
async function remoteImage(url: string, referer: string, options: MaterialSourceOptions, maxBytes = maxBinary): Promise<{ extraction: UploadedMaterial; bytes: number }> {
  checkAborted(options); if (!https(url)) throw materialSourceErrors.invalid_media("图片必须使用公开 HTTPS 地址");
  const response = await fetcher(options)(url, { maxBytes, headers: { ...pageHeaders(), accept: "image/*,application/octet-stream", referer: safeReferer(referer) }, signal: options.signal });
  const extraction = await (options.extractMaterial ?? extractUploadedMaterial)({ file_name: `来源素材.${extensionFor(response.type)}`, data_base64: response.data.toString("base64") }, options);
  return { extraction, bytes: response.data.length };
}
function apiData(response: MaterialPublicResponse): Record<string, unknown> {
  const json = object(responseJSON(response)); if (typeof json.code === "number" && json.code !== 0) throw ([-403, 403, -101, -412].includes(json.code) ? materialSourceErrors.restricted : materialSourceErrors.unavailable)("B站公开接口未返回可读内容；不尝试登录或绕过限制");
  return object(json.data);
}
async function bilibili(source: string, options: MaterialSourceOptions): Promise<MaterialSourceMaterial> {
  const { html, response } = await readPage(source, options);
  if (classifyMaterialSource(response.final_url) !== "bilibili" || new URL(response.final_url).hostname === "b23.tv") throw materialSourceErrors.redirect_mismatch("短链接未跳转到B站视频页");
  const state = object(materialSourceEmbeddedJSON(html, "__INITIAL_STATE__")); const video = object(state.videoData); const bvid = video.bvid ?? state.bvid; const cid = Number(video.cid ?? state.cid);
  if (typeof bvid !== "string" || !/^BV[A-Za-z\d]+$/u.test(bvid) || !Number.isSafeInteger(cid) || cid <= 0) throw materialSourceErrors.unavailable("B站公开页缺少视频身份；原链接保留");
  const query = new URLSearchParams({ bvid, cid: String(cid) }); const request = fetcher(options); const headers = { ...pageHeaders(), referer: safeReferer(response.final_url) };
  const player = apiData(await request(`https://api.bilibili.com/x/player/v2?${query}`, { maxBytes: 4_000_000, headers, signal: options.signal }));
  const rank = (language: unknown) => ["zh-hans", "zh-cn", "zh", "ai-zh"].indexOf(String(language).toLowerCase());
  const subtitles = array(object(player.subtitle).subtitles).map(object).sort((a, b) => (rank(a.lan) < 0 ? 100 : rank(a.lan)) - (rank(b.lan) < 0 ? 100 : rank(b.lan)));
  for (const subtitle of subtitles) {
    checkAborted(options); const subtitleURL = https(subtitle.subtitle_url); if (!subtitleURL) continue;
    try {
      const value = object(responseJSON(await request(subtitleURL, { maxBytes: 2_000_000, headers, signal: options.signal })));
      const body = array(value.body); const segments = body.slice(0, 10000).map(object).flatMap(value => { const text = typeof value.content === "string" ? value.content.trim().slice(0, 200000) : ""; const start = Number(value.from ?? 0); const end = Number(value.to ?? start); return text && Number.isFinite(start) && start >= 0 && start <= 604800 && Number.isFinite(end) && end <= 604800 ? [{ start_seconds: start, end_seconds: Math.max(start, end), text }] : []; });
      if (segments.length < 30 || segments.reduce((count, segment) => count + (segment.text.match(/\p{L}/gu)?.length ?? 0), 0) < 200) continue;
      const text = segments.map(segment => `[${segment.start_seconds}–${segment.end_seconds} 秒] ${segment.text}`).join("\n");
      return { text, title: typeof video.title === "string" ? video.title : metadata(html, "og:title"), source_url: source, provider: "bilibili", extractor: "bilibili-public-subtitles", segments, coverage: coverage(body.length > 10000 ? ["字幕仅提取前 10000 段"] : [], true) };
    } catch (error) { checkAborted(options); if (isMaterialSourceFailure(error) && error.code === "material.source.private_address") throw error; }
  }
  throw materialSourceErrors.unavailable("没有合格的公开字幕；可以粘贴字幕继续");
}
async function xiaohongshu(source: string, options: MaterialSourceOptions): Promise<MaterialSourceMaterial> {
  const expected = materialXiaohongshuNoteID(source)!; const { html, response } = await readPage(source, options);
  if (materialXiaohongshuNoteID(response.final_url) !== expected) throw materialSourceErrors.note_mismatch("小红书跳转后的笔记 ID 不一致；未读取其他笔记");
  const payload = parseMaterialXiaohongshu(html, expected); const parts = [payload.title, payload.body, payload.tags.length ? `话题：${payload.tags.map(tag => `#${tag}`).join(" ")}` : undefined].filter((text): text is string => !!text);
  const issues: string[] = []; const pages: NonNullable<MaterialSourceMaterial["pages"]> = []; let acquired = 0; let bytes = 0; let hasMaterial = !!payload.body;
  if (payload.kind === "video") issues.push("视频不转写，只读取笔记正文");
  else {
    if (payload.images.length > 20) issues.push("图集仅提取前 20 张");
    for (const [index, url] of payload.images.slice(0, 20).entries()) {
      checkAborted(options); if (bytes >= maxBinary) { issues.push("图集总下载达到 25 MB 上限"); break; }
      try { const result = await remoteImage(url, response.final_url, options, maxBinary - bytes); bytes += result.bytes; acquired++; if (result.extraction.text.trim()) { hasMaterial = true; parts.push(`[图片 ${index + 1}]\n${result.extraction.text}`); } pages.push(...result.extraction.pages.map(page => ({ ...page, number: index + 1 }))); issues.push(...result.extraction.coverage.issues); }
      catch (error) { checkAborted(options); if (error instanceof ActionError && !isMaterialFailure(error)) throw error; issues.push(`图片 ${index + 1}：${error instanceof Error ? error.message : "提取失败"}`); if (isMaterialFailure(error) && error.code === "material.native_unavailable") break; }
    }
    if (payload.images.length) issues.push("图片仅提取文字，未理解纯视觉内容");
  }
  const text = parts.filter(Boolean).join("\n\n");
  if (!text || !hasMaterial) throw materialSourceErrors.insufficient("小红书来源只有标题或元数据，没有足够的可读材料；原链接保留，可以粘贴原文继续");
  return { text, title: payload.title, source_url: source, provider: "xiaohongshu", extractor: "xiaohongshu-public-page", coverage: coverage([...new Set(issues)], true, acquired, payload.kind === "video" ? 1 : payload.images.length), pages };
}
export async function readMaterialSource(source: string, options: MaterialSourceOptions = {}): Promise<MaterialSourceMaterial> {
  checkAborted(options);
  switch (classifyMaterialSource(source)) {
    case "bilibili": return bilibili(source, options);
    case "xiaohongshu": return xiaohongshu(source, options);
    case "article": {
      const response = await fetcher(options)(source, { maxBytes: 4_000_000, headers: pageHeaders(), signal: options.signal });
      if (/html/iu.test(response.type)) { const article = materialHTMLArticle(response.data.toString("utf8")); return { ...article, source_url: source, provider: "article", extractor: "public-html", coverage: coverage(["提取公开网页正文，未读取嵌入音视频和图片"], true) }; }
      if (/text\/(plain|markdown)/iu.test(response.type)) { const text = response.data.toString("utf8"); return { text, source_url: source, provider: "article", extractor: "public-text", coverage: coverage([], !!text.trim()) }; }
      throw materialSourceErrors.unsupported("来源不属于可读网页；可以上传文件继续");
    }
  }
}
