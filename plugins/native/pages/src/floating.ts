// Placing a layer is the Plugin SDK's `/browser` (one way for every floating thing); what stays here is about rows and scrolling in Pages.

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
/** Parents own their header, not the vertical space occupied by their children. */
export function rowGapAt(y: number, rows: readonly { top: number; bottom: number; indent: number }[]): number {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.bottom <= row.top) continue;
    const child = rows[index + 1];
    const bottom = child && child.indent > row.indent && child.bottom > child.top
      ? Math.min(row.bottom, child.top)
      : row.bottom;
    if (y < (row.top + bottom) / 2) return index;
  }
  return rows.length;
}
