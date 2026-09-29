export function markdownFromExtract(sourceName: string, text: string): string {
  return `# ${sourceName.replace(/\.[^.]+$/, "")}\n\n${text.trim()}\n`;
}

export function resultNameForExtract(kind: string): string {
  if (kind === "pdf") return "pdf.md";
  return kind === "image" ? "ocr.md" : "extract.md";
}
