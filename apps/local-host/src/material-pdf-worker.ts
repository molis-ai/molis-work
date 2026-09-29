import { parentPort, workerData } from "node:worker_threads";
import type { MaterialExtraction, MaterialLimits } from "@molis-ai/molis-work-contracts/services/materials";
import { boundedMaterialText } from "./material-text.js";

async function extract(bytes: Uint8Array, limits: MaterialLimits): Promise<MaterialExtraction> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true,
    useWorkerFetch: false, isOffscreenCanvasSupported: false, verbosity: 0 });
  try {
    const pdf = await task.promise, pages: MaterialExtraction["pages"] = [], issues: string[] = [];
    let text = "", truncated = pdf.numPages > limits.maxPages;
    if (pdf.numPages > limits.maxPages) issues.push(`PDF 超过 ${limits.maxPages} 页，未提取全部页面`);
    for (let number = 1; number <= Math.min(pdf.numPages, limits.maxPages); number++) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const raw = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
        if (!raw) issues.push(`第 ${number} 页没有可读取的文本层；扫描件需要先转换为文字`);
        const separator = text ? "\n\n" : "";
        const available = { maxCharacters: Math.max(0, limits.maxCharacters - text.length - separator.length),
          maxTextBytes: Math.max(0, limits.maxTextBytes - Buffer.byteLength(text + separator)) };
        const body = boundedMaterialText(raw, available);
        pages.push({ number, text: body, method: "pdf-text", confidence: null });
        if (body) text += separator + body;
        if (body !== raw) { truncated = true; issues.push("PDF 正文达到提取容量上限，未提取全部内容"); break; }
      } finally { page.cleanup(); }
    }
    return { text, extractor: "pdfjs-text", pages, coverage: { status: !text ? "insufficient" : issues.length ? "partial" : "sufficient",
      truncated, processed_pages: pages.length, total_pages: pdf.numPages, issues } };
  } finally { await task.destroy(); }
}

try { parentPort!.postMessage({ result: await extract(workerData.bytes, workerData.limits) }); }
catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : "PDF 提取失败" }); }
