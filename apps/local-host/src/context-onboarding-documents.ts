import { createHash } from "node:crypto";
import { readWholeMaterial } from "./material-extraction.js";
import type { ContextReference, ContextSourceKind, ImportFile } from "./context-onboarding-store.js";
import { diskFull, readStagedFile, stageContextText, stageContextUpload, unreadableReason } from "./context-onboarding-staging.js";

const MIME: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html", htm: "text/html", md: "text/markdown", markdown: "text/markdown" };

/**
 * One file read in full after the explicit start (no limits, user 2026-10-22): its bytes come from the journey's staging (or are staged
 * first), its whole text is staged beside them, and the reference names both by digest. A file that cannot be read is an issue of
 * its own and never stops the others.
 */
export async function prepareContextDocument(home: string, journeyId: string, kind: ContextSourceKind, file: ImportFile, signal?: AbortSignal)
  : Promise<{ reference: ContextReference } | { issue: { path: string; reason: string } }> {
  signal?.throwIfAborted();
  try {
    if (file.reason || (file.staged === undefined && file.bytes === undefined)) throw new Error(file.reason || "没有读取到文件");
    const original = file.bytes ? await stageContextUpload(home, journeyId, file.bytes) : null;
    const sha256 = original?.sha256 ?? file.staged!;
    const bytes = file.bytes ?? await readStagedFile(home, journeyId, sha256), filename = file.path.split("/").at(-1)!;
    const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
    const result = await readWholeMaterial({ file_name: filename, bytes }, signal);
    signal?.throwIfAborted();
    if (extension === "pdf" && result.coverage.status !== "sufficient") throw new Error(result.coverage.issues.join("；") || "PDF 没有可读取的文本层");
    const body = result.text.trim();
    if (!body) throw new Error("文件没有可读取的正文");
    const title = [...(result.title || filename.replace(/\.[^.]+$/u, ""))].slice(0, 500).join("");
    return { reference: { source_id: createHash("sha256").update(JSON.stringify([kind, file.path, sha256])).digest("hex"),
      version: 1, label: "", title, path: file.path, text: await stageContextText(home, journeyId, body),
      original: { filename, mime: MIME[extension] ?? "text/plain", sha256, size_bytes: bytes.length } } };
  } catch (error) {
    signal?.throwIfAborted();
    // A full disk is not this file's fault: the round stops and goes on at this file once there is room.
    if (diskFull(error)) throw error;
    const message = error instanceof Error ? error.message : "无法读取文件";
    return { issue: { path: file.path, reason: unreadableReason(error) ?? (/password/iu.test(message) ? "PDF 已加密，请解密后导入" : message.slice(0, 600)) } };
  }
}
