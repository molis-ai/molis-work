import type { KnowledgeSection } from "@molis-ai/molis-work-contracts/services/knowledge";

/** Text without headings is cut into sections of about this many characters, at paragraph breaks. */
export const PLAIN_SECTION_CHARS = 2_000;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/u;
const FENCE = /^(`{3,}|~{3,})/u;
const TITLE_CHARS = 60;

const firstLine = (value: string) => (value.split("\n").find(line => line.trim())?.trim() ?? "").slice(0, TITLE_CHARS);

/** Markdown headings outside fenced code, each with the offset of the line it is on. */
function headings(content: string): Array<{ start: number; level: number; title: string }> {
  const found: Array<{ start: number; level: number; title: string }> = [];
  let offset = 0, fence: string | null = null;
  for (const line of content.split("\n")) {
    const opens = FENCE.exec(line.trimStart())?.[1];
    if (opens && (!fence || opens.startsWith(fence))) fence = fence ? null : opens.slice(0, 3);
    const heading = fence ? null : HEADING.exec(line);
    if (heading) found.push({ start: offset, level: heading[1]!.length, title: heading[2]!.slice(0, TITLE_CHARS) });
    offset += line.length + 1;
  }
  return found;
}

/** Cuts heading-less text at the last paragraph break before each limit, else at the limit. */
function plainSections(content: string): KnowledgeSection[] {
  const sections: KnowledgeSection[] = [];
  for (let start = 0; start < content.length;) {
    let end = Math.min(content.length, start + PLAIN_SECTION_CHARS);
    const near = content.lastIndexOf("\n\n", end);
    if (end < content.length && near > start + PLAIN_SECTION_CHARS / 2) end = near + 2;
    sections.push({ anchor: `p${sections.length + 1}`, title: firstLine(content.slice(start, end)), level: 0, start, length: end - start });
    start = end;
  }
  return sections;
}

/**
 * The sections of a piece as written: one per Markdown heading (the text before the first one is its own section), or
 * paragraph-aligned pieces when it has none. Anchors name a section within one revision of the text only.
 */
export function outlineOf(content: string): KnowledgeSection[] {
  const marks = headings(content);
  if (!marks.length) return plainSections(content);
  const sections: KnowledgeSection[] = [];
  if (marks[0]!.start > 0 && content.slice(0, marks[0]!.start).trim()) sections.push({ anchor: "h0", title: firstLine(content), level: 0, start: 0, length: marks[0]!.start });
  marks.forEach((mark, index) => {
    const end = marks[index + 1]?.start ?? content.length;
    sections.push({ anchor: `h${index + 1}`, title: mark.title, level: mark.level, start: mark.start, length: end - mark.start });
  });
  return sections;
}

/** The range one read covers: a section, or the whole text. Null when the anchor names no section of this text. */
export function rangeOf(content: string, anchor: string | undefined): { start: number; end: number } | null {
  if (anchor === undefined) return { start: 0, end: content.length };
  const section = outlineOf(content).find(item => item.anchor === anchor);
  return section ? { start: section.start, end: section.start + section.length } : null;
}

const LINE_CHARS = 400;
const clip = (line: string) => line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}…` : line;

/** Lines containing `pattern` (literal, ignoring case), with up to `around` lines before and after, at most `limit`. */
export function grepLines(content: string, pattern: string, around: number, limit: number): { hits: Array<{ line: number; text: string; before: string[]; after: string[] }>; more: boolean } {
  const lines = content.split("\n"), needle = pattern.toLocaleLowerCase();
  const hits: Array<{ line: number; text: string; before: string[]; after: string[] }> = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]!.toLocaleLowerCase().includes(needle)) continue;
    if (hits.length === limit) return { hits, more: true };
    hits.push({ line: index + 1, text: clip(lines[index]!), before: lines.slice(Math.max(0, index - around), index).map(clip), after: lines.slice(index + 1, index + 1 + around).map(clip) });
  }
  return { hits, more: false };
}
