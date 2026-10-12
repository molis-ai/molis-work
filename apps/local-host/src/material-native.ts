import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialExtraction, MaterialExtractionOptions, MaterialLimits, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { isMaterialFailure, materialErrors, materialFailure } from "./material-text.js";
const run = promisify(execFile);
export const materialMediaExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".aiff", ".aif", ".flac", ".mp4", ".mov", ".m4v", ".webm"]);
export const materialImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif"]);
/** Trusted Host configuration. These paths must never come from an Action input. */
export interface NativeMaterialOptions {
  helperPath?: string; whisperHelperPath?: string; platform?: NodeJS.Platform;
  modelDirectory?: string;
  beforeEffect?: () => void | Promise<void>;
}
function fail(condition: unknown, raise: (message: string) => ActionError, message: string): asserts condition {
  if (!condition) throw raise(message);
}
function validateNativeResult(raw: unknown): MaterialExtraction {
  fail(raw && typeof raw === "object" && !Array.isArray(raw), materialErrors.invalid_result, "原生提取器返回无效结果");
  const value = raw as MaterialExtraction;
  fail(typeof value.text === "string" && value.text.length <= 4_100_000 && typeof value.extractor === "string" && Array.isArray(value.pages) && value.pages.length <= 100 && value.coverage && ["sufficient", "partial", "insufficient"].includes(value.coverage.status) && Number.isSafeInteger(value.coverage.processed_pages) && Number.isSafeInteger(value.coverage.total_pages) && value.coverage.processed_pages >= 0 && value.coverage.total_pages >= value.coverage.processed_pages && Array.isArray(value.coverage.issues) && value.coverage.issues.every(issue => typeof issue === "string"), materialErrors.invalid_result, "原生提取结果缺少正文或覆盖信息");
  for (const page of value.pages) fail(page && Number.isSafeInteger(page.number) && page.number > 0 && typeof page.text === "string" && typeof page.method === "string" && (page.confidence == null || (typeof page.confidence === "number" && page.confidence >= 0 && page.confidence <= 1)), materialErrors.invalid_result, "原生提取器页面信息无效");
  for (const page of value.pages) if (page.lines !== undefined) fail(Array.isArray(page.lines) && page.lines.length <= 100_000
    && page.lines.every(line => line && typeof line.text === "string" && (line.confidence === null || (Number.isFinite(line.confidence) && line.confidence >= 0 && line.confidence <= 1)))
    && page.lines.map(line => line.text).join("\n") === page.text, materialErrors.invalid_result, "原生提取器逐行文字或置信度无效");
  if (value.segments !== undefined) fail(Array.isArray(value.segments) && value.segments.length <= 10000 && value.segments.every(segment => segment && typeof segment.text === "string" && Number.isFinite(segment.start_seconds) && segment.start_seconds >= 0 && Number.isFinite(segment.end_seconds) && segment.end_seconds >= segment.start_seconds), materialErrors.invalid_result, "转写时间戳无效");
  if (value.frames !== undefined) fail(Array.isArray(value.frames) && value.frames.length <= 5 && value.frames.every(frame => frame && typeof frame.text === "string" && Number.isFinite(frame.seconds) && frame.seconds >= 0 && (frame.confidence == null || (Number.isFinite(frame.confidence) && frame.confidence >= 0 && frame.confidence <= 1))), materialErrors.invalid_result, "视频帧定位无效");
  if (value.duration_seconds !== undefined) fail(Number.isFinite(value.duration_seconds) && value.duration_seconds >= 0, materialErrors.invalid_result, "媒体时长无效");
  return { ...value, pages: value.pages.map(page => ({ ...page, confidence: page.confidence ?? null })) };
}

function packageHelper(name: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.resolve("@molis-ai/molis-work-app-local-host"))), `../native/materials/bin/${name}`);
}
/** Passive discovery for UI; never starts a helper or downloads a model. */
export function materialImageTextAvailable(native: NativeMaterialOptions = {}): boolean {
  if ((native.platform ?? process.platform) !== "darwin") return false;
  try { accessSync(native.helperPath ?? packageHelper("jelly-material"), constants.X_OK); return true; } catch { return false; }
}
export async function extractNativeMaterial(source: MaterialSource, options: MaterialExtractionOptions, limits: MaterialLimits, native: NativeMaterialOptions): Promise<MaterialExtraction> {
  options.signal?.throwIfAborted();
  fail((native.platform ?? process.platform) === "darwin", materialErrors.native_unavailable, "图片、OCR PDF 和音视频提取需要 macOS 原生素材组件");
  const extension = path.extname(source.file_name).toLowerCase(), media = materialMediaExtensions.has(extension);
  const helper = media ? native.whisperHelperPath ?? packageHelper("jelly-whisper") : native.helperPath ?? packageHelper("jelly-material");
  try { await access(helper, constants.X_OK); }
  catch { throw materialErrors.native_unavailable(`原生素材组件尚未构建；请运行 Local Host 的 ${media ? "materials:build:whisper" : "materials:build"} 后重试`); }
  options.signal?.throwIfAborted();
  if (media) fail(native.modelDirectory, materialErrors.native_unavailable, "Host 尚未提供素材模型缓存目录");
  await native.beforeEffect?.(); options.signal?.throwIfAborted();
  const work = await mkdtemp(path.join(tmpdir(), "molis-material-"));
  try {
    options.signal?.throwIfAborted();
    const input = path.join(work, `source${extension}`);
    await writeFile(input, source.bytes, { mode: 0o600, signal: options.signal });
    await native.beforeEffect?.(); options.signal?.throwIfAborted();
    const args = ["extract", input];
    if (media) { args.push(native.modelDirectory!, work); if (options.allowModelDownload === true) args.push("--allow-model-download"); }
    else if (options.ocrLanguages) args.push("--languages", options.ocrLanguages.join(","));
    const pending = run(helper, args, { timeout: options.timeoutMs ?? (media ? 30 * 60_000 : 120_000),
      maxBuffer: 20 * 1024 * 1024, encoding: "utf8", windowsHide: true, killSignal: "SIGKILL" });
    const closed = new Promise<void>(resolve => pending.child.once("close", () => resolve()));
    // execFile forwards signal to spawn without its killSignal; own cancellation so it cannot hang on SIGTERM.
    const abort = () => { pending.child.kill("SIGKILL"); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    let buffer = "";
    if (options.onProgress) pending.child.stderr?.on("data", chunk => {
      if (options.signal?.aborted) return;
      buffer += String(chunk); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      if (buffer.length > 65536) buffer = "";
      for (const line of lines) {
        if (options.signal?.aborted) break;
        try { const progress = JSON.parse(line) as { stage: string; progress: number };
          if (typeof progress.stage === "string" && Number.isFinite(progress.progress) && progress.progress >= 0 && progress.progress <= 1) options.onProgress?.(progress);
        } catch { /* Framework diagnostics are not user progress. */ }
      }
    });
    try {
      const { stdout } = await pending;
      options.signal?.throwIfAborted();
      const result = validateNativeResult(JSON.parse(stdout));
      fail(result.text.length <= limits.maxCharacters && Buffer.byteLength(result.text) <= limits.maxTextBytes && result.pages.length <= limits.maxPages, materialErrors.output_too_large, "提取正文超过容量上限，请拆分后重试");
      return result;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (isMaterialFailure(error)) throw error;
      const failure = error as NodeJS.ErrnoException & { stdout?: string; killed?: boolean };
      if (failure.stdout) {
        try {
          const detail = JSON.parse(failure.stdout) as { error?: string; message?: string; approximate_bytes?: number; variant?: string };
          if (typeof detail.error === "string" && typeof detail.message === "string") throw materialFailure(detail.error, detail.message, { approximate_bytes: detail.approximate_bytes, variant: detail.variant });
        } catch (parsed) { if (isMaterialFailure(parsed)) throw parsed; }
      }
      throw failure.killed ? materialErrors.timeout("素材提取超时") : materialErrors.extraction_failed("素材提取失败");
    } finally { options.signal?.removeEventListener("abort", abort); await closed; }
  } finally { await rm(work, { recursive: true, force: true }); }
}
