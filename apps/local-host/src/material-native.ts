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
/** Trusted Host configuration. The path must never come from an Action input. */
export interface NativeMaterialOptions {
  helperPath?: string; platform?: NodeJS.Platform;
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
  return { text: value.text, extractor: value.extractor, coverage: value.coverage, pages: value.pages.map(page => ({ ...page, confidence: page.confidence ?? null })) };
}

function packageHelper(name: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.resolve("@molis-ai/molis-work-app-local-host"))), `../native/materials/bin/${name}`);
}
const HELPER = "molis-material";
/** Passive discovery for UI; never starts the helper. */
export function materialImageTextAvailable(native: NativeMaterialOptions = {}): boolean {
  if ((native.platform ?? process.platform) !== "darwin") return false;
  try { accessSync(native.helperPath ?? packageHelper(HELPER), constants.X_OK); return true; } catch { return false; }
}
export async function extractNativeMaterial(source: MaterialSource, options: MaterialExtractionOptions, limits: MaterialLimits, native: NativeMaterialOptions): Promise<MaterialExtraction> {
  options.signal?.throwIfAborted();
  fail((native.platform ?? process.platform) === "darwin", materialErrors.native_unavailable, "图片和 OCR PDF 提取需要 macOS 原生素材组件");
  const extension = path.extname(source.file_name).toLowerCase();
  const helper = native.helperPath ?? packageHelper(HELPER);
  try { await access(helper, constants.X_OK); }
  catch { throw materialErrors.native_unavailable("原生素材组件尚未构建；请运行 Local Host 的 materials:build 后重试"); }
  options.signal?.throwIfAborted();
  await native.beforeEffect?.(); options.signal?.throwIfAborted();
  const work = await mkdtemp(path.join(tmpdir(), "molis-material-"));
  try {
    options.signal?.throwIfAborted();
    const input = path.join(work, `source${extension}`);
    await writeFile(input, source.bytes, { mode: 0o600, signal: options.signal });
    await native.beforeEffect?.(); options.signal?.throwIfAborted();
    const args = ["extract", input];
    if (options.ocrLanguages) args.push("--languages", options.ocrLanguages.join(","));
    const pending = run(helper, args, { timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 20 * 1024 * 1024, encoding: "utf8", windowsHide: true, killSignal: "SIGKILL" });
    const closed = new Promise<void>(resolve => pending.child.once("close", () => resolve()));
    // execFile forwards signal to spawn without its killSignal; own cancellation so it cannot hang on SIGTERM.
    const abort = () => { pending.child.kill("SIGKILL"); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
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
          const detail = JSON.parse(failure.stdout) as { error?: string; message?: string };
          if (typeof detail.error === "string" && typeof detail.message === "string") throw materialFailure(detail.error, detail.message);
        } catch (parsed) { if (isMaterialFailure(parsed)) throw parsed; }
      }
      throw failure.killed ? materialErrors.timeout("素材提取超时") : materialErrors.extraction_failed("素材提取失败");
    } finally { options.signal?.removeEventListener("abort", abort); await closed; }
  } finally { await rm(work, { recursive: true, force: true }); }
}
