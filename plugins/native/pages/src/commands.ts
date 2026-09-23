import { chainCommands, exitCode, lift, selectAll, setBlockType, splitBlock, splitBlockAs } from "prosemirror-commands";
import { Fragment, Node, ResolvedPos } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
import { safePagesLanguage } from "./code-language.js";
import { convertedBlocks, convertedNodes } from "./convert.js";
import { bookmarkLabel, imageAlt, safePagesBookmarkTitle, safePagesHref, safePagesImageCaption, safePagesImageSrc, safePagesImageWidth } from "./link.js";
import { blocksFromMarkdown } from "./paste-markdown.js";
import { deleteAtPos, deleteSpan as deleteSpanDoc, dragRows, duplicateAtPos, duplicateSpan as duplicateSpanDoc, placeCopySpan, placeDragged, placeSpan, reorderTopLevel, spanRoots } from "./reorder.js";
import { pagesSchema, safePagesColumnShare } from "./schema.js";
import { safePagesTone } from "./tone.js";

export function blockPos(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

/** Caret position at the start of the first text, for leaving the page title. */
export function docStart(doc: Node): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return;
    found = pos + 1;
    return false;
  });
  if (found >= 0) return Math.min(found, doc.content.size);
  return TextSelection.near(doc.resolve(0), 1).from;
}

/** Triple-click selects the whole text block, hard breaks included. A click on an atom selects that block. */
export function tripleClickSelection(doc: Node, pos: number): { from: number; to: number; atom: boolean } | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  const after = $pos.nodeAfter;
  if (after?.isAtom && after.isBlock) return { from: clamped, to: clamped + after.nodeSize, atom: true };
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.isTextblock) return { from: $pos.start(depth), to: $pos.end(depth), atom: false };
  }
  return null;
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
    if (next.length === 1 && next[0].eq(node)) return true;
    if (!doc.canReplace(index, index + 1, Fragment.from(next))) return false;
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
    if (dispatch) {
      const tr = state.tr.replaceWith(0, state.doc.content.size, next.content);
      dispatch(tr.setSelection(caretAt(tr, pos, -1)).scrollIntoView());
    }
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

/** Copy the selected rows into the gap at `level`. The originals stay where they are. */
export function copyDragSpan(anchor: number, head: number, gap: number, level: number): Command {
  return (state, dispatch) => {
    const next = placeCopySpan(state.doc, anchor, head, gap, level);
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
    if (dispatch) {
      const from = spanRoots(state.doc, anchor, head)[0].pos;
      const tr = state.tr.replaceWith(0, state.doc.content.size, next.content);
      dispatch(tr.setSelection(caretAt(tr, from, -1)).scrollIntoView());
    }
    return true;
  };
}

/** Copy the selected rows as a group after the last one. */
export function duplicateSpan(anchor: number, head: number): Command {
  return (state, dispatch) => {
    const next = duplicateSpanDoc(state.doc, anchor, head);
    if (!next) return false;
    if (dispatch) {
      const roots = spanRoots(state.doc, anchor, head);
      const last = roots[roots.length - 1];
      const at = last.pos + state.doc.nodeAt(last.pos)!.nodeSize;
      const copies = roots.map((row) => state.doc.nodeAt(row.pos)!);
      const tr = state.tr.insert(at, Fragment.from(copies));
      dispatch(tr.setSelection(caretAt(tr, at + 1)).scrollIntoView());
    }
    return true;
  };
}

/** Insert a copy of the row at `pos` immediately after it. */
export function duplicateRow(pos: number): Command {
  return (state, dispatch) => {
    const next = duplicateAtPos(state.doc, pos);
    if (!next) return false;
    if (dispatch) {
      const node = state.doc.nodeAt(pos)!;
      const at = pos + node.nodeSize;
      const tr = state.tr.insert(at, node);
      dispatch(tr.setSelection(caretAt(tr, at + 1)).scrollIntoView());
    }
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
/** What a slash or mention menu should do with a key. `hold` eats the key so Enter does not split the line. */
export function menuKey(key: string, count: number): "choose" | "next" | "prev" | "close" | "hold" | "pass" {
  if (key === "Escape") return "close";
  if (key === "ArrowDown") return count > 0 ? "next" : "hold";
  if (key === "ArrowUp") return count > 0 ? "prev" : "hold";
  if (key === "Enter" || key === "Tab") return count > 0 ? "choose" : "hold";
  return "pass";
}

/** Escape closes a link, comment, note, or writing pop without applying it. */
export function popEscape(open: boolean, key: string): boolean {
  return open && key === "Escape";
}

/** Block-menu keys. A number is the next highlighted button. `null` leaves the key to the editor. */
export function blockMenuKey(
  index: number,
  count: number,
  key: string,
  nested = false,
  opens = false,
): number | "run" | "close" | "back" | "stay" | null {
  if (key === "Escape") return "close";
  if (count <= 0) return null;
  if (key === "ArrowLeft") return nested ? "back" : "stay";
  if (key === "ArrowRight") return opens ? "run" : "stay";
  if (key === "Enter") return "run";
  if (key === "ArrowDown") return index < 0 ? 0 : (index + 1) % count;
  if (key === "ArrowUp") return index < 0 ? count - 1 : (index - 1 + count) % count;
  return null;
}

/** Pointer moved onto a menu row. The same row, or a row that is not in the menu, stays put. */
export function hoverMenuIndex(current: number, next: number, count: number): number | null {
  if (!Number.isInteger(next) || next < 0 || next >= count || next === current) return null;
  return next;
}

/** Cmd or Ctrl and slash opens the block menu. A plain slash still types. Shift and Alt leave the key alone. */
export function blockMenuShortcut(key: string, mod: boolean, alt: boolean, shift: boolean): boolean {
  return mod && !alt && !shift && key === "/";
}

/** The drag row that holds `pos`, so a keyboard block menu opens on the caret's block. */
export function blockMenuTarget(doc: Node, pos: number): number | null {
  let hit: number | null = null;
  for (const row of dragRows(doc)) {
    const node = doc.nodeAt(row.pos);
    if (node && pos >= row.pos && pos < row.pos + node.nodeSize) hit = row.pos;
  }
  return hit;
}

/** The slash or mention token to remove when the menu closes because the caret left it. Typing stays. */
export function dismissedMenuRange(
  wasOpen: boolean,
  stillOpen: boolean,
  docChanged: boolean,
  token: { from: number; to: number } | null,
  selectionFrom: number,
  selectionTo: number,
): { from: number; to: number } | null {
  if (!wasOpen || stillOpen || docChanged || !token || token.from >= token.to) return null;
  if (selectionFrom <= token.to && selectionTo >= token.from) return null;
  return { from: token.from, to: token.to };
}

/** Where the grip sits. A hovered row wins; otherwise it follows the caret. */
export function handleAnchor(hoverPos: number, caretPos: number): { pos: number; followingCaret: boolean } | null {
  if (hoverPos >= 0) return { pos: hoverPos, followingCaret: false };
  if (caretPos >= 0) return { pos: caretPos, followingCaret: true };
  return null;
}

/** Mouse hover sticks until the caret moves. A selection change sends the grip back to the caret. */
export function hoverPosAfter(prev: number, selectionChanged: boolean, metaPos: number | undefined): number {
  if (typeof metaPos === "number") return metaPos;
  if (selectionChanged) return -1;
  return prev;
}

/** Move a block span by one row. `extend` keeps the anchor; otherwise the span collapses onto the new row. At the end, the span stays. */
export function blockSpanStep(
  doc: Node,
  anchor: number,
  head: number,
  direction: -1 | 1,
  extend: boolean,
): { anchor: number; head: number } | null {
  const rows = dragRows(doc);
  const headIndex = rows.findIndex((row) => row.pos === head);
  if (headIndex < 0) return null;
  const next = rows[headIndex + direction];
  if (!next) return { anchor, head };
  return { anchor: extend ? anchor : next.pos, head: next.pos };
}

/** Shift+arrow from a fully selected block starts a span with the neighbor. A caret or a partial selection stays in the text. */
export function blockSpanFromSelection(
  doc: Node,
  from: number,
  to: number,
  direction: -1 | 1,
): { anchor: number; head: number } | null {
  if (from === to) return null;
  let covered: number | null = null;
  for (const row of dragRows(doc)) {
    const node = doc.nodeAt(row.pos);
    if (!node) continue;
    const start = node.isTextblock ? row.pos + 1 : row.pos;
    const end = node.isTextblock ? row.pos + node.nodeSize - 1 : row.pos + node.nodeSize;
    if (from === start && to === end) covered = row.pos;
  }
  if (covered == null) return null;
  return blockSpanStep(doc, covered, covered, direction, true);
}

/** A text selection that covers whole blocks becomes the same span as Shift+arrow. A partial block stays text. */
export function blockSpanFromRange(doc: Node, from: number, to: number): { anchor: number; head: number } | null {
  if (from >= to) return null;
  const rows = dragRows(doc);
  const covered: Array<{ pos: number; size: number }> = [];
  for (const row of rows) {
    const node = doc.nodeAt(row.pos);
    if (!node) continue;
    const hasChild = rows.some((other) => other.pos > row.pos && other.pos < row.pos + node.nodeSize);
    const range = node.isTextblock || (!node.isAtom && !hasChild)
      ? textRange(node, row.pos)
      : { start: row.pos, end: row.pos + node.nodeSize };
    if (to <= range.start || from >= range.end) continue;
    if (from <= range.start && to >= range.end) {
      covered.push({ pos: row.pos, size: node.nodeSize });
      continue;
    }
    if (node.isTextblock || node.isAtom || !hasChild) return null;
  }
  const outer = covered.filter((row) => !covered.some((other) => row.pos > other.pos && row.pos < other.pos + other.size));
  if (outer.length < 2) return null;
  return { anchor: outer[0].pos, head: outer[outer.length - 1].pos };
}

/** Shift-click moves the span head to the row under `pos`, among the anchor's siblings.
 * A click inside a nested block lands on the ancestor that shares that parent.
 * A click that would leave those siblings, or a position that is not a row, stays put. */
export function blockSpanToRow(doc: Node, anchor: number, pos: number): { anchor: number; head: number } | null {
  const rows = dragRows(doc);
  const origin = rows.find((row) => row.pos === anchor);
  if (!origin) return null;
  let target = blockMenuTarget(doc, pos);
  const seen = new Set<number>();
  while (target != null && !seen.has(target)) {
    seen.add(target);
    const row = rows.find((item) => item.pos === target);
    if (!row) return null;
    if (row.parentPos === origin.parentPos && row.indent === origin.indent) return { anchor, head: target };
    let parent: number | null = null;
    for (const item of rows) {
      if (item.pos === target) break;
      const node = doc.nodeAt(item.pos);
      if (node && target > item.pos && target < item.pos + node.nodeSize) parent = item.pos;
    }
    target = parent;
  }
  return null;
}

function textRange(node: Node, pos: number): { start: number; end: number } {
  if (node.isTextblock) return { start: pos + 1, end: pos + node.nodeSize - 1 };
  let start = -1;
  let end = -1;
  node.descendants((child, offset) => {
    if (!child.isTextblock) return;
    const at = pos + 1 + offset;
    const childStart = at + 1;
    const childEnd = at + child.nodeSize - 1;
    if (start < 0 || childStart < start) start = childStart;
    if (childEnd > end) end = childEnd;
    return false;
  });
  if (start < 0) return { start: pos, end: pos + node.nodeSize };
  return { start, end };
}

/** More than one block is in the span, so delete and duplicate must take the whole group. */
export function spanIsGroup(doc: Node, anchor: number, head: number): boolean {
  if (anchor < 0 || head < 0 || anchor === head) return false;
  return spanRoots(doc, anchor, head).length > 1;
}

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

/** Set the one-line caption under an image. The address, alt text, and width stay. */
export function setImageCaption(state: EditorState, pos: number, caption: string) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.image) return null;
  const next = safePagesImageCaption(caption);
  if (next === safePagesImageCaption(node.attrs.caption)) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption: next });
}

/** Rename a bookmark. The address stays. An empty name falls back to the site label when rendered. */
export function setBookmarkTitle(state: EditorState, pos: number, title: string) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.bookmark) return null;
  const next = safePagesBookmarkTitle(title);
  if (next === safePagesBookmarkTitle(node.attrs.title)) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: next });
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
  const parent = parentPos == null ? state.doc : state.doc.nodeAt(parentPos);
  if (!parent) return null;
  if (parent.type.name === id && LIST_PARENT.has(id)
    && sources.every((source) => source.type.name === (id === "task_list" ? "task_item" : "list_item"))) return state.tr;
  const next = convertedNodes(id, sources);
  if (!next?.length) return null;
  if (Fragment.from(next).eq(Fragment.from(sources))) return state.tr;
  const from = roots[0].pos;
  const last = sources[sources.length - 1];
  const to = roots[roots.length - 1].pos + last.nodeSize;
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

/** Turn a multi-block grip selection into `id`. The same heading or list again becomes paragraphs. */
export function turnGroup(state: EditorState, anchor: number, head: number, id: string): Transaction | null {
  if (!spanIsGroup(state.doc, anchor, head)) return null;
  const roots = spanRoots(state.doc, anchor, head);
  const nodes = roots.map((row) => state.doc.nodeAt(row.pos));
  if (nodes.some((node) => !node)) return null;
  if (id === "heading1" || id === "heading2" || id === "heading3") {
    const level = Number(id.at(-1));
    const same = nodes.every((node) => node?.type.name === "heading" && Number(node.attrs.level) === level);
    return turnSpanInto(state, anchor, head, same ? "paragraph" : id);
  }
  if (id === "bullet_list" || id === "ordered_list" || id === "task_list") {
    const itemName = id === "task_list" ? "task_item" : "list_item";
    const parentPos = roots[0].parentPos;
    const parent = parentPos == null ? null : state.doc.nodeAt(parentPos);
    const sameList = roots.every((row) => row.parentPos === parentPos)
      && parent?.type.name === id
      && nodes.every((node) => node?.type.name === itemName);
    return turnSpanInto(state, anchor, head, sameList ? "paragraph" : id);
  }
  return turnSpanInto(state, anchor, head, id);
}

/** Strip inline marks from every block in a multi-block selection. A single block stays with `clearInlineMarks`. */
export function clearSpanMarks(state: EditorState, anchor: number, head: number): Transaction | null {
  if (!spanIsGroup(state.doc, anchor, head)) return null;
  const roots = spanRoots(state.doc, anchor, head);
  const types = INLINE_MARKS.map((name) => pagesSchema.marks[name]);
  let found = false;
  const tr = state.tr;
  for (const root of roots) {
    const node = state.doc.nodeAt(root.pos);
    if (!node) continue;
    const from = root.pos;
    const to = root.pos + node.nodeSize;
    state.doc.nodesBetween(from, to, (child) => {
      if (child.isText && types.some((type) => type.isInSet(child.marks))) found = true;
    });
    types.forEach((type) => tr.removeMark(from, to, type));
  }
  return found ? tr : null;
}

/** Rows a text selection actually covers. A caret covers none, so the single-block commands stay in charge. */
function coveredRows(state: EditorState) {
  const { from, to } = state.selection;
  if (from === to) return [];
  const rows = dragRows(state.doc);
  if (state.selection instanceof NodeSelection) return rows.filter((row) => row.pos === from);
  const covered = new Set<number>();
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock && !(node.isBlock && node.isAtom)) return;
    const at = node.isTextblock ? pos + 1 : pos;
    let deepest: number | null = null;
    for (const row of rows) {
      const block = state.doc.nodeAt(row.pos);
      if (block && at >= row.pos && at < row.pos + block.nodeSize) deepest = row.pos;
    }
    if (deepest != null) covered.add(deepest);
    return false;
  });
  return rows.filter((row) => covered.has(row.pos));
}

/** Turn every block in the selection into this heading. The same heading again becomes paragraphs. */
export function applyHeading(state: EditorState, level: 1 | 2 | 3): Transaction | null {
  const rows = coveredRows(state);
  const parent = state.selection.$from.parent;
  if (rows.length < 2) {
    if (parent.type.name === "heading" && Number(parent.attrs.level) === level) return turnRowInto(state, "paragraph");
    return null;
  }
  const same = rows.every((row) => {
    const node = state.doc.nodeAt(row.pos);
    return node?.type.name === "heading" && Number(node.attrs.level) === level;
  });
  return turnSpanInto(state, rows[0].pos, rows[rows.length - 1].pos, same ? "paragraph" : `heading${level}`);
}

/** Turn every block in a text selection into `id`. A caret leaves this to the single-block menu. */
export function applyTurn(state: EditorState, id: string): Transaction | null {
  const rows = coveredRows(state);
  if (rows.length < 2) return null;
  return turnSpanInto(state, rows[0].pos, rows[rows.length - 1].pos, id);
}

/**
 * Format-bar lists over a multi-block selection become one list.
 * The same list lifts those items back to paragraphs. One block keeps `applyList`.
 */
export function applyListSelection(state: EditorState, id: "bullet_list" | "ordered_list" | "task_list"): Transaction | null {
  const rows = coveredRows(state);
  if (rows.length < 2) return applyList(state, id);
  const itemName = id === "task_list" ? "task_item" : "list_item";
  const nodes = rows.map((row) => state.doc.nodeAt(row.pos));
  const parentPos = rows[0].parentPos;
  const sameParent = rows.every((row) => row.parentPos === parentPos);
  const parent = parentPos == null ? null : state.doc.nodeAt(parentPos);
  if (sameParent && parent?.type.name === id && nodes.every((node) => node?.type.name === itemName)) {
    return turnSpanInto(state, rows[0].pos, rows[rows.length - 1].pos, "paragraph");
  }
  return turnSpanInto(state, rows[0].pos, rows[rows.length - 1].pos, id) ?? applyList(state, id);
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

/** The list kind shared by the selection. A caret uses the list around it. Mixed blocks are null. */
export function listKindAt(state: EditorState): "bullet_list" | "ordered_list" | "task_list" | null {
  const { from, to } = state.selection;
  if (from === to) return activeList(state);
  const rows = coveredRows(state);
  if (!rows.length) return activeList(state);
  let kind: "bullet_list" | "ordered_list" | "task_list" | null | undefined;
  for (const row of rows) {
    const parent = row.parentPos == null ? null : state.doc.nodeAt(row.parentPos);
    const name = parent?.type.name;
    const next = name === "bullet_list" || name === "ordered_list" || name === "task_list" ? name : null;
    if (kind === undefined) kind = next;
    else if (kind !== next) return null;
  }
  return kind ?? null;
}

/** The heading level shared by the selection. Mixed blocks, or no heading, are null. */
export function headingLevelAt(state: EditorState): 1 | 2 | 3 | null {
  const levelOf = (node: Node): 1 | 2 | 3 | null => {
    if (node.type.name !== "heading") return null;
    const level = Number(node.attrs.level);
    return level === 1 || level === 2 || level === 3 ? level : null;
  };
  const { from, to, $from } = state.selection;
  if (from === to) return levelOf($from.parent);
  let found: 1 | 2 | 3 | null | undefined;
  let conflict = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isTextblock || conflict) return;
    const level = levelOf(node);
    if (found === undefined) found = level;
    else if (found !== level) conflict = true;
  });
  if (conflict || found === undefined) return null;
  return found;
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
  return rowPos < 0 ? null : turnSpanInto(state, rowPos, rowPos, id);
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

/**
 * Enter in a toggle title keeps the left side as the title and puts the right
 * side inside. A closed toggle opens so the new line is visible. Enter at the
 * very start inserts an empty paragraph above the toggle instead.
 * An empty title with nothing inside still falls through, so Enter can leave it.
 */
export const enterInToggle: Command = (state, dispatch) => {
  const { $from, $to, empty } = state.selection;
  if (!$from.sameParent($to) || $from.parent.type !== pagesSchema.nodes.paragraph || $from.depth < 2) return false;
  const toggle = $from.node($from.depth - 1);
  if (toggle.type !== pagesSchema.nodes.toggle || $from.index($from.depth - 1) !== 0) return false;
  if ($from.parent.content.size === 0 && toggle.childCount === 1) return false;
  const togglePos = $from.before($from.depth - 1);
  if (empty && $from.parentOffset === 0 && $from.parent.content.size > 0) {
    const $toggle = state.doc.resolve(togglePos);
    const paragraph = pagesSchema.nodes.paragraph.create();
    if (!$toggle.parent.canReplace($toggle.index(), $toggle.index(), Fragment.from(paragraph))) return false;
    if (!dispatch) return true;
    const tr = state.tr.insert(togglePos, paragraph);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, togglePos + 1)).scrollIntoView());
    return true;
  }
  if (!dispatch) return true;
  const tr = state.tr;
  if (!toggle.attrs.open) tr.setNodeMarkup(togglePos, undefined, { ...toggle.attrs, open: true });
  const opened = state.apply(tr);
  let splitOk = false;
  splitBlock(opened, (split) => {
    for (const step of split.steps) tr.step(step);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(split.selection.from, tr.doc.content.size)), 1));
    splitOk = true;
  });
  if (!splitOk) return false;
  dispatch(tr.scrollIntoView());
  return true;
};

/** Clicking a to-do checkbox flips that item. The words stay. A position that is not a to-do does nothing. */
export function flipTaskAt(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || node.type !== pagesSchema.nodes.task_item) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked });
}

/** Mod-Enter flips the to-do under the caret, or the to-do block that is selected. Other items keep their own check. */
export const toggleTaskChecked: Command = (state, dispatch) => {
  if (state.selection instanceof NodeSelection && state.selection.node.type === pagesSchema.nodes.task_item) {
    if (!dispatch) return true;
    const { from, node } = state.selection;
    dispatch(state.tr.setNodeMarkup(from, undefined, { ...node.attrs, checked: !node.attrs.checked }));
    return true;
  }
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

/** Space or Mod-Enter on several selected to-dos. Mixed blocks stay put. Any open item checks the whole group. */
export function toggleTaskGroup(state: EditorState, anchor: number, head: number): Transaction | null {
  if (!spanIsGroup(state.doc, anchor, head)) return null;
  const roots = spanRoots(state.doc, anchor, head);
  const nodes = roots.map((row) => state.doc.nodeAt(row.pos));
  if (nodes.some((node) => node?.type.name !== "task_item")) return null;
  const checked = !nodes.every((node) => node?.attrs.checked);
  const tr = state.tr;
  roots.forEach((row, index) => {
    const node = nodes[index];
    if (!node) return;
    tr.setNodeMarkup(row.pos, undefined, { ...node.attrs, checked });
  });
  return tr;
}

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

/** The heading the caret is in, or the last heading above it. Before the first heading, -1. */
export function headingIndexAt(doc: Node, pos: number): number {
  let index = -1;
  let seen = 0;
  doc.descendants((node, nodePos) => {
    if (node.type !== pagesSchema.nodes.heading) return;
    if (nodePos < pos) index = seen;
    seen += 1;
  });
  return index;
}

/** Flip a toggle's open flag. The summary and the hidden body stay put. */
export function setToggleOpen(state: EditorState, pos: number) {
  const node = state.doc.nodeAt(pos);
  if (node?.type !== pagesSchema.nodes.toggle) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: !node.attrs.open });
}

const NEST_CONTAINER = new Set(["toggle", "callout", "blockquote"]);

function blockPositions(state: EditorState, anchor: number, head: number): number[] {
  if (anchor >= 0 && head >= 0) {
    const roots = spanRoots(state.doc, anchor, head);
    if (roots.length) return roots.map((row) => row.pos);
  }
  if (state.selection instanceof NodeSelection && state.doc.nodeAt(state.selection.from)?.isBlock) return [state.selection.from];
  const row = rowUnderSelection(state);
  return row >= 0 ? [row] : [];
}

function siblingRun(doc: Node, positions: readonly number[]) {
  if (!positions.length) return null;
  const first = doc.resolve(positions[0]);
  const parent = first.parent;
  const start = first.index();
  const nodes: Node[] = [];
  let expected = positions[0];
  for (const pos of positions) {
    const node = doc.nodeAt(pos);
    if (!node || pos !== expected || doc.resolve(pos).parent !== parent) return null;
    nodes.push(node);
    expected = pos + node.nodeSize;
  }
  return { parent, depth: first.depth, start, nodes, from: positions[0], to: expected };
}

function selectionIn(tr: Transaction, pos: number): Transaction {
  const clamped = Math.max(1, Math.min(pos, Math.max(1, tr.doc.content.size)));
  const $pos = tr.doc.resolve(clamped);
  if ($pos.parent.isTextblock) {
    const at = Math.max($pos.start(), Math.min(clamped, $pos.end()));
    return tr.setSelection(TextSelection.create(tr.doc, at));
  }
  return tr.setSelection(TextSelection.near($pos, 1));
}

/**
 * Tab nests the current blocks under the previous sibling.
 * A paragraph becomes an open toggle; a toggle, callout, or quote takes the blocks in.
 * The first block, a heading, and a toggle's own title stay put.
 */
export function indentUnderPrevious(state: EditorState, anchor = -1, head = -1): Transaction | null {
  const run = siblingRun(state.doc, blockPositions(state, anchor, head));
  if (!run || run.start === 0) return null;
  if (run.parent.type === pagesSchema.nodes.toggle && run.start === 1) return null;
  const prev = run.parent.child(run.start - 1);
  const prevPos = run.from - prev.nodeSize;
  let next: Node;
  if (NEST_CONTAINER.has(prev.type.name)) {
    const children: Node[] = [];
    prev.forEach((child) => children.push(child));
    children.push(...run.nodes);
    const attrs = prev.type === pagesSchema.nodes.toggle ? { ...prev.attrs, open: true } : prev.attrs;
    next = prev.type.create(attrs, children);
  } else if (prev.type === pagesSchema.nodes.paragraph) {
    next = pagesSchema.nodes.toggle.create({ open: true }, [prev, ...run.nodes]);
  } else return null;
  if (!run.parent.canReplace(run.start - 1, run.start + run.nodes.length, Fragment.from(next))) return null;
  const tr = state.tr.replaceWith(prevPos, run.to, next);
  const moved = run.nodes.reduce((total, node) => total + node.nodeSize, 0);
  const newPos = prevPos + 1 + next.content.size - moved;
  const origin = Math.min(Math.max(state.selection.from, run.from), run.to - 1);
  return selectionIn(tr, newPos + (origin - run.from));
}

/**
 * Shift-Tab lifts the current blocks out of a toggle, callout, or quote.
 * A toggle title stays until it is the only thing left, then it becomes a paragraph.
 */
export function outdentFromContainer(state: EditorState, anchor = -1, head = -1): Transaction | null {
  const run = siblingRun(state.doc, blockPositions(state, anchor, head));
  if (!run) return null;
  const only = run.nodes.length === 1 ? run.nodes[0] : null;
  if (only?.type === pagesSchema.nodes.toggle && only.childCount === 1 && only.firstChild?.type === pagesSchema.nodes.paragraph) {
    const summary = only.firstChild;
    if (!run.parent.canReplace(run.start, run.start + 1, Fragment.from(summary))) return null;
    const tr = state.tr.replaceWith(run.from, run.to, summary);
    return selectionIn(tr, Math.max(1, state.selection.from - 1));
  }
  const wrapper = run.parent;
  if (!NEST_CONTAINER.has(wrapper.type.name)) return null;
  const $from = state.doc.resolve(run.from);
  const wrapperPos = $from.before($from.depth);
  const grand = $from.node($from.depth - 1);
  const wrapperIndex = $from.index($from.depth - 1);
  if (wrapper.type === pagesSchema.nodes.toggle && run.start === 0) {
    if (wrapper.childCount !== 1 || run.nodes.length !== 1) return null;
    if (!grand.canReplace(wrapperIndex, wrapperIndex + 1, Fragment.from(run.nodes[0]))) return null;
    const tr = state.tr.replaceWith(wrapperPos, wrapperPos + wrapper.nodeSize, run.nodes[0]);
    return selectionIn(tr, Math.min(wrapperPos + (state.selection.from - run.from), tr.doc.content.size));
  }
  const kept: Node[] = [];
  wrapper.forEach((child, _offset, index) => {
    if (index < run.start || index >= run.start + run.nodes.length) kept.push(child);
  });
  if (wrapper.type === pagesSchema.nodes.toggle && kept[0]?.type !== pagesSchema.nodes.paragraph) return null;
  const pieces: Node[] = [];
  if (kept.length) pieces.push(wrapper.type.create(wrapper.attrs, kept));
  pieces.push(...run.nodes);
  if (!grand.canReplace(wrapperIndex, wrapperIndex + 1, Fragment.from(pieces))) return null;
  const tr = state.tr.replaceWith(wrapperPos, wrapperPos + wrapper.nodeSize, pieces);
  const newPos = kept.length ? wrapperPos + pieces[0].nodeSize : wrapperPos;
  const origin = Math.min(Math.max(state.selection.from, run.from), run.to - 1);
  return selectionIn(tr, newPos + (origin - run.from));
}

/** Tab nesting has to cover to-do items too, not just bullet and numbered lists. */
function listItemSpan(state: EditorState) {
  const { from, to } = state.selection;
  const $from = state.doc.resolve(from);
  let listDepth = 0;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "bullet_list" || name === "ordered_list" || name === "task_list") {
      listDepth = depth;
      break;
    }
  }
  if (!listDepth) return null;
  const list = $from.node(listDepth);
  const listPos = $from.before(listDepth);
  const items: { index: number; pos: number; node: Node }[] = [];
  list.forEach((node, offset, index) => {
    const pos = listPos + 1 + offset;
    const end = pos + node.nodeSize;
    const hit = from === to ? pos < from && end > from : pos < to && end > from;
    if (hit) items.push({ index, pos, node });
  });
  if (items.length < 2) return null;
  for (let i = 1; i < items.length; i += 1) {
    if (items[i].index !== items[i - 1].index + 1) return null;
  }
  return { list, listPos, items };
}

/** Nest a run of sibling items under the item above them. The first item of a list cannot move. */
export function indentItemGroup(state: EditorState): Transaction | "blocked" | null {
  const found = listItemSpan(state);
  if (!found) return null;
  const { list, listPos, items } = found;
  if (items[0].index === 0) return "blocked";
  let prevPos = listPos + 1;
  for (let i = 0; i < items[0].index - 1; i += 1) prevPos += list.child(i).nodeSize;
  const prev = list.child(items[0].index - 1);
  const children: Node[] = [];
  prev.forEach((child) => children.push(child));
  const last = children[children.length - 1];
  const taken = items.map((item) => item.node);
  if (last && last.type === list.type) {
    const merged: Node[] = [];
    last.forEach((child) => merged.push(child));
    merged.push(...taken);
    children[children.length - 1] = last.type.create(last.attrs, merged);
  } else {
    const attrs = list.type.name === "ordered_list" ? { order: 1 } : null;
    children.push(list.type.create(attrs, taken));
  }
  const nextPrev = prev.type.create(prev.attrs, children);
  const end = items[items.length - 1].pos + items[items.length - 1].node.nodeSize;
  const tr = state.tr.replaceWith(prevPos, end, nextPrev);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(prevPos + 1, tr.doc.content.size)), 1));
}

/** Lift a run of items out of a nested list, back beside their parent item. */
export function outdentItemGroup(state: EditorState): Transaction | "blocked" | null {
  const found = listItemSpan(state);
  if (!found) return null;
  let lifted: Transaction | null = null;
  liftListItem(found.items[0].node.type)(state, (tr) => { lifted = tr; });
  return lifted ?? "blocked";
}

export const indentListItem: Command = (state, dispatch) => {
  const grouped = indentItemGroup(state);
  if (grouped === "blocked") return true;
  if (grouped) {
    if (dispatch) dispatch(grouped.scrollIntoView());
    return true;
  }
  return chainCommands(
    sinkListItem(pagesSchema.nodes.list_item),
    sinkListItem(pagesSchema.nodes.task_item),
  )(state, dispatch);
};

/** Shift-Tab, the mirror of `indentListItem`. */
export const outdentListItem: Command = (state, dispatch) => {
  const grouped = outdentItemGroup(state);
  if (grouped === "blocked") return true;
  if (grouped) {
    if (dispatch) dispatch(grouped.scrollIntoView());
    return true;
  }
  return chainCommands(
    liftListItem(pagesSchema.nodes.list_item),
    liftListItem(pagesSchema.nodes.task_item),
  )(state, dispatch);
};

/** The drag row around `pos`. `strict` skips a row that starts exactly at `pos`, so a selected block can climb to its parent. */
function rowContaining(doc: Node, pos: number, strict: boolean): number | null {
  let hit: number | null = null;
  for (const row of dragRows(doc)) {
    const node = doc.nodeAt(row.pos);
    if (!node) continue;
    const end = row.pos + node.nodeSize;
    const contains = strict ? row.pos < pos && end > pos : pos >= row.pos && pos < end;
    if (contains) hit = row.pos;
  }
  return hit;
}

function selectRow(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, pos: number): boolean {
  if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
  return true;
}

/** Mod-A grabs the current block first, then the container around it, and only then the whole document. */
export const selectBlockThenAll: Command = (state, dispatch) => {
  const selection = state.selection;
  if (selection instanceof NodeSelection) {
    const parent = rowContaining(state.doc, selection.from, true);
    if (parent == null) return selectAll(state, dispatch);
    return selectRow(state, dispatch, parent);
  }
  if (!selection.$from.parent.isTextblock) return selectAll(state, dispatch);
  const start = selection.$from.start();
  const end = selection.$from.end();
  const covers = start === end || (selection.from <= start && selection.to >= end);
  if (!covers) {
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)));
    return true;
  }
  const parent = rowContaining(state.doc, selection.$from.before(selection.$from.depth), true);
  if (parent == null) return selectAll(state, dispatch);
  return selectRow(state, dispatch, parent);
};

/** Escape selects the row under the caret. A second press selects the container around that row. */
export const selectEnclosingBlock: Command = (state, dispatch) => {
  if (state.selection instanceof NodeSelection) {
    const parent = rowContaining(state.doc, state.selection.from, true);
    if (parent == null) return false;
    return selectRow(state, dispatch, parent);
  }
  const row = rowContaining(state.doc, state.selection.from, false);
  if (row == null) return false;
  return selectRow(state, dispatch, row);
};

/** Replace a selected block with a paragraph of `text`. An empty string leaves a blank paragraph. */
export function replaceSelectedBlock(state: EditorState, text: string): Transaction | null {
  if (!(state.selection instanceof NodeSelection)) return null;
  const raw = text.replace(/[\r\n]/gu, "");
  const paragraph = raw
    ? pagesSchema.nodes.paragraph.create(null, pagesSchema.text(raw))
    : pagesSchema.nodes.paragraph.create();
  const from = state.selection.from;
  const node = state.selection.node;
  const $from = state.doc.resolve(from);
  if (!$from.parent.canReplace($from.index(), $from.index() + 1, Fragment.from(paragraph))) return null;
  const tr = state.tr.replaceWith(from, from + node.nodeSize, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, raw ? from + 1 + raw.length : from + 1));
}

/** Replace every block in a multi-block selection with one plain paragraph. */
export function replaceSpan(state: EditorState, anchor: number, head: number, text: string): Transaction | null {
  const roots = spanRoots(state.doc, anchor, head);
  if (roots.length < 2) return null;
  const first = roots[0];
  const last = roots[roots.length - 1];
  const lastNode = state.doc.nodeAt(last.pos);
  if (!lastNode) return null;
  const from = first.pos;
  const to = last.pos + lastNode.nodeSize;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if ($from.depth !== $to.depth || $from.parent !== $to.parent) return null;
  const raw = text.replace(/[\r\n]/gu, "");
  const paragraph = raw
    ? pagesSchema.nodes.paragraph.create(null, pagesSchema.text(raw))
    : pagesSchema.nodes.paragraph.create();
  if (!$from.parent.canReplace($from.index(), $to.index(), Fragment.from(paragraph))) return null;
  const tr = state.tr.replaceWith(from, to, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, raw ? from + 1 + raw.length : from + 1));
}

/** Replace several sibling blocks with the pasted nodes. A span that crosses parents stays put. */
export function replaceSpanWithNodes(state: EditorState, anchor: number, head: number, nodes: readonly Node[]): Transaction | null {
  if (nodes.length === 0) return null;
  const roots = spanRoots(state.doc, anchor, head);
  if (roots.length < 2) return null;
  const first = roots[0];
  const last = roots[roots.length - 1];
  const lastNode = state.doc.nodeAt(last.pos);
  if (!lastNode) return null;
  const from = first.pos;
  const to = last.pos + lastNode.nodeSize;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if ($from.depth !== $to.depth || $from.parent !== $to.parent) return null;
  const fragment = Fragment.from(nodes);
  if (!$from.parent.canReplace($from.index(), $to.index(), fragment)) return null;
  const tr = state.tr.replaceWith(from, to, fragment);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size)), 1)).scrollIntoView();
}

/** Delete a selected block. A parent that must keep a child becomes an empty paragraph. */
export function deleteSelectedBlock(state: EditorState): Transaction | null {
  if (!(state.selection instanceof NodeSelection)) return null;
  const from = state.selection.from;
  const node = state.selection.node;
  const $from = state.doc.resolve(from);
  if ($from.parent.canReplace($from.index(), $from.index() + 1, Fragment.empty)) {
    const tr = state.tr.delete(from, from + node.nodeSize);
    const at = Math.max(0, Math.min(from, tr.doc.content.size));
    return tr.setSelection(TextSelection.near(tr.doc.resolve(at), -1));
  }
  return replaceSelectedBlock(state, "");
}

/** Move a whole-block selection to the previous or next sibling. At the end the selection stays. */
export function moveSelectedBlock(state: EditorState, direction: -1 | 1): Transaction | null {
  if (!(state.selection instanceof NodeSelection)) return null;
  const { from, node } = state.selection;
  const $from = state.doc.resolve(from);
  const next = $from.index() + direction;
  if (next < 0 || next >= $from.parent.childCount) return state.tr;
  const pos = direction < 0 ? from - $from.parent.child(next).nodeSize : from + node.nodeSize;
  return state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView();
}

/** Put the caret at the start or end of a selected block. An image steps into the neighboring text. */
export function collapseSelectedBlock(state: EditorState, edge: "start" | "end"): Transaction | null {
  if (!(state.selection instanceof NodeSelection)) return null;
  const { from, node } = state.selection;
  if (node.isTextblock) {
    const at = edge === "start" ? from + 1 : from + node.nodeSize - 1;
    return state.tr.setSelection(TextSelection.create(state.doc, at)).scrollIntoView();
  }
  if (node.isAtom) {
    const dir = edge === "start" ? -1 : 1;
    const $from = state.doc.resolve(from);
    const index = $from.index() + dir;
    if (index < 0 || index >= $from.parent.childCount) return state.tr;
    const sibling = $from.parent.child(index);
    const pos = dir < 0 ? from - sibling.nodeSize : from + node.nodeSize;
    if (sibling.isTextblock) {
      const at = dir < 0 ? pos + sibling.nodeSize - 1 : pos + 1;
      return state.tr.setSelection(TextSelection.create(state.doc, at)).scrollIntoView();
    }
    return state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView();
  }
  let found: number | null = null;
  node.descendants((child, pos) => {
    if (!child.isTextblock) return;
    const at = edge === "start" ? from + pos + 2 : from + pos + child.nodeSize;
    if (edge === "start") {
      if (found == null) found = at;
    } else {
      found = at;
    }
    return false;
  });
  if (found == null) return state.tr;
  return state.tr.setSelection(TextSelection.create(state.doc, found)).scrollIntoView();
}

/** Enter under several selected blocks opens an empty paragraph after the last one. The blocks stay. */
export function insertAfterSpan(state: EditorState, anchor: number, head: number): Transaction | null {
  const roots = spanRoots(state.doc, anchor, head);
  if (roots.length < 2) return null;
  const last = roots[roots.length - 1];
  const node = state.doc.nodeAt(last.pos);
  if (!node) return null;
  const $pos = state.doc.resolve(last.pos);
  const paragraph = pagesSchema.nodes.paragraph.create();
  if (!$pos.parent.canReplaceWith($pos.index() + 1, $pos.index() + 1, paragraph.type)) return null;
  const at = last.pos + node.nodeSize;
  const tr = state.tr.insert(at, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

/** Shift+Enter on several selected blocks breaks the line at the end of the last one. The blocks stay. */
export function hardBreakAtSpanEnd(state: EditorState, anchor: number, head: number): Transaction | null {
  const roots = spanRoots(state.doc, anchor, head);
  if (roots.length < 2) return null;
  const last = roots[roots.length - 1];
  const node = state.doc.nodeAt(last.pos);
  if (!node) return null;
  let textPos = -1;
  state.doc.nodesBetween(last.pos, last.pos + node.nodeSize, (child, pos) => {
    if (child.isTextblock) textPos = pos;
  });
  const block = textPos < 0 ? null : state.doc.nodeAt(textPos);
  if (!block?.isTextblock) return null;
  const at = textPos + block.nodeSize - 1;
  const tr = block.type.spec.code
    ? state.tr.insertText("\n", at)
    : state.tr.insert(at, pagesSchema.nodes.hard_break.create());
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

/** Enter under a selected block opens an empty paragraph after it. */
export function insertAfterSelectedBlock(state: EditorState): Transaction | null {
  if (!(state.selection instanceof NodeSelection)) return null;
  const { from, node } = state.selection;
  const $from = state.doc.resolve(from);
  const paragraph = pagesSchema.nodes.paragraph.create();
  if (!$from.parent.canReplaceWith($from.index() + 1, $from.index() + 1, paragraph.type)) return null;
  const at = from + node.nodeSize;
  const tr = state.tr.insert(at, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

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
export function linkAt(_doc: Node, selection: { from: number; to: number; empty: boolean; $from: ResolvedPos }):
  { from: number; to: number; href: string } | null {
  const mark = pagesSchema.marks.link;
  const { from, to, empty, $from } = selection;
  const found = $from.marks().find((item) => item.type === mark)
    ?? $from.nodeAfter?.marks.find((item) => item.type === mark);
  if (found) {
    if (!empty) return { from, to, href: String(found.attrs.href || "") };
    const siblings: { node: Node; offset: number }[] = [];
    $from.parent.forEach((node, offset) => siblings.push({ node, offset }));
    const hit = siblings.findIndex(({ node, offset }) => found.isInSet(node.marks)
      && offset <= $from.parentOffset && offset + node.nodeSize >= $from.parentOffset);
    if (hit < 0) return null;
    let start = hit;
    let end = hit;
    while (start > 0 && found.isInSet(siblings[start - 1].node.marks)) start -= 1;
    while (end + 1 < siblings.length && found.isInSet(siblings[end + 1].node.marks)) end += 1;
    return {
      from: $from.start() + siblings[start].offset,
      to: $from.start() + siblings[end].offset + siblings[end].node.nodeSize,
      href: String(found.attrs.href || ""),
    };
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
/** True when every selected character already carries this mark. */
export function markCovers(doc: Node, from: number, to: number, markName: string): boolean {
  const markType = pagesSchema.marks[markName];
  if (!markType || from >= to) return false;
  let text = false;
  let open = false;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText || !node.text) return;
    text = true;
    if (!markType.isInSet(node.marks)) open = true;
  });
  return text && !open;
}

/** Bold, italic, underline, strike, or code. A partial selection gets the mark; a full one loses it. */
export function toggleInlineMark(markName: string): Command {
  const markType = pagesSchema.marks[markName];
  return (state, dispatch) => {
    if (!markType) return false;
    const { from, to, empty, $from } = state.selection;
    if (empty) {
      if (!$from.parent.type.allowsMarkType(markType)) return false;
      if (!dispatch) return true;
      const stored = markType.isInSet(state.storedMarks ?? $from.marks());
      dispatch(stored ? state.tr.removeStoredMark(markType) : state.tr.addStoredMark(markType.create()));
      return true;
    }
    if (!dispatch) return true;
    const tr = state.tr;
    if (markCovers(state.doc, from, to, markName)) tr.removeMark(from, to, markType);
    else tr.addMark(from, to, markType.create());
    dispatch(tr);
    return true;
  };
}

/** Bold or another inline mark across a multi-block selection. A partial group gets the mark; a full one loses it. */
export function toggleSpanMark(state: EditorState, anchor: number, head: number, markName: string): Transaction | null {
  const markType = pagesSchema.marks[markName];
  if (!markType || !spanIsGroup(state.doc, anchor, head)) return null;
  const roots = spanRoots(state.doc, anchor, head);
  const last = roots[roots.length - 1];
  const lastNode = last ? state.doc.nodeAt(last.pos) : null;
  if (!roots[0] || !last || !lastNode) return null;
  const from = roots[0].pos;
  const to = last.pos + lastNode.nodeSize;
  const tr = state.tr;
  if (markCovers(state.doc, from, to, markName)) tr.removeMark(from, to, markType);
  else tr.addMark(from, to, markType.create());
  return tr;
}

/** True when every selected character already has this exact tone. */
export function toneCovers(doc: Node, from: number, to: number, kind: "font_color" | "highlight", tone: string): boolean {
  const safe = safePagesTone(tone);
  const markType = pagesSchema.marks[kind];
  if (!safe || from >= to) return false;
  let text = false;
  let open = false;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText || !node.text) return;
    text = true;
    const found = markType.isInSet(node.marks);
    if (!found || found.attrs.tone !== safe) open = true;
  });
  return text && !open;
}

/** Apply a text or background tone. The same tone on the whole selection clears it; a partial tone is filled in. */
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
    const covered = Boolean(safe) && toneCovers(state.doc, from, to, kind, safe);
    const tr = state.tr.removeMark(from, to, mark);
    if (safe && !covered) tr.addMark(from, to, mark.create({ tone: safe }));
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

/** ArrowDown at the end of the document opens an empty paragraph. A block that still has something after it stays put. */
export function continuePastEnd(state: EditorState): Transaction | null {
  const doc = state.doc;
  const last = doc.lastChild;
  if (!last) return null;
  const lastFrom = doc.content.size - last.nodeSize;
  const selection = state.selection;
  if (selection instanceof NodeSelection) {
    if (selection.from !== lastFrom) return null;
  } else {
    const { $from, empty } = selection;
    if (!empty || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return null;
    if ($from.pos < lastFrom) return null;
    if (doc.textBetween($from.after(), doc.content.size, "", "\uFFFC").length > 0) return null;
    let blocksAfter = false;
    doc.nodesBetween($from.after(), doc.content.size, (node, pos) => {
      if (pos >= $from.after() && node.isBlock) blocksAfter = true;
    });
    if (blocksAfter) return null;
  }
  const at = doc.content.size;
  const tr = state.tr.insert(at, pagesSchema.nodes.paragraph.create());
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

/** ArrowUp at the start of the document opens an empty paragraph above. A block that still has something before it stays put. */
export function continueBeforeStart(state: EditorState): Transaction | null {
  const doc = state.doc;
  const first = doc.firstChild;
  if (!first) return null;
  const selection = state.selection;
  if (selection instanceof NodeSelection) {
    if (selection.from !== 0) return null;
  } else {
    const { $from, empty } = selection;
    if (!empty || !$from.parent.isTextblock || $from.parentOffset !== 0) return null;
    if ($from.pos > first.nodeSize) return null;
    const before = $from.before();
    if (doc.textBetween(0, before, "", "\uFFFC").length > 0) return null;
    let blocksBefore = false;
    doc.nodesBetween(0, before, (node, pos) => {
      if (pos < before && pos + node.nodeSize <= before && node.isBlock) blocksBefore = true;
    });
    if (blocksBefore) return null;
  }
  const tr = state.tr.insert(0, pagesSchema.nodes.paragraph.create());
  return tr.setSelection(TextSelection.create(tr.doc, 1)).scrollIntoView();
}

/**
 * A click in the empty space under the last block lands in an empty paragraph there.
 * If that paragraph already exists, the caret moves into it and no second one is added.
 */
export function focusBelowContent(state: EditorState): Transaction | null {
  const last = state.doc.lastChild;
  if (!last) return null;
  const paragraph = pagesSchema.nodes.paragraph;
  if (last.type === paragraph && last.content.size === 0) {
    const pos = state.doc.content.size - 1;
    if (state.selection instanceof TextSelection && state.selection.empty && state.selection.from === pos) return null;
    return state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView();
  }
  const at = state.doc.content.size;
  const tr = state.tr.insert(at, paragraph.create());
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

/** Arrow toward an image, rule, or other atom selects that block instead of skipping it. */
export function selectNeighborAtom(state: EditorState, direction: -1 | 1): Transaction | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.depth < 1) return null;
  const atEdge = direction < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size;
  if (!atEdge) return null;
  const depth = $from.depth;
  const container = $from.node(depth - 1);
  const next = $from.index(depth - 1) + direction;
  if (next < 0 || next >= container.childCount) return null;
  const sibling = container.child(next);
  if (!sibling.isAtom) return null;
  const pos = direction < 0 ? $from.before(depth) - sibling.nodeSize : $from.after(depth);
  try {
    return state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView();
  } catch {
    return null;
  }
}

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
