import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ShelfError } from "./errors.js";

/**
 * On-device text recognition, DropAgent's `ImageText`. The recognizer is a
 * small native helper the desktop app ships; without it images simply cannot
 * be read here, and the shelf says so instead of calling anything remote.
 */
export interface ShelfOcrLine {
  readonly text: string;
  readonly confidence: number;
}

export const OCR_LOW_CONFIDENCE = 0.5;
export const OCR_MISSING = "这台机器还没有本机文字识别";
export const OCR_UNREADABLE = "打不开这张图";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function ocrLanguages(choiceId: string | null | undefined): string[] {
  if (choiceId === "zh") return ["zh-Hans"];
  if (choiceId === "en") return ["en-US"];
  return ["zh-Hans", "en-US"];
}

export function ocrHelperPath(): string | null {
  const configured = process.env.MOLIS_WORK_OCR_BIN;
  if (configured) return existsSync(configured) ? configured : null;
  const candidates = [
    path.join(path.dirname(process.execPath), "molis-work-ocr"),
    path.join(HERE, "../../../apps/desktop/src-tauri/target/release/molis-work-ocr"),
    path.join(HERE, "../../../apps/desktop/src-tauri/target/debug/molis-work-ocr"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function imageTextAvailable(): boolean {
  return ocrHelperPath() !== null;
}

export function recognizeImageText(file: string, languages: readonly string[]): ShelfOcrLine[] {
  const helper = ocrHelperPath();
  if (!helper) throw new ShelfError("shelf.no_ocr", OCR_MISSING);
  const result = spawnSync(helper, [file, languages.join(",")], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const reason = (result.stderr ?? "").trim();
    throw new ShelfError("shelf.ocr_failed", reason || OCR_UNREADABLE);
  }
  try {
    const parsed = JSON.parse(result.stdout ?? "{}") as { lines?: ShelfOcrLine[] };
    return (parsed.lines ?? []).filter((line) => typeof line.text === "string" && line.text.trim().length > 0);
  } catch {
    throw new ShelfError("shelf.ocr_failed", OCR_UNREADABLE);
  }
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
        lines.push(line.confidence < OCR_LOW_CONFIDENCE ? `${line.text}（待确认）` : line.text);
      }
    }
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}
