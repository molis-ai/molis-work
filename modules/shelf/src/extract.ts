import { extractPdfSelectableText } from "./pdf.js";

export function extractLocalText(bytes: Uint8Array, kind: string, mime = ""): string {
  if (kind === "pdf" || mime === "application/pdf") {
    const text = extractPdfSelectableText(bytes);
    if (!text) throw new Error("这份 PDF 没有可抽取的文字");
    return text;
  }
  if (kind === "text" || kind === "markdown" || mime.startsWith("text/")) {
    return Buffer.from(bytes).toString("utf8");
  }
  throw new Error("这种材料还不能在本机抽字");
}

export function markdownFromExtract(sourceName: string, text: string): string {
  return `# ${sourceName.replace(/\.[^.]+$/, "")}\n\n${text.trim()}\n`;
}

export function resultNameForExtract(kind: string): string {
  return kind === "pdf" ? "pdf.md" : "extract.md";
}
