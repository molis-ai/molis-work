import { inflateRawSync } from "node:zlib";
import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";
import { PagesError } from "./error.js";
import { convertImportContent, type PagesImportFormat } from "./import-content.js";

export interface PagesImportFile { name: string; data: string }
export interface PreparedPagesImportDocument {
  key: string;
  name: string;
  title: string;
  body: PagesBody;
  warnings: string[];
}
export interface PreparedPagesImport {
  documents: PreparedPagesImportDocument[];
  warnings: string[];
}

const MIB = 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * MIB;
const MAX_EXPANDED_BYTES = 20 * MIB;
const MAX_ENTRY_BYTES = 5 * MIB;
const MAX_DOCUMENTS = 100;
const MAX_ENTRIES = 1000;
const MAX_COMPRESSION_RATIO = 200;
const FORMATS: Record<string, PagesImportFormat> = {
  md: "markdown", markdown: "markdown", html: "html", htm: "html", txt: "text", csv: "csv",
};

interface ArchiveEntry {
  name: string;
  originalSize: number;
  compressedSize: number;
  compression: number;
  crc: number;
  dataOffset: number;
}
interface ImportBudget { expandedBytes: number; entries: number }

function invalid(message: string): never {
  throw new PagesError("pages.invalid", message);
}

function extension(name: string): string {
  return name.split(/[\\/]/).at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
}

function archivePath(name: string, source: string): string {
  const normalized = name.replaceAll("\\", "/");
  if (!normalized || normalized.length > 1024 || /[\u0000-\u001f]/.test(normalized)
    || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)
    || normalized.split("/").includes("..")) {
    invalid(`${source}：压缩包包含不安全的文件路径`);
  }
  return normalized;
}

/** Read directory metadata only. No entry is inflated until the entire archive passes. */
function inspectArchive(data: Buffer, source: string, budget: ImportBudget): ArchiveEntry[] {
  let end = -1;
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset--) {
    if (data.readUInt32LE(offset) === 0x06054b50 && offset + 22 + data.readUInt16LE(offset + 20) === data.length) {
      end = offset;
      break;
    }
  }
  if (end < 0) invalid(`${source}：压缩包已损坏或格式不受支持`);
  const count = data.readUInt16LE(end + 10);
  const directorySize = data.readUInt32LE(end + 12);
  const directoryOffset = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)
    || data.readUInt16LE(end + 8) !== count || count === 0xffff
    || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    invalid(`${source}：不支持分卷或 ZIP64 压缩包`);
  }
  if (count + budget.entries > MAX_ENTRIES) invalid(`压缩包文件条目合计不能超过 ${MAX_ENTRIES} 个`);
  if (directoryOffset + directorySize > end) invalid(`${source}：压缩包目录已损坏`);
  let cursor = directoryOffset;
  let expanded = 0;
  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > directoryOffset + directorySize || data.readUInt32LE(cursor) !== 0x02014b50) {
      invalid(`${source}：压缩包目录已损坏`);
    }
    const flags = data.readUInt16LE(cursor + 8);
    const compression = data.readUInt16LE(cursor + 10);
    const crc = data.readUInt32LE(cursor + 16);
    const compressedSize = data.readUInt32LE(cursor + 20);
    const originalSize = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const localOffset = data.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > directoryOffset + directorySize || localOffset + 30 > directoryOffset
      || compressedSize === 0xffffffff || originalSize === 0xffffffff) {
      invalid(`${source}：压缩包目录已损坏或使用了 ZIP64`);
    }
    if (flags & (1 | 64 | 8192)) invalid(`${source}：不支持加密压缩包`);
    if (compression !== 0 && compression !== 8) invalid(`${source}：不支持该压缩方式，请重新导出为普通 ZIP`);
    if (data.readUInt16LE(cursor + 34)) invalid(`${source}：不支持分卷压缩包`);
    const rawName = data.subarray(cursor + 46, cursor + 46 + nameLength);
    if (!(flags & 2048) && rawName.some((byte) => byte >= 128)) {
      invalid(`${source}：压缩包文件名不是 UTF-8 编码，请重新导出为 UTF-8 ZIP 后导入`);
    }
    let name: string;
    try {
      name = flags & 2048 ? new TextDecoder("utf-8", { fatal: true }).decode(rawName) : rawName.toString("latin1");
    } catch { invalid(`${source}：压缩包文件名编码无效`); }
    name = archivePath(name, source);
    if (names.has(name)) invalid(`${source}：压缩包包含重复路径 ${name}`);
    names.add(name);
    if (originalSize > MAX_ENTRY_BYTES) invalid(`${source} / ${name}：解压后的单个文件不能超过 5 MiB`);
    if (originalSize > Math.max(1, compressedSize) * MAX_COMPRESSION_RATIO) {
      invalid(`${source} / ${name}：压缩比异常，无法安全导入`);
    }
    expanded += originalSize;
    if (expanded + budget.expandedBytes > MAX_EXPANDED_BYTES) invalid("所有文件解压后的大小合计不能超过 20 MiB");
    if (data.readUInt32LE(localOffset) !== 0x04034b50
      || data.readUInt16LE(localOffset + 6) !== flags
      || data.readUInt16LE(localOffset + 8) !== compression) {
      invalid(`${source} / ${name}：压缩包文件头已损坏`);
    }
    const localNameLength = data.readUInt16LE(localOffset + 26);
    const localExtraLength = data.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > directoryOffset
      || !rawName.equals(data.subarray(localOffset + 30, localOffset + 30 + localNameLength))
      || (!(flags & 8) && (data.readUInt32LE(localOffset + 14) !== crc
        || data.readUInt32LE(localOffset + 18) !== compressedSize
        || data.readUInt32LE(localOffset + 22) !== originalSize))) {
      invalid(`${source} / ${name}：压缩包文件数据已损坏`);
    }
    entries.push({ name, originalSize, compressedSize, compression, crc, dataOffset });
    cursor = next;
  }
  if (cursor !== directoryOffset + directorySize) invalid(`${source}：压缩包目录长度无效`);

  // fflate's filter is deliberately metadata-only. Node's bounded inflater below also
  // protects against forged originalSize values, before any unbounded allocation.
  let inspected = 0;
  unzipSync(data, { filter: (entry) => {
    const expected = entries[inspected++];
    if (!expected || archivePath(entry.name, source) !== expected.name
      || entry.originalSize !== expected.originalSize || entry.size !== expected.compressedSize
      || entry.originalSize > MAX_ENTRY_BYTES) invalid(`${source}：压缩包元数据不一致`);
    return false;
  } });
  if (inspected !== entries.length) invalid(`${source}：压缩包条目不完整`);
  budget.entries += count;
  budget.expandedBytes += expanded;
  return entries;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function unpackArchive(data: Buffer, source: string, budget: ImportBudget): Array<{ name: string; data: Buffer }> {
  try {
    const entries = inspectArchive(data, source, budget);
    return entries.map((entry) => {
      const compressed = data.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
      const content = entry.compression === 0 ? compressed : inflateRawSync(compressed, {
        maxOutputLength: Math.max(1, entry.originalSize),
      });
      if (content.length !== entry.originalSize || crc32(content) !== entry.crc) {
        invalid(`${source} / ${entry.name}：文件长度或校验码不正确，压缩包可能已损坏`);
      }
      return { name: entry.name, data: content };
    });
  } catch (error) {
    if (error instanceof PagesError) throw error;
    invalid(`${source}：压缩包无法解压，文件可能已损坏或超过安全限制`);
  }
}

function textContent(data: Buffer, source: string): string {
  try {
    const encoding = data[0] === 0xff && data[1] === 0xfe ? "utf-16le"
      : data[0] === 0xfe && data[1] === 0xff ? "utf-16be" : "utf-8";
    const decoded = new TextDecoder(encoding, { fatal: true }).decode(data);
    if (decoded.includes("\0")) invalid(`${source}：文件包含二进制内容，不能作为文本导入`);
    return decoded;
  } catch (error) {
    if (error instanceof PagesError) throw error;
    invalid(`${source}：文本编码无效，请另存为 UTF-8 后导入`);
  }
}

function uploadBytes(file: PagesImportFile): Buffer {
  if (!file || typeof file.name !== "string" || !file.name.trim() || file.name.length > 1024
    || /[\u0000-\u001f]/.test(file.name) || typeof file.data !== "string") invalid("导入文件信息无效");
  if (file.data.length > 4 * Math.ceil(MAX_UPLOAD_BYTES / 3)) invalid(`${file.name}：单个文件不能超过 10 MiB`);
  if (file.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) {
    invalid(`${file.name}：上传文件编码无效`);
  }
  const data = Buffer.from(file.data, "base64");
  if (data.length > MAX_UPLOAD_BYTES) invalid(`${file.name}：单个文件不能超过 10 MiB`);
  return data;
}

export async function preparePagesImport(files: readonly PagesImportFile[]): Promise<PreparedPagesImport> {
  if (!Array.isArray(files) || !files.length) invalid("请选择需要导入的文件");
  if (files.length > MAX_DOCUMENTS) invalid(`一次最多选择 ${MAX_DOCUMENTS} 个文件`);
  let uploadTotal = 0;
  const uploads = files.map((file) => {
    const data = uploadBytes(file);
    uploadTotal += data.length;
    if (uploadTotal > MAX_UPLOAD_BYTES) invalid("上传文件大小合计不能超过 10 MiB");
    return { name: file.name, data };
  });
  const result: PreparedPagesImport = { documents: [], warnings: [] };
  const budget: ImportBudget = { expandedBytes: 0, entries: 0 };

  async function addDocument(name: string, data: Buffer): Promise<void> {
    const ext = extension(name);
    const format = Object.hasOwn(FORMATS, ext) ? FORMATS[ext] : undefined;
    if (!format && ext !== "docx") {
      result.warnings.push(ext === "zip" ? `已跳过嵌套压缩包 ${name}，请解压后单独导入。` : `已跳过不支持的文件或附件 ${name}。`);
      return;
    }
    if (result.documents.length >= MAX_DOCUMENTS) invalid(`一次最多导入 ${MAX_DOCUMENTS} 篇文档，请分批导入`);
    try {
      let converted;
      const warnings: string[] = [];
      if (ext === "docx") {
        const entries = unpackArchive(data, name, budget);
        if (!entries.some((entry) => entry.name === "[Content_Types].xml")
          || !entries.some((entry) => entry.name === "word/document.xml")) invalid(`${name}：不是有效的 Word DOCX 文档`);
        // Repackage verified bytes so Mammoth never inflates unchecked, forged entries.
        const safeEntries: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
        for (const entry of entries) safeEntries[entry.name] = entry.data;
        let imageCount = 0;
        const html = await mammoth.convertToHtml({ buffer: Buffer.from(zipSync(safeEntries, { level: 0 })) }, {
          externalFileAccess: false,
          styleMap: ["u => u"],
          convertImage: mammoth.images.imgElement(async () => {
            imageCount++;
            return { src: "" };
          }),
        });
        if (imageCount) warnings.push(`文档包含 ${imageCount} 张图片；Pages 暂不支持图片，已保留文字说明。`);
        for (const message of html.messages) warnings.push(`Word 转换提示：${message.message}`);
        converted = convertImportContent({ name, format: "html", content: html.value });
      } else {
        if (!format) invalid(`${name}：不支持这种文档格式`);
        converted = convertImportContent({ name, format, content: textContent(data, name) });
      }
      result.documents.push({
        key: `document-${result.documents.length + 1}`, name,
        title: converted.title, body: converted.body,
        warnings: [...new Set([...warnings, ...converted.warnings])],
      });
    } catch (error) {
      if (error instanceof PagesError) {
        throw new PagesError(error.code, error.message.startsWith(`${name}：`) ? error.message : `${name}：${error.message}`);
      }
      invalid(`${name}：文档转换失败，文件可能已损坏`);
    }
  }

  for (const upload of uploads) {
    if (extension(upload.name) !== "zip") {
      await addDocument(upload.name, upload.data);
      continue;
    }
    const entries = unpackArchive(upload.data, upload.name, budget);
    let metadataCount = 0;
    for (const entry of entries) {
      if (entry.name.endsWith("/")) continue;
      if (entry.name.split("/").some((part) => part === "__MACOSX" || part === ".DS_Store" || part.startsWith("._"))) {
        metadataCount++;
        continue;
      }
      await addDocument(`${upload.name} / ${entry.name}`, entry.data);
    }
    if (metadataCount) result.warnings.push(`${upload.name}：已忽略 ${metadataCount} 个系统元数据文件。`);
  }
  if (!result.documents.length) invalid("没有可导入的文档；请选择 Markdown、HTML、TXT、CSV、DOCX 或包含这些文件的 ZIP");
  return result;
}
