const MARGIN = 8;

export interface FloatingAnchor {
  left: number;
  top: number;
  bottom: number;
  right: number;
}

export interface FloatingSize {
  width: number;
  height: number;
}

/** Put a floating panel on the side that fits. A panel taller than the screen stays inside the margin. */
export function placeFloating(
  anchor: FloatingAnchor,
  size: FloatingSize,
  viewport: { width: number; height: number },
  mode: "below" | "above" | "beside",
): { left: number; top: number } {
  const gap = 8;
  const clamp = (value: number, limit: number, length: number) => Math.round(
    Math.min(Math.max(MARGIN, value), Math.max(MARGIN, limit - length - MARGIN)),
  );
  if (mode === "beside") {
    const onRight = anchor.right + gap;
    const onLeft = anchor.left - gap - size.width;
    const left = pick(
      onRight,
      onLeft,
      onRight + size.width <= viewport.width - MARGIN,
      onLeft >= MARGIN,
      viewport.width - onRight,
      anchor.left - MARGIN,
    );
    const top = anchor.top + size.height <= viewport.height - MARGIN
      ? anchor.top
      : viewport.height - MARGIN - size.height;
    return { left: clamp(left, viewport.width, size.width), top: clamp(top, viewport.height, size.height) };
  }
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - size.height;
  const top = mode === "above"
    ? pick(above, below, above >= MARGIN, below + size.height <= viewport.height - MARGIN, anchor.top - MARGIN, viewport.height - below)
    : pick(below, above, below + size.height <= viewport.height - MARGIN, above >= MARGIN, viewport.height - below, anchor.top - MARGIN);
  return { left: clamp(anchor.left, viewport.width, size.width), top: clamp(top, viewport.height, size.height) };
}

function pick(
  preferred: number,
  alternate: number,
  preferredFits: boolean,
  alternateFits: boolean,
  preferredRoom: number,
  alternateRoom: number,
): number {
  if (preferredFits) return preferred;
  if (alternateFits) return alternate;
  return preferredRoom >= alternateRoom ? preferred : alternate;
}

/** Scroll only the menu, so the highlighted row stays visible without moving the page. */
export function scrollChildIntoView(
  parent: { scrollTop: number; clientHeight: number },
  child: { offsetTop: number; offsetHeight: number },
): number {
  const top = child.offsetTop;
  const bottom = top + child.offsetHeight;
  if (top < parent.scrollTop) return top;
  if (bottom > parent.scrollTop + parent.clientHeight) return Math.max(0, bottom - parent.clientHeight);
  return parent.scrollTop;
}
