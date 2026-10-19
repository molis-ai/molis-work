// Positions, selections, and menu navigation; no editing command dependencies.
import { Node, ResolvedPos } from "prosemirror-model";
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { dragRows, spanRoots } from "./reorder.js";
import { selectAll } from "prosemirror-commands";


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

export function caretAt(tr: { doc: Node }, pos: number, bias: 1 | -1 = 1) {
  return TextSelection.near(tr.doc.resolve(Math.min(Math.max(pos, 0), tr.doc.content.size)), bias);
}

export function rowUnderSelection(state: EditorState): number {
  const pos = state.selection.from;
  let hit = -1;
  for (const row of dragRows(state.doc)) {
    const node = state.doc.nodeAt(row.pos);
    if (node && pos >= row.pos && pos < row.pos + node.nodeSize) hit = row.pos;
  }
  return hit;
}

export const LIST_PARENT = new Set(["bullet_list", "ordered_list", "task_list"]);

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

/** Rows a text selection actually covers. A caret covers none, so the single-block commands stay in charge. */
export function coveredRows(state: EditorState) {
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
