import type { KnowledgeSection } from "@molis-ai/molis-work-contracts/services/knowledge";

/** A section as the text has it; its note, if any, comes from the card. `own` is its text before its first subsection. */
export type TextSection = Omit<KnowledgeSection, "summary"> & { own: number };

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
function plainSections(content: string): TextSection[] {
  const sections: TextSection[] = [];
  for (let start = 0; start < content.length;) {
    let end = Math.min(content.length, start + PLAIN_SECTION_CHARS);
    const near = content.lastIndexOf("\n\n", end);
    if (end < content.length && near > start + PLAIN_SECTION_CHARS / 2) end = near + 2;
    sections.push({ anchor: `p${sections.length + 1}`, title: firstLine(content.slice(start, end)), level: 0, parent: null, start, line: 0, length: end - start, own: end - start });
    start = end;
  }
  return sections;
}

/**
 * The sections of a piece as written: one per Markdown heading (the text before the first one is its own section), or
 * paragraph-aligned pieces when it has none. Headings make a tree, as PageIndex reads a document: a section's `length` runs to
 * the next heading of its level or higher, so it holds its subsections, and `parent` is the heading it sits under. Anchors name
 * a section within one revision of the text only.
 */
export function outlineOf(content: string): TextSection[] {
  const marks = headings(content);
  const sections: TextSection[] = !marks.length ? plainSections(content) : [];
  if (marks.length && marks[0]!.start > 0 && content.slice(0, marks[0]!.start).trim()) {
    sections.push({ anchor: "h0", title: firstLine(content), level: 0, parent: null, start: 0, line: 0, length: marks[0]!.start, own: marks[0]!.start });
  }
  const open: Array<{ anchor: string; level: number }> = [];
  marks.forEach((mark, index) => {
    const own = (marks[index + 1]?.start ?? content.length) - mark.start;
    const end = marks.slice(index + 1).find(next => next.level <= mark.level)?.start ?? content.length;
    while (open.length && open.at(-1)!.level >= mark.level) open.pop();
    const anchor = `h${index + 1}`;
    sections.push({ anchor, title: mark.title, level: mark.level, parent: open.at(-1)?.anchor ?? null, start: mark.start, line: 0, length: end - mark.start, own });
    open.push({ anchor, level: mark.level });
  });
  const lines = lineStarts(content);
  for (const section of sections) section.line = lineAt(lines, section.start);
  return sections;
}

/** Where each line of the text starts; line n (1-based) starts at `starts[n - 1]`. */
export function lineStarts(content: string): number[] {
  const starts = [0];
  for (let at = content.indexOf("\n"); at !== -1; at = content.indexOf("\n", at + 1)) starts.push(at + 1);
  return starts;
}

/** Where `count` lines from the one `start` is on end: the start of the line after them, or the text's end. */
export function afterLines(starts: readonly number[], start: number, count: number, length: number): number {
  const next = lineAt(starts, start) - 1 + count;
  return next < starts.length ? starts[next]! : length;
}

/** The 1-based line the character at `offset` is on. */
export function lineAt(starts: readonly number[], offset: number): number {
  let low = 0, high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle]! <= offset) low = middle; else high = middle - 1;
  }
  return low + 1;
}

/** The range one read covers: a section, or the whole text. Null when the anchor names no section of this text. */
export function rangeOf(content: string, anchor: string | undefined): { start: number; end: number } | null {
  if (anchor === undefined) return { start: 0, end: content.length };
  const section = outlineOf(content).find(item => item.anchor === anchor);
  return section ? { start: section.start, end: section.start + section.length } : null;
}

const LINE_CHARS = 400;
const clip = (line: string) => line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}…` : line;

/**
 * Lines from line `from` on containing any of `patterns` (literal, ignoring case), with up to `around` lines before and after,
 * at most `limit`; `more` when lines from `from` on match past the limit. `count` is every matching line, before `from` too.
 */
export function grepLines(content: string, patterns: readonly string[], around: number, limit: number, from = 1): { hits: Array<{ line: number; text: string; before: string[]; after: string[] }>; more: boolean; count: number } {
  const lines = content.split("\n"), needles = patterns.map(pattern => pattern.toLocaleLowerCase());
  const hits: Array<{ line: number; text: string; before: string[]; after: string[] }> = [];
  let count = 0, later = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.toLocaleLowerCase();
    if (!needles.some(needle => line.includes(needle))) continue;
    count += 1;
    if (index + 1 < from) continue;
    later += 1;
    if (hits.length === limit) continue;
    hits.push({ line: index + 1, text: clip(lines[index]!), before: lines.slice(Math.max(0, index - around), index).map(clip), after: lines.slice(index + 1, index + 1 + around).map(clip) });
  }
  return { hits, more: later > hits.length, count };
}
