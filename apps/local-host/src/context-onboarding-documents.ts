import { createHash } from "node:crypto";
import { preparePagesImport, pagesSchema, nodesToMarkdown } from "@molis-ai/molis-work-plugin-pages";
import { documentTitle, htmlToMarkdown } from "@molis-ai/molis-work-module-shelf";
import type { ContextReference, ContextSourceKind, ImportFile } from "./context-onboarding-store.js";

/** Extract locally after explicit start. Originals stay in the journey until project adoption. */
export async function prepareContextDocuments(kind: ContextSourceKind, files: ImportFile[]) {
  const references: ContextReference[] = [], issues: { path: string; reason: string }[] = [];
  for (const file of files) {
    try {
      if (file.reason || file.data === undefined) throw new Error(file.reason || "没有读取到文件");
      const bytes = Buffer.from(file.data, "base64"), filename = file.path.split("/").at(-1)!;
      if (bytes.length > 6_000_000) throw new Error("文件超过 6 MB");
      let body = "", title = filename.replace(/\.[^.]+$/u, ""), mime = "text/plain";
      if (/\.pdf$/iu.test(filename)) {
        mime = "application/pdf";
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false,
          disableFontFace: true, useWorkerFetch: false, isOffscreenCanvasSupported: false, verbosity: 0 });
        try {
          const pdf = await task.promise;
          if (pdf.numPages > 200) throw new Error("PDF 超过 200 页，请拆分后导入");
          for (let page = 1; page <= pdf.numPages; page++) {
            const view = await pdf.getPage(page), text = await view.getTextContent();
            body += text.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n\n";
            view.cleanup();
            if (Buffer.byteLength(body) > 2_000_000) throw new Error("抽取正文超过 2 MB，请拆分后导入");
          }
          if (!body.trim()) throw new Error("PDF 没有可读取的文本层；扫描件需要先转换为文字");
        } finally { await task.destroy(); }
      } else if (/\.docx$/iu.test(filename)) {
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const result = await preparePagesImport([{ name: filename, data: file.data }]);
        const doc = result.documents[0]!;
        body = nodesToMarkdown(pagesSchema.nodeFromJSON(doc.body).content.content);
        title = doc.title || title;
      } else {
        body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(body)) throw new Error("文件不是可读取的 UTF-8 文本");
        if (/\.html?$/iu.test(filename)) { mime = "text/html"; title = documentTitle(body) || title; body = htmlToMarkdown(body); }
        else if (/\.(md|markdown)$/iu.test(filename)) { mime = "text/markdown"; title = /^# ([^\r\n]+)/mu.exec(body)?.[1] ?? title; }
      }
      if (!body.trim()) throw new Error("文件没有可读取的正文");
      if (Buffer.byteLength(body) > 2_000_000) throw new Error("正文超过 2 MB，请拆分后导入");
      references.push({ source_id: createHash("sha256").update(JSON.stringify([kind, file.path, file.data])).digest("hex"),
        version: 1, label: "", title: title.slice(0, 500), path: file.path, body: body.trim(),
        original: { filename, mime, data_base64: file.data } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取文件";
      issues.push({ path: file.path, reason: /password/iu.test(message) ? "PDF 已加密，请解密后导入" : message.slice(0, 600) });
    }
  }
  return { references, issues };
}
