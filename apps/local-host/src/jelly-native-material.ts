import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const maximumBytes = 25 * 1024 * 1024;
const maximumCharacters = 2_000_000;
const textExtensions = new Set([".txt", ".md", ".markdown", ".html", ".htm"]);
const mediaExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".aiff", ".aif", ".flac", ".mp4", ".mov", ".m4v", ".webm"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif"]);
export class JellyMaterialError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly details?: { approximate_bytes?: number; variant?: string }) { super(message); this.name = "JellyMaterialError"; }
}
export interface JellyMaterialPage { number: number; text: string; method: string; confidence: number | null }
export interface JellyMaterialExtraction {
  text: string; file_name: string; source_sha256: string; extractor: string;
  pages: JellyMaterialPage[];
  segments?: { start_seconds: number; end_seconds: number; text: string }[];
  frames?: { seconds: number; text: string; confidence?: number | null }[];
  duration_seconds?: number;
  coverage: { status: "sufficient" | "partial" | "insufficient"; processed_pages: number; total_pages: number; issues: string[] };
}
export interface JellyMaterialUpload { file_name: string; data_base64: string; allow_model_download?: boolean }
export interface JellyMaterialOptions { helperPath?: string; whisperHelperPath?: string; platform?: NodeJS.Platform; signal?: AbortSignal; onProgress?: (progress: { stage: string; progress: number }) => void }
function fail(condition: unknown, code: string, message: string, status = 400): asserts condition { if (!condition) throw new JellyMaterialError(code, message, status); }
function decodeUpload(upload: JellyMaterialUpload): { name: string; extension: string; data: Buffer } {
  fail(upload && typeof upload.file_name === "string" && upload.file_name.length > 0 && upload.file_name.length <= 240 && !/[\\/\x00-\x1F\x7F]/.test(upload.file_name) && ![".", ".."].includes(upload.file_name), "jelly.material.invalid_filename", "请选择有效的文件名，不能包含路径");
  const extension = path.extname(upload.file_name).toLowerCase();
  fail(textExtensions.has(extension) || imageExtensions.has(extension) || mediaExtensions.has(extension) || extension === ".pdf", "jelly.material.unsupported", "支持文字、Markdown、HTML、图片、PDF、常见音视频文件", 415);
  fail(typeof upload.data_base64 === "string" && upload.data_base64.length <= Math.ceil(maximumBytes / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.data_base64), "jelly.material.invalid_data", "文件内容不是有效 Base64，或超过 25 MB");
  fail(upload.allow_model_download === undefined || typeof upload.allow_model_download === "boolean", "jelly.material.invalid_download_choice", "模型下载选项无效");
  const data = Buffer.from(upload.data_base64, "base64");
  fail(data.length > 0 && data.length <= maximumBytes && data.toString("base64") === upload.data_base64, "jelly.material.invalid_data", "文件内容为空、编码无效或超过 25 MB");
  return { name: upload.file_name, extension, data };
}
async function privateDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name); await mkdir(directory, { recursive: true, mode: 0o700 }); const stat = await lstat(directory);
  fail(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(directory) === directory, "jelly.material.unsafe_storage", "素材保存目录无效", 500); return directory;
}
async function saveUpload(home: string, extension: string, data: Buffer, hash: string): Promise<string> {
  await mkdir(home, { recursive: true, mode: 0o700 }); const homeRoot = await realpath(home);
  const jelly = await privateDirectory(homeRoot, "jelly"); const directory = await privateDirectory(jelly, "imports");
  const file = path.join(directory, `${hash}${extension}`);
  try {
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { fail((await handle.stat()).isFile() && createHash("sha256").update(await handle.readFile()).digest("hex") === hash, "jelly.material.storage_conflict", "已有上传副本校验失败", 409); } finally { await handle.close(); }
  }
  return file;
}
function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (whole, token: string) => { if (!token.startsWith("#")) return named[token.toLowerCase()] ?? whole; const code = token[1]?.toLowerCase() === "x" ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10); return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : whole; });
}
/** Read-only extraction: scripts are never evaluated and external assets are never fetched. */
function htmlText(source: string): string {
  return decodeEntities(source.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|iframe|object|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<(br|hr)\b[^>]*>/gi, "\n").replace(/<\/(p|div|section|article|li|h[1-6]|tr|pre|blockquote)\s*>/gi, "\n").replace(/<[^>]*>/g, " ")).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function extractText(data: Buffer, extension: string): Omit<JellyMaterialExtraction, "file_name" | "source_sha256"> {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { throw new JellyMaterialError("jelly.material.encoding", "文字文件需使用 UTF-8 编码"); }
  fail(!source.includes("\0"), "jelly.material.encoding", "文件包含二进制内容，不能按文字提取");
  const html = extension === ".html" || extension === ".htm";
  let text = html ? htmlText(source) : source.trim(); const truncated = text.length > maximumCharacters; if (truncated) text = text.slice(0, maximumCharacters);
  const issues = truncated ? ["文字达到 200 万字符上限"] : []; if (html) issues.push("仅提取 HTML 可见文字；未读取图片、样式、脚本或外部资源"); if (!text) issues.push("未提取到可读文字");
  const extractor = html ? "html-text" : "utf8-text";
  return { text, extractor, pages: [{ number: 1, text, method: extractor, confidence: null }], coverage: { status: !text ? "insufficient" : truncated || html ? "partial" : "sufficient", processed_pages: 1, total_pages: 1, issues } };
}
function validateNativeResult(raw: unknown): Omit<JellyMaterialExtraction, "file_name" | "source_sha256"> {
  fail(raw && typeof raw === "object" && !Array.isArray(raw), "jelly.material.invalid_result", "原生提取器返回无效结果", 502);
  const value = raw as Omit<JellyMaterialExtraction, "file_name" | "source_sha256">;
  fail(typeof value.text === "string" && value.text.length <= 4_100_000 && typeof value.extractor === "string" && Array.isArray(value.pages) && value.pages.length <= 100 && value.coverage && ["sufficient", "partial", "insufficient"].includes(value.coverage.status) && Number.isSafeInteger(value.coverage.processed_pages) && Number.isSafeInteger(value.coverage.total_pages) && Array.isArray(value.coverage.issues) && value.coverage.issues.every(issue => typeof issue === "string"), "jelly.material.invalid_result", "原生提取结果缺少正文或覆盖信息", 502);
  for (const page of value.pages) fail(page && Number.isSafeInteger(page.number) && page.number > 0 && typeof page.text === "string" && typeof page.method === "string" && (page.confidence == null || (typeof page.confidence === "number" && page.confidence >= 0 && page.confidence <= 1)), "jelly.material.invalid_result", "原生提取器页面信息无效", 502);
  if (value.segments !== undefined) fail(Array.isArray(value.segments) && value.segments.length <= 10000 && value.segments.every(segment => typeof segment.text === "string" && Number.isFinite(segment.start_seconds) && segment.start_seconds >= 0 && Number.isFinite(segment.end_seconds) && segment.end_seconds >= segment.start_seconds), "jelly.material.invalid_result", "转写时间戳无效", 502);
  if (value.frames !== undefined) fail(Array.isArray(value.frames) && value.frames.length <= 5 && value.frames.every(frame => typeof frame.text === "string" && Number.isFinite(frame.seconds) && frame.seconds >= 0), "jelly.material.invalid_result", "视频帧定位无效", 502);
  return { ...value, pages: value.pages.map(page => ({ ...page, confidence: page.confidence ?? null })) };
}
function packageHelper(name: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.resolve("@molis-ai/molis-work-plugin-jelly"))), `../native/bin/${name}`);
}
export async function extractJellyMaterial(home: string, upload: JellyMaterialUpload, options: JellyMaterialOptions = {}): Promise<JellyMaterialExtraction> {
  fail(!options.signal?.aborted, "jelly.material.cancelled", "素材提取已取消", 499);
  const { name, extension, data } = decodeUpload(upload);
  const hash = createHash("sha256").update(data).digest("hex");
  const storedFile = await saveUpload(home, extension, data, hash);
  if (textExtensions.has(extension)) return { ...extractText(data, extension), file_name: name, source_sha256: hash };
  fail((options.platform ?? process.platform) === "darwin", "jelly.material.native_unavailable", "图片、PDF 和音视频提取需要 macOS 原生素材组件", 503);
  const media = mediaExtensions.has(extension);
  const helper = media
    ? options.whisperHelperPath ?? process.env.MOLIS_JELLY_WHISPER_HELPER ?? packageHelper("jelly-whisper")
    : options.helperPath ?? process.env.MOLIS_JELLY_NATIVE_HELPER ?? packageHelper("jelly-material");
  try { await access(helper, constants.X_OK); } catch { throw new JellyMaterialError("jelly.material.native_unavailable", `原生素材组件尚未构建；请运行 Jelly 插件的 ${media ? "native:build:whisper" : "native:build"} 后重试`, 503); }
  let work: string | null = null;
  const args = ["extract", storedFile];
  if (media) {
    const jelly = path.dirname(path.dirname(storedFile)); const models = await privateDirectory(jelly, "models");
    work = await mkdtemp(path.join(jelly, "material-run-")); args.push(models, work);
    if (upload.allow_model_download === true) args.push("--allow-model-download");
  }
  try {
    const pending = run(helper, args, { timeout: media ? 30 * 60_000 : 120_000, maxBuffer: 20 * 1024 * 1024, encoding: "utf8", windowsHide: true, signal: options.signal });
    if (options.onProgress) {
      let buffer = "";
      pending.child.stderr?.on("data", chunk => {
        buffer += String(chunk); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        if (buffer.length > 65536) buffer = "";
        for (const line of lines) { try { const progress = JSON.parse(line) as { stage: string; progress: number }; if (typeof progress.stage === "string" && Number.isFinite(progress.progress) && progress.progress >= 0 && progress.progress <= 1) options.onProgress?.(progress); } catch { /* Other framework diagnostics are not user progress. */ } }
      });
    }
    const { stdout } = await pending;
    return { ...validateNativeResult(JSON.parse(stdout)), file_name: name, source_sha256: hash };
  } catch (error) {
    if (error instanceof JellyMaterialError) throw error;
    const failure = error as NodeJS.ErrnoException & { stdout?: string; killed?: boolean };
    if (options.signal?.aborted || failure.name === "AbortError") throw new JellyMaterialError("jelly.material.cancelled", "素材提取已取消；原始上传副本保留", 499);
    if (failure.stdout) {
      try {
        const detail = JSON.parse(failure.stdout) as { error?: string; message?: string; approximate_bytes?: number; variant?: string };
        if (typeof detail.error === "string" && typeof detail.message === "string") throw new JellyMaterialError(`jelly.material.${detail.error}`, detail.message, detail.error === "model_required" ? 409 : 422, { approximate_bytes: detail.approximate_bytes, variant: detail.variant });
      } catch (parsed) { if (parsed instanceof JellyMaterialError) throw parsed; }
    }
    throw new JellyMaterialError(failure.killed ? "jelly.material.timeout" : "jelly.material.extraction_failed", failure.killed ? "素材提取超时；原始上传副本已保留，可使用文字版本重试" : "素材提取失败；原始上传副本已保留", 502);
  } finally { if (work) await rm(work, { recursive: true, force: true }); }
}

/** Re-read only a previously uploaded, content-addressed copy; never accept a filesystem path. */
export async function readStoredJellyMaterial(home: string, input: { file_name: string; sha256: string; allow_model_download?: boolean }, options: JellyMaterialOptions = {}): Promise<JellyMaterialExtraction> {
  fail(typeof input?.sha256 === "string" && /^[a-f0-9]{64}$/u.test(input.sha256), "jelly.material.invalid_reference", "上传副本标识无效");
  fail(typeof input.file_name === "string" && input.file_name.length > 0 && input.file_name.length <= 240 && !/[\\/\x00-\x1F\x7F]/u.test(input.file_name), "jelly.material.invalid_filename", "上传副本文件名无效");
  const homeRoot = await realpath(home), directory = path.join(homeRoot, "jelly", "imports");
  try { fail(await realpath(directory) === directory, "jelly.material.unsafe_storage", "素材保存目录无效", 500); }
  catch (error) { if (error instanceof JellyMaterialError) throw error; throw new JellyMaterialError("jelly.material.not_found", "上传副本不存在，请重新选择原始文件", 404); }
  const file = path.join(directory, input.sha256 + path.extname(input.file_name).toLowerCase());
  let data: Buffer;
  try {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat(); fail(stat.isFile() && stat.size > 0 && stat.size <= maximumBytes, "jelly.material.invalid_reference", "上传副本格式或大小无效");
      data = await handle.readFile();
    } finally { await handle.close(); }
  } catch (error) { if (error instanceof JellyMaterialError) throw error; throw new JellyMaterialError("jelly.material.not_found", "上传副本不存在，请重新选择原始文件", 404); }
  fail(createHash("sha256").update(data).digest("hex") === input.sha256, "jelly.material.storage_conflict", "上传副本校验失败，原文件保留，请重新选择原始文件", 409);
  return extractJellyMaterial(home, { file_name: input.file_name, data_base64: data.toString("base64"), allow_model_download: input.allow_model_download }, options);
}
