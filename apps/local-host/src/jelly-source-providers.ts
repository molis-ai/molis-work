import { decodeJellyHTMLEntities, fetchJellyPublicBytes, jellyHTMLArticle, JellySourceError, validateJellyPublicURL, type JellyPublicFetchOptions, type JellyPublicResponse } from "./jelly-source-reader.js";
import { extractJellyMaterial, JellyMaterialError, type JellyMaterialExtraction, type JellyMaterialOptions, type JellyMaterialUpload } from "./jelly-native-material.js";

export interface JellySourceMaterial {
  text: string; title?: string; source_url: string; provider: string; extractor: string;
  coverage: JellyMaterialExtraction["coverage"];
  pages?: JellyMaterialExtraction["pages"]; segments?: JellyMaterialExtraction["segments"]; frames?: JellyMaterialExtraction["frames"];
  model_required?: { approximate_bytes?: number; variant?: string };
}
export interface JellySourceOptions extends JellyMaterialOptions {
  allow_model_download?: boolean;
  /** Dependency seams for offline parser/adapter regressions; HTTP routes never bind these fields. */
  fetch?: (url: string, options?: JellyPublicFetchOptions) => Promise<JellyPublicResponse>;
  extractMaterial?: (home: string, upload: JellyMaterialUpload, options?: JellyMaterialOptions) => Promise<JellyMaterialExtraction>;
}
const desktopAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const pageHeaders = { "user-agent": desktopAgent, "accept-language": "zh-CN,zh;q=0.9", accept: "text/html,application/xhtml+xml,application/json" };
const maxBinary = 25 * 1024 * 1024;
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function firstString(value: Record<string, unknown>, keys: string[]): string | undefined { return keys.map(key => value[key]).find((part): part is string => typeof part === "string"); }
function domain(host: string, base: string): boolean { return host === base || host.endsWith(`.${base}`); }
function https(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = validateJellyPublicURL(value.startsWith("//") ? `https:${value}` : value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
function safeReferer(value: string): string { const url = new URL(value); url.search = ""; url.hash = ""; return url.href; }
function responseJSON(response: JellyPublicResponse): unknown { try { return JSON.parse(response.data.toString("utf8")); } catch { throw new JellySourceError("jelly.source.invalid_json", "来源返回的数据无法解析；原链接保留"); } }
function checkAborted(options: JellySourceOptions): void { if (options.signal?.aborted) throw new JellySourceError("jelly.source.cancelled", "来源提取已取消", 499); }
export function jellyXiaohongshuNoteID(value: string): string | null {
  let url: URL; try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !domain(url.hostname, "xiaohongshu.com")) return null;
  const match = url.pathname.match(/^\/(?:explore|discovery\/item)\/([A-Za-z\d_-]{1,128})\/?$/u);
  return match?.[1] ?? null;
}
export function classifyJellySource(value: string): "bilibili" | "xiaoyuzhou" | "xiaohongshu" | "article" {
  const url = validateJellyPublicURL(value);
  if (url.protocol === "https:" && (url.hostname === "b23.tv" || (domain(url.hostname, "bilibili.com") && /^\/video\//u.test(url.pathname)))) return "bilibili";
  if (url.protocol === "https:" && domain(url.hostname, "xiaoyuzhoufm.com") && /^\/episode\//u.test(url.pathname)) return "xiaoyuzhou";
  return jellyXiaohongshuNoteID(value) ? "xiaohongshu" : "article";
}
/** Balanced JSON extraction with literal-only undefined handling. Never executes source JavaScript. */
export function jellySourceEmbeddedJSON(html: string, name: string): unknown | null {
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
export interface JellyXiaohongshuPayload { id: string; title?: string; body?: string; tags: string[]; images: string[]; videos: string[]; kind: "image" | "video" }
export function parseJellyXiaohongshu(html: string, expectedID: string): JellyXiaohongshuPayload {
  const root = jellySourceEmbeddedJSON(html, "__INITIAL_STATE__");
  if (!root) throw new JellySourceError(/登录|login|captcha|验证/iu.test(html) ? "jelly.source.restricted" : "jelly.source.unavailable", "小红书公开页没有可读内容；原链接保留，可以粘贴文字、上传文件或重试");
  const rootObject = object(root); let chosen: Record<string, unknown> | undefined;
  for (const container of [object(rootObject.note).noteDetailMap, rootObject.noteDetailMap]) {
    const entry = object(object(container)[expectedID]); if (Object.keys(entry).length === 0) continue;
    const note = Object.keys(object(entry.note)).length ? object(entry.note) : entry;
    const embeddedID = firstString(note, ["noteId", "noteID", "note_id"]); if (!embeddedID || embeddedID === expectedID) { chosen = note; break; }
  }
  chosen ??= walk(root, value => firstString(value, ["noteId", "noteID", "note_id"]) === expectedID ? value : undefined) as Record<string, unknown> | undefined;
  if (!chosen) throw new JellySourceError("jelly.source.note_mismatch", "小红书页面与请求的笔记 ID 不一致；未读取其他笔记");
  const title = firstString(chosen, ["title", "displayTitle"])?.trim().slice(0, 500);
  const body = firstString(chosen, ["desc", "description"])?.trim().slice(0, 200_000);
  const tags = [...new Set(array(chosen.tagList ?? chosen.tags).map(value => typeof value === "string" ? value : firstString(object(value), ["name", "title"])).filter((value): value is string => !!value).map(value => value.trim().slice(0, 100)))];
  const images = [...new Set(array(chosen.imageList ?? chosen.images).map(value => https(firstString(object(value), ["urlDefault", "urlPre", "url"]))).filter((value): value is string => !!value))];
  const videos: string[] = []; let visited = 0;
  function videoURLs(value: unknown, key = "", depth = 0): void {
    if (depth > 16 || ++visited > 50_000) return;
    if (typeof value === "string" && ["masterurl", "backupurls", "streamurl", "urldefault", "urlpre", "url"].includes(key.toLowerCase())) { const url = https(value); if (url && !videos.includes(url)) videos.push(url); return; }
    if (Array.isArray(value)) { for (const child of value) videoURLs(child, key, depth + 1); return; }
    const record = object(value); const preferred = ["masterUrl", "streamUrl", "url", "urlDefault", "urlPre", "backupUrls"];
    for (const child of [...preferred.filter(key => key in record), ...Object.keys(record).filter(key => !preferred.includes(key)).sort()]) videoURLs(record[child], child, depth + 1);
  }
  videoURLs(chosen.video ?? chosen.videoInfo);
  const declared = firstString(chosen, ["type", "noteType"]);
  return { id: expectedID, title, body, tags, images, videos, kind: declared?.toLowerCase() === "video" || videos.length ? "video" : "image" };
}
function metadata(html: string, property: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0]; const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (key?.toLowerCase() === property.toLowerCase()) { const content = tag.match(/content\s*=\s*["']([^"']+)["']/iu)?.[1]; return content ? decodeJellyHTMLEntities(content) : undefined; }
  }
  return undefined;
}
export function parseJellyXiaoyuzhouAudio(html: string): string | null {
  const og = https(metadata(html, "og:audio")); if (og) return og;
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { const url = walk(JSON.parse(match[1]!), value => https(value.contentUrl) ?? undefined); if (typeof url === "string") return url; } catch { /* Try other public representations. */ }
  }
  const next = jellySourceEmbeddedJSON(html, "__NEXT_DATA__");
  return walk(next, value => https(value.audioUrl) ?? https(object(value.enclosure).url) ?? undefined) as string | null ?? null;
}
function coverage(issues: string[], sufficient: boolean, processed = 1, total = 1): JellyMaterialExtraction["coverage"] { return { status: !sufficient ? "insufficient" : issues.length ? "partial" : "sufficient", processed_pages: processed, total_pages: total, issues }; }
function fetcher(options: JellySourceOptions) { return options.fetch ?? fetchJellyPublicBytes; }
async function readPage(url: string, options: JellySourceOptions): Promise<{ html: string; response: JellyPublicResponse }> {
  checkAborted(options); const response = await fetcher(options)(url, { maxBytes: 4_000_000, headers: pageHeaders, signal: options.signal });
  if (!/text\/html|application\/xhtml\+xml/iu.test(response.type)) throw new JellySourceError("jelly.source.unsupported", "来源没有返回公开网页");
  return { html: response.data.toString("utf8"), response };
}
function extensionFor(type: string, fallback: "audio" | "video" | "image"): string {
  const mime = type.split(";")[0]!.toLowerCase();
  const types: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif" };
  if (types[mime]) return types[mime]!;
  if (mime && mime !== "application/octet-stream" && !mime.startsWith(`${fallback}/`)) throw new JellySourceError("jelly.source.invalid_media", "来源媒体响应类型不符");
  return fallback === "video" ? "mp4" : fallback === "audio" ? "m4a" : "jpg";
}
async function remoteMaterial(home: string, url: string, kind: "audio" | "video" | "image", referer: string, options: JellySourceOptions, maxBytes = maxBinary): Promise<{ extraction: JellyMaterialExtraction; bytes: number }> {
  checkAborted(options); if (!https(url)) throw new JellySourceError("jelly.source.invalid_media", "媒体必须使用公开 HTTPS 地址");
  const response = await fetcher(options)(url, { maxBytes, headers: { ...pageHeaders, accept: `${kind}/*,application/octet-stream`, referer: safeReferer(referer) }, signal: options.signal });
  const extension = extensionFor(response.type, kind);
  const extraction = await (options.extractMaterial ?? extractJellyMaterial)(home, { file_name: `来源素材.${extension}`, data_base64: response.data.toString("base64"), allow_model_download: options.allow_model_download === true }, options);
  return { extraction, bytes: response.data.length };
}
function fromExtraction(extraction: JellyMaterialExtraction, source: string, provider: string, title?: string): JellySourceMaterial { return { text: extraction.text, ...(title ? { title } : {}), source_url: source, provider, extractor: extraction.extractor, coverage: extraction.coverage, pages: extraction.pages, segments: extraction.segments, frames: extraction.frames }; }
function apiData(response: JellyPublicResponse): Record<string, unknown> {
  const json = object(responseJSON(response)); if (typeof json.code === "number" && json.code !== 0) throw new JellySourceError([-403, 403, -101, -412].includes(json.code) ? "jelly.source.restricted" : "jelly.source.unavailable", "B站公开接口未返回可读内容；不尝试登录或绕过限制");
  return object(json.data);
}
function biliAudio(data: Record<string, unknown>): string | null { const first = object(array(object(data.dash).audio)[0]); return https(first.baseUrl ?? first.base_url); }
async function bilibili(home: string, source: string, options: JellySourceOptions): Promise<JellySourceMaterial> {
  const { html, response } = await readPage(source, options);
  if (classifyJellySource(response.final_url) !== "bilibili" || new URL(response.final_url).hostname === "b23.tv") throw new JellySourceError("jelly.source.redirect_mismatch", "短链接未跳转到B站视频页");
  const state = object(jellySourceEmbeddedJSON(html, "__INITIAL_STATE__")); const video = object(state.videoData); const bvid = video.bvid ?? state.bvid; const cid = Number(video.cid ?? state.cid);
  if (typeof bvid !== "string" || !/^BV[A-Za-z\d]+$/u.test(bvid) || !Number.isSafeInteger(cid) || cid <= 0) throw new JellySourceError("jelly.source.unavailable", "B站公开页缺少视频身份；原链接保留");
  const query = new URLSearchParams({ bvid, cid: String(cid) }); const request = fetcher(options); const headers = { ...pageHeaders, referer: safeReferer(response.final_url) };
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
    } catch (error) { checkAborted(options); if (error instanceof JellySourceError && error.code === "jelly.source.private_address") throw error; }
  }
  let audio = biliAudio(player);
  if (!audio) { query.set("fnval", "16"); audio = biliAudio(apiData(await request(`https://api.bilibili.com/x/player/playurl?${query}`, { maxBytes: 4_000_000, headers, signal: options.signal }))); }
  if (!audio) throw new JellySourceError("jelly.source.unavailable", "没有合格公开字幕或可读音轨；可以粘贴字幕或上传文件");
  const material = await remoteMaterial(home, audio, "audio", response.final_url, options);
  return fromExtraction(material.extraction, source, "bilibili", typeof video.title === "string" ? video.title : undefined);
}
async function xiaoyuzhou(home: string, source: string, options: JellySourceOptions): Promise<JellySourceMaterial> {
  const { html, response } = await readPage(source, options); if (classifyJellySource(response.final_url) !== "xiaoyuzhou") throw new JellySourceError("jelly.source.redirect_mismatch", "链接未返回原小宇宙节目页");
  const audio = parseJellyXiaoyuzhouAudio(html); if (!audio) throw new JellySourceError("jelly.source.unavailable", "小宇宙公开页未提供可读音频；可以上传音频或粘贴转写");
  const material = await remoteMaterial(home, audio, "audio", response.final_url, options);
  return fromExtraction(material.extraction, source, "xiaoyuzhou", metadata(html, "og:title"));
}
async function xiaohongshu(home: string, source: string, options: JellySourceOptions): Promise<JellySourceMaterial> {
  const expected = jellyXiaohongshuNoteID(source)!; const { html, response } = await readPage(source, options);
  if (jellyXiaohongshuNoteID(response.final_url) !== expected) throw new JellySourceError("jelly.source.note_mismatch", "小红书跳转后的笔记 ID 不一致；未读取其他笔记");
  const payload = parseJellyXiaohongshu(html, expected); const parts = [payload.title, payload.body, payload.tags.length ? `话题：${payload.tags.map(tag => `#${tag}`).join(" ")}` : undefined].filter((text): text is string => !!text);
  const issues: string[] = []; const pages: NonNullable<JellySourceMaterial["pages"]> = []; let segments: JellySourceMaterial["segments"]; let frames: JellySourceMaterial["frames"]; let modelRequired: JellySourceMaterial["model_required"]; let acquired = 0; let bytes = 0; let hasMaterial = !!payload.body;
  if (payload.kind === "video") {
    let material: JellyMaterialExtraction | undefined;
    for (const candidate of payload.videos.slice(0, 3)) {
      try { material = (await remoteMaterial(home, candidate, "video", response.final_url, options)).extraction; break; }
      catch (error) { checkAborted(options); if (error instanceof JellyMaterialError && error.code === "jelly.material.model_required") { if (!hasMaterial) throw error; modelRequired = error.details ?? {}; issues.push("本地语音模型尚未启用；保留正文，视频转写等待明确下载选择"); break; } issues.push(error instanceof Error ? error.message : "视频素材读取失败"); }
    }
    if (material) { parts.push(material.text); hasMaterial ||= !!material.text.trim(); pages.push(...material.pages); segments = material.segments; frames = material.frames; issues.push(...material.coverage.issues); acquired++; }
    else if (!modelRequired) issues.push("公开视频素材不可用");
  } else {
    if (payload.images.length > 20) issues.push("图集仅提取前 20 张");
    for (const [index, url] of payload.images.slice(0, 20).entries()) {
      checkAborted(options); if (bytes >= maxBinary) { issues.push("图集总下载达到 25 MB 上限"); break; }
      try { const result = await remoteMaterial(home, url, "image", response.final_url, options, maxBinary - bytes); bytes += result.bytes; acquired++; if (result.extraction.text.trim()) { hasMaterial = true; parts.push(`[图片 ${index + 1}]\n${result.extraction.text}`); } pages.push(...result.extraction.pages.map(page => ({ ...page, number: index + 1 }))); issues.push(...result.extraction.coverage.issues); }
      catch (error) { checkAborted(options); issues.push(`图片 ${index + 1}：${error instanceof Error ? error.message : "提取失败"}`); if (error instanceof JellyMaterialError && error.code === "jelly.material.native_unavailable") break; }
    }
    if (payload.images.length) issues.push("图片仅提取文字，未理解纯视觉内容");
  }
  const text = parts.filter(Boolean).join("\n\n");
  if (!text || !hasMaterial) throw new JellySourceError("jelly.source.insufficient", "小红书来源只有标题或元数据，没有足够的可读材料；原链接保留，可以粘贴原文继续");
  return { text, title: payload.title, source_url: source, provider: "xiaohongshu", extractor: "xiaohongshu-public-page", coverage: coverage([...new Set(issues)], true, acquired, payload.kind === "video" ? 1 : payload.images.length), pages, segments, frames, ...(modelRequired ? { model_required: modelRequired } : {}) };
}
export async function readJellyMaterialSource(home: string, source: string, options: JellySourceOptions = {}): Promise<JellySourceMaterial> {
  checkAborted(options);
  switch (classifyJellySource(source)) {
    case "bilibili": return bilibili(home, source, options);
    case "xiaoyuzhou": return xiaoyuzhou(home, source, options);
    case "xiaohongshu": return xiaohongshu(home, source, options);
    case "article": {
      const response = await fetcher(options)(source, { maxBytes: 4_000_000, headers: pageHeaders, signal: options.signal });
      if (/html/iu.test(response.type)) { const article = jellyHTMLArticle(response.data.toString("utf8")); return { ...article, source_url: source, provider: "article", extractor: "public-html", coverage: coverage(["提取公开网页正文，未读取嵌入音视频和图片"], true) }; }
      if (/text\/(plain|markdown)/iu.test(response.type)) { const text = response.data.toString("utf8"); return { text, source_url: source, provider: "article", extractor: "public-text", coverage: coverage([], !!text.trim()) }; }
      throw new JellySourceError("jelly.source.unsupported", "来源不属于可读网页；可以上传文件继续");
    }
  }
}
