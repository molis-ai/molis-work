import type { KnowledgeSection } from "@molis-ai/molis-work-contracts/services/knowledge";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/** A section as the text has it; its note, if any, comes from the card. `own` is its text before its first subsection. */
type TextSection = Omit<KnowledgeSection, "summary"> & { own: number };

/** Text without headings is cut into sections of about this many characters, at paragraph breaks. */
export const PLAIN_SECTION_CHARS = 2_000;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/u;
const FENCE = /^(`{3,}|~{3,})/u;
const TITLE_CHARS = 60;

const firstLine = (value: string) => cutHead(value.split("\n").find(line => line.trim())?.trim() ?? "", TITLE_CHARS);

const NUMBER = "[一二三四五六七八九十百千零〇\\d]+";
/** Chinese numbered headings, by level: 第一章, 第一节, 一、, （一）, 第一条. */
const NUMBERED: ReadonlyArray<readonly [RegExp, number]> = [[new RegExp(`^第${NUMBER}[章编篇部]`, "u"), 1], [new RegExp(`^第${NUMBER}节`, "u"), 2],
  [/^[一二三四五六七八九十]+[、．]/u, 2], [/^[（(][一二三四五六七八九十]+[）)]/u, 3], [new RegExp(`^第${NUMBER}条`, "u"), 3]];
const NUMBERED_TITLE_CHARS = 40;

/** Markdown headings outside fenced code, each with the offset of the line it is on (a CRLF line ends before its `\r`). */
function headings(content: string): Array<{ start: number; level: number; title: string }> {
  const found: Array<{ start: number; level: number; title: string }> = [], numbered: typeof found = [];
  let offset = 0, fence: string | null = null;
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r$/u, "");
    const opens = FENCE.exec(line.trimStart())?.[1];
    if (opens && (!fence || opens.startsWith(fence))) fence = fence ? null : opens.slice(0, 3);
    const heading = fence ? null : HEADING.exec(line);
    if (heading) found.push({ start: offset, level: heading[1]!.length, title: cutHead(heading[2]!, TITLE_CHARS) });
    // A short line of its own that starts with a Chinese section number, and is not a sentence, heads a section too.
    const bare = line.trim(), level = !fence && bare.length <= NUMBERED_TITLE_CHARS && !/[。；;，,：:]$/u.test(bare) ? NUMBERED.find(([shape]) => shape.test(bare))?.[1] : undefined;
    if (level !== undefined) numbered.push({ start: offset, level, title: bare.slice(0, TITLE_CHARS) });
    offset += raw.length + 1;
  }
  // Markdown headings when the text has them; the numbered ones when it has none and at least two of them.
  return found.length || numbered.length < 2 ? found : numbered;
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
const LEAD_CHARS = 120;
const clip = (line: string) => line.length > LINE_CHARS ? `${cutHead(line, LINE_CHARS)}…` : line;
/** A long matching line, cut around its first match (a long paragraph's match is often past its first 400 characters). */
const clipAround = (line: string, at: number) => {
  if (line.length <= LINE_CHARS) return line;
  const start = Math.max(0, Math.min(at - LEAD_CHARS, line.length - LINE_CHARS));
  // Both ends keep whole characters: the start may land on the low half of one, the end on the high half.
  const head = line.slice(start, start + LINE_CHARS).replace(/^[\uDC00-\uDFFF]/u, "");
  const kept = head.replace(/[\uD800-\uDBFF]$/u, "");
  return `${start ? "…" : ""}${kept}${start + LINE_CHARS < line.length ? "…" : ""}`;
};

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
    const at = Math.min(...needles.map(needle => line.indexOf(needle)).filter(found => found >= 0));
    if (at === Infinity) continue;
    count += 1;
    if (index + 1 < from) continue;
    later += 1;
    if (hits.length === limit) continue;
    hits.push({ line: index + 1, text: clipAround(lines[index]!, at), before: lines.slice(Math.max(0, index - around), index).map(clip), after: lines.slice(index + 1, index + 1 + around).map(clip) });
  }
  return { hits, more: later > hits.length, count };
}
