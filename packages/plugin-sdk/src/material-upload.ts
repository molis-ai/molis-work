import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialSource, MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";

export const MATERIAL_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
/** Formats accepted by the shared upload decoder and Host extractor. */
export const MATERIAL_EXTENSIONS = {
  text: [".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".json", ".log"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif"],
  media: [".mp3", ".wav", ".m4a", ".aac", ".aiff", ".aif", ".flac", ".mp4", ".mov", ".m4v", ".webm"],
  document: [".pdf"],
} as const;
const extensions = new Set<string>(Object.values(MATERIAL_EXTENSIONS).flat());
const errors = defineErrorCodes("material", {
  invalid_filename: "invalid", unsupported: "invalid", invalid_data: "invalid",
});

export function supportsMaterialExtension(extension: string): boolean { return extensions.has(extension); }

/** Decode a bounded upload; this never reads a path or starts extraction. */
export function decodeMaterialUpload(upload: MaterialUpload): MaterialSource {
  const name = upload?.file_name;
  if (typeof name !== "string" || !name.length || name.length > 240 || /[\\/\x00-\x1F\x7F]/.test(name) || [".", ".."].includes(name)) {
    throw errors.invalid_filename("请选择有效的文件名，不能包含路径");
  }
  if (!supportsMaterialExtension(path.extname(name).toLowerCase())) throw errors.unsupported("支持文字、Markdown、HTML、图片、PDF、常见音视频文件");
  const encoded = upload.data_base64;
  if (typeof encoded !== "string" || encoded.length > Math.ceil(MATERIAL_UPLOAD_MAX_BYTES / 3) * 4
    || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw errors.invalid_data("文件内容不是有效 Base64，或超过 25 MB");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MATERIAL_UPLOAD_MAX_BYTES || bytes.toString("base64") !== encoded) {
    throw errors.invalid_data("文件内容为空、编码无效或超过 25 MB");
  }
  return { file_name: name, bytes };
}
