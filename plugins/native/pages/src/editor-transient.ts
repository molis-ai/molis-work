import type { Node } from "prosemirror-model";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { insertImage } from "./commands.js";
import { actionItemsFromText } from "./ai.js";
import { pagesSchema } from "./schema.js";
import { applyToPagesFrozen, pagesFocusKey, freezePagesFocus, releasePagesFrozen, resolvePagesFrozen } from "./focus.js";
import { acceptedImageFile, safePagesImageSrc } from "./link.js";

const transients = new WeakMap<EditorView, Set<() => void>>();

/** Resources belong to the document shown by this view, even when the view itself is reused. */
export function ownPagesTransient(view: EditorView, cleanup: () => void): () => void {
  let resources = transients.get(view);
  if (!resources) { resources = new Set(); transients.set(view, resources); }
  const owned = resources;
  const stop = () => { if (owned.delete(stop)) cleanup(); };
  owned.add(stop);
  return stop;
}

export function endPagesTransients(view: EditorView): void {
  const resources = transients.get(view);
  transients.delete(view);
  if (resources) for (const stop of resources) stop();
}

type Anchor = { from: number; to: number };
type ImageCommit = (state: EditorState, src: string, anchor: Anchor) => Transaction | null;

/** The file stays attached to its mapped insertion anchor; a new document ends both the read and the callback. */
export function readPagesImage(view: EditorView, file: File, range?: Anchor, commit?: ImageCommit): void {
  if (view.isDestroyed || !acceptedImageFile(file)) return;
  const selection = view.state.selection;
  const token = crypto.randomUUID();
  if (!freezePagesFocus(view, token, range ?? { from: selection.from, to: selection.to }, true)) return;
  const nodeSelection = !range && selection instanceof NodeSelection;
  const reader = new FileReader();
  let active = true;
  const stop = ownPagesTransient(view, () => {
    active = false;
    reader.onload = reader.onerror = reader.onabort = null;
    if (reader.readyState === 1) reader.abort();
    if (!view.isDestroyed) releasePagesFrozen(view, token);
  });
  reader.onload = () => {
    if (!active || view.isDestroyed) return;
    const anchor = resolvePagesFrozen(view, token);
    const src = safePagesImageSrc(reader.result);
    stop();
    if (!anchor?.intact || !src) return;
    const selected = nodeSelection && view.state.doc.nodeAt(anchor.from)
      ? NodeSelection.create(view.state.doc, anchor.from)
      : TextSelection.between(view.state.doc.resolve(anchor.from), view.state.doc.resolve(anchor.to));
    const state = view.state.apply(view.state.tr.setSelection(selected));
    const tr = commit ? commit(state, src, anchor) : insertImage(state, src);
    if (tr) { view.dispatch(tr.scrollIntoView()); view.focus(); }
  };
  reader.onerror = reader.onabort = stop;
  try { reader.readAsDataURL(file); } catch (error) { stop(); throw error; }
}

const popovers = new WeakMap<HTMLElement, () => void>();

export function closePagesPopover(selector: string): void {
  const pop = document.querySelector<HTMLElement>(selector);
  if (pop) { popovers.get(pop)?.(); pop.remove(); }
}

export function pagesPopoverAnchor(view: EditorView, pop: HTMLElement, from: number, to: number) {
  const token = crypto.randomUUID();
  freezePagesFocus(view, token, { from, to }, true);
  let active = true;
  const close = ownPagesTransient(view, () => { active = false; popovers.delete(pop); pop.remove(); if (!view.isDestroyed) releasePagesFrozen(view, token); });
  popovers.set(pop, close);
  return { close, at: () => active && !view.isDestroyed && pop.isConnected ? resolvePagesFrozen(view, token) : null };
}

function actionsNode(text: string): Node {
  const items = actionItemsFromText(text);
  const nodes = (items.length ? items : [text.trim() || ""]).map((item) => (
    pagesSchema.nodes.task_item.create({ checked: false }, pagesSchema.nodes.paragraph.create(null, item ? pagesSchema.text(item) : undefined))
  ));
  return pagesSchema.nodes.task_list.create(null, nodes);
}

export function applyPagesActions(view: EditorView, token: string, text: string, mode: "replace" | "insert_after" | "delete"): boolean {
  if (mode === "delete") return applyToPagesFrozen(view, token, text, mode).ok;
  const at = resolvePagesFrozen(view, token);
  if (!at?.intact) return false;
  const node = actionsNode(text), end = view.state.doc.resolve(at.to);
  const tr = mode === "replace" ? view.state.tr.replaceWith(at.from, at.to, node)
    : view.state.tr.insert(end.depth === 0 ? at.to : end.after(1), node);
  view.dispatch(tr.setMeta(pagesFocusKey, { release: token }).scrollIntoView());
  view.focus();
  return true;
}
