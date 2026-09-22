import { chainCommands, exitCode, lift, selectAll, setBlockType } from "prosemirror-commands";
import { Fragment, Node, ResolvedPos } from "prosemirror-model";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import { Command, EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
import { safePagesLanguage } from "./code-language.js";
import { convertedBlocks } from "./convert.js";
import { safePagesHref } from "./link.js";
import { deleteAtPos, deleteSpan as deleteSpanDoc, dragRows, duplicateAtPos, duplicateSpan as duplicateSpanDoc, placeDragged, placeSpan, reorderTopLevel } from "./reorder.js";
import { pagesSchema } from "./schema.js";
import { safePagesTone } from "./tone.js";

export function blockPos(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

export function topBlockRange($pos: ResolvedPos): { from: number; to: number; index: number; node: Node } | null {
  if ($pos.depth < 1) return null;
  return { from: $pos.before(1), to: $pos.after(1), index: $pos.index(0), node: $pos.node(1) };
}

function caretAt(tr: { doc: Node }, pos: number, bias: 1 | -1 = 1) {
  return TextSelection.near(tr.doc.resolve(Math.min(Math.max(pos, 0), tr.doc.content.size)), bias);
}

/** Insert a copy of top-level block `index` right after it. */
export function duplicateBlock(index: number): Command {
  return (state, dispatch) => {
    const doc = state.doc;
    if (index < 0 || index >= doc.childCount) return false;
    const node = doc.child(index);
    const at = blockPos(doc, index) + node.nodeSize;
    if (!dispatch) return true;
    const tr = state.tr.insert(at, node);
    dispatch(tr.setSelection(caretAt(tr, at + 1)).scrollIntoView());
    return true;
  };
}

/** Drop top-level block `index`. Deleting the only block leaves the empty paragraph `doc` requires. */
export function deleteBlock(index: number): Command {
  return (state, dispatch) => {
    const doc = state.doc;
    if (index < 0 || index >= doc.childCount) return false;
    if (!dispatch) return true;
    const from = blockPos(doc, index);
    const tr = state.tr.delete(from, from + doc.child(index).nodeSize);
    dispatch(tr.setSelection(caretAt(tr, from + 1, -1)).scrollIntoView());
    return true;
  };
}

/** Rebuild top-level block `index` as block kind `id`, carrying its text across. */
export function turnBlockInto(index: number, id: string): Command {
  return (state, dispatch) => {
    const doc = state.doc;
    if (index < 0 || index >= doc.childCount) return false;
    const node = doc.child(index);
    const next = convertedBlocks(id, node);
    if (!next?.length) return false;
    if (!dispatch) return true;
    const from = blockPos(doc, index);
    const tr = state.tr.replaceWith(from, from + node.nodeSize, Fragment.from(next));
    dispatch(tr.setSelection(caretAt(tr, from + 1)).scrollIntoView());
    return true;
  };
}

/** Move top-level block `fromIndex` so it lands before `insertBefore`. */
export function moveBlock(fromIndex: number, insertBefore: number): Command {
  return (state, dispatch) => {
    const next = reorderTopLevel(state.doc, fromIndex, insertBefore);
    if (next === state.doc) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/** Drop the row at `fromPos` into the gap `gap` at visual indent `level`. */
export function moveRow(fromPos: number, gap: number, level: number): Command {
  return (state, dispatch) => {
    const next = placeDragged(state.doc, fromPos, gap, level);
    if (!next) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/** Delete whatever row the grip is on, including a nested list item or callout child. */
export function deleteRow(pos: number): Command {
  return (state, dispatch) => {
    const next = deleteAtPos(state.doc, pos);
    if (!next) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/** Move the selected rows, from `anchor` through `head`, into the gap at `level`. */
export function moveSpan(anchor: number, head: number, gap: number, level: number): Command {
  return (state, dispatch) => {
    const next = placeSpan(state.doc, anchor, head, gap, level);
    if (!next) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/** Delete the selected rows. A parent that is selected takes its children with it. */
export function deleteSpan(anchor: number, head: number): Command {
  return (state, dispatch) => {
    const next = deleteSpanDoc(state.doc, anchor, head);
    if (!next) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/** Copy the selected rows as a group after the last one. */
export function duplicateSpan(anchor: number, head: number): Command {
  return (state, dispatch) => {
    const next = duplicateSpanDoc(state.doc, anchor, head);
    if (!next) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/** Insert a copy of the row at `pos` immediately after it. */
export function duplicateRow(pos: number): Command {
  return (state, dispatch) => {
    const next = duplicateAtPos(state.doc, pos);
    if (!next) return false;
    if (dispatch) dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content));
    return true;
  };
}

/**
 * Leave a quote, callout, or toggle.
 * Backspace peels even when the line has text. Enter only leaves an empty line,
 * and never strips a toggle's summary while it still has children.
 */
function peelWrapper(state: EditorState, dispatch: ((tr: ReturnType<EditorState["tr"]["scrollIntoView"]>) => void) | undefined, onlyEmpty: boolean): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
  if (onlyEmpty && $from.parent.content.size > 0) return false;
  const s = pagesSchema;
  const wrapper = $from.node($from.depth - 1);
  const wrapped = wrapper.type === s.nodes.blockquote || wrapper.type === s.nodes.callout || wrapper.type === s.nodes.toggle;
  if (!wrapped) return false;
  const index = $from.index($from.depth - 1);
  if (wrapper.type === s.nodes.toggle && index === 0 && wrapper.childCount > 1) return false;
  if (wrapper.childCount === 1) {
    const from = $from.before($from.depth - 1);
    const to = $from.after($from.depth - 1);
    const container = $from.node($from.depth - 2);
    if (!container.canReplace($from.index($from.depth - 2), $from.index($from.depth - 2) + 1, Fragment.from($from.parent))) return false;
    if (dispatch) {
      const tr = state.tr.replaceWith(from, to, $from.parent);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, Math.min(from + 1, tr.doc.content.size))).scrollIntoView());
    }
    return true;
  }
  return lift(state, dispatch);
}

function rowUnderSelection(state: EditorState): number {
  const pos = state.selection.from;
  let hit = -1;
  for (const row of dragRows(state.doc)) {
    const node = state.doc.nodeAt(row.pos);
    if (node && pos >= row.pos && pos < row.pos + node.nodeSize) hit = row.pos;
  }
  return hit;
}

/**
 * Slash replaces the row under the caret. A list that cannot hold the new block
 * splits around that item, so the other items stay.
 */
export function replaceEnclosingRow(state: EditorState, node: Node) {
  const rowPos = rowUnderSelection(state);
  if (rowPos < 0) return null;
  const row = state.doc.nodeAt(rowPos);
  if (!row) return null;
  const $pos = state.doc.resolve(rowPos);
  const parent = $pos.parent;
  const index = $pos.index();
  const fragment = Fragment.from(node);
  if (parent.canReplace(index, index + 1, fragment)) {
    const tr = state.tr.replaceWith(rowPos, rowPos + row.nodeSize, node);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(rowPos + 1, tr.doc.content.size))));
  }
  const list = parent.type === pagesSchema.nodes.bullet_list
    || parent.type === pagesSchema.nodes.ordered_list
    || parent.type === pagesSchema.nodes.task_list;
  if (!list || $pos.depth < 1) return null;
  const before: Node[] = [];
  const after: Node[] = [];
  parent.forEach((child, _offset, childIndex) => {
    if (childIndex < index) before.push(child);
    else if (childIndex > index) after.push(child);
  });
  const pieces: Node[] = [];
  if (before.length) pieces.push(parent.type.create(parent.attrs, before));
  pieces.push(node);
  if (after.length) pieces.push(parent.type.create(parent.attrs, after));
  const listPos = $pos.before();
  const grand = state.doc.resolve(listPos);
  if (!grand.parent.canReplace(grand.index(), grand.index() + 1, Fragment.from(pieces))) return null;
  const tr = state.tr.replaceWith(listPos, listPos + parent.nodeSize, pieces);
  let at = listPos;
  if (before.length) at += pieces[0].nodeSize;
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + 1, tr.doc.content.size))));
}

/** Copy the row under the caret. A list item copies as the next item, not as a second list. */
export function duplicateEnclosingRow(state: EditorState) {
  const rowPos = rowUnderSelection(state);
  if (rowPos < 0) return null;
  const row = state.doc.nodeAt(rowPos);
  if (!row) return null;
  const at = rowPos + row.nodeSize;
  const tr = state.tr.insert(at, row);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + 1, tr.doc.content.size))));
}

/** Turn the row under the caret into `id`, splitting a list so the other items stay. */
export function turnRowInto(state: EditorState, id: string) {
  const rowPos = rowUnderSelection(state);
  const row = rowPos >= 0 ? state.doc.nodeAt(rowPos) : null;
  if (!row) return null;
  const next = convertedBlocks(id, row);
  if (!next?.length) return null;
  if (next.length === 1) return replaceEnclosingRow(state, next[0]);
  const $pos = state.doc.resolve(rowPos);
  if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, Fragment.from(next))) return null;
  const tr = state.tr.replaceWith(rowPos, rowPos + row.nodeSize, next);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(rowPos + 1, tr.doc.content.size))));
}

/** Backspace at the very start of a block peels one layer of formatting instead of merging text. */
export const unwrapAtStart: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const s = pagesSchema;
  if ($from.parent.type === s.nodes.heading) return setBlockType(s.nodes.paragraph)(state, dispatch);
  const grand = $from.depth > 1 ? $from.node($from.depth - 1) : null;
  if (grand?.type === s.nodes.list_item) return liftListItem(s.nodes.list_item)(state, dispatch);
  if (grand?.type === s.nodes.task_item) return liftListItem(s.nodes.task_item)(state, dispatch);
  return peelWrapper(state, dispatch, false);
};

/** Enter on an empty line inside a quote, callout, or toggle steps back out. */
export const exitWrappedBlock: Command = (state, dispatch) => peelWrapper(state, dispatch, true);

/** Tab nesting has to cover to-do items too, not just bullet and numbered lists. */
export const indentListItem: Command = chainCommands(
  sinkListItem(pagesSchema.nodes.list_item),
  sinkListItem(pagesSchema.nodes.task_item),
);

/** Shift-Tab, the mirror of `indentListItem`. */
export const outdentListItem: Command = chainCommands(
  liftListItem(pagesSchema.nodes.list_item),
  liftListItem(pagesSchema.nodes.task_item),
);

/** Mod-A grabs the current block first and only reaches for the whole document on a second press. */
export const selectBlockThenAll: Command = (state, dispatch) => {
  const selection = state.selection;
  if (selection instanceof NodeSelection || !selection.$from.parent.isTextblock) return selectAll(state, dispatch);
  const start = selection.$from.start();
  const end = selection.$from.end();
  if (start === end || (selection.from <= start && selection.to >= end)) return selectAll(state, dispatch);
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)));
  return true;
};

/** Escape lifts a text caret up to a whole-block selection. */
export const selectEnclosingBlock: Command = (state, dispatch) => {
  if (state.selection instanceof NodeSelection) return false;
  const range = topBlockRange(state.selection.$from);
  if (!range) return false;
  if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, range.from)));
  return true;
};

/** Link range under the selection: the selected text, or the whole link the caret sits in. */
export function linkAt(doc: Node, selection: { from: number; to: number; empty: boolean; $from: ResolvedPos }):
  { from: number; to: number; href: string } | null {
  const mark = pagesSchema.marks.link;
  const { from, to, empty, $from } = selection;
  const found = $from.marks().find((item) => item.type === mark)
    ?? (empty ? undefined : doc.resolve(from + 1).marks().find((item) => item.type === mark));
  if (found) {
    let start = from;
    let end = to;
    doc.nodesBetween(Math.max(0, from - 1), Math.min(doc.content.size, to + 1), (node, pos) => {
      if (!node.isText || !found.isInSet(node.marks)) return;
      start = Math.min(start, pos);
      end = Math.max(end, pos + node.nodeSize);
    });
    return { from: start, to: end, href: String(found.attrs.href || "") };
  }
  if (empty) return null;
  return { from, to, href: "" };
}

/** Paint or clear a writing tone over the current selection; an empty or unknown tone clears it. */
export function setTone(kind: "font_color" | "highlight", tone: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    const mark = pagesSchema.marks[kind];
    const safe = safePagesTone(tone);
    if (empty) {
      if (!dispatch) return true;
      const stored = mark.isInSet(state.storedMarks ?? state.selection.$from.marks());
      if (!safe || stored?.attrs.tone === safe) dispatch(state.tr.removeStoredMark(mark));
      else dispatch(state.tr.addStoredMark(mark.create({ tone: safe })));
      return true;
    }
    if (!dispatch) return true;
    const tr = state.tr.removeMark(from, to, mark);
    if (safe && !state.doc.rangeHasMark(from, to, mark.create({ tone: safe }))) {
      tr.addMark(from, to, mark.create({ tone: safe }));
    }
    dispatch(tr);
    return true;
  };
}

/** Paint a whole top-level block, the way the block menu's colour entry does. */
export function setBlockTone(index: number, kind: "font_color" | "highlight", tone: string): Command {
  return (state, dispatch) => {
    const doc = state.doc;
    if (index < 0 || index >= doc.childCount) return false;
    if (!dispatch) return true;
    const from = blockPos(doc, index);
    const to = from + doc.child(index).nodeSize;
    const mark = pagesSchema.marks[kind];
    const safe = safePagesTone(tone);
    const tr = state.tr.removeMark(from, to, mark);
    if (safe) tr.addMark(from, to, mark.create({ tone: safe }));
    dispatch(tr);
    return true;
  };
}

/** Restyle one callout. Leaving `icon` unset keeps it automatic, so it follows the tone. */
export function setCalloutStyle(pos: number, patch: { tone?: string; icon?: string }): Command {
  return (state, dispatch) => {
    const node = pos >= 0 && pos < state.doc.content.size ? state.doc.nodeAt(pos) : null;
    if (node?.type !== pagesSchema.nodes.callout) return false;
    if (!dispatch) return true;
    const tone = patch.tone === undefined ? node.attrs.tone : safePagesCalloutTone(patch.tone);
    const icon = patch.icon === undefined ? node.attrs.icon : safePagesCalloutIcon(patch.icon);
    dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, tone, icon }));
    return true;
  };
}

/** Tone currently covering the selection, or "" when the range is mixed or plain. */
export function toneAt(state: EditorState, kind: "font_color" | "highlight"): string {
  const mark = pagesSchema.marks[kind];
  const { from, to, empty, $from } = state.selection;
  if (empty) return safePagesTone(mark.isInSet(state.storedMarks ?? $from.marks())?.attrs.tone);
  let found: string | null = null;
  let mixed = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const tone = safePagesTone(mark.isInSet(node.marks)?.attrs.tone);
    if (found === null) found = tone;
    else if (found !== tone) mixed = true;
  });
  return mixed ? "" : found ?? "";
}

const MARKDOWN_DIVIDER = /^(?:---|___|\*\*\*)$/u;
const MARKDOWN_FENCE = /^```([A-Za-z0-9_+#-]*)?$/u;

/**
 * A paragraph that is only `---`, `***`, `___`, or a ``` fence becomes that block.
 * The fence's language tag is folded through the same allowlist as the code menu.
 */
export function markdownBlock(state: EditorState, start: number) {
  const $start = state.doc.resolve(start);
  const parent = $start.parent;
  if (parent.type !== pagesSchema.nodes.paragraph || $start.depth < 1) return null;
  const text = parent.textContent;
  const container = $start.node($start.depth - 1);
  const index = $start.index($start.depth - 1);
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

/** ArrowDown at the end of a code block steps out, adding a paragraph when nothing follows. */
export const leaveCodeDown: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.type.spec.code) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  const after = $from.after();
  if (after < state.doc.content.size) {
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(after), 1)).scrollIntoView());
    return true;
  }
  return exitCode(state, dispatch);
};

/** ArrowUp at the start of a code block steps into the previous block. */
export const leaveCodeUp: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.type.spec.code) return false;
  if ($from.parentOffset !== 0) return false;
  const before = $from.before();
  if (before <= 0) return false;
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(before), -1)).scrollIntoView());
  return true;
};

/** Replace any link mark on [from, to) with `href`; an unsafe or empty href just removes it. */
export function setLink(from: number, to: number, href: string): Command {
  return (state, dispatch) => {
    if (from >= to) return false;
    if (!dispatch) return true;
    const mark = pagesSchema.marks.link;
    const safe = safePagesHref(href);
    const tr = state.tr.removeMark(from, to, mark);
    if (safe) tr.addMark(from, to, mark.create({ href: safe }));
    dispatch(tr);
    return true;
  };
}
