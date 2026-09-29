export interface ShelfOcrLine {
  readonly text: string;
  readonly confidence: number | null;
}

export const OCR_LOW_CONFIDENCE = 0.5;
export const OCR_MISSING = "这台机器还没有本机文字识别";

export function ocrLanguages(choiceId: string | null | undefined): ("zh-Hans" | "en-US")[] {
  if (choiceId === "zh") return ["zh-Hans"];
  if (choiceId === "en") return ["en-US"];
  return ["zh-Hans", "en-US"];
}

/** DropAgent `ImageText.markdown`: one line each, low confidence marked. */
export function ocrMarkdown(pages: readonly { name: string; lines: readonly ShelfOcrLine[] }[]): string {
  if (!pages.length) return "没有识别到文字。\n";
  const blocks = pages.map((page) => {
    const lines: string[] = [];
    if (pages.length > 1) {
      lines.push(`## ${page.name}`, "");
    }
    if (!page.lines.length) {
      lines.push("没有识别到文字。");
    } else {
      for (const line of page.lines) {
        lines.push(line.confidence === null || line.confidence < OCR_LOW_CONFIDENCE ? `${line.text}（待确认）` : line.text);
      }
    }
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}
