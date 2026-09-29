import path from "node:path";
import { runMaterialWorker } from "./material-worker.js";
import type { MaterialExtraction, MaterialExtractionOptions, MaterialExtractor, MaterialLimits, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { extractNativeMaterial, materialImageExtensions, materialMediaExtensions, type NativeMaterialOptions } from "./material-native.js";
import { extractMaterialText, MaterialExtractionError } from "./material-text.js";
export { MaterialExtractionError } from "./material-text.js";

const defaults: MaterialLimits = { maxBytes: 25 * 1024 * 1024, maxCharacters: 2_000_000, maxTextBytes: 8_000_000, maxPages: 200 };
export const materialTextExtensions = new Set([".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".json", ".log"]);
export function supportsMaterialExtension(extension: string): boolean {
  return materialTextExtensions.has(extension) || materialImageExtensions.has(extension) || materialMediaExtensions.has(extension) || extension === ".pdf";
}
function checkedLimits(options: MaterialExtractionOptions): MaterialLimits {
  const limits = { ...defaults, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > defaults[key as keyof MaterialLimits]) throw new MaterialExtractionError("invalid_limits", "提取容量上限无效");
  }
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 30 * 60_000)) throw new MaterialExtractionError("invalid_limits", "提取超时设置无效");
  return limits;
}
function extractPdf(source: MaterialSource, options: MaterialExtractionOptions, limits: MaterialLimits): Promise<MaterialExtraction> {
  return runMaterialWorker("material-pdf-worker.js", { bytes: new Uint8Array(source.bytes), limits }, options, "PDF");
}

export function createMaterialExtractor(native: NativeMaterialOptions = {}): MaterialExtractor {
  return async (source, options = {}) => {
    options.signal?.throwIfAborted();
    const limits = checkedLimits(options), extension = path.extname(source.file_name).toLowerCase();
    if (!source.bytes.length || source.bytes.length > limits.maxBytes) throw new MaterialExtractionError("invalid_data", "文件为空或超过提取容量上限");
    if (!supportsMaterialExtension(extension)) throw new MaterialExtractionError("unsupported", "不支持该材料格式", 415);
    const result = materialTextExtensions.has(extension) ? extractMaterialText(source.bytes, extension, options.textFormat === "markdown", limits)
      : extension === ".pdf" && options.pdfMode !== "ocr" ? await extractPdf(source, options, limits)
      : await extractNativeMaterial(source, options, limits, native);
    options.signal?.throwIfAborted();
    return result;
  };
}
export const extractMaterial: MaterialExtractor = createMaterialExtractor();
