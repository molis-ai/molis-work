/// <reference lib="dom" />
/**
 * A menu anchored under its button (docs/design/capability-pack/README.md, the state block's menu): the button carries
 * `data-anchored-menu` and `popovertarget` naming a `mw-menu` with `popover="auto"`, so the menu is in the top layer and no
 * scrolling box clips it, and the browser closes it on Escape or a press outside. This program only places it and keeps the keys:
 * - It opens from the button's lower edge, never over the button, its left edge with the button's and inside the window by 16px.
 * - Where there is not room under the button, the button's scrolling area is first scrolled up (never past the area's top), and
 *   only then does the menu scroll itself.
 * - The button says whether it is open (`aria-expanded`); the first item takes the focus; arrow keys, Home and End move among the
 *   items; when the menu closes with the focus inside it (or with the focus lost), the focus goes back to the button.
 * The menu's own rise (`craft-drop`, none with reduced motion) is the design system's `.mw-menu:popover-open` rule.
 */
const GAP = 6;
const EDGE = 16;
const FLOOR = 160;
const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)';

const triggerOf = (menu: HTMLElement) => menu.id ? document.querySelector<HTMLElement>(`[data-anchored-menu][popovertarget="${CSS.escape(menu.id)}"]`) : null;
const isOpen = (menu: HTMLElement) => menu.matches(":popover-open");
const scrollerOf = (element: Element): Element | null => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
};

/** `bring` (on opening only): scroll the button up to make room; afterwards the menu just follows the button the person scrolls. */
function place(menu: HTMLElement, trigger: HTMLElement, bring = false): void {
  menu.style.maxHeight = "";
  let box = trigger.getBoundingClientRect();
  const need = box.bottom + GAP + menu.offsetHeight - (innerHeight - 8);
  const scroller = bring && need > 0 ? scrollerOf(trigger) : null;
  if (scroller) {
    const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
    scroller.scrollTop += Math.min(need, Math.max(0, box.top - top - 8));
    box = trigger.getBoundingClientRect();
  }
  menu.style.left = `${Math.max(EDGE, Math.min(box.left, innerWidth - menu.offsetWidth - EDGE))}px`;
  menu.style.top = `${box.bottom + GAP}px`;
  menu.style.maxHeight = `${Math.max(FLOOR, innerHeight - box.bottom - GAP - 8)}px`;
}

const openMenus = () => [...document.querySelectorAll<HTMLElement>(".mw-anchored-menu")].filter(isOpen);
const follow = () => openMenus().forEach((menu) => {
  const trigger = triggerOf(menu);
  if (trigger) place(menu, trigger);
});

/** Binds the document once; a second call (the board's script and a page's both) does nothing. */
export function installAnchoredMenu(): void {
  if ((globalThis as { molisAnchoredMenu?: boolean }).molisAnchoredMenu) return;
  (globalThis as { molisAnchoredMenu?: boolean }).molisAnchoredMenu = true;
  // `toggle` does not bubble; it is caught on the way down.
  document.addEventListener("toggle", (event) => {
    const menu = event.target;
    if (!(menu instanceof HTMLElement) || !menu.classList.contains("mw-anchored-menu")) return;
    const trigger = triggerOf(menu);
    if (!trigger) return;
    const open = (event as ToggleEvent).newState === "open";
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      place(menu, trigger, true);
      menu.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
      return;
    }
    const focus = document.activeElement;
    if (!focus || focus === document.body || menu.contains(focus)) trigger.focus({ preventScroll: true });
  }, true);
  document.addEventListener("keydown", (event) => {
    const menu = (event.target as Element | null)?.closest?.<HTMLElement>(".mw-anchored-menu");
    if (!menu || !isOpen(menu)) return;
    const items = [...menu.querySelectorAll<HTMLElement>(ITEMS)];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
    if (next === undefined || !items.length) return;
    event.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  });
  // Choosing an item closes the menu, as a menu does.
  document.addEventListener("click", (event) => {
    const item = (event.target as Element | null)?.closest?.(ITEMS);
    const menu = item?.closest<HTMLElement>(".mw-anchored-menu");
    if (menu && isOpen(menu)) menu.hidePopover();
  });
  addEventListener("resize", follow);
  document.addEventListener("scroll", follow, true);
}

installAnchoredMenu();
