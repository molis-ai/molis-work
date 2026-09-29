import { createHash } from "node:crypto";
import { pagesSchema, nodesToMarkdown } from "@molis-ai/molis-work-plugin-pages";
import { preparePagesFileImport } from "./pages-import.js";
import { extractMaterial } from "./material-extraction.js";
import type { ContextReference, ContextSourceKind, ImportFile } from "./context-onboarding-store.js";

/** Extract locally after explicit start. Originals stay in the journey until project adoption. */
export async function prepareContextDocuments(kind: ContextSourceKind, files: ImportFile[], signal?: AbortSignal) {
  const references: ContextReference[] = [], issues: { path: string; reason: string }[] = [];
  for (const file of files) {
    signal?.throwIfAborted();
    try {
      if (file.reason || file.data === undefined) throw new Error(file.reason || "没有读取到文件");
      const bytes = Buffer.from(file.data, "base64"), filename = file.path.split("/").at(-1)!;
      if (bytes.length > 6_000_000) throw new Error("文件超过 6 MB");
      let body = "", title = filename.replace(/\.[^.]+$/u, ""), mime = "text/plain";
      if (/\.docx$/iu.test(filename)) {
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const result = await preparePagesFileImport([{ name: filename, data: file.data }], { signal });
        const doc = result.documents[0]!;
        body = nodesToMarkdown(pagesSchema.nodeFromJSON(doc.body).content.content);
        title = doc.title || title;
      } else {
        const result = await extractMaterial({ file_name: filename, bytes }, { signal, textFormat: "markdown", pdfMode: "text",
          limits: { maxBytes: 6_000_000, maxCharacters: 2_000_000, maxTextBytes: 2_000_000, maxPages: 200 } });
        body = result.text; title = result.title || title;
        if (/\.pdf$/iu.test(filename)) {
          mime = "application/pdf";
          if (result.coverage.status !== "sufficient") throw new Error(result.coverage.issues.join("；") || "PDF 没有可读取的文本层");
        } else {
          // HTML omits external content by design; a capacity truncation must still reject the import.
          if (result.coverage.truncated) throw new Error("正文超过 2 MB，请拆分后导入");
          if (/\.html?$/iu.test(filename)) mime = "text/html";
          else if (/\.(md|markdown)$/iu.test(filename)) mime = "text/markdown";
        }
      }
      signal?.throwIfAborted();
      if (!body.trim()) throw new Error("文件没有可读取的正文");
      if (Buffer.byteLength(body) > 2_000_000) throw new Error("正文超过 2 MB，请拆分后导入");
      references.push({ source_id: createHash("sha256").update(JSON.stringify([kind, file.path, file.data])).digest("hex"),
        version: 1, label: "", title: title.slice(0, 500), path: file.path, body: body.trim(),
        original: { filename, mime, data_base64: file.data } });
    } catch (error) {
      signal?.throwIfAborted();
      const message = error instanceof Error ? error.message : "无法读取文件";
      issues.push({ path: file.path, reason: /password/iu.test(message) ? "PDF 已加密，请解密后导入" : message.slice(0, 600) });
    }
  }
  return { references, issues };
}
