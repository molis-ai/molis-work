/**
 * The split dividers' pointer and keyboard handling (specs/visual-ui-experience §drag-split, VUX-23/24).
 *
 * A press is only a candidate: the divider moves once the pointer has gone about 4 CSS px, so a click or the first half of a
 * double click leaves the split as it was. While it moves it follows the pointer frame by frame, held inside the range both
 * sides need (`range`) and settling on the default near it with hysteresis (`snap`). Release keeps the new ratio; Escape,
 * a cancelled or lost pointer, the window losing focus or the divider going away put back the ratio it had at the press, and
 * every path takes the resize cursor and the iframe guard off again. Double click and Enter go back to the default, Home and
 * End to the ends of the range, the arrows step 5 % (1 % with Shift).
 */
export const TAB_SASH_FACTORY = String.raw`({ panes, root, find, sync, persist, range, snap, defaultRatio }) => {
  let drag = null;
  const sizeOf = (sash, node) => { const box = sash.parentElement.getBoundingClientRect(); return node.direction === "row" ? box.width : box.height; };
  const set = (node, ratio) => { node.ratio = ratio; sync(); };
  const finish = (keep) => {
    const current = drag; if (!current) return; drag = null;
    current.abort.abort();
    root.classList.remove("is-resizing"); delete root.dataset.resizing; current.sash.classList.remove("is-dragging");
    if (current.sash.isConnected && current.sash.hasPointerCapture(current.pointer)) current.sash.releasePointerCapture(current.pointer);
    if (!current.moved) return;
    if (keep) persist(); else set(current.node, current.start);
  };
  panes.addEventListener("pointerdown", (event) => {
    const sash = event.target.closest("[data-tab-sash]"); if (!sash || event.button !== 0) return;
    const node = find(sash.dataset.tabSash); if (!node) return;
    finish(false);
    // The press must not start a text selection across the panes it sits between.
    event.preventDefault(); sash.setPointerCapture(event.pointerId);
    const abort = new AbortController(), on = (target, type, listener, capture = false) => target.addEventListener(type, listener, { signal: abort.signal, capture });
    drag = { sash, node, abort, pointer: event.pointerId, start: node.ratio, x: event.clientX, y: event.clientY, moved: false, snapped: false };
    on(sash, "pointermove", (pointer) => {
      if (!drag || pointer.pointerId !== drag.pointer) return;
      if (!sash.isConnected) { finish(false); return; }
      if (!drag.moved) {
        if (Math.hypot(pointer.clientX - drag.x, pointer.clientY - drag.y) < 4) return;
        drag.moved = true; root.classList.add("is-resizing"); root.dataset.resizing = node.direction; sash.classList.add("is-dragging");
      }
      const box = sash.parentElement.getBoundingClientRect(), size = sizeOf(sash, node), bounds = range(node, size);
      if (!bounds) return;
      const at = (node.direction === "row" ? pointer.clientX - box.left : pointer.clientY - box.top) / size;
      const next = snap(Math.min(bounds[1], Math.max(bounds[0], at)), defaultRatio, drag.snapped, size);
      drag.snapped = next.snapped; set(node, next.ratio);
    });
    on(sash, "pointerup", (pointer) => { if (pointer.pointerId === drag?.pointer) finish(true); });
    on(window, "pointerup", (pointer) => { if (pointer.pointerId === drag?.pointer) finish(true); });
    on(sash, "pointercancel", () => finish(false));
    on(sash, "lostpointercapture", () => finish(false));
    on(window, "blur", () => finish(false));
    on(document, "keydown", (key) => { if (key.key !== "Escape") return; key.preventDefault(); key.stopPropagation(); finish(false); }, true);
  });
  panes.addEventListener("dblclick", (event) => {
    const sash = event.target.closest("[data-tab-sash]"), node = sash && find(sash.dataset.tabSash); if (!node) return;
    set(node, defaultRatio); persist();
  });
  panes.addEventListener("keydown", (event) => {
    const sash = event.target.closest("[data-tab-sash]"), node = sash && find(sash.dataset.tabSash); if (!node) return;
    const bounds = range(node, sizeOf(sash, node)) || [0.15, 0.85], step = event.shiftKey ? 0.01 : 0.05;
    const now = Math.min(bounds[1], Math.max(bounds[0], node.ratio || defaultRatio));
    const next = ["ArrowLeft", "ArrowUp"].includes(event.key) ? now - step : ["ArrowRight", "ArrowDown"].includes(event.key) ? now + step
      : event.key === "Home" ? bounds[0] : event.key === "End" ? bounds[1] : event.key === "Enter" ? defaultRatio : null;
    if (next === null) return;
    event.preventDefault(); set(node, Math.min(bounds[1], Math.max(bounds[0], next))); persist();
  });
  // A wider or narrower stage moves the range: the panes are laid out again, and the narrow layout taken or left.
  new ResizeObserver(() => sync()).observe(panes);
  return { cancel: () => finish(false) };
}`;
