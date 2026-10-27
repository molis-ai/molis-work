import type { MaterialExtraction } from "@molis-ai/molis-work-contracts/services/materials";

export function markdownFromExtract(sourceName: string, text: string): string {
  return `# ${sourceName.replace(/\.[^.]+$/, "")}\n\n${text.trim()}\n`;
}

export function resultNameForExtract(kind: string): string {
  if (kind === "pdf") return "pdf.md";
  return kind === "image" ? "ocr.md" : "extract.md";
}

export function extractionText(extracted: MaterialExtraction): string {
  return extracted.text + extractionNote(extracted);
}

export function extractionNote(extracted: MaterialExtraction): string {
  const incomplete = extracted.coverage.status !== "sufficient" || extracted.coverage.truncated;
  return incomplete ? `\n\n提取说明：${extracted.coverage.issues.join("；") || "仅提取了部分内容，请核对原件"}` : "";
}
