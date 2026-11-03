/**
 * A drop zone's feedback (specs/visual-ui-experience §composer-mentions「附件形态与接收区」, VUX-18): `window.molisDropZone(zone,
 * mark, accepts)` keeps `mark(true)` while a drag the zone accepts is over it, and calls `mark(false)` once it really leaves.
 * One program per document follows the element the drag last entered. Moving between two elements enters the new one before
 * it leaves the old, so a leave from the element last entered is a leave from everything: the drag went out of the window
 * or Escape cancelled it. Crossing a child inside the zone does not flicker, and nothing needs `relatedTarget`, which
 * WebKit leaves empty on drag events. A drop, the end of a drag started here, and the window losing focus clear it too.
 * A zone is an element, or a selector for zones a page draws again (matched against where the drag is; registering the same
 * selector again replaces it). Zones given the same `mark` are one place (a plugin's directory and its page): it stays on
 * while the drag is in either.
 * A zone given a `reason` has a third face: while a drag it does not take is over it, it is marked `data-drop-refused` (a dashed
 * outline in the danger colour) and the page's one badge says why. Only a drag that came from outside the page is refused that way
 * (one started here, a tab or a card moved inside the app, is not a drop onto a file zone), and only one that carries something
 * (types are empty when a browser hides them). The drop itself is not taken: nothing here calls `preventDefault`. It follows the
 * same enter/leave counting, so crossing a child does not flicker, and it clears the same ways.
 * The zone still takes the drop itself (`dragover` and `drop`); this only says where it is.
 */
import type { DropAccepts as Accepts, DropItem, DropMark as Mark } from "@molis-ai/molis-work-plugin-sdk/page-globals";

const zones = new Map<Element | string, { mark: Mark; accepts: Accepts; reason?: string }>();
const shown = new Map<Mark, boolean>();
let entered: EventTarget | null = null;
let own = false;
let refused: Element | null = null;
let badge: HTMLElement | null = null;

// The refused face is drawn from here, so every document that carries the program has it (adopted sheets are not CSP-bound).
const sheet = () => {
  const css = new CSSStyleSheet();
  css.replaceSync(`html [data-drop-refused]{outline:2px dashed var(--danger,var(--red));outline-offset:-2px}
.molis-drop-refusal{position:fixed;z-index:2147483000;display:none;max-width:calc(100vw - 16px);padding:4px 10px;border-radius:6px;pointer-events:none;background:var(--danger,var(--red));color:var(--danger-action-ink,var(--page));font-size:12px;font-weight:500;line-height:18px;transform:translateX(-50%)}
.molis-drop-refusal[data-shown]{display:block}`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, css];
};
const refuse = (zone: Element | null, reason = "") => {
  if (zone === refused && (!zone || badge?.textContent === reason)) return;
  refused?.removeAttribute("data-drop-refused");
  refused = zone;
  if (!zone) { badge?.removeAttribute("data-shown"); return; }
  if (!badge) { sheet(); badge = document.createElement("div"); badge.className = "molis-drop-refusal"; badge.setAttribute("role", "status"); document.body.append(badge); }
  const box = zone.getBoundingClientRect();
  badge.textContent = reason;
  badge.style.left = `${Math.round(Math.min(innerWidth - 8, Math.max(8, box.left + box.width / 2)))}px`;
  badge.style.top = `${Math.round(Math.max(8, box.top + 8))}px`;
  zone.setAttribute("data-drop-refused", "");
  badge.setAttribute("data-shown", "");
};

const paint = (target: EventTarget | null, types: readonly string[], items: readonly DropItem[] = []) => {
  const next = new Map<Mark, boolean>();
  let no: [Element, string] | null = null;
  for (const [zone, { mark, accepts, reason }] of zones) {
    if (typeof zone !== "string" && !zone.isConnected) { zones.delete(zone); continue; }
    const over = typeof zone === "string" ? target instanceof Element && !!target.closest(zone) : target instanceof Node && zone.contains(target);
    const takes = over && accepts(types, items);
    next.set(mark, next.get(mark) || takes);
    const at = over && !takes && reason && types.length && !own ? (typeof zone === "string" ? (target as Element).closest(zone) : zone) : null;
    if (at && !no) no = [at, reason as string];
  }
  for (const [mark, on] of shown) if (!next.has(mark)) { shown.delete(mark); if (on) mark(false); }
  for (const [mark, on] of next) { if ((shown.get(mark) ?? false) !== on) mark(on); shown.set(mark, on); }
  // A zone that takes this drag wins over one that refuses it (a refusing zone around a taking one).
  if ([...next.values()].includes(true)) refuse(null); else refuse(no?.[0] ?? null, no?.[1]);
};
const clear = () => { entered = null; paint(null, []); };

// A drag begun in this document (a tab, a card) is the app's own movement, not something brought to a file zone.
addEventListener("dragstart", () => { own = true; }, true);
addEventListener("dragenter", (event) => {
  entered = event.target;
  paint(entered, [...(event.dataTransfer?.types ?? [])], [...(event.dataTransfer?.items ?? [])].map(({ kind, type }) => ({ kind, type })));
}, true);
addEventListener("dragleave", (event) => { if (event.target === entered) clear(); }, true);
// The drag is over for good: forget where it began too. (Leaving the window is not that: it may come back.)
for (const type of ["drop", "dragend"]) addEventListener(type, () => { own = false; clear(); }, true);
// Not caught on the way down: that would be every field's blur. The window's own blur reaches it as it happens.
addEventListener("blur", clear);

window.molisDropZone ??= (zone, mark, accepts = (types) => types.includes("Files"), reason) => { zones.set(zone, { mark, accepts, reason }); };
