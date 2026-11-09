/** Keep keyboard movement inside the existing presentation menu, including trusted carrier and discussion documents. */
export function positionMenuKey(event: KeyboardEvent) {
  const hit = event.target as Element | null, menu = hit?.closest?.<HTMLDetailsElement>(".mw-presentation__more[open]");
  if (!menu || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === "Escape") {
    event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector("summary")?.focus({ preventScroll: true }); return;
  }
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(item => item.checkVisibility() && !item.matches(":disabled,[aria-disabled=true]"));
  const at = items.findIndex(item => item === hit);
  const next = event.key === "Home" ? items[0] : event.key === "End" ? items.at(-1) :
    items[(at < 0 ? event.key === "ArrowDown" ? 0 : items.length - 1 : (at + items.length + (event.key === "ArrowDown" ? 1 : -1)) % items.length)];
  if (next) { event.preventDefault(); next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest" }); }
}
