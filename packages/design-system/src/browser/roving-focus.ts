/**
 * Roving focus's one program per document (specs/visual-ui-experience §adaptive-focus, VUX-28). A semantic group (tabs,
 * radios, a toolbar, a menu or menubar, a listbox whose options take focus) is one tab stop; arrow keys move inside it.
 * - The tab stop is the item the person last focused, else the selected, checked or current one, else the first. It is
 *   put right again when items are added, removed, disabled, hidden or reordered, so Tab always lands on a live item.
 * - Arrows follow the group's orientation (`aria-orientation`, else tabs, toolbars and menubars run across and menus and
 *   listboxes down; radios take both), across reverses in right-to-left text, and they wrap. Home and End go to the ends.
 *   Disabled and hidden items are skipped.
 * - Moving focus does nothing else: a tab, radio or option is chosen with Enter or Space as its own control does. A group
 *   whose page handles a key itself (`preventDefault`) keeps that, and a field inside a toolbar keeps its own arrows.
 * - Focus moves with `preventScroll`; the item is brought into view inside its own scroller only, never by moving the page.
 */
const GROUPS = ["tablist", "radiogroup", "toolbar", "menu", "menubar", "listbox"] as const;
type Role = (typeof GROUPS)[number];
const GROUP = GROUPS.map((role) => `[role=${role}]`).join(",");
const ITEMS: Record<Role, string> = {
  tablist: "[role=tab]", radiogroup: "[role=radio]", menu: "[role^=menuitem]", menubar: "[role^=menuitem]", listbox: "[role=option]",
  toolbar: "button, [role=button], [role=checkbox], [role=radio], [role=switch], a[href], select, input, [tabindex]",
};
const CHOSEN = "[aria-selected=true], [aria-checked=true], [aria-current]:not([aria-current=false]), [aria-pressed=true]";
const TYPING = "input:not([type=button], [type=checkbox], [type=radio], [type=reset], [type=submit]), textarea, select, [contenteditable=true]";
const last = new WeakMap<Element, Element>();

const roleOf = (group: Element) => group.getAttribute("role") as Role;
/** A listbox driven from its field (`aria-activedescendant`) keeps focus in the field; it is not a roving group. */
const roving = (group: Element) => roleOf(group) !== "listbox"
  || (!group.hasAttribute("aria-activedescendant") && !(group.id && document.querySelector(`[aria-controls="${CSS.escape(group.id)}"][aria-activedescendant]`)));
const shown = (item: HTMLElement) => item.getClientRects().length > 0 && !item.closest("[hidden], [inert]");
const live = (item: HTMLElement) => shown(item) && !item.matches(":disabled, [aria-disabled=true]");
function itemsOf(group: Element) {
  const role = roleOf(group);
  return [...group.querySelectorAll<HTMLElement>(ITEMS[role])].filter((item) => item.closest(GROUP) === group);
}

/** One tab stop per group, every other item -1: the focused item; for tabs, radios and options the chosen one; else the
 * one last focused; else the first live item. */
function settle(group: Element) {
  if (!roving(group)) return;
  const items = itemsOf(group), usable = items.filter(live);
  if (!usable.length) return;
  const remembered = last.get(group) as HTMLElement | undefined, role = roleOf(group);
  const stop = usable.find((item) => item === document.activeElement)
    ?? (role === "tablist" || role === "radiogroup" || role === "listbox" ? usable.find((item) => item.matches(CHOSEN)) : undefined)
    ?? (remembered && usable.includes(remembered) ? remembered : undefined)
    ?? usable[0]!;
  for (const item of items) { const want = item === stop ? 0 : -1; if (item.tabIndex !== want) item.tabIndex = want; }
}

/** Bring `item` into view inside the nearest scroller that holds it, without scrolling the page. */
function reveal(item: HTMLElement) {
  for (let node = item.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    const across = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    const down = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    if (!across && !down) continue;
    const box = node.getBoundingClientRect(), at = item.getBoundingClientRect();
    if (across) node.scrollLeft += at.left < box.left ? at.left - box.left : at.right > box.right ? at.right - box.right : 0;
    if (down) node.scrollTop += at.top < box.top ? at.top - box.top : at.bottom > box.bottom ? at.bottom - box.bottom : 0;
    return;
  }
}

function step(group: Element, key: string) {
  const role = roleOf(group);
  const orientation = group.getAttribute("aria-orientation") ?? (role === "menu" || role === "listbox" ? "vertical" : role === "radiogroup" ? "both" : "horizontal");
  const back = getComputedStyle(group).direction === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === "Home" || key === "End") return key;
  if (orientation !== "vertical" && (key === "ArrowLeft" || key === "ArrowRight")) return key === back ? -1 : 1;
  if (orientation !== "horizontal" && (key === "ArrowUp" || key === "ArrowDown")) return key === "ArrowUp" ? -1 : 1;
  return null;
}

addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  const group = target?.closest(GROUP);
  if (!target || !group || !roving(group)) return;
  const items = itemsOf(group).filter(live), at = items.indexOf(target);
  if (at < 0 || (roleOf(group) === "toolbar" && target.matches(TYPING))) return;
  const move = step(group, event.key);
  if (move === null) return;
  const next = move === "Home" ? items[0] : move === "End" ? items.at(-1) : items[(at + move + items.length) % items.length];
  if (!next) return;
  event.preventDefault();
  last.set(group, next);
  settle(group);
  next.focus({ preventScroll: true });
  reveal(next);
});
addEventListener("focusin", (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const group = target?.closest(GROUP);
  if (!target || !group || !itemsOf(group).includes(target)) return;
  last.set(group, target);
  settle(group);
});

let queued = false;
const dirty = new Set<Element>();
const settleAll = () => { queued = false; const groups = dirty.size ? [...dirty] : [...document.querySelectorAll(GROUP)]; dirty.clear(); groups.forEach(settle); };
// Only an element can hold groups of its own: a text node looks no further than its own group, or a block of many text
// pieces put in at once (a coloured code block) would search its parent once per piece.
const touched = (node: Node) => { const el = node instanceof Element ? node : node.parentElement; const group = el?.closest(GROUP); if (group) dirty.add(group);
  else if (node instanceof Element) node.querySelectorAll(GROUP).forEach((inner) => dirty.add(inner)); };
// Items come, go, are disabled or reordered by the pages: the groups they belong to get their tab stop put right before
// the next frame. Text streaming elsewhere is not looked at.
new MutationObserver((records) => {
  for (const record of records) { touched(record.target); record.addedNodes.forEach(touched); }
  if (dirty.size && !queued) { queued = true; requestAnimationFrame(settleAll); }
})
  .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "hidden", "aria-selected", "aria-checked", "role"] });
document.addEventListener("DOMContentLoaded", settleAll);
settleAll();
