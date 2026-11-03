import type { EditorView } from "prosemirror-view";
import { NodeSelection } from "prosemirror-state";
import { followScroll } from "@molis-ai/molis-work-plugin-sdk/browser";
import { PagesBlockMenu } from "./editor-block-menu.js";
import { createBlockDrag } from "./editor-block-drag.js";
import { createHandlePosition } from "./editor-block-handle-position.js";
import { hoverKey, EMPTY_HOVER, rowAtSelection, rowAtPosition } from "./editor-block-selection.js";
import { blockMenuTarget, handleAnchor, insertSlashBelow } from "./commands.js";
import type { Translate } from "./editor-types.js";
import { t, stopEvent, overlayRoot, dsIcon, escapeHtml } from "./editor-view-ui.js";

function handleWidget(translate: Translate | undefined): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pages-block-handle";
  wrap.innerHTML = `
  <button type="button" data-pages-plus aria-label="${escapeHtml(t(translate, "插入块"))}">${dsIcon("plus")}</button>
  <button type="button" data-pages-grip aria-label="${escapeHtml(t(translate, "拖动以排序或缩进"))}">${dsIcon("grip")}</button>`;
  return wrap;
}

/** Coordinates the handle, menu and current gesture for one editor. */
export function createBlockHandle(view: EditorView, translate: Translate | undefined, onNote: (index: number) => void) {
  const handle = handleWidget(translate);
  handle.hidden = true;
  const position = createHandlePosition(view, handle);
  const blockMenu = new PagesBlockMenu(view, translate, () => position.pos, onNote);
  const menu = blockMenu.dom;
  let menuTick = 0;
  const events = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(target: EventTarget | null, type: K,
    listener: (event: HTMLElementEventMap[K]) => void, options: AddEventListenerOptions = {}) => {
    target?.addEventListener(type, listener as EventListener, { ...options, signal: events.signal });
  };
  const closeMenu = () => blockMenu.close();
  const openMenu = () => blockMenu.open(handle);
  const hoverState = () => hoverKey.getState(view.state) ?? EMPTY_HOVER;
  const setHover = (nextPos: number, dragging = hoverState().dragging) => {
    const current = hoverState();
    if (current.pos === nextPos && current.dragging === dragging) return;
    if (nextPos !== position.pos) closeMenu();
    view.dispatch(view.state.tr.setMeta(hoverKey, { pos: nextPos, dragging }));
  };
  const drag = createBlockDrag(view, handle, translate, setHover, closeMenu);
  overlayRoot().append(handle, menu, drag.ghost);
  const hostEl = view.dom.closest<HTMLElement>(".pages-editor-host") ?? view.dom;
  const workspace = view.dom.closest<HTMLElement>(".pages-workspace");
  const onMove = (event: MouseEvent) => {
    if (event.buttons || drag.busy) return;
    const target = event.target as HTMLElement | null;
    if (target && (handle.contains(target) || menu.contains(target))) return;
    // Over a menu or the bar, or outside the editor: no row is hovered, unless the block menu is open.
    const host = view.dom.closest(".pages-editor-host") ?? view.dom;
    if (target?.closest(".pages-slash, .mw-ctx, .mw-ctx-menu, .mw-ctx-panel, .pages-link-preview, .pages-comment-preview, .pages-pop, .pages-more-menu, .pages-create-menu") || !host.contains(target)) {
      if (menu.hidden) setHover(-1, false);
      return;
    }
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    setHover(found ? rowAtPosition(view.state.doc, found.pos) : -1, false);
  };
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (handle.contains(target) || menu.contains(target))) return;
    closeMenu();
  };
  const onKey = (event: KeyboardEvent) => {
    if ((drag.busy && event.key === "Escape") || drag.active) {
      stopEvent(event);
      if (event.key === "Escape") drag.stop(false);
      return;
    }
    blockMenu.handleKey(event);
  };
  const onLeave = (event: MouseEvent) => {
    if (drag.busy) return;
    const to = event.relatedTarget as HTMLElement | null;
    if (to && (handle.contains(to) || menu.contains(to) || hostEl.contains(to))) return;
    if (menu.hidden) setHover(-1, false);
  };
  const onScroll = () => {
    if (drag.active) {
      drag.schedule();
      return;
    }
    closeMenu();
    position.follow();
  };
  on(handle, "click", event => clickHandle(view, handle, position, blockMenu, drag, event));
  on(handle, "pointerdown", event => drag.begin(event, position.pos));
  on(handle, "pointermove", drag.move);
  on(handle, "pointerup", drag.end);
  on(handle, "pointercancel", drag.cancel);
  const cancelDrag = () => drag.stop(false);
  on(handle, "lostpointercapture", cancelDrag);
  on(window, "blur", cancelDrag);
  on(window, "resize", cancelDrag);
  on(hostEl, "mousemove", onMove);
  on(handle, "mousemove", onMove);
  on(hostEl, "mouseleave", onLeave);
  on(handle, "mouseleave", onLeave);
  on(document, "pointerdown", onPointerDown, { capture: true });
  on(document, "keydown", onKey, { capture: true });
  on(workspace, "scroll", onScroll, { passive: true });
  const stopScroll = followScroll(menu, onScroll);
  return {
    update() {
      drag.update();
      if (drag.active) return;
      const hover = hoverState();
      const { state } = view;
      if (hover.menuTick !== menuTick) {
        menuTick = hover.menuTick;
        const at = blockMenuTarget(state.doc, state.selection.from);
        if (at != null) {
          if (!menu.hidden && position.pos === at) closeMenu();
          else {
            position.place(at, true, false);
            if (position.pos === at) openMenu();
          }
        }
      }
      const hovered = hover.pos >= 0 && state.doc.nodeAt(hover.pos) ? hover.pos : -1;
      const anchor = handleAnchor(hovered, rowAtSelection(state));
      if (!anchor) position.hide();
      else position.place(anchor.pos, false, anchor.followingCaret);
    },
    destroy() {
      drag.destroy();
      events.abort();
      stopScroll();
      handle.remove();
      blockMenu.destroy();
    },
  };
}

function clickHandle(view: EditorView, handle: HTMLElement, position: ReturnType<typeof createHandlePosition>,
  blockMenu: PagesBlockMenu, drag: ReturnType<typeof createBlockDrag>, event: MouseEvent) {
  const target = event.target as HTMLElement;
  stopEvent(event);
  if (drag.consumeClick()) return;
  if (target.closest("[data-pages-plus]")) {
    blockMenu.close();
    const tr = insertSlashBelow(view.state, position.pos);
    if (tr) {
      view.dispatch(tr.scrollIntoView());
      view.focus();
    }
    return;
  }
  if (!target.closest("[data-pages-grip]") || drag.busy || position.pos < 0) return;
  const selectSpan = (anchor: number, head: number) => {
    const tr = view.state.tr.setMeta(hoverKey, { span: { anchor, head }, pos: position.pos });
    try { tr.setSelection(NodeSelection.create(tr.doc, head)); } catch { /* leave the caret */ }
    view.dispatch(tr);
  };
  if (event.shiftKey) {
    const hover = hoverKey.getState(view.state) ?? EMPTY_HOVER;
    selectSpan(hover.anchor >= 0 ? hover.anchor : position.pos, position.pos);
    blockMenu.close();
    return;
  }
  selectSpan(position.pos, position.pos);
  if (blockMenu.dom.hidden) blockMenu.open(handle);
  else blockMenu.close();
}
