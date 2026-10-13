import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialExtraction, MaterialPage } from "@molis-ai/molis-work-contracts/services/materials";
import { createMaterialExtractor, supportsMaterialExtension } from "./material-extraction.js";
import { materialMediaExtensions } from "./material-native.js";
import { isMaterialFailure } from "./material-text.js";

const maximumBytes = 25 * 1024 * 1024;
/**
 * The upload checks of Jelly's material reader, every one `jelly.material.<reason>`. What the extractor refuses (`material.<reason>`) comes
 * out under Jelly's name too, with its kind, message and details (`jellyMaterialFailure`), because the speech-model download is asked for by
 * `jelly.material.model_required` and the source readers look for `jelly.material.native_unavailable`.
 */
export const jellyMaterialErrors = defineErrorCodes("jelly.material", {
  cancelled: "cancelled",
  invalid_data: "invalid",
  invalid_download_choice: "invalid",
  invalid_filename: "invalid",
  unsafe_storage: "internal",
  unsupported: "invalid",
});
/** Whether a failure is one of the material reader's, under Jelly's name (read by its code, not its class). */
export function isJellyMaterialFailure(error: unknown): error is ActionError {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("jelly.material.");
}
/** The extractor's refusal as Jelly's: the same fact, kind, message and details under the code `jelly.material.<reason>`. */
function jellyMaterialFailure(error: ActionError): ActionError {
  return new ActionError(`jelly.material.${error.code.slice("material.".length)}`, error.message, { ...(error.kind ? { kind: error.kind } : {}), ...(error.details ? { details: error.details } : {}) });
}
export type JellyMaterialPage = MaterialPage;
export interface JellyMaterialExtraction extends MaterialExtraction { file_name: string }
export interface JellyMaterialUpload { file_name: string; data_base64: string; allow_model_download?: boolean }
export interface JellyMaterialOptions { helperPath?: string; whisperHelperPath?: string; platform?: NodeJS.Platform; signal?: AbortSignal; beforeEffect?: () => void | Promise<void>; onProgress?: (progress: { stage: string; progress: number }) => void }
function fail(condition: unknown, raise: (message: string) => ActionError, message: string): asserts condition { if (!condition) throw raise(message); }
function decodeUpload(upload: JellyMaterialUpload): { name: string; extension: string; data: Buffer } {
  fail(upload && typeof upload.file_name === "string" && upload.file_name.length > 0 && upload.file_name.length <= 240 && !/[\\/\x00-\x1F\x7F]/.test(upload.file_name) && ![".", ".."].includes(upload.file_name), jellyMaterialErrors.invalid_filename, "请选择有效的文件名，不能包含路径");
  const extension = path.extname(upload.file_name).toLowerCase();
  fail(supportsMaterialExtension(extension), jellyMaterialErrors.unsupported, "支持文字、Markdown、HTML、图片、PDF、常见音视频文件");
  fail(typeof upload.data_base64 === "string" && upload.data_base64.length <= Math.ceil(maximumBytes / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.data_base64), jellyMaterialErrors.invalid_data, "文件内容不是有效 Base64，或超过 25 MB");
  fail(upload.allow_model_download === undefined || typeof upload.allow_model_download === "boolean", jellyMaterialErrors.invalid_download_choice, "模型下载选项无效");
  const data = Buffer.from(upload.data_base64, "base64");
  fail(data.length > 0 && data.length <= maximumBytes && data.toString("base64") === upload.data_base64, jellyMaterialErrors.invalid_data, "文件内容为空、编码无效或超过 25 MB");
  return { name: upload.file_name, extension, data };
}
async function privateDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name); await mkdir(directory, { recursive: true, mode: 0o700 }); const stat = await lstat(directory);
  fail(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(directory) === directory, jellyMaterialErrors.unsafe_storage, "素材保存目录无效"); return directory;
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
    if (options.signal?.aborted) throw jellyMaterialErrors.cancelled("素材提取已取消");
    if (isMaterialFailure(error)) throw jellyMaterialFailure(error);
    throw error;
  }
}
async function modelCacheDirectory(home: string): Promise<string> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  return privateDirectory(await privateDirectory(await realpath(home), "lingguang"), "models");
}
