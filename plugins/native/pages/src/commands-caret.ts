// Caret movement and code editing at block and document boundaries.
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { pagesSchema } from "./schema.js";
import { Fragment } from "prosemirror-model";
import { exitCode } from "prosemirror-commands";


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
