import { tryUiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export interface ShelfOcrLine {
  readonly text: string;
  readonly confidence: number | null;
}

export type ShelfOcrLanguage = "zh-Hans" | "en-US" | "ja-JP";

const OCR_LANGUAGE_CHOICES: Readonly<Record<string, readonly ShelfOcrLanguage[]>> = {
  zh: ["zh-Hans"],
  en: ["en-US"],
  ja: ["ja-JP"],
};
const DEFAULT_OCR_LANGUAGES: readonly ShelfOcrLanguage[] = ["zh-Hans", "en-US", "ja-JP"];

export const OCR_LOW_CONFIDENCE = 0.5;
export const OCR_MISSING = "这台机器还没有本机文字识别";

export function ocrMissingText(): string {
  return tryUiText("shelf.bar.this-mac-has-no-on") ?? OCR_MISSING;
}

export function ocrLanguages(choiceId: string | null | undefined): ShelfOcrLanguage[] {
  if (choiceId && Object.hasOwn(OCR_LANGUAGE_CHOICES, choiceId)) {
    return [...OCR_LANGUAGE_CHOICES[choiceId]!];
  }
  return [...DEFAULT_OCR_LANGUAGES];
}

/** DropAgent `ImageText.markdown`: one line each, low confidence marked. */
export function ocrMarkdown(pages: readonly { name: string; lines: readonly ShelfOcrLine[] }[]): string {
  const noText = () => tryUiText("shelf.ocr.no-text") ?? "没有识别到文字。";
  const uncertain = (text: string) => tryUiText("shelf.ocr.uncertain", { text }) ?? `${text}（待确认）`;
  if (!pages.length) return `${noText()}\n`;
  const blocks = pages.map((page) => {
    const lines: string[] = [];
    if (pages.length > 1) {
      lines.push(`## ${page.name}`, "");
    }
    if (!page.lines.length) {
      lines.push(noText());
    } else {
      for (const line of page.lines) {
        lines.push(line.confidence === null || line.confidence < OCR_LOW_CONFIDENCE ? uncertain(line.text) : line.text);
      }
    }
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}
