import type { UiFileResult } from "@molis-ai/molis-work-contracts/platform/ui";
import { readStrictJson } from "./file-reader.js";

export interface StrictJsonOptions {
  /** Which file, for the problems. */
  readonly file?: string;
  /** Compared with the source's bytes before anything is parsed. */
  readonly maxBytes?: number;
  readonly maxDepth?: number;
}

/**
 * JSON where a repeated property name, `__proto__`, `constructor` and `prototype` are refused before `JSON.parse` could let them pass: an ordinary
 * parser keeps the last of two equal names without a word. Problems carry the path (`$.light.ink`), the line and the column.
 */
export function parseStrictJson(source: string, options: StrictJsonOptions = {}): UiFileResult<unknown> {
  const read = readStrictJson(source, options.file ?? "input.json", options.maxBytes, options.maxDepth);
  return read.ok ? { ok: true, value: read.value } : read;
}
