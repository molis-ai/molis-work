// Move, copy, delete, and convert whole rows or selected spans.
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { convertedBlocks, convertedNodes } from "./convert.js";
import { Fragment, Node } from "prosemirror-model";
import { deleteAtPos, deleteSpan as deleteSpanDoc, duplicateAtPos, duplicateSpan as duplicateSpanDoc, placeCopySpan, placeDragged, placeSpan, reorderTopLevel, spanRoots } from "./reorder.js";
import { pagesSchema } from "./schema.js";
import { LIST_PARENT, blockPos, caretAt, coveredRows, rowUnderSelection, spanIsGroup } from "./commands-selection.js";


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

/** Turn the row under the caret into `id`, splitting a list so the other items stay. */
export function turnRowInto(state: EditorState, id: string) {
  const rowPos = rowUnderSelection(state);
  return rowPos < 0 ? null : turnSpanInto(state, rowPos, rowPos, id);
}

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
