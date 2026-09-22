import { chainCommands, exitCode, lift, selectAll, setBlockType, splitBlockAs } from "prosemirror-commands";
import { Fragment, Node, ResolvedPos } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
import { safePagesLanguage } from "./code-language.js";
import { convertedBlocks, convertedNodes } from "./convert.js";
import { bookmarkLabel, imageAlt, safePagesHref, safePagesImageSrc, safePagesImageWidth } from "./link.js";
import { blocksFromMarkdown } from "./paste-markdown.js";
import { deleteAtPos, deleteSpan as deleteSpanDoc, dragRows, duplicateAtPos, duplicateSpan as duplicateSpanDoc, placeDragged, placeSpan, reorderTopLevel, spanRoots } from "./reorder.js";
import { pagesSchema, safePagesColumnShare } from "./schema.js";
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

const LIST_PARENT = new Set(["bullet_list", "ordered_list", "task_list"]);

export interface SlashSession {
  from: number;
  to: number;
  query: string;
  rowPos: number;
  /** The slash token is the whole row, so the chosen block takes its place. */
  replacesRow: boolean;
}

function insideTable($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === "table" || name === "table_row" || name === "table_cell" || name === "table_header") return true;
  }
  return false;
}

/**
 * The `/query` in front of the caret. Works in nested paragraphs, not only the
 * top of the document. Code and table cells stay literal.
 */
export function slashSession(state: EditorState): SlashSession | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code || insideTable($from)) return null;
  const before = parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const matched = /\/([^\s/]*)$/u.exec(before);
  if (!matched || matched.index == null) return null;
  const query = matched[1] ?? "";
  let fromOffset = matched.index;
  if (fromOffset > 0 && /\s/u.test(before.charAt(fromOffset - 1))) fromOffset -= 1;
  const from = $from.start() + fromOffset;
  const to = $from.pos;
  const rowPos = rowUnderSelection(state);
  const row = rowPos >= 0 ? state.doc.nodeAt(rowPos) : null;
  if (!row) return null;
  return {
    from,
    to,
    query,
    rowPos,
    replacesRow: from === $from.start() && to === $from.end() && row.textContent === parent.textContent,
  };
}

function insertNodeAfter(doc: Node, rowPos: number, node: Node): { from: number; to: number; nodes: Node[] } | null {
  const row = doc.nodeAt(rowPos);
  if (!row) return null;
  const $pos = doc.resolve(rowPos);
  const parent = $pos.parent;
  const index = $pos.index();
  if (parent.canReplace(index + 1, index + 1, Fragment.from(node))) {
    const at = rowPos + row.nodeSize;
    return { from: at, to: at, nodes: [node] };
  }
  if (!LIST_PARENT.has(parent.type.name) || $pos.depth < 1) return null;
  const before: Node[] = [];
  const after: Node[] = [];
  parent.forEach((child, _offset, childIndex) => {
    if (childIndex <= index) before.push(child);
    else after.push(child);
  });
  const pieces: Node[] = [];
  if (before.length) pieces.push(parent.type.create(parent.attrs, before));
  pieces.push(node);
  if (after.length) pieces.push(parent.type.create(parent.attrs, after));
  const listPos = $pos.before();
  const grand = doc.resolve(listPos);
  if (!grand.parent.canReplace(grand.index(), grand.index() + 1, Fragment.from(pieces))) return null;
  return { from: listPos, to: listPos + parent.nodeSize, nodes: pieces };
}

function slashHostOffset(row: Node): number | null {
  if (row.isTextblock && !row.type.spec.code) return 0;
  const first = row.firstChild;
  const named = row.type.name === "list_item" || row.type.name === "task_item"
    || row.type.name === "callout" || row.type.name === "blockquote" || row.type.name === "toggle";
  if (named && first?.isTextblock && !first.type.spec.code) return 1;
  return null;
}

function slashBlockFor(parentName: string): Node {
  const paragraph = pagesSchema.nodes.paragraph.create(null, pagesSchema.text("/"));
  if (parentName === "bullet_list" || parentName === "ordered_list") {
    return pagesSchema.nodes.list_item.create(null, paragraph);
  }
  if (parentName === "task_list") {
    return pagesSchema.nodes.task_item.create({ checked: false }, paragraph);
  }
  return paragraph;
}

function caretAfterSlash(node: Node): number {
  return node.isTextblock ? 2 : 3;
}

/**
 * The block handle's plus. An empty text row receives `/` in place so the slash
 * menu opens there. A row that already has words gets a new sibling below it.
 */

export function insertSlashBelow(state: EditorState, rowPos: number, where: "auto" | "after" = "auto") {
  if (rowPos < 0 || rowPos > state.doc.content.size) return null;
  const row = state.doc.nodeAt(rowPos);
  if (!row) return null;
  if (where === "auto") {
    const host = slashHostOffset(row);
    if (host != null && row.textContent === "") {
      const at = rowPos + host + 1;
      const tr = state.tr.insertText("/", at);
      return tr.setSelection(TextSelection.create(tr.doc, at + 1));
    }
  }
  const parentName = state.doc.resolve(rowPos).parent.type.name;
  const block = slashBlockFor(parentName);
  const plan = insertNodeAfter(state.doc, rowPos, block);
  if (!plan) return null;
  const tr = state.tr.replaceWith(plan.from, plan.to, plan.nodes);
  const origin = plan.nodes[0] === block ? plan.from : plan.from + plan.nodes[0].nodeSize;
  return tr.setSelection(TextSelection.create(tr.doc, origin + caretAfterSlash(block)));
}

/**
 * The gap line stays blank until there is real input. Empty or whitespace-only
 * text inserts nothing. A lone URL becomes a bookmark; other text becomes blocks.
 */
export function commitGap(state: EditorState, afterIndex: number, raw: string) {
  if (afterIndex < 0 || afterIndex >= state.doc.childCount) return null;
  if (!raw.trim()) return null;
  const at = blockPos(state.doc, afterIndex) + state.doc.child(afterIndex).nodeSize;
  const trimmed = raw.trim();
  const image = safePagesImageSrc(trimmed);
  const href = !image && /^\S+$/u.test(trimmed) ? safePagesHref(trimmed) : "";
  const blocks = image
    ? [pagesSchema.nodes.image.create({ src: image, alt: image.startsWith("data:") ? "图片" : imageAlt(image) })]
    : href
      ? [pagesSchema.nodes.bookmark.create({ href, title: bookmarkLabel(href) })]
      : blocksFromMarkdown(raw) ?? [pagesSchema.nodes.paragraph.create(null, [pagesSchema.text(raw)])];
  const tr = state.tr.insert(at, blocks);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + blocks[0].nodeSize, tr.doc.content.size)), -1));
}

function emptyColumn(): Node {
  return pagesSchema.nodes.column.create(null, pagesSchema.nodes.paragraph.create());
}

/** Move width from the next column into this one. The pair keeps the same total. */
export function nudgeColumnShare(state: EditorState, listPos: number, index: number, delta: number) {
  const list = listPos >= 0 && listPos <= state.doc.content.size ? state.doc.nodeAt(listPos) : null;
  if (!list || list.type !== pagesSchema.nodes.column_list) return null;
  if (!Number.isFinite(delta) || index < 0 || index >= list.childCount - 1) return null;
  const left = list.child(index);
  const right = list.child(index + 1);
  const leftShare = safePagesColumnShare(left.attrs.width);
  const rightShare = safePagesColumnShare(right.attrs.width);
  const sum = leftShare + rightShare;
  const nextLeft = Math.max(0.2, Math.min(sum - 0.2, Math.round((leftShare + delta) * 100) / 100));
  const nextRight = Math.round((sum - nextLeft) * 100) / 100;
  if (nextLeft === leftShare && nextRight === rightShare) return null;
  let leftPos = listPos + 1;
  for (let i = 0; i < index; i += 1) leftPos += list.child(i).nodeSize;
  const tr = state.tr.setNodeMarkup(leftPos, undefined, { ...left.attrs, width: nextLeft });
  tr.setNodeMarkup(leftPos + left.nodeSize, undefined, { ...right.attrs, width: nextRight });
  return tr;
}

/** Append one column to a column list and put the caret in its empty paragraph. */
export function addColumn(state: EditorState, pos: number) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.column_list) return null;
  const at = pos + node.nodeSize - 1;
  const tr = state.tr.insert(at, emptyColumn());
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
}

/** Drop the column frame and leave each column's blocks in order. */
export function unwrapColumns(state: EditorState, pos: number) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.column_list) return null;
  const blocks: Node[] = [];
  node.forEach((column) => column.forEach((child) => blocks.push(child)));
  if (!blocks.length) return null;
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, Fragment.from(blocks))) return null;
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, blocks);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size))));
}

/** Set an image's pixel width. Zero restores the full line. Other blocks are left alone. */
export function setImageWidth(state: EditorState, pos: number, width: number) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.image) return null;
  const next = safePagesImageWidth(width);
  if (next === safePagesImageWidth(node.attrs.width)) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: next });
}

/** Put a checked image where the caret is. An empty paragraph is replaced; otherwise the image follows that row. */
export function insertImage(state: EditorState, src: string, alt = "") {
  const safe = safePagesImageSrc(src);
  if (!safe) return null;
  const image = pagesSchema.nodes.image.create({
    src: safe,
    alt: alt || (safe.startsWith("data:") ? "图片" : imageAlt(safe)),
  });
  const { $from } = state.selection;
  if ($from.parent.type === pagesSchema.nodes.paragraph && $from.parent.content.size === 0 && $from.depth >= 1) {
    const at = $from.before();
    const $at = state.doc.resolve(at);
    if ($at.parent.canReplace($at.index(), $at.index() + 1, Fragment.from(image))) {
      const tr = state.tr.replaceWith(at, $from.after(), image);
      return tr.setSelection(NodeSelection.create(tr.doc, at));
    }
  }
  const rowPos = rowUnderSelection(state);
  if (rowPos < 0) return null;
  const plan = insertNodeAfter(state.doc, rowPos, image);
  if (!plan) return null;
  const tr = state.tr.replaceWith(plan.from, plan.to, plan.nodes);
  const origin = plan.nodes[0] === image ? plan.from : plan.from + plan.nodes[0].nodeSize;
  return tr.setSelection(NodeSelection.create(tr.doc, origin));
}

/** Turn the slash token into `node`. A partial line keeps the words in front of `/`. */
export function applySlash(state: EditorState, node: Node) {
  const session = slashSession(state);
  if (!session) return null;
  if (session.replacesRow) return replaceEnclosingRow(state, node);
  const tr = state.tr.delete(session.from, session.to);
  const rowPos = tr.mapping.map(session.rowPos);
  const plan = insertNodeAfter(tr.doc, rowPos, node);
  if (!plan) return null;
  tr.replaceWith(plan.from, plan.to, plan.nodes);
  const cursor = plan.nodes[0] === node ? plan.from : plan.from + plan.nodes[0].nodeSize;
  return tr.setSelection(caretAt(tr, cursor + 1));
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

/**
 * Turn the selected rows into `id`. Contiguous siblings become one conversion:
 * several paragraphs become one list, and a list splits when the new blocks
 * cannot sit inside it. Rows from different parents, or a group that contains
 * a table, stay put.
 */
export function turnSpanInto(state: EditorState, anchor: number, head: number, id: string) {
  const roots = spanRoots(state.doc, anchor, head);
  if (!roots.length) return null;
  const parentPos = roots[0].parentPos;
  for (let i = 1; i < roots.length; i += 1) {
    if (roots[i].parentPos !== parentPos) return null;
    const prev = state.doc.nodeAt(roots[i - 1].pos);
    if (!prev || roots[i - 1].pos + prev.nodeSize !== roots[i].pos) return null;
  }
  const sources: Node[] = [];
  for (const root of roots) {
    const node = state.doc.nodeAt(root.pos);
    if (!node) return null;
    sources.push(node);
  }
  const next = convertedNodes(id, sources);
  if (!next?.length) return null;
  const from = roots[0].pos;
  const last = sources[sources.length - 1];
  const to = roots[roots.length - 1].pos + last.nodeSize;
  const parent = parentPos == null ? state.doc : state.doc.nodeAt(parentPos);
  if (!parent) return null;
  const start = roots[0].index;
  const end = roots[roots.length - 1].index + 1;
  if (parent.canReplace(start, end, Fragment.from(next))) {
    const tr = state.tr.replaceWith(from, to, next);
    return tr.setSelection(caretAt(tr, from + 1));
  }
  if (!LIST_PARENT.has(parent.type.name) || parentPos == null) return null;
  const before: Node[] = [];
  const after: Node[] = [];
  parent.forEach((child, _offset, index) => {
    if (index < start) before.push(child);
    else if (index >= end) after.push(child);
  });
  const pieces: Node[] = [];
  if (before.length) pieces.push(parent.type.create(parent.attrs, before));
  pieces.push(...next);
  if (after.length) pieces.push(parent.type.create(parent.attrs, after));
  const grand = state.doc.resolve(parentPos);
  if (!grand.parent.canReplace(grand.index(), grand.index() + 1, Fragment.from(pieces))) return null;
  const tr = state.tr.replaceWith(parentPos, parentPos + parent.nodeSize, pieces);
  const origin = before.length ? parentPos + pieces[0].nodeSize : parentPos;
  return tr.setSelection(caretAt(tr, origin + 1));
}

/** The nearest list around the caret, so the format bar can show which list is on. */
export function activeList(state: EditorState): "bullet_list" | "ordered_list" | "task_list" | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "bullet_list" || name === "ordered_list" || name === "task_list") return name;
  }
  return null;
}

/**
 * Format-bar lists toggle. The same kind lifts the current item back to a
 * paragraph. Another kind converts just that item, and siblings stay put.
 */
export function applyList(state: EditorState, id: "bullet_list" | "ordered_list" | "task_list") {
  if (activeList(state) === id) {
    const item = id === "task_list" ? pagesSchema.nodes.task_item : pagesSchema.nodes.list_item;
    let lifted: Transaction | null = null;
    const ok = liftListItem(item)(state, (tr) => { lifted = tr; });
    return ok ? lifted : null;
  }
  return turnRowInto(state, id);
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

/**
 * Backspace in a column whose only block is empty removes that column.
 * With two columns left, the frame goes away and the other column's blocks stay.
 */
export const collapseEmptyColumn: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size !== 0 || $from.parentOffset !== 0) return false;
  const frame = columnContext($from);
  if (!frame || $from.depth !== frame.columnDepth + 1) return false;
  const column = $from.node(frame.columnDepth);
  if (column.childCount !== 1) return false;
  const list = $from.node(frame.listDepth);
  if (list.childCount < 2) return false;
  const columnIndex = $from.index(frame.listDepth);
  if (!dispatch) return true;
  if (list.childCount === 2) {
    const other = list.child(columnIndex === 0 ? 1 : 0);
    const blocks: Node[] = [];
    other.forEach((child) => blocks.push(child));
    const listFrom = $from.before(frame.listDepth);
    const $list = state.doc.resolve(listFrom);
    if (!$list.parent.canReplace($list.index(), $list.index() + 1, Fragment.from(blocks))) return false;
    const tr = state.tr.replaceWith(listFrom, $from.after(frame.listDepth), blocks);
    const size = blocks.reduce((total, block) => total + block.nodeSize, 0);
    const pos = columnIndex === 0 ? listFrom + 1 : Math.min(listFrom + size, tr.doc.content.size);
    const bias = columnIndex === 0 ? 1 : -1;
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos), bias)).scrollIntoView());
    return true;
  }
  const from = $from.before(frame.columnDepth);
  const tr = state.tr.delete(from, $from.after(frame.columnDepth));
  const bias = columnIndex === 0 ? 1 : -1;
  dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), bias)).scrollIntoView());
  return true;
};

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

/** Shift-Enter keeps the block and inserts a line break. Inside code it inserts a newline. */
export const insertHardBreak: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return false;
  if (!dispatch) return true;
  if ($from.parent.type.spec.code) {
    dispatch(state.tr.insertText("\n").scrollIntoView());
    return true;
  }
  dispatch(state.tr.replaceSelectionWith(pagesSchema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

/**
 * Enter in a heading keeps the left side as the heading. The right side, including
 * an empty line at the end, becomes a paragraph. At the very start, the new
 * paragraph is inserted above and the heading stays whole.
 */
export const enterHeading: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if ($from.parent.type !== pagesSchema.nodes.heading || !$from.sameParent($to)) return false;
  return splitBlockAs((node, atEnd, $pos) => {
    if (node.type !== pagesSchema.nodes.heading || atEnd || $pos.parentOffset === 0) return null;
    return { type: pagesSchema.nodes.paragraph };
  })(state, dispatch);
};

/** Mod-Enter flips the to-do under the caret. Other items keep their own check. */
export const toggleTaskChecked: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type !== pagesSchema.nodes.task_item) continue;
    if (!dispatch) return true;
    dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: !node.attrs.checked }));
    return true;
  }
  return false;
};

/**
 * Enter on a code block's empty last line steps out into a paragraph and
 * removes that blank line. A line that still has code stays inside the block.
 */
export const leaveEmptyCodeLine: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.type.spec.code) return false;
  const text = $from.parent.textContent;
  if ($from.parentOffset !== text.length) return false;
  const lineStart = text.lastIndexOf("\n") + 1;
  if (text.slice(lineStart).length > 0) return false;
  const paragraph = pagesSchema.nodes.paragraph.create();
  const blockPos = $from.before();
  const $block = state.doc.resolve(blockPos);
  if (lineStart === 0) {
    if (!$block.parent.canReplace($block.index(), $block.index() + 1, Fragment.from(paragraph))) return false;
    if (!dispatch) return true;
    const tr = state.tr.replaceWith(blockPos, $from.after(), paragraph);
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(blockPos + 1, tr.doc.content.size)))).scrollIntoView());
    return true;
  }
  if (!$block.parent.canReplace($block.index() + 1, $block.index() + 1, Fragment.from(paragraph))) return false;
  if (!dispatch) return true;
  const tr = state.tr.delete($from.pos - 1, $from.pos);
  const block = tr.doc.nodeAt(blockPos);
  if (!block) return false;
  const at = blockPos + block.nodeSize;
  tr.insert(at, paragraph);
  dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))).scrollIntoView());
  return true;
};

/** Enter in a to-do splits the item, and the new item starts unchecked. */
export const splitTaskItem: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to)) return false;
  let inTask = false;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === pagesSchema.nodes.task_item) inTask = true;
  }
  if (!inTask) return false;
  return splitListItem(pagesSchema.nodes.task_item)(state, dispatch && ((tr) => {
    const $pos = tr.selection.$from;
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type !== pagesSchema.nodes.task_item) continue;
      if (node.attrs.checked) tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: false });
      break;
    }
    dispatch(tr.scrollIntoView());
  }));
};

/** Tab inside a code block inserts two spaces instead of indenting a list. */
export const insertCodeIndent: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.type.spec.code) return false;
  if (dispatch) dispatch(state.tr.insertText("  ").scrollIntoView());
  return true;
};

/** Shift-Tab inside a code block removes up to two spaces before the caret. */
export const removeCodeIndent: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.type.spec.code || $from.parentOffset === 0) return false;
  const size = Math.min(2, $from.parentOffset);
  const before = $from.parent.textBetween($from.parentOffset - size, $from.parentOffset);
  const spaces = before.match(/ +$/)?.[0].length ?? 0;
  if (!spaces) return false;
  if (dispatch) dispatch(state.tr.delete($from.pos - spaces, $from.pos).scrollIntoView());
  return true;
};

/**
 * Move the caret to the nth heading and open any toggle hiding it.
 * Index follows document order, so two headings with the same words stay distinct.
 */
export function revealHeading(state: EditorState, index: number) {
  if (index < 0) return null;
  let found = -1;
  let seen = 0;
  state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type !== pagesSchema.nodes.heading) return;
    if (seen === index) found = pos;
    seen += 1;
  });
  if (found < 0) return null;
  const tr = state.tr;
  const $pos = state.doc.resolve(found);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type === pagesSchema.nodes.toggle && !node.attrs.open) {
      tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, open: true });
    }
  }
  const at = tr.mapping.map(found);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))).scrollIntoView();
}

/** Flip a toggle's open flag. The summary and the hidden body stay put. */
export function setToggleOpen(state: EditorState, pos: number) {
  const node = state.doc.nodeAt(pos);
  if (node?.type !== pagesSchema.nodes.toggle) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: !node.attrs.open });
}

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

/** Comment range under the caret, or the current selection when it is not inside one yet. */
export function commentAt(doc: Node, selection: { from: number; to: number; $from: ResolvedPos }):
  { from: number; to: number; text: string; id: string } | null {
  const mark = pagesSchema.marks.comment;
  const { from, to, $from } = selection;
  const found = $from.marks().find((item) => item.type === mark);
  if (found) {
    let start = from;
    let end = to;
    doc.nodesBetween(Math.max(0, from - 1), Math.min(doc.content.size, to + 1), (node, pos) => {
      if (!node.isText || !found.isInSet(node.marks)) return;
      start = Math.min(start, pos);
      end = Math.max(end, pos + node.nodeSize);
    });
    return { from: start, to: end, text: String(found.attrs.text || ""), id: String(found.attrs.id || "") };
  }
  if (from === to) return null;
  return { from, to, text: "", id: "" };
}

/** Add, replace, or clear a comment on [from, to). Blank text removes it. The words stay. */
export function setComment(from: number, to: number, text: string, id = ""): Command {
  return (state, dispatch) => {
    if (from >= to) return false;
    if (!dispatch) return true;
    const mark = pagesSchema.marks.comment;
    const tr = state.tr.removeMark(from, to, mark);
    const body = text.trim();
    if (body) tr.addMark(from, to, mark.create({ id, text: body }));
    dispatch(tr);
    return true;
  };
}

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

const INLINE_MARKS = ["strong", "em", "underline", "strike", "code", "font_color", "highlight", "link", "comment"] as const;

/** Drop inline styles on the selection. With only a caret, the next characters are plain. */
export const clearInlineMarks: Command = (state, dispatch) => {
  const types = INLINE_MARKS.map((name) => pagesSchema.marks[name]);
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const stored = state.storedMarks ?? $from.marks();
    const active = types.filter((type) => type.isInSet(stored));
    if (!active.length) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    active.forEach((type) => tr.removeStoredMark(type));
    dispatch(tr);
    return true;
  }
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && types.some((type) => type.isInSet(node.marks))) found = true;
  });
  if (!found) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  types.forEach((type) => tr.removeMark(from, to, type));
  dispatch(tr);
  return true;
};

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

/** Paint the blocks at `positions`. One list item stays one item; siblings are left alone. */
export function setRowsTone(
  state: EditorState,
  positions: readonly number[],
  kind: "font_color" | "highlight",
  tone: string,
) {
  const unique = [...new Set(positions)].filter((pos) => {
    if (pos < 0 || pos > state.doc.content.size) return false;
    return Boolean(state.doc.nodeAt(pos)?.isBlock);
  });
  if (!unique.length) return null;
  const mark = pagesSchema.marks[kind];
  const safe = safePagesTone(tone);
  const tr = state.tr;
  for (const pos of unique) {
    const node = state.doc.nodeAt(pos);
    if (!node) continue;
    tr.removeMark(pos, pos + node.nodeSize, mark);
    if (safe) tr.addMark(pos, pos + node.nodeSize, mark.create({ tone: safe }));
  }
  return tr;
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

type ColumnEdge = "left" | "right" | "up" | "down";

function columnContext($from: ResolvedPos): { columnDepth: number; listDepth: number } | null {
  const s = pagesSchema.nodes;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type !== s.column) continue;
    const listDepth = depth - 1;
    if ($from.node(listDepth).type !== s.column_list) return null;
    return { columnDepth: depth, listDepth };
  }
  return null;
}

/** True when the caret is at the first or last editable spot of this column. */
function atColumnEdge($from: ResolvedPos, columnDepth: number, end: boolean): boolean {
  if ($from.parentOffset !== (end ? $from.parent.content.size : 0)) return false;
  const column = $from.node(columnDepth);
  const childIndex = $from.index(columnDepth);
  if (end ? childIndex !== column.childCount - 1 : childIndex !== 0) return false;
  for (let depth = columnDepth + 1; depth < $from.depth; depth += 1) {
    const index = $from.index(depth);
    const parent = $from.node(depth);
    if (end ? index !== parent.childCount - 1 : index !== 0) return false;
  }
  return true;
}

function columnChildPos($from: ResolvedPos, listDepth: number, index: number): number {
  let pos = $from.start(listDepth);
  const list = $from.node(listDepth);
  for (let i = 0; i < index; i += 1) pos += list.child(i).nodeSize;
  return pos;
}

/**
 * Where the caret should go when an arrow key hits the edge of a column.
 * Left and right move between columns. Up and down leave the whole layout.
 * `null` means the key should keep its normal movement.
 */
export function columnEdgeTarget(state: EditorState, edge: ColumnEdge): number | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const frame = columnContext($from);
  if (!frame) return null;
  const { columnDepth, listDepth } = frame;
  const atStart = atColumnEdge($from, columnDepth, false);
  const atEnd = atColumnEdge($from, columnDepth, true);
  if ((edge === "left" || edge === "up") && !atStart) return null;
  if ((edge === "right" || edge === "down") && !atEnd) return null;
  const list = $from.node(listDepth);
  const columnIndex = $from.index(listDepth);
  if (edge === "left" && columnIndex > 0) {
    const node = list.child(columnIndex - 1);
    return columnChildPos($from, listDepth, columnIndex - 1) + node.nodeSize - 1;
  }
  if (edge === "right" && columnIndex < list.childCount - 1) {
    return columnChildPos($from, listDepth, columnIndex + 1) + 1;
  }
  if (edge === "left" || edge === "up") {
    const before = $from.before(listDepth);
    return before > 0 ? before : null;
  }
  const after = $from.after(listDepth);
  return after < state.doc.content.size ? after : null;
}

/** Move across a column edge. Returns false so a normal arrow key still runs inside the column. */
export function moveColumnEdge(edge: ColumnEdge): Command {
  return (state, dispatch) => {
    const target = columnEdgeTarget(state, edge);
    if (target == null) return false;
    if (!dispatch) return true;
    const bias = edge === "left" || edge === "up" ? -1 : 1;
    dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(target), bias)).scrollIntoView());
    return true;
  };
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
