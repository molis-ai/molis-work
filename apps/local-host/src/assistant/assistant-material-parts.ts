import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/** The most UTF-16 units one material part carries: with its header it stays inside the runtime's 20,000 per material. */
export const MATERIAL_PART_UNITS = 18_000;

/**
 * `text` in parts of at most `size` UTF-16 units, cut only between whole characters: a 🟢 (two units) that would straddle a
 * boundary goes whole into the next part. Every part decodes on its own and the parts joined in order are `text` exactly. An
 * empty text is one empty part; `size` is at least 2. Ordinary rounds and comment-thread rounds both split their materials here.
 */
export function materialParts(text: string, size = MATERIAL_PART_UNITS): string[] {
  const parts: string[] = [];
  for (let at = 0; at < text.length;) {
    const part = cutHead(text.slice(at, at + size + 1), size) || text.slice(at, at + size);
    parts.push(part);
    at += part.length;
  }
  return parts.length ? parts : [""];
}
