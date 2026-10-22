import { MATERIAL_EXTENSIONS } from "@molis-ai/molis-work-plugin-sdk";
import type { MaterialExtraction, MaterialExtractionOptions } from "@molis-ai/molis-work-contracts/services/materials";
import { extractMaterial } from "./material-extraction.js";
import { extractHomeMaterial } from "./material-home.js";
import { isMaterialFailure } from "./material-text.js";
import { runMaterialWorker } from "./material-worker.js";

/** What officeparser reads, by extension (the worker is told the type; it never sniffs a PDF or anything else). */
const OFFICE: Record<string, string> = { docx: "docx", pptx: "pptx", xlsx: "xlsx", odt: "odt", ods: "ods", odp: "odp", rtf: "rtf", epub: "epub" };
const IMAGE = new Set<string>(MATERIAL_EXTENSIONS.image.map(extension => extension.slice(1)));
const MEDIA = new Set<string>(MATERIAL_EXTENSIONS.media.map(extension => extension.slice(1)));
const OCR: Pick<MaterialExtractionOptions, "ocrLanguages"> = { ocrLanguages: ["zh-Hans", "en-US"] };
/** The import waits for the text (user 2026-10-19: during import, with a time limit); past it the original is kept without text. */
const LIMIT_MS = { office: 60_000, pdf: 60_000, image: 60_000, scan: 120_000, media: 300_000 };
/** A transcription the person agreed may first download the speech model (about 600 MB): the download gets its own time (PMAT-48). */
const DOWNLOAD_LIMIT_MS = 30 * 60_000;

const NAME_ONLY = "只保存了原件；Agent 只能看到它的名字。";
const UNREADABLE = `读不出这个文件的正文，${NAME_ONLY}`;
/** `model_required`: the transcription needs the local speech model, not downloaded; the import's caller can ask and import again (PMAT-48). */
type OriginalText = { text: string; warnings: string[]; model_required?: { approximate_bytes: number | null } };
interface OriginalTextOptions {
  signal?: AbortSignal;
  /** Only the person's explicit yes, decided by the Host from a trusted user caller (S-39); never a default. */
  allowModelDownload?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}
const nameOnly = (why: string): OriginalText => ({ text: "", warnings: [`${why}，${NAME_ONLY}`] });

/** The bytes as text when they are valid UTF-8 with no NUL (a binary file almost always has one); null otherwise. */
function utf8Text(bytes: Buffer): string | null {
  if (!bytes.length || bytes.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/u, "").trim() || null; } catch { return null; }
}

/** Why the macOS helper gave no text, said as the import's warning (a failure the person can act on keeps its own words). */
function nativeFailure(error: unknown, what: "识别" | "转写"): OriginalText {
  if (!isMaterialFailure(error)) return { text: "", warnings: [UNREADABLE] };
  if (error.code === "material.native_unavailable") return nameOnly(what === "识别" ? "这台电脑不能识别文字（需要 macOS 的文字识别组件）" : "这台电脑不能转写音视频（需要 macOS 的转写组件）");
  if (error.code === "material.model_required") {
    const bytes = (error.details as { approximate_bytes?: unknown } | undefined)?.approximate_bytes;
    const size = typeof bytes === "number" && bytes > 0 ? bytes : null;
    return { text: "", model_required: { approximate_bytes: size },
      warnings: [`没有转成文字，${NAME_ONLY}转写要先下载本机语音模型${size ? `（约 ${Math.round(size / 1024 / 1024)} MB）` : ""}，同意下载后重新导入即可。`] };
  }
  if (error.code === "material.timeout") return nameOnly(what === "识别" ? "识别文字超时" : "转写超时");
  return nameOnly(what === "识别" ? "识别文字失败" : "转写失败");
}

/**
 * The text of an original the import keeps as it is (specs/project-knowledge PMAT-14, PMAT-44, PMAT-47): Office, OpenDocument, RTF
 * and EPUB as Markdown (officeparser, in a worker); a PDF's text layer, recognized when it has none; an image's recognized text and
 * an audio or video file's transcript (the macOS helpers); and any other file that is plain UTF-8 text. A file it cannot read is
 * still imported, with a note saying why and no text (it then gets a card from its name and is not sent to a model).
 */
export async function readOriginalText(file: { filename: string; data_base64: string }, home: string, options: OriginalTextOptions = {}): Promise<OriginalText> {
  const { signal } = options;
  const extension = file.filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
  const source = { file_name: file.filename, bytes: Buffer.from(file.data_base64, "base64") };
  const within = (timeoutMs: number) => ({ ...(signal ? { signal } : {}), timeoutMs });
  const native = async (options: MaterialExtractionOptions, what: "识别" | "转写", empty: string): Promise<OriginalText> => {
    let read: MaterialExtraction;
    try { read = await extractHomeMaterial(home, source, options); }
    catch (error) { signal?.throwIfAborted(); return nativeFailure(error, what); }
    return read.text.trim() ? { text: read.text, warnings: what === "识别" ? ["正文是识别出的文字，可能有错字；原件完整保存。"] : ["正文是转写出的文字，可能有错字；原件完整保存。"] } : nameOnly(empty);
  };
  try {
    if (OFFICE[extension]) {
      const read = await runMaterialWorker<{ text: string }>("material-office-worker.js", { bytes: new Uint8Array(source.bytes), type: OFFICE[extension] }, within(LIMIT_MS.office), "文档");
      return read.text ? { text: read.text, warnings: [] } : nameOnly("这个文件里没有读出文字");
    }
    if (IMAGE.has(extension)) return await native({ ...within(LIMIT_MS.image), ...OCR }, "识别", "图片里没有识别出文字");
    if (MEDIA.has(extension)) {
      // Only a transcription may download the model, and only when the person said yes; then its progress is shown (PMAT-48).
      const download = options.allowModelDownload === true;
      return await native({ ...within(download ? DOWNLOAD_LIMIT_MS : LIMIT_MS.media), ...download ? { allowModelDownload: true } : {},
        ...options.onProgress ? { onProgress: options.onProgress } : {} }, "转写", "没有转写出文字");
    }
    if (extension !== "pdf") {
      // Any other file that is plain UTF-8 text (a CSV, JSON, YAML, source code) is its own text; anything else keeps only its name.
      const text = utf8Text(source.bytes);
      return text !== null ? { text, warnings: [] } : { text: "", warnings: [UNREADABLE] };
    }
    const layer = await extractMaterial(source, { ...within(LIMIT_MS.pdf), pdfMode: "text", textFormat: "markdown" });
    if (layer.coverage.status === "sufficient") return { text: layer.text, warnings: [] };
    // Scanned pages have no text layer: recognize the whole PDF, and keep whichever reading has more text.
    const scanned = await native({ ...within(LIMIT_MS.scan), ...OCR, pdfMode: "ocr" }, "识别", "这份 PDF 没有可读的文字层，也没有识别出文字");
    if (scanned.text.length > layer.text.trim().length) return { text: scanned.text, warnings: ["PDF 有扫描页，正文是识别出的文字，可能有错字；原件完整保存。"] };
    return layer.text.trim() ? { text: layer.text, warnings: ["PDF 里只读出了部分文字（扫描页没有文字层）；原件完整保存。"] } : scanned;
  } catch {
    signal?.throwIfAborted();
    return { text: "", warnings: [UNREADABLE] };
  }
}
