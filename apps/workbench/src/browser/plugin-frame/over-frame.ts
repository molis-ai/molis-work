import type { FrameBox, FrameScope } from "./types.js";

/**
 * Lays a trusted sibling over an opaque page (reviews, embedded views, platform areas): `holder` takes the part of `box` (in
 * the frame's coordinates) the frame shows and clips to it, and `inner` sits at the whole box inside it. `inner` keeps its own
 * height when `sized` is false. Says whether any of the box shows.
 */
export function overFrame(root: HTMLElement, owner: DOMRectReadOnly, holder: HTMLElement, inner: HTMLElement, box: FrameBox, sized = true): boolean {
  const bounds = root.getBoundingClientRect();
  const left = Math.max(0, box.x), top = Math.max(0, box.y), right = Math.min(owner.width, box.x + box.width), bottom = Math.min(owner.height, box.y + box.height);
  Object.assign(holder.style, { left: owner.left - bounds.left + left + "px", top: owner.top - bounds.top + top + "px",
    width: Math.max(0, right - left) + "px", height: Math.max(0, bottom - top) + "px" });
  Object.assign(inner.style, { left: box.x - left + "px", top: box.y - top + "px", width: box.width + "px", ...sized ? { height: box.height + "px" } : {} });
  return right > left && bottom > top;
}

/**
 * The page's half of every such sibling: reports, every frame while it has places, where each empty element is, in the frame's
 * coordinates. A hidden document, an open dialog, an element that is not rendered or has no width reports `null`; an element
 * that left the document calls `gone`. `resend` reports a place again even if it has not moved (the shell has just drawn it).
 */
export function childPlaces(scope: FrameScope, report: (id: number, box: FrameBox | null) => void, gone: (id: number) => void) {
  const places = new Map<number, { element: HTMLElement; last: string }>();
  let scheduled = 0;
  const frame = () => {
    scheduled = 0;
    for (const [id, place] of places) {
      if (!place.element.isConnected) { places.delete(id); gone(id); continue; }
      const box = place.element.getBoundingClientRect();
      const value = document.body.hidden || document.querySelector("dialog[open]") || !place.element.checkVisibility() || !box.width ? null
        : { x: box.x, y: box.y, width: box.width, height: box.height };
      const text = JSON.stringify(value);
      if (text !== place.last) { place.last = text; report(id, value); }
    }
    if (places.size) scheduled = requestAnimationFrame(frame);
  };
  scope.own(() => cancelAnimationFrame(scheduled));
  return {
    track(id: number, element: HTMLElement) { places.set(id, { element, last: "" }); if (!scheduled) scheduled = requestAnimationFrame(frame); },
    untrack(id: number) { places.delete(id); },
    resend(id: number) { const place = places.get(id); if (place) place.last = ""; },
  };
}
