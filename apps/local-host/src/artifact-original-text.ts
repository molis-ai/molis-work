import { MATERIAL_EXTENSIONS } from "@molis-ai/molis-work-plugin-sdk";
import type { ImportedDocumentWarning } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { MaterialExtraction, MaterialExtractionOptions } from "@molis-ai/molis-work-contracts/services/materials";
import { extractMaterial } from "./material-extraction.js";
import { extractHomeMaterial } from "./material-home.js";
import { isMaterialFailure } from "./material-text.js";
import { runMaterialWorker } from "./material-worker.js";

/** What officeparser reads, by extension (the worker is told the type; it never sniffs a PDF or anything else). */
const OFFICE: Record<string, string> = { docx: "docx", pptx: "pptx", xlsx: "xlsx", odt: "odt", ods: "ods", odp: "odp", rtf: "rtf", epub: "epub" };
const IMAGE = new Set<string>(MATERIAL_EXTENSIONS.image.map(extension => extension.slice(1)));
/** Audio and video are kept as originals only: nothing on this machine transcribes them (batch 112, user 2026-11-25). */
const MEDIA = new Set(["mp3", "wav", "m4a", "aac", "aiff", "aif", "flac", "ogg", "mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const OCR: Pick<MaterialExtractionOptions, "ocrLanguages"> = { ocrLanguages: ["zh-Hans", "en-US", "ja-JP"] };
/** The import waits for the text (user 2026-10-19: during import, with a time limit); past it the original is kept without text. */
const LIMIT_MS = { office: 60_000, pdf: 60_000, image: 60_000, scan: 120_000 };

type OriginalText = { text: string; warnings: ImportedDocumentWarning[] };
interface OriginalTextOptions { signal?: AbortSignal }
const nameOnly = (key: string): OriginalText => ({ text: "", warnings: [{ key }] });
const unreadable = () => nameOnly("workbench.import.warning-unreadable");

/** The bytes as text when they are valid UTF-8 with no NUL (a binary file almost always has one); null otherwise. */
function utf8Text(bytes: Buffer): string | null {
  if (!bytes.length || bytes.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/u, "").trim() || null; } catch { return null; }
}

/** Why the macOS helper gave no text, said as the import's warning (a failure the person can act on keeps its own words). */
function nativeFailure(error: unknown): OriginalText {
  if (!isMaterialFailure(error)) return unreadable();
  if (error.code === "material.native_unavailable") return nameOnly("workbench.import.warning-ocr-unavailable");
  if (error.code === "material.timeout") return nameOnly("workbench.import.warning-ocr-timeout");
  return nameOnly("workbench.import.warning-ocr-failed");
}

/**
 * The text of an original the import keeps as it is (specs/project-knowledge PMAT-14, PMAT-44, PMAT-47): Office, OpenDocument, RTF
 * and EPUB as Markdown (officeparser, in a worker); a PDF's text layer, recognized when it has none; an image's recognized text
 * (the macOS helper); and any other file that is plain UTF-8 text. Audio and video, and any file it cannot read, are still imported,
 * with a note saying why and no text (they then get a card from their name and are not sent to a model).
 */
export async function readOriginalText(file: { filename: string; bytes: Buffer }, home: string, options: OriginalTextOptions = {}): Promise<OriginalText> {
  const { signal } = options;
  const extension = file.filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
  const source = { file_name: file.filename, bytes: file.bytes };
  const within = (timeoutMs: number) => ({ ...(signal ? { signal } : {}), timeoutMs });
  const native = async (options: MaterialExtractionOptions, empty: string): Promise<OriginalText> => {
    let read: MaterialExtraction;
    try { read = await extractHomeMaterial(home, source, options); }
    catch (error) { signal?.throwIfAborted(); return nativeFailure(error); }
    return read.text.trim() ? { text: read.text, warnings: [{ key: "workbench.import.warning-ocr-text" }] } : nameOnly(empty);
  };
  try {
    if (OFFICE[extension]) {
      const read = await runMaterialWorker<{ text: string }>("material-office-worker.js", { bytes: new Uint8Array(source.bytes), type: OFFICE[extension] }, within(LIMIT_MS.office), "文档");
      return read.text ? { text: read.text, warnings: [] } : nameOnly("workbench.import.warning-empty-document");
    }
    if (IMAGE.has(extension)) return await native({ ...within(LIMIT_MS.image), ...OCR }, "workbench.import.warning-empty-image");
    if (MEDIA.has(extension)) return nameOnly("workbench.import.warning-media-original-only");
    if (extension !== "pdf") {
      // Any other file that is plain UTF-8 text (a CSV, JSON, YAML, source code) is its own text; anything else keeps only its name.
      const text = utf8Text(source.bytes);
      return text !== null ? { text, warnings: [] } : unreadable();
    }
    const layer = await extractMaterial(source, { ...within(LIMIT_MS.pdf), pdfMode: "text", textFormat: "markdown" });
    if (layer.coverage.status === "sufficient") return { text: layer.text, warnings: [] };
    // Scanned pages have no text layer: recognize the whole PDF, and keep whichever reading has more text.
    const scanned = await native({ ...within(LIMIT_MS.scan), ...OCR, pdfMode: "ocr" }, "workbench.import.warning-empty-pdf");
    if (scanned.text.length > layer.text.trim().length) return { text: scanned.text, warnings: [{ key: "workbench.import.warning-scanned-pdf" }] };
    return layer.text.trim() ? { text: layer.text, warnings: [{ key: "workbench.import.warning-partial-pdf" }] } : scanned;
  } catch {
    signal?.throwIfAborted();
    return unreadable();
  }
}
