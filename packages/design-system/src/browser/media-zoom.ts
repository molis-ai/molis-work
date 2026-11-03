import type { MediaZoom, MediaZoomOptions, MediaZoomState } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { mediaAxis } from "../media-zoom.js";

/**
 * Zoom about the point looked at, and bounded panning, for one image in a clipping viewport (specs/visual-ui-experience
 * §media-affine, VUX-32): `window.molisMediaZoom(viewport, image, { onChange })`.
 * - One coordinate space: the viewport's own pixels. With the point looked at p, the translation t and the ratio
 *   c = next / scale, the next translation is t' = p − (p − t)·c on each axis, then held inside the bounds: an image
 *   smaller than the viewport on an axis is centred on it, a larger one never leaves a gap at an edge.
 * - The scale runs from fitting the viewport (never above the image's own pixels) to 8× that, or 2× the image's pixels.
 * - A pinch on a trackpad (a wheel with ctrl or ⌘) and two fingers zoom about their point or their centre; only this
 *   viewport takes the gesture, so the page's own zoom works everywhere else. A plain wheel pans a zoomed image and scrolls
 *   the page otherwise. One pointer drags a zoomed image after 4 px. A double click zooms in about its point, or back to fit.
 *   Keys: + and − about the centre, 0 back to fit, the arrows pan.
 * - A new image (its load) and a resize of the viewport while fitting refit it; zoomed, a resize only re-bounds it.
 */
const SETTLE_MS = 260;

function molisMediaZoom(viewport: HTMLElement, image: HTMLImageElement, { onChange }: MediaZoomOptions = {}): MediaZoom {
  viewport.classList.add("mw-media-zoom");
  if (!viewport.hasAttribute("tabindex")) viewport.tabIndex = 0;
  let scale = 1, x = 0, y = 0, fitted = true, told: MediaZoomState | null = null, settle = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { id: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
  // A pinch keeps the image point that was under the fingers' centre when it began under their centre now, so it zooms
  // and follows the fingers together, whichever finger's move comes first.
  let pinch: { distance: number; scale: number; ix: number; iy: number } | null = null;
  const size = () => ({ w: viewport.clientWidth, h: viewport.clientHeight, nw: image.naturalWidth, nh: image.naturalHeight });
  const fitScale = () => { const { w, h, nw, nh } = size(); return nw && nh && w && h ? Math.min(1, w / nw, h / nh) : 1; };
  const maxScale = () => Math.max(fitScale() * 8, 2);
  const paint = (eased = false) => {
    const { w, h, nw, nh } = size();
    x = mediaAxis(x, x, scale, scale, nw, w); y = mediaAxis(y, y, scale, scale, nh, h);
    window.clearTimeout(settle);
    viewport.classList.toggle("is-settling", eased);
    if (eased) settle = window.setTimeout(() => viewport.classList.remove("is-settling"), SETTLE_MS);
    image.style.width = nw + "px"; image.style.height = nh + "px";
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const state: MediaZoomState = fitted ? "fit" : "zoomed";
    viewport.dataset.zoom = state;
    if (state !== told) { told = state; onChange?.(state); }
  };
  const zoomTo = (next: number, px: number, py: number, eased = false) => {
    const fit = fitScale();
    next = Math.min(maxScale(), Math.max(fit, next));
    const { w, h, nw, nh } = size();
    x = mediaAxis(px, x, scale, next, nw, w); y = mediaAxis(py, y, scale, next, nh, h); scale = next;
    fitted = next <= fit * 1.001;
    paint(eased);
  };
  const fit = (eased = false) => { scale = fitScale(); fitted = true; x = 0; y = 0; paint(eased); };
  const centre = () => ({ px: viewport.clientWidth / 2, py: viewport.clientHeight / 2 });
  const local = (event: { clientX: number; clientY: number }) => { const box = viewport.getBoundingClientRect(); return { px: event.clientX - box.left, py: event.clientY - box.top }; };
  const pans = () => { const { w, h, nw, nh } = size(); return nw * scale > w + 0.5 || nh * scale > h + 0.5; };

  const wheel = (event: WheelEvent) => {
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const { px, py } = local(event);
      zoomTo(scale * Math.exp(Math.max(-1, Math.min(1, -event.deltaY * unit * 0.01))), px, py);
    } else if (pans()) {
      event.preventDefault();
      x -= event.deltaX * unit; y -= event.deltaY * unit; paint();
    }
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      for (const id of pointers.keys()) viewport.setPointerCapture?.(id);
      const [a, b] = [...pointers.values()], { px, py } = local({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
      pinch = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, scale, ix: (px - x) / scale, iy: (py - y) / scale }; drag = null;
    } else if (pointers.size === 1) drag = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: x, ty: y, moved: false };
  };
  const move = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], { px, py } = local({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
      const fit = fitScale();
      scale = Math.min(maxScale(), Math.max(fit, pinch.scale * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinch.distance)));
      x = px - pinch.ix * scale; y = py - pinch.iy * scale; fitted = scale <= fit * 1.001;
      paint();
    } else if (drag && drag.id === event.pointerId && pans()) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) viewport.setPointerCapture?.(drag.id);
      drag.moved = true; viewport.classList.add("is-dragging");
      x = drag.tx + dx; y = drag.ty + dy; paint();
    }
  };
  // A drag that moved, or a pinch, is not a click: the click that follows it (closing on the backdrop) goes no further.
  let swallow = false;
  const up = (event: PointerEvent) => {
    if (drag?.moved || pinch) swallow = true;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag?.id === event.pointerId || !pointers.size) { drag = null; viewport.classList.remove("is-dragging"); }
  };
  const click = (event: MouseEvent) => { if (swallow) { event.stopPropagation(); event.preventDefault(); } swallow = false; };
  const dblclick = (event: MouseEvent) => {
    event.preventDefault();
    if (!fitted) { fit(true); return; }
    const { px, py } = local(event);
    zoomTo(Math.max(fitScale() * 2, 1), px, py, true);
  };
  const key = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const { px, py } = centre(), step = 48;
    if (event.key === "+" || event.key === "=") zoomTo(scale * 1.5, px, py, true);
    else if (event.key === "-" || event.key === "_") zoomTo(scale / 1.5, px, py, true);
    else if (event.key === "0") fit(true);
    else if (event.key.startsWith("Arrow") && pans()) {
      x += event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0;
      y += event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
      paint(true);
    } else return;
    event.preventDefault();
  };
  const resized = new ResizeObserver(() => { if (fitted) fit(); else paint(); });
  const lifetime = new AbortController(), signal = lifetime.signal;
  viewport.addEventListener("wheel", wheel, { passive: false, signal });
  viewport.addEventListener("pointerdown", down, { signal });
  viewport.addEventListener("pointermove", move, { signal });
  viewport.addEventListener("pointerup", up, { signal });
  viewport.addEventListener("pointercancel", up, { signal });
  viewport.addEventListener("click", click, { capture: true, signal });
  viewport.addEventListener("dblclick", dblclick, { signal });
  viewport.addEventListener("keydown", key, { signal });
  image.addEventListener("load", () => fit(), { signal });
  image.draggable = false;
  resized.observe(viewport);
  if (image.complete) fit();
  return {
    fit: (eased = true) => fit(eased),
    actual: () => { const { px, py } = centre(); zoomTo(1, px, py, true); },
    state: () => (fitted ? "fit" : "zoomed"),
    fitsAtActual: () => fitScale() >= 1,
    dispose: () => { resized.disconnect(); window.clearTimeout(settle); lifetime.abort(); },
  };
}

window.molisMediaZoom ??= molisMediaZoom;
