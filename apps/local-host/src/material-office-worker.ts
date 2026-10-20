import { parentPort, workerData } from "node:worker_threads";
import { parseOffice } from "officeparser";

// Office, OpenDocument, RTF and EPUB as Markdown, through officeparser (specs/project-knowledge PMAT-47). Runs in its own worker
// with a memory cap, like the PDF and HTML readers: the bytes are an untrusted upload. No OCR (images are the macOS helper's),
// no attachments, no comments; the zip limits stop an archive that inflates past what the import keeps.
try {
  const ast = await parseOffice(Buffer.from(workerData.bytes as Uint8Array), {
    fileType: workerData.type, ocr: false, extractAttachments: false, ignoreComments: true, ignoreHeadersAndFooters: true, includeRawContent: false,
    decompressionLimits: { maxUncompressedBytes: 64 * 1024 * 1024, maxZipEntries: 5_000 },
  });
  const converted = await ast.to("md", { generateIds: false, includeFormatting: false, mdConfig: { fallbackToHtml: false, dialect: "github" } });
  // The Markdown generator always writes the document's metadata as YAML front matter; the title is the import's, the rest is noise.
  const text = String(converted.value).replace(/^---\n[\s\S]*?\n---\n+/u, "").replace(/^(?:---\n+)+/u, "").trim();
  parentPort!.postMessage({ result: { text } });
} catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : "文档提取失败" }); }
