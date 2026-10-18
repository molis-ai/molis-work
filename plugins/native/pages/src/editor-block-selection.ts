import { PluginKey, NodeSelection, type EditorState, type Command, type Transaction } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { spanIsGroup, deleteSelectedBlock, deleteSpan, duplicateSpan } from "./commands.js";
import { dragRows, nudgeSpan } from "./reorder.js";
import { tableHit, moveTableRow } from "./table-edit.js";

export type PagesHover = { pos: number; dragging: boolean; anchor: number; head: number; menuTick: number };

export const hoverKey = new PluginKey<PagesHover>("pages-hover");

export const EMPTY_HOVER: PagesHover = { pos: -1, dragging: false, anchor: -1, head: -1, menuTick: 0 };

export function runBlockCommand(view: EditorView, command: Command): void {
  if (!command(view.state, view.dispatch.bind(view), view)) return;
  view.focus();
}

export function rowAtSelection(state: EditorState): number {
  return rowAtPosition(state.doc, state.selection.from);
}

export function rowAtPosition(doc: ProseMirrorNode, pos: number): number {
  let hit = -1;
  for (const row of dragRows(doc)) {
    const node = doc.nodeAt(row.pos);
    if (node && pos >= row.pos && pos < row.pos + node.nodeSize) hit = row.pos;
  }
  return hit;
}

export function hoveredGroup(view: EditorView): { anchor: number; head: number } | null {
  const hover = hoverKey.getState(view.state);
  if (!hover || !spanIsGroup(view.state.doc, hover.anchor, hover.head)) return null;
  return { anchor: hover.anchor, head: hover.head };
}

export function dropHoveredGroup(view: EditorView): boolean {
  const group = hoveredGroup(view);
  if (!group) return false;
  return deleteSpan(group.anchor, group.head)(view.state, (tr) => {
    view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
  });
}

export function duplicateHoveredGroup(view: EditorView): boolean {
  const group = hoveredGroup(view);
  if (!group) return false;
  const ok = duplicateSpan(group.anchor, group.head)(view.state, (tr) => {
    view.dispatch(tr.setMeta(hoverKey, { span: null }).scrollIntoView());
  });
  if (ok) view.focus();
  return ok;
}

export function nudgeEditor(view: EditorView, direction: -1 | 1): boolean {
  const hover = hoverKey.getState(view.state) ?? EMPTY_HOVER;
  const anchor = hover.anchor >= 0 ? hover.anchor : rowAtSelection(view.state);
  const head = hover.anchor >= 0 ? hover.head : anchor;
  if (tableHit(view.state)) {
    const rowMove = moveTableRow(view.state, direction);
    if (!rowMove) return true;
    view.dispatch(rowMove.scrollIntoView());
    view.focus();
    return true;
  }
  if (anchor < 0 || head < 0) return false;
  const moved = nudgeSpan(view.state.doc, anchor, head, direction);
  if (!moved) return false;
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, moved.doc.content);
  if (moved.anchor >= 0) {
    try { tr.setSelection(NodeSelection.create(tr.doc, moved.anchor)); } catch { /* the caret stays where mapping put it */ }
    tr.setMeta(hoverKey, { span: { anchor: moved.anchor, head: moved.head } });
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export function dropSelectedBlock(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const tr = deleteSelectedBlock(state);
  if (!tr) return false;
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}
