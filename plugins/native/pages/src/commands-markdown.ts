// Markdown input shortcuts that turn typed text into document structure.
import { EditorState, TextSelection, Transaction } from "prosemirror-state";
import { pagesSchema } from "./schema.js";
import { safePagesHref } from "./link.js";
import { Fragment } from "prosemirror-model";
import { safePagesLanguage } from "./code-language.js";


/** Turn `**text**`, `*text*`, `` `text` ``, or `~~text~~` into the matching mark and drop the markers. */
export function markdownWrapMark(
  state: EditorState,
  start: number,
  end: number,
  open: string,
  close: string,
  markName: "strong" | "em" | "code" | "strike",
) {
  if (start >= end) return null;
  const $start = state.doc.resolve(start);
  if ($start.parent.type.spec.code || !$start.parent.isTextblock) return null;
  const text = state.doc.textBetween(start, end);
  if (!text.startsWith(open) || !text.endsWith(close)) return null;
  if (text.length <= open.length + close.length) return null;
  const inner = text.slice(open.length, text.length - close.length);
  if (!inner.trim() || (open === "*" && (inner.startsWith("*") || inner.endsWith("*")))) return null;
  const from = start + open.length;
  const to = end - close.length;
  const mark = pagesSchema.marks[markName].create();
  const tr = state.tr.delete(to, end).delete(start, from);
  tr.addMark(tr.mapping.map(from), tr.mapping.map(to), mark);
  return tr;
}

/** Turn `[label](url)` into a link, or link a bare `https://…` once a space is typed after it. */
export function markdownLink(state: EditorState, start: number, end: number) {
  if (start >= end) return null;
  const parent = state.doc.resolve(start).parent;
  if (parent.type.spec.code || !parent.isTextblock) return null;
  const text = state.doc.textBetween(start, end);
  const wrapped = /^\[([^\]]+)\]\(([^)\s]+)\)$/u.exec(text);
  if (wrapped) {
    const href = safePagesHref(wrapped[2]);
    if (!href) return null;
    const tr = state.tr.delete(start, end);
    tr.insert(start, pagesSchema.text(wrapped[1], [pagesSchema.marks.link.create({ href })]));
    return tr;
  }
  const bare = /^(https?:\/\/\S+) $/u.exec(text);
  if (!bare) return null;
  const href = safePagesHref(bare[1]);
  if (!href) return null;
  return state.tr.addMark(start, start + bare[1].length, pagesSchema.marks.link.create({ href }));
}

/** `[ ] `, `[] `, or `[x] ` at the start of a paragraph becomes a to-do. Words after the marker stay. */
export function markdownTask(state: EditorState, start: number, end: number): Transaction | null {
  const $start = state.doc.resolve(start);
  const parent = $start.parent;
  if (parent.type !== pagesSchema.nodes.paragraph || $start.parentOffset !== 0 || $start.depth < 1) return null;
  const marker = parent.textBetween(0, end - $start.start());
  const checked = /^\[(?:x|X)\] $/u.test(marker);
  const open = /^\[\] $/u.test(marker) || /^\[ \] $/u.test(marker);
  if (!checked && !open) return null;
  const paragraph = pagesSchema.nodes.paragraph.create(null, parent.content.cut(end - $start.start()));
  const item = pagesSchema.nodes.task_item.create({ checked }, paragraph);
  const list = pagesSchema.nodes.task_list.create(null, item);
  const container = $start.node($start.depth - 1);
  const index = $start.index($start.depth - 1);
  if (!container.canReplace(index, index + 1, Fragment.from(list))) return null;
  const tr = state.tr.replaceWith($start.before(), $start.after(), list);
  return tr.setSelection(TextSelection.create(tr.doc, Math.min($start.before() + 3, tr.doc.content.size)));
}

const MARKDOWN_DIVIDER = /^(?:---|___|\*\*\*)$/u;
const MARKDOWN_FENCE = /^```([A-Za-z0-9_+#-]*)?$/u;

/**
 * A paragraph that is only `---`, `***`, `___`, or a ``` fence becomes that block.
 * The fence's language tag is folded through the same allowlist as the code menu.
 */
export function markdownBlock(state: EditorState, start: number, end?: number) {
  const $start = state.doc.resolve(start);
  const parent = $start.parent;
  if (parent.type !== pagesSchema.nodes.paragraph || $start.depth < 1) return null;
  const container = $start.node($start.depth - 1);
  const index = $start.index($start.depth - 1);
  if (end != null && $start.parentOffset === 0 && parent.textBetween(0, end - $start.start()) === "> ") {
    const paragraph = pagesSchema.nodes.paragraph.create(null, parent.content.cut(end - $start.start()));
    const quote = pagesSchema.nodes.blockquote.create(null, paragraph);
    if (!container.canReplace(index, index + 1, Fragment.from(quote))) return null;
    const tr = state.tr.replaceWith($start.before(), $start.after(), quote);
    return tr.setSelection(TextSelection.create(tr.doc, Math.min($start.before() + 2, tr.doc.content.size)));
  }
  if (end != null && $start.parentOffset === 0) {
    const marker = parent.textBetween(0, end - $start.start());
    if (MARKDOWN_DIVIDER.test(marker)) {
      const paragraph = pagesSchema.nodes.paragraph.create(null, parent.content.cut(end - $start.start()));
      const rule = pagesSchema.nodes.horizontal_rule.create();
      const fragment = Fragment.from([rule, paragraph]);
      if (!container.canReplace(index, index + 1, fragment)) return null;
      const tr = state.tr.replaceWith($start.before(), $start.after(), fragment);
      const caret = Math.min($start.before() + rule.nodeSize + 1, tr.doc.content.size);
      return tr.setSelection(TextSelection.create(tr.doc, caret));
    }
    const fence = MARKDOWN_FENCE.exec(marker);
    if (fence) {
      const codeText = parent.textBetween(end - $start.start(), parent.content.size);
      const language = safePagesLanguage(fence[1] ?? "");
      const code = codeText
        ? pagesSchema.nodes.code_block.create({ language }, pagesSchema.text(codeText))
        : pagesSchema.nodes.code_block.create({ language });
      if (!container.canReplace(index, index + 1, Fragment.from(code))) return null;
      const tr = state.tr.replaceWith($start.before(), $start.after(), code);
      return tr.setSelection(TextSelection.create(tr.doc, Math.min($start.before() + 1, tr.doc.content.size)));
    }
  }
  const text = parent.textContent;
  if (MARKDOWN_DIVIDER.test(text)) {
    const rule = pagesSchema.nodes.horizontal_rule.create();
    const paragraph = pagesSchema.nodes.paragraph.create();
    const fragment = Fragment.from([rule, paragraph]);
    if (!container.canReplace(index, index + 1, fragment)) return null;
    const tr = state.tr.replaceWith($start.before(), $start.after(), fragment);
    const caret = Math.min($start.before() + rule.nodeSize + 1, tr.doc.content.size);
    return tr.setSelection(TextSelection.create(tr.doc, caret));
  }
  if (/^>\s$/u.test(text)) {
    const quote = pagesSchema.nodes.blockquote.create(null, pagesSchema.nodes.paragraph.create());
    if (!container.canReplace(index, index + 1, Fragment.from(quote))) return null;
    const tr = state.tr.replaceWith($start.before(), $start.after(), quote);
    return tr.setSelection(TextSelection.create(tr.doc, Math.min($start.before() + 2, tr.doc.content.size)));
  }
  const fence = MARKDOWN_FENCE.exec(text);
  if (!fence) return null;
  const code = pagesSchema.nodes.code_block.create({ language: safePagesLanguage(fence[1] ?? "") });
  if (!container.canReplace(index, index + 1, Fragment.from(code))) return null;
  const tr = state.tr.replaceWith($start.before(), $start.after(), code);
  return tr.setSelection(TextSelection.create(tr.doc, $start.before() + 1));
}
