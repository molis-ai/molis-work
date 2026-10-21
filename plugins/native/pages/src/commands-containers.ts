// Commands for lists, nested wrappers, headings, tasks, and columns.
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { pagesSchema, safePagesColumnShare } from "./schema.js";
import { Fragment, Node, ResolvedPos } from "prosemirror-model";
import { chainCommands, lift, setBlockType, splitBlock, splitBlockAs } from "prosemirror-commands";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { spanRoots } from "./reorder.js";
import { coveredRows, rowUnderSelection, spanIsGroup } from "./commands-selection.js";
import { turnRowInto, turnSpanInto } from "./commands-blocks.js";


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
