import path from "node:path";
import { MATERIAL_EXTENSIONS, supportsMaterialExtension } from "@molis-ai/molis-work-plugin-sdk";
import { runMaterialWorker } from "./material-worker.js";
import type { MaterialExtraction, MaterialExtractionOptions, MaterialExtractor, MaterialLimits, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { extractNativeMaterial, type NativeMaterialOptions } from "./material-native.js";
import { extractMaterialText, materialErrors } from "./material-text.js";

const defaults: MaterialLimits = { maxBytes: 25 * 1024 * 1024, maxCharacters: 2_000_000, maxTextBytes: 8_000_000, maxPages: 200 };
const ceilings: MaterialLimits = { ...defaults, maxBytes: 32 * 1024 * 1024 };
const materialTextExtensions = new Set<string>(MATERIAL_EXTENSIONS.text);
function checkedLimits(options: MaterialExtractionOptions): MaterialLimits {
  const limits = { ...defaults, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > ceilings[key as keyof MaterialLimits]) throw materialErrors.invalid_limits("提取容量上限无效");
  }
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 30 * 60_000)) throw materialErrors.invalid_limits("提取超时设置无效");
  if (options.ocrLanguages !== undefined && (!options.ocrLanguages.length || options.ocrLanguages.length > 3
    || options.ocrLanguages.some(language => !["zh-Hans", "zh-Hant", "en-US"].includes(language)))) throw materialErrors.invalid_limits("文字识别语言无效");
  return limits;
}
function extractPdf(source: MaterialSource, options: MaterialExtractionOptions, limits: MaterialLimits): Promise<MaterialExtraction> {
  return runMaterialWorker("material-pdf-worker.js", { bytes: new Uint8Array(source.bytes), limits }, options, "PDF");
}

/** Untruncated HTML conversion for document import; the caller owns its input/output and empty-content rules. */
export function readMaterialHtml(html: string, options: Pick<MaterialExtractionOptions, 'signal' | 'timeoutMs'> = {}): Promise<{ title?: string; text: string }> {
  if (Buffer.byteLength(html) > defaults.maxBytes) throw materialErrors.invalid_data("HTML 超过提取容量上限");
  return runMaterialWorker("material-html-worker.js", { kind: "document", html }, options, "HTML");
}

export function createMaterialExtractor(native: NativeMaterialOptions = {}): MaterialExtractor {
  return async (source, options = {}) => {
    options.signal?.throwIfAborted();
    const limits = checkedLimits(options), extension = path.extname(source.file_name).toLowerCase();
    if (!source.bytes.length || source.bytes.length > limits.maxBytes) throw materialErrors.invalid_data("文件为空或超过提取容量上限");
    if (!supportsMaterialExtension(extension)) throw materialErrors.unsupported("不支持该材料格式");
    const result = extension === ".html" || extension === ".htm" ? await runMaterialWorker<MaterialExtraction>("material-html-worker.js",
      { kind: "extraction", bytes: new Uint8Array(source.bytes), extension, markdown: options.textFormat === "markdown", limits }, options, "HTML")
      : materialTextExtensions.has(extension) ? extractMaterialText(source.bytes, extension, options.textFormat === "markdown", limits)
      : extension === ".pdf" && options.pdfMode !== "ocr" ? await extractPdf(source, options, limits)
      : await extractNativeMaterial(source, options, limits, native);
    options.signal?.throwIfAborted();
    return result;
  };
}
export const extractMaterial: MaterialExtractor = createMaterialExtractor();

/** No cap of its own: the whole text, as far as the reader's worker can hold it (its memory cap still stops a file it cannot). */
const WHOLE: MaterialLimits = { maxBytes: Number.MAX_SAFE_INTEGER, maxCharacters: Number.MAX_SAFE_INTEGER, maxTextBytes: Number.MAX_SAFE_INTEGER, maxPages: Number.MAX_SAFE_INTEGER };
const WHOLE_TIMEOUT_MS = 30 * 60_000;

/**
 * The whole text of a person's material, for the Host's own reading in onboarding (no limits, user 2026-10-22): text files decoded
 * in full, HTML's visible text, every page of a PDF's text layer, a Word file's body as Markdown. Unlike the extractor above it takes
 * no limits from its caller; a file its worker cannot hold fails with the worker's reason, by itself.
 */
export async function readWholeMaterial(source: MaterialSource, signal?: AbortSignal): Promise<MaterialExtraction> {
  const extension = path.extname(source.file_name).toLowerCase(), options = { ...signal ? { signal } : {}, timeoutMs: WHOLE_TIMEOUT_MS };
  if (!source.bytes.length) throw materialErrors.invalid_data("文件为空");
  if (extension === ".html" || extension === ".htm") return runMaterialWorker<MaterialExtraction>("material-html-worker.js",
    { kind: "extraction", bytes: new Uint8Array(source.bytes), extension, markdown: true, limits: WHOLE }, options, "HTML");
  if (extension === ".pdf") return runMaterialWorker<MaterialExtraction>("material-pdf-worker.js", { bytes: new Uint8Array(source.bytes), limits: WHOLE }, options, "PDF");
  if (extension === ".docx") {
    const read = await runMaterialWorker<{ text: string }>("material-office-worker.js", { bytes: new Uint8Array(source.bytes), type: "docx" }, options, "文档");
    return { text: read.text, extractor: "office-markdown", pages: [{ number: 1, text: read.text, method: "office-markdown", confidence: null }],
      coverage: { status: read.text ? "sufficient" : "insufficient", truncated: false, processed_pages: 1, total_pages: 1, issues: [] } };
  }
  return extractMaterialText(source.bytes, extension, true, WHOLE);
}
