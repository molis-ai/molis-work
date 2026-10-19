import { stopEvent } from "./editor-view-ui.js";
import type { EditorView } from "prosemirror-view";
import { commitDrag, DragPreview } from "./drag-preview.js";
import { previewSpan, spanRows } from "./reorder.js";
import { chromePlugin } from "./editor-gap.js";
import { codeHighlightPlugin } from "./editor-node-media.js";
import { hoverKey, EMPTY_HOVER } from "./editor-block-selection.js";
import type { Translate } from "./editor-types.js";
import { createDragRendering, showDragGhost, type Drag } from "./editor-block-drag-render.js";

/** One pointer gesture owns its preview until release, cancellation or teardown. */
export function createBlockDrag(view: EditorView, handle: HTMLElement, translate: Translate | undefined,
  setHover: (pos: number, dragging?: boolean) => void, closeMenu: () => void) {
  const grip = handle.querySelector<HTMLElement>("[data-pages-grip]")!;
  const ghost = document.createElement("div");
  ghost.className = "pages-block-ghost pages-editor-host";
  ghost.hidden = true;
  ghost.setAttribute("aria-hidden", "true");
  let drag: Drag = null;
  let motion: DragPreview | null = null;
  let suppressClick = false;
  const rendering = createDragRendering(view, ghost, () => drag, () => motion);
  const trackPointer = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return false;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.alt = event.altKey;
    return true;
  };
  const stopDrag = (commit: boolean) => {
    if (!drag) return;
    rendering.flush(commit);
    const { from, anchor, head, gap, level, active: wasActive, pointerId, alt } = drag;
    drag = null;
    if (grip.hasPointerCapture(pointerId)) grip.releasePointerCapture(pointerId);
    if (wasActive) suppressClick = true;
    const valid = commit && wasActive && motion?.source === view.state.doc
      && previewSpan(view.state.doc, anchor, head, gap, level);
    const apply = () => {
      if (valid) {
        commitDrag(view, anchor, head, gap, level,
          tr => tr.setMeta(hoverKey, { span: null, pos: -1, dragging: false }), alt);
      } else setHover(motion && motion.source !== view.state.doc ? -1 : from, false);
    };
    if (wasActive && motion) motion.finish(apply, ghost.getBoundingClientRect());
    else apply();
    ghost.classList.remove("is-copy");
    ghost.hidden = true;
    ghost.replaceChildren();
    ghost.style.transform = "";
    handle.classList.remove("is-dragging");
    document.documentElement.classList.remove("is-pages-dragging");
    if (valid) view.focus();
  };
  return {
    ghost,
    get busy() { return drag != null; },
    get active() { return Boolean(drag?.active); },
    schedule: rendering.schedule,
    stop: stopDrag,
    begin(event: PointerEvent, pos: number) {
      const target = event.target as HTMLElement;
      const plus = target.closest("[data-pages-plus]");
      if (!plus && (!grip.contains(target) || pos < 0)) return;
      stopEvent(event);
      if (plus || event.shiftKey) return;
      closeMenu();
      motion?.destroy();
      motion = null;
      grip.setPointerCapture(event.pointerId);
      const hover = hoverKey.getState(view.state) ?? EMPTY_HOVER;
      const covered = hover.anchor >= 0
        && spanRows(view.state.doc, hover.anchor, hover.head).some((row) => row.pos === pos);
      drag = {
        pointerId: event.pointerId,
        from: pos,
        anchor: covered ? hover.anchor : pos,
        head: covered ? hover.head : pos,
        gap: -1,
        level: -1,
        requestedLevel: -1,
        originX: event.clientX,
        originY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        offsetX: 0,
        offsetY: 0,
        active: false,
        alt: event.altKey,
        previewCopy: false,
      };
    },
    move(event: PointerEvent) {
      if (!trackPointer(event) || !drag) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) < 5) return;
        const dom = view.nodeDOM(drag.from);
        if (!(dom instanceof HTMLElement)) {
          stopDrag(false);
          return;
        }
        drag.active = true;
        const rect = showDragGhost(view, ghost, drag.anchor, drag.head);
        drag.offsetX = rect.left - drag.originX;
        drag.offsetY = rect.top - drag.originY;
        handle.classList.add("is-dragging");
        document.documentElement.classList.add("is-pages-dragging");
        view.dispatch(view.state.tr.setMeta(hoverKey, {
          pos: drag.from,
          dragging: true,
          span: { anchor: drag.anchor, head: drag.head },
        }));
        motion = new DragPreview(view, drag.anchor, drag.head, [chromePlugin(translate, true), codeHighlightPlugin()]);
      }
      rendering.schedule();
    },
    end(event: PointerEvent) {
      if (!trackPointer(event) || !drag) return;
      if (drag.active) rendering.schedule();
      stopDrag(drag.active);
    },
    cancel(event: PointerEvent) {
      if (drag?.pointerId === event.pointerId) stopDrag(false);
    },
    consumeClick() {
      if (!suppressClick) return false;
      suppressClick = false;
      return true;
    },
    update() {
      if (drag?.active && motion && motion.source !== view.state.doc) stopDrag(false);
    },
    destroy() {
      drag = null;
      rendering.flush(false);
      motion?.destroy();
      document.documentElement.classList.remove("is-pages-dragging");
      ghost.remove();
    },
  };
}
