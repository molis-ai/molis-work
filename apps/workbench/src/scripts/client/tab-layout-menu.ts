/** Keep a popover inside the viewport. Tall menus scroll instead of clipping past the top.
 *  Stringified into the browser factory. Type annotations are erased before that string is sent. */
export function placeLayoutMenu(
  anchor: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
) {
  const availableHeight = Math.max(0, viewport.height - margin * 2);
  const maxHeight = menu.height > availableHeight ? availableHeight : null;
  const height = maxHeight == null ? menu.height : maxHeight;
  const width = menu.width;
  let top = anchor.bottom + 6;
  if (top + height > viewport.height - margin) {
    const above = anchor.top - 6 - height;
    top = above >= margin ? above : margin;
  }
  if (top < margin) top = margin;
  let left = anchor.right - width;
  const maxLeft = viewport.width - width - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;
  return { top, left, maxHeight };
}
