import type { MaterialExtraction, MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";
import { decodeMaterialUpload } from "@molis-ai/molis-work-plugin-sdk";
import { extractHomeMaterial, type HomeMaterialOptions } from "./material-home.js";
import { materialErrors } from "./material-text.js";

export interface UploadedMaterial extends MaterialExtraction { file_name: string }
export interface MaterialUploadRequest extends MaterialUpload { allow_model_download?: boolean }
export type MaterialUploadOptions = HomeMaterialOptions;

/** Current file-reading result shape; transport validation is shared with Runtime plugins through the SDK. */
export async function extractUploadedMaterial(home: string, upload: MaterialUploadRequest, options: MaterialUploadOptions = {}): Promise<UploadedMaterial> {
  try {
    options.signal?.throwIfAborted(); await options.beforeEffect?.(); options.signal?.throwIfAborted();
    const source = decodeMaterialUpload(upload);
    if (upload.allow_model_download !== undefined && typeof upload.allow_model_download !== "boolean") throw materialErrors.invalid_download_choice("模型下载选项无效");
    const result = await extractHomeMaterial(home, source, { ...options, pdfMode: "ocr", allowModelDownload: upload.allow_model_download });
    const { title: _title, ...material } = result;
    const { truncated: _truncated, ...coverage } = result.coverage;
    return { ...material, coverage, file_name: source.file_name };
  } catch (error) {
    if (options.signal?.aborted) throw materialErrors.cancelled("素材提取已取消");
    throw error;
  }
}
