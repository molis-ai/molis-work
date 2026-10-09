import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { MaterialExtraction, MaterialPage } from "@molis-ai/molis-work-contracts/services/materials";
import { createMaterialExtractor, MaterialExtractionError, supportsMaterialExtension } from "./material-extraction.js";
import { materialMediaExtensions } from "./material-native.js";

const maximumBytes = 25 * 1024 * 1024;
export class JellyMaterialError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly details?: { approximate_bytes?: number; variant?: string }) { super(message); this.name = "JellyMaterialError"; }
}
export type JellyMaterialPage = MaterialPage;
export interface JellyMaterialExtraction extends MaterialExtraction { file_name: string }
export interface JellyMaterialUpload { file_name: string; data_base64: string; allow_model_download?: boolean }
export interface JellyMaterialOptions { helperPath?: string; whisperHelperPath?: string; platform?: NodeJS.Platform; signal?: AbortSignal; beforeEffect?: () => void | Promise<void>; onProgress?: (progress: { stage: string; progress: number }) => void }
function fail(condition: unknown, code: string, message: string, status = 400): asserts condition { if (!condition) throw new JellyMaterialError(code, message, status); }
function decodeUpload(upload: JellyMaterialUpload): { name: string; extension: string; data: Buffer } {
  fail(upload && typeof upload.file_name === "string" && upload.file_name.length > 0 && upload.file_name.length <= 240 && !/[\\/\x00-\x1F\x7F]/.test(upload.file_name) && ![".", ".."].includes(upload.file_name), "jelly.material.invalid_filename", "请选择有效的文件名，不能包含路径");
  const extension = path.extname(upload.file_name).toLowerCase();
  fail(supportsMaterialExtension(extension), "jelly.material.unsupported", "支持文字、Markdown、HTML、图片、PDF、常见音视频文件", 415);
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
async function checkCurrent(options: JellyMaterialOptions): Promise<void> {
  options.signal?.throwIfAborted(); await options.beforeEffect?.(); options.signal?.throwIfAborted();
}
/**
 * Read text out of an uploaded file. The upload is only ever held in memory (and in the extractor's own temporary
 * directory, which it removes): reading keeps no spark, so a stored copy would have no reader and no owner. Only the
 * speech-model cache, which a later reading reuses, lives under the Home.
 */
export async function extractJellyMaterial(home: string, upload: JellyMaterialUpload, options: JellyMaterialOptions = {}): Promise<JellyMaterialExtraction> {
  try {
    await checkCurrent(options);
    const { name, extension, data } = decodeUpload(upload);
    await checkCurrent(options);
    const modelDirectory = materialMediaExtensions.has(extension) ? await modelCacheDirectory(home) : undefined;
    await checkCurrent(options);
    const extract = createMaterialExtractor({ helperPath: options.helperPath ?? process.env.MOLIS_JELLY_NATIVE_HELPER,
      whisperHelperPath: options.whisperHelperPath ?? process.env.MOLIS_JELLY_WHISPER_HELPER,
      platform: options.platform, modelDirectory, beforeEffect: options.beforeEffect });
    const result = await extract({ file_name: name, bytes: data }, { signal: options.signal, onProgress: options.onProgress,
      pdfMode: "ocr", allowModelDownload: upload.allow_model_download });
    await checkCurrent(options);
    // The public Jelly v1 result keeps its historical shape; coverage.status already conveys partial text.
    const { title: _title, ...material } = result;
    const { truncated: _truncated, ...coverage } = result.coverage;
    return { ...material, coverage, file_name: name };
  } catch (error) {
    if (options.signal?.aborted) throw new JellyMaterialError("jelly.material.cancelled", "素材提取已取消", 499);
    if (error instanceof MaterialExtractionError) throw new JellyMaterialError(`jelly.material.${error.code}`, error.message, error.status, error.details);
    throw error;
  }
}
async function modelCacheDirectory(home: string): Promise<string> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  return privateDirectory(await privateDirectory(await realpath(home), "lingguang"), "models");
}
