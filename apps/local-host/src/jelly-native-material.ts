import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import path from "node:path";
import type { MaterialExtraction, MaterialPage } from "@molis-ai/molis-work-contracts/services/materials";
import { createMaterialExtractor, MaterialExtractionError, supportsMaterialExtension } from "./material-extraction.js";
import { materialMediaExtensions } from "./material-native.js";

const maximumBytes = 25 * 1024 * 1024;
export class JellyMaterialError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly details?: { approximate_bytes?: number; variant?: string }) { super(message); this.name = "JellyMaterialError"; }
}
export type JellyMaterialPage = MaterialPage;
export interface JellyMaterialExtraction extends MaterialExtraction { file_name: string; source_sha256: string }
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
async function saveUpload(home: string, extension: string, data: Buffer, hash: string, options: JellyMaterialOptions): Promise<string> {
  await checkCurrent(options);
  await mkdir(home, { recursive: true, mode: 0o700 }); const homeRoot = await realpath(home);
  // Kept where 灵光, the one that reads files now, keeps its things.
  const jelly = await privateDirectory(homeRoot, "lingguang"); const directory = await privateDirectory(jelly, "imports");
  const file = path.join(directory, `${hash}${extension}`);
  await checkCurrent(options);
  const staging = await mkdtemp(path.join(jelly, "material-upload-")), staged = path.join(staging, "source");
  try {
    await checkCurrent(options);
    const handle = await open(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await checkCurrent(options); await handle.writeFile(data, { signal: options.signal }); await handle.sync(); }
    finally { await handle.close(); }
    await checkCurrent(options);
    try { await link(staged, file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await existing.stat();
        fail(stat.isFile() && stat.size === data.length && createHash("sha256").update(await existing.readFile()).digest("hex") === hash,
          "jelly.material.storage_conflict", "已有上传副本校验失败", 409);
      } finally { await existing.close(); }
    }
  } finally { await rm(staging, { recursive: true, force: true }); }
  return file;
}
async function checkCurrent(options: JellyMaterialOptions): Promise<void> {
  options.signal?.throwIfAborted(); await options.beforeEffect?.(); options.signal?.throwIfAborted();
}
export async function extractJellyMaterial(home: string, upload: JellyMaterialUpload, options: JellyMaterialOptions = {}): Promise<JellyMaterialExtraction> {
  try {
    await checkCurrent(options);
    const { name, extension, data } = decodeUpload(upload), hash = createHash("sha256").update(data).digest("hex");
    const stored = await saveUpload(home, extension, data, hash, options);
    await checkCurrent(options);
    const modelDirectory = materialMediaExtensions.has(extension) ? await privateDirectory(path.dirname(path.dirname(stored)), "models") : undefined;
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
    return { ...material, coverage, file_name: name, source_sha256: hash };
  } catch (error) {
    if (options.signal?.aborted) throw new JellyMaterialError("jelly.material.cancelled", "素材提取已取消；已保存的原始副本保留", 499);
    if (error instanceof MaterialExtractionError) throw new JellyMaterialError(`jelly.material.${error.code}`, error.message, error.status, error.details);
    throw error;
  }
}

