import { Fragment, Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { safePagesLanguage } from "./code-language.js";
import { safePagesHref } from "./link.js";
import { pagesSchema } from "./schema.js";

const FENCE_OPEN = /^```([A-Za-z0-9_+#-]*)$/u;
const FENCE_CLOSE = /^```$/u;
const DIVIDER = /^(?:---|\*\*\*|___)$/u;
const HEADING = /^(#{1,3})\s+(\S.*)$/u;
const BULLET = /^[-*]\s+(\S.*)$/u;
const ORDERED = /^\d+\.\s+(\S.*)$/u;
const TASK = /^\[( ?|x|X)\]\s+(\S.*)$/u;
const QUOTE = /^>(?:$|\s(.*))$/u;
const TABLE_ROW = /^\|(.+)\|$/u;
const TABLE_SEP_CELL = /^:?-{3,}:?$/u;
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/gu;

function textNode(value: string, marks: ReturnType<typeof pagesSchema.marks.strong.create>[] = []) {
  return marks.length ? pagesSchema.text(value, marks) : pagesSchema.text(value);
}

/** Inline marks Notion paste keeps: bold, italic, strike, code, and a safe link. */
export function inlineFromMarkdown(value: string): Node[] {
  const nodes: Node[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(textNode(value.slice(cursor, index)));
    const token = match[0];
    if (token.startsWith("**")) nodes.push(textNode(token.slice(2, -2), [pagesSchema.marks.strong.create()]));
    else if (token.startsWith("*")) nodes.push(textNode(token.slice(1, -1), [pagesSchema.marks.em.create()]));
    else if (token.startsWith("~~")) nodes.push(textNode(token.slice(2, -2), [pagesSchema.marks.strike.create()]));
    else if (token.startsWith("`")) nodes.push(textNode(token.slice(1, -1), [pagesSchema.marks.code.create()]));
    else {
      const linked = /^\[([^\]]+)\]\(([^)\s]+)\)$/u.exec(token);
      const href = linked ? safePagesHref(linked[2]) : "";
      if (linked && href) nodes.push(textNode(linked[1], [pagesSchema.marks.link.create({ href })]));
      else nodes.push(textNode(token));
    }
    cursor = index + token.length;
  }
  if (cursor < value.length) nodes.push(textNode(value.slice(cursor)));
  return nodes;
}

function paragraph(value: string): Node {
  const content = value ? inlineFromMarkdown(value) : [];
  return pagesSchema.nodes.paragraph.create(null, content);
}

function listItem(value: string, checked?: boolean): Node {
  const body = paragraph(value);
  return checked === undefined
    ? pagesSchema.nodes.list_item.create(null, body)
    : pagesSchema.nodes.task_item.create({ checked }, body);
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return TABLE_ROW.test(trimmed) && splitTableRow(trimmed).length > 1;
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  return splitTableRow(line).every((cell) => TABLE_SEP_CELL.test(cell));
}

function tableFromRows(rows: string[][], header: boolean): Node {
  const width = Math.max(...rows.map((row) => row.length));
  const build = (cells: string[], asHeader: boolean) => {
    const padded = cells.slice();
    while (padded.length < width) padded.push("");
    const type = asHeader ? pagesSchema.nodes.table_header : pagesSchema.nodes.table_cell;
    return pagesSchema.nodes.table_row.create(null, padded.map((value) => type.create(null, paragraph(value))));
  };
  const [first, ...rest] = rows;
  return pagesSchema.nodes.table.create(null, [
    build(first ?? [], header),
    ...rest.map((row) => build(row, false)),
  ]);
}

function isStructural(line: string): boolean {
  const trimmed = line.trim();
  return FENCE_OPEN.test(trimmed)
    || DIVIDER.test(trimmed)
    || HEADING.test(trimmed)
    || BULLET.test(trimmed)
    || ORDERED.test(trimmed)
    || TASK.test(trimmed)
    || QUOTE.test(trimmed)
    || isTableRow(trimmed);
}

/** Parse a paste into blocks when it contains markdown structure; plain lines stay null. */
export function blocksFromMarkdown(text: string): Node[] | null {
  const lines = text.replace(/\r\n/gu, "\n").trim().split("\n");
  if (!lines.some(isStructural)) return null;
  const blocks: Node[] = [];
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const fence = FENCE_OPEN.exec(trimmed);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_CLOSE.test(lines[index].trim())) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const code = body.join("\n");
      blocks.push(code
        ? pagesSchema.nodes.code_block.create({ language: safePagesLanguage(fence[1] ?? "") }, pagesSchema.text(code))
        : pagesSchema.nodes.code_block.create({ language: safePagesLanguage(fence[1] ?? "") }));
      continue;
    }
    if (DIVIDER.test(trimmed)) {
      blocks.push(pagesSchema.nodes.horizontal_rule.create());
      index += 1;
      continue;
    }
    if (isTableRow(trimmed)) {
      const raw: string[] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        raw.push(lines[index].trim());
        index += 1;
      }
      const header = raw.length > 1 && isTableSeparator(raw[1]);
      const body = raw.filter((line) => !isTableSeparator(line)).map(splitTableRow);
      if (body.length) blocks.push(tableFromRows(body, header));
      continue;
    }
    if (QUOTE.test(trimmed)) {
      const parts: Node[] = [];
      while (index < lines.length && QUOTE.test(lines[index].trim())) {
        const found = QUOTE.exec(lines[index].trim());
        parts.push(paragraph(found?.[1] ?? ""));
        index += 1;
      }
      blocks.push(pagesSchema.nodes.blockquote.create(null, parts));
      continue;
    }
    const heading = HEADING.exec(trimmed);
    if (heading) {
      blocks.push(pagesSchema.nodes.heading.create({ level: heading[1].length }, inlineFromMarkdown(heading[2])));
      index += 1;
      continue;
    }
    const take = (pattern: RegExp, build: (line: string) => Node | null, wrap: (items: Node[]) => Node) => {
      const items: Node[] = [];
      while (index < lines.length) {
        const item = build(lines[index].trim());
        if (!item || !pattern.test(lines[index].trim())) break;
        items.push(item);
        index += 1;
      }
      if (items.length) blocks.push(wrap(items));
      return items.length > 0;
    };
    if (take(BULLET, (line) => {
      const found = BULLET.exec(line);
      return found ? listItem(found[1]) : null;
    }, (items) => pagesSchema.nodes.bullet_list.create(null, items))) continue;
    if (take(ORDERED, (line) => {
      const found = ORDERED.exec(line);
      return found ? listItem(found[1]) : null;
    }, (items) => pagesSchema.nodes.ordered_list.create(null, items))) continue;
    if (take(TASK, (line) => {
      const found = TASK.exec(line);
      return found ? listItem(found[2], found[1].toLowerCase() === "x") : null;
    }, (items) => pagesSchema.nodes.task_list.create(null, items))) continue;
    blocks.push(paragraph(trimmed));
    index += 1;
  }
  return blocks.length ? blocks : null;
}

/** Replace the empty paragraph under the cursor. A non-empty line, or a parent that cannot hold the blocks, keeps the default paste. */
export function pasteMarkdown(state: EditorState, text: string) {
  const blocks = blocksFromMarkdown(text);
  if (!blocks) return null;
  const { empty, $from } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0 || $from.depth < 1) return null;
  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  const fragment = Fragment.from(blocks);
  if (!container.canReplace(index, index + 1, fragment)) return null;
  const tr = state.tr.replaceWith($from.before(), $from.after(), fragment);
  const caret = Math.min($from.before() + 1, tr.doc.content.size);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(caret), 1));
}
