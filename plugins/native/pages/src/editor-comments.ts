import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { pagesSchema } from "./schema.js";
import { commentAt } from "./commands.js";
interface CommentPopupPorts {
  onComment?: (id: string) => void;
  pop: HTMLDivElement;
  translate?: (value: string) => string;
  actions(translate: ((value: string) => string) | undefined, save: () => void, cancel: () => void): HTMLElement;
  hidePop(): void;
  applyComment(view: EditorView, from: number, to: number, text: string, id: string): void;
  placeOverlay(element: HTMLElement, bounds: { left: number; right: number; top: number; bottom: number }, side: "below"): void;
}

export function openEditorComment(view: EditorView, options: CommentPopupPorts): void {
    const found = commentAt(view.state.doc, view.state.selection);
    if (!found) return;
    if (options.onComment) {
      const id = found.id || crypto.randomUUID();
      if (!found.id) view.dispatch(view.state.tr.addMark(found.from, found.to, pagesSchema.marks.comment.create({ id, text: "" })));
      options.hidePop();options.onComment(id);
      return;
    }
    options.pop.hidden = false;
    options.pop.replaceChildren();
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 3;
    area.value = found.text;
    options.pop.append(area, options.actions(options.translate, () => {
      options.applyComment(view, found.from, found.to, area.value, found.id); options.hidePop();
    }, options.hidePop));
    options.placeOverlay(options.pop, view.coordsAtPos(found.from), "below"); area.focus();
  }

/** Keep an existing annotation intact; ambiguous or empty blocks need an explicit text selection. */
export function markCommentBlock(view: EditorView, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= view.state.doc.childCount) return null;
  const block = view.state.doc.child(index), ids = new Set<string>();
  let from = -1, to = -1, offset = 0;
  for (let i = 0; i < index; i++) offset += view.state.doc.child(i).nodeSize;
  block.descendants((node, pos) => {
    if (!node.isText) return;
    if (from < 0) from = offset + pos + 1;
    to = offset + pos + node.nodeSize + 1;
    for (const mark of node.marks) if (mark.type === pagesSchema.marks.comment && mark.attrs.id) ids.add(String(mark.attrs.id));
  });
  if (from < 0 || ids.size > 1) return null;
  if (ids.size === 1) return [...ids][0]!;
  const id = crypto.randomUUID();
  view.dispatch(view.state.tr.addMark(from, to, pagesSchema.marks.comment.create({ id, text: "" })));
  return id;
}

/** Locate the surviving mark by identity; never reattach by matching words. */
export function focusComment(handle: { view: EditorView }, id: string): boolean {
  let from = -1, to = -1;
  handle.view.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some(mark => mark.type.name === "comment" && mark.attrs.id === id)) {
      if (from < 0) from = pos;
      to = pos + node.nodeSize;
    }
  });
  if (from < 0) return false;
  handle.view.dispatch(handle.view.state.tr.setSelection(TextSelection.create(handle.view.state.doc, from, to)).scrollIntoView());
  handle.view.focus(); return true;
}

export function commentBlock(handle: { view: EditorView }, index: number): string | null {
  return markCommentBlock(handle.view, index);
}
