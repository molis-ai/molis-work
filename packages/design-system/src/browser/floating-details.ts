/**
 * A `<details>` whose content floats (positioned absolute or fixed: a menu, a list of dependencies, a filter) is a layer
 * (specs/visual-ui-experience §adaptive-focus, VUX-29). One program per document closes it the way every layer closes:
 * - Escape closes the innermost open one that holds focus, and focus goes back to its summary. Only that one: the Escape
 *   is used up, so the dialog or pane under it stays. A page that handled the Escape itself (`preventDefault`), a field
 *   being written in with an input method, and a popover or modal dialog open inside it come first.
 * - A press outside closes every open one that does not hold it; focus stays where the press put it.
 * - While it is open it carries `data-layer-open`, so a pane that closes on Escape (a cover) knows a layer is above it.
 * A `<details>` that opens in place (a disclosure in the page's flow) is not a layer and is left alone.
 */
const floats = (details: HTMLDetailsElement) => [...details.children].some((child) => child.tagName !== "SUMMARY"
  && /^(absolute|fixed)$/.test(getComputedStyle(child).position));
const open = () => [...document.querySelectorAll<HTMLDetailsElement>("details[open]")].filter(floats);

addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
  const focus = document.activeElement;
  const layer = open().filter((details) => details.contains(focus)).at(-1);
  const inner = focus?.closest(":popover-open, dialog:modal");
  if (!layer || (inner && layer.contains(inner))) return;
  event.preventDefault();
  layer.open = false;
  layer.querySelector<HTMLElement>(":scope > summary")?.focus({ preventScroll: true });
});
// `toggle` does not bubble; it is caught on the way down.
document.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement)) return;
  details.toggleAttribute("data-layer-open", details.open && floats(details));
}, true);
addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Node ? event.target : null;
  for (const details of open()) if (!target || !details.contains(target)) details.open = false;
}, true);
