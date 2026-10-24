import type { EditorView } from "prosemirror-view";
import { placeOverlay, type FloatingAnchor } from "@molis-ai/molis-work-design-system/floating";
import { ownPagesTransient } from "./editor-transient.js";
import { freezePagesFocus, releasePagesFrozen, resolvePagesFrozen } from "./focus.js";
import { overlayRoot } from "./editor-view-ui.js";
import type { PagesEditorMountOptions } from "./editor-types.js";

/**
 * The editor's popup: a selection's form or result. The context toolbar draws it under itself when it can
 * (`docked`); otherwise it sits in the stage. A writing request keeps its range frozen (`token`) while the popup
 * is open; closing the popup any way lets it go.
 */
export function createEditorPopup(options: PagesEditorMountOptions) {
  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.hidden = true;
  overlayRoot().append(pop);

  let view!: EditorView;
  const state = { token: null as string | null, request: 0, docked: false };
  const backToStage = () => {
    const stage = overlayRoot();
    if (pop.parentElement !== stage) stage.append(pop);
  };
  const clearPop = (fromPanel = false) => {
    const restoreFocus = pop.contains(document.activeElement);
    pop.hidden = true;
    pop.replaceChildren();
    state.request += 1;
    if (state.token) { releasePagesFrozen(view, state.token); state.token = null; }
    if (state.docked) { state.docked = false; pop.classList.remove("is-docked"); if (!fromPanel) options.openPanel?.({ node: null }); }
    backToStage();
    if (restoreFocus) view.focus();
  };
  let end: (fromPanel?: boolean) => void = clearPop;
  const hidePop = (fromPanel?: boolean) => end(fromPanel);
  const showPop = () => {
    hidePop();
    let fromPanel = false;
    const stop = ownPagesTransient(view, () => clearPop(fromPanel));
    end = (panel = false) => { fromPanel = panel; stop(); };
    pop.hidden = false;
  };
  const anchorPop = (from: number, to: number) => {
    const token = crypto.randomUUID(); state.token = token; freezePagesFocus(view, token, { from, to }, true);
    return () => state.token === token && !view.isDestroyed ? resolvePagesFrozen(view, token) : null;
  };
  // `keep`: a result the person is waiting for stays where it is when they select something else.
  const placePop = (anchor: FloatingAnchor, mode: "above" | "below", label: string, keep = false) => {
    pop.hidden = false;
    state.docked = Boolean(options.openPanel?.({ node: pop, label, keep, onClose: () => hidePop(true) }));
    pop.classList.toggle("is-docked", state.docked);
    if (!state.docked) placeOverlay(pop, anchor, mode);
  };
  // A form that belongs to a block, not to a selection, takes the popup back to the stage.
  const reclaimPop = () => {
    if (!state.docked) return;
    state.docked = false;
    options.openPanel?.({ node: null });
    pop.classList.remove("is-docked");
    backToStage();
  };

  return { pop, state, showPop, hidePop, anchorPop, placePop, reclaimPop, mounted: (editor: EditorView) => { view = editor; } };
}

export type EditorPopup = ReturnType<typeof createEditorPopup>;
