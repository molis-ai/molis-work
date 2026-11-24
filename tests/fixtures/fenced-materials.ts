import { UNTRUSTED_MATERIALS_NOTICE } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** Extract the single JSON line fenced by `fencedMaterials(data, boundary)`. Returns undefined when the text is not fenced. */
export function extractFencedMaterials(text: string): { boundary: string; raw: string; block: string; data: unknown } | undefined {
  const noticeAt = text.indexOf(UNTRUSTED_MATERIALS_NOTICE);
  if (noticeAt < 0) return undefined;
  const tail = text.slice(noticeAt + UNTRUSTED_MATERIALS_NOTICE.length);
  const match = /^\nBEGIN_([A-Za-z0-9_-]+)\n([^\n]+)\nEND_\1(?=\n|$)/.exec(tail);
  if (!match) return undefined;
  try {
    return {
      boundary: match[1]!,
      raw: match[2]!,
      block: UNTRUSTED_MATERIALS_NOTICE + match[0],
      data: JSON.parse(match[2]!),
    };
  } catch {
    return undefined;
  }
}

/** Parse fenced materials JSON or fail loudly in tests that require `fencedMaterials(...)`. */
export function parseFencedMaterials<T = unknown>(text: string): T {
  const found = extractFencedMaterials(text);
  if (!found) throw new Error("Expected fencedMaterials() payload with UNTRUSTED_MATERIALS_NOTICE and matching BEGIN_/END_ fence");
  return found.data as T;
}
