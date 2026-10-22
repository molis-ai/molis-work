/**
 * The page's one tooltip (specs/visual-ui-experience §type-optics and §adaptive-focus, VUX-05, VUX-29): one element drawn
 * in the page, placed by its control, so no scrolling column clips it.
 * - It names an icon-only control: the dock, the side toggle, the account and project controls, and any `[data-craft-tip]`.
 *   A control whose name is already written beside its icon gets none. A rail tool shows its ⌥ shortcut.
 * - It shows text cut short: a control or row holding a name, path or summary cut by an ellipsis or a line clamp shows the
 *   whole text, so a long name is read in full without opening it.
 * - A pointer shows it after a short rest (at once while another was just shown), keyboard focus (`:focus-visible`) at once,
 *   and a touch by press and hold, since touch has no hover; it stays a moment after the finger lifts.
 * - It goes on leaving, a press, a scroll that moves what it is about (not another box following its output), Escape or the
 *   window losing focus. A native `title` is held back while it shows.
 */
const TIP_TARGETS = ".workbench-bar :is(.dock-pin, .bar-chat, .account-global-trigger, .navigator-project-selector, .plugin-picker-trigger), [data-craft-tip]";
/** What may hold a cut name: something one presses or moves to, or a row of a list. */
const HOLDERS = "a[href], button, summary, [role=button], [role=tab], [role=option], [role=menuitem], [role=treeitem], [role=row], [tabindex]:not([tabindex=\"-1\"]), li";
const HOLD_MS = 500;

declare global {
  interface Window { molisRailShortcuts?: () => Element[] }
}

const tip = document.createElement("div");
tip.className = "craft-tip";
tip.setAttribute("aria-hidden", "true");
let owner: HTMLElement | null = null, waiting: HTMLElement | null = null, timer = 0, lastHidden = 0, held = 0;
const hoverable = matchMedia("(hover: hover) and (pointer: fine)");

const isCut = (el: Element) => {
  if (!(el instanceof HTMLElement) || !el.textContent?.trim()) return false;
  const style = getComputedStyle(el);
  return (style.webkitLineClamp !== "none" && style.webkitLineClamp !== "" && el.scrollHeight > el.clientHeight + 1)
    || (style.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1);
};
/** The whole text of what `node` holds cut short: the cut text under `at` (the pointer or finger), else its first one. */
function cutText(node: Element, at?: Element | null): string {
  let el: Element | null = null;
  for (let up = at ?? null; up && node.contains(up) && !el; up = up.parentElement) if (isCut(up)) el = up;
  // A row is looked into only so deep: a whole card is not a name.
  el ??= [node, ...[...node.querySelectorAll("*")].slice(0, 60)].find(isCut) ?? null;
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
function labelFor(node: HTMLElement): string {
  if (node.matches(".navigator-project-selector")) return node.querySelector("strong")?.textContent?.trim() || node.getAttribute("aria-label") || "";
  return node.dataset.craftTip || node.dataset.craftTitle || node.getAttribute("title") || node.getAttribute("aria-label") || "";
}
/** What the tip says for `node`, and whether it is a cut text (which may wrap): a cut name comes first, even on a named control. */
function textFor(node: HTMLElement, at?: Element | null): [string, boolean] {
  const cut = cutText(node, at);
  if (cut || !node.matches(TIP_TARGETS)) return [cut, true];
  const name = node.querySelector(":scope > span:not(.personal-account-avatar):not(.project-monogram), .personal-account-copy");
  return name && name.getBoundingClientRect().width > 2 ? ["", false] : [labelFor(node), false];
}
function place(node: HTMLElement) {
  const box = node.getBoundingClientRect();
  const above = node.closest(".workbench-bar") !== null || box.bottom + tip.offsetHeight + 14 > innerHeight;
  const x = box.left + box.width / 2 - tip.offsetWidth / 2;
  const y = above ? box.top - tip.offsetHeight - 8 : box.bottom + 8;
  tip.style.setProperty("--tip-x", `${Math.round(Math.max(6, Math.min(innerWidth - tip.offsetWidth - 6, x)))}px`);
  tip.style.setProperty("--tip-y", `${Math.round(Math.max(6, y))}px`);
  tip.style.transformOrigin = above ? "bottom center" : "top center";
}
function show(node: HTMLElement, at?: Element | null) {
  const [text, cut] = textFor(node, at);
  if (!text) return;
  for (const el of [node, ...node.querySelectorAll<HTMLElement>("[title]")]) {
    if (el.hasAttribute("title")) { el.dataset.craftTitle = el.getAttribute("title")!; el.removeAttribute("title"); }
  }
  tip.textContent = text;
  tip.toggleAttribute("data-cut", cut);
  const index = cut ? -1 : (window.molisRailShortcuts?.() ?? []).indexOf(node);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = node.matches(".navigator-project-search") ? (mac ? "⌘K" : "Ctrl K") : index >= 0 ? `${mac ? "⌥" : "Alt "}${index + 1}` : "";
  if (shortcut) { const key = document.createElement("kbd"); key.textContent = shortcut; tip.append(key); }
  if (!tip.isConnected) document.body.append(tip);
  owner = node;
  place(node);
  requestAnimationFrame(() => { if (owner === node) tip.setAttribute("data-shown", ""); });
}
function hide() {
  clearTimeout(timer); clearTimeout(held); waiting = null;
  if (!owner) return;
  for (const el of [owner, ...owner.querySelectorAll<HTMLElement>("[data-craft-title]")]) {
    if (el.dataset.craftTitle != null) { el.setAttribute("title", el.dataset.craftTitle); delete el.dataset.craftTitle; }
  }
  owner = null;
  tip.removeAttribute("data-shown");
  lastHidden = Date.now();
}
function queue(node: HTMLElement, wait: number, at?: Element | null) {
  if (owner === node && tip.textContent?.startsWith(textFor(node, at)[0])) return;
  hide();
  waiting = node;
  timer = window.setTimeout(() => show(node, at), Date.now() - lastHidden < 500 ? 0 : wait);
}
/** The control a pointer, finger or focus is on that has something to say: a named control, else the nearest of the controls
 * or rows around it that holds a cut text (a button in a row whose name is cut is the row's). A pointer or finger on a cut
 * text that nothing holds (a heading) is shown it too; keyboard focus never lands there. */
function targetOf(event: Event): HTMLElement | null {
  const el = event.target instanceof Element ? event.target : null;
  const named = el?.closest<HTMLElement>(TIP_TARGETS);
  if (named && textFor(named, el)[0]) return named;
  for (let holder = el?.closest<HTMLElement>(HOLDERS), up = 0; holder && up < 3; holder = holder.parentElement?.closest<HTMLElement>(HOLDERS), up++) {
    if (cutText(holder, el)) return holder;
  }
  if (event.type === "focusin") return null;
  for (let up = el, depth = 0; up instanceof HTMLElement && depth < 4; up = up.parentElement, depth++) if (isCut(up)) return up;
  return null;
}

document.addEventListener("pointerover", (event) => {
  if (!hoverable.matches || event.pointerType === "touch") return;
  const node = targetOf(event);
  if (node) queue(node, 420, event.target as Element);
});
document.addEventListener("pointerout", (event) => {
  if (!owner || event.pointerType === "touch") return;
  if (event.target instanceof Node && owner.contains(event.target) && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide();
});
document.addEventListener("focusin", (event) => {
  const node = targetOf(event);
  if (node && node.matches(":focus-visible")) queue(node, 0);
});
document.addEventListener("focusout", hide);
document.addEventListener("pointerdown", (event) => {
  hide();
  if (event.pointerType !== "touch") return;
  const node = targetOf(event);
  if (!node) return;
  const start = [event.clientX, event.clientY];
  const moved = (move: PointerEvent) => { if (Math.hypot(move.clientX - start[0]!, move.clientY - start[1]!) > 8) clearTimeout(held); };
  addEventListener("pointermove", moved, { passive: true });
  const at = event.target as Element;
  held = window.setTimeout(() => show(node, at), HOLD_MS);
  addEventListener("pointerup", () => { removeEventListener("pointermove", moved); if (owner === node) held = window.setTimeout(hide, 1500); else clearTimeout(held); }, { once: true });
}, true);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && owner) hide(); });
// The page itself (document) or a box holding what it is about.
document.addEventListener("scroll", (event) => { const about = owner ?? waiting; if (about && (event.target as Node).contains(about)) hide(); }, true);
addEventListener("blur", hide);
