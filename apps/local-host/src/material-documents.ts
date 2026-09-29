import type { MaterialDocumentBatch, MaterialDocumentOptions, MaterialDocumentReader, MaterialSource, MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";
import { MaterialExtractionError } from "./material-text.js";
import { runMaterialWorker } from "./material-worker.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024, MAX_DOCUMENTS = 100;
function invalid(message: string): never { throw new MaterialExtractionError("invalid_document", message, 422); }
function checkCount(sources: readonly unknown[]): void {
  if (!Array.isArray(sources) || !sources.length) invalid("请选择需要导入的文件");
  if (sources.length > MAX_DOCUMENTS) invalid(`一次最多选择 ${MAX_DOCUMENTS} 个文件`);
}
function checkName(name: string): void {
  if (typeof name !== "string" || !name.trim() || name.length > 1024 || /[\u0000-\u001f]/.test(name)) invalid("导入文件信息无效");
}
export const readMaterialDocuments: MaterialDocumentReader = async (sources, options = {}) => {
  options.signal?.throwIfAborted(); checkCount(sources);
  let total = 0;
  for (const source of sources) {
    checkName(source.file_name);
    if (source.bytes.length > MAX_UPLOAD_BYTES) invalid(`${source.file_name}：单个文件不能超过 10 MiB`);
    total += source.bytes.length;
    if (total > MAX_UPLOAD_BYTES) invalid("上传文件大小合计不能超过 10 MiB");
  }
  return runMaterialWorker("material-documents-worker.js", { sources }, options, "文档");
};

/** Validate transport before allocating decoded bytes and before transferring to the parser worker. */
export async function readMaterialUploads(uploads: readonly MaterialUpload[], options: MaterialDocumentOptions = {}): Promise<MaterialDocumentBatch> {
  options.signal?.throwIfAborted(); checkCount(uploads);
  const sources: MaterialSource[] = []; let total = 0;
  for (const upload of uploads) {
    checkName(upload?.file_name);
    if (typeof upload.data_base64 !== "string") invalid("导入文件信息无效");
    if (upload.data_base64.length > 4 * Math.ceil(MAX_UPLOAD_BYTES / 3)) invalid(`${upload.file_name}：单个文件不能超过 10 MiB`);
    if (upload.data_base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data_base64)) invalid(`${upload.file_name}：上传文件编码无效`);
    const bytes = Buffer.from(upload.data_base64, "base64");
    if (bytes.toString("base64") !== upload.data_base64) invalid(`${upload.file_name}：上传文件编码无效`);
    if (bytes.length > MAX_UPLOAD_BYTES) invalid(`${upload.file_name}：单个文件不能超过 10 MiB`);
    total += bytes.length; if (total > MAX_UPLOAD_BYTES) invalid("上传文件大小合计不能超过 10 MiB");
    sources.push({ file_name: upload.file_name, bytes });
  }
  return readMaterialDocuments(sources, options);
}
