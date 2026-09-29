import type { AgentDocumentParser } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * PDF text for the Agent runtime's document parser slot (Prologue ships no parser). The text layer only: a scanned
 * page has none and fails in words, an encrypted file says so — never an empty text that reads as “the file is empty”.
 */
export const pdfDocumentParser: AgentDocumentParser = {
  mediaTypes: ["application/pdf"],
  async parse({ bytes, maxChars }) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, useWorkerFetch: false, isOffscreenCanvasSupported: false, verbosity: 0 });
    try {
      const pdf = await task.promise.catch((error: unknown) => {
        throw new Error(/password/iu.test(error instanceof Error ? error.message : String(error)) ? "PDF 已加密，请解密后再带进来" : "PDF 打不开（文件可能损坏）");
      });
      let text = "";
      for (let page = 1; page <= pdf.numPages && text.length < maxChars; page++) {
        const view = await pdf.getPage(page), content = await view.getTextContent();
        text += content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n\n";
        view.cleanup();
      }
      if (!text.trim()) throw new Error("PDF 没有可读取的文本层（可能是扫描件），需要先转成文字");
      return { text: text.trim(), pages: pdf.numPages };
    } finally { await task.destroy(); }
  },
};
