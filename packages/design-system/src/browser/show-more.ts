import type { ShowMoreOptions } from "../show-more.js";

/**
 * One "show more" for a long list (specs/visual-ui-experience §assistant-information, VUX-08):
 * `window.molisShowMore(list, { key, label, limit, keep })` keeps the list's first `limit` items in sight and tucks the rest
 * behind one button whose words say how many (`label`, with `{n}`). An item matching `keep` (a failure) is never tucked.
 * - Revealing is the person's choice: it lasts for the page under the same `key`, so the list drawn again stays open.
 * - The button stands where the tucked items are and hands focus to the first one it revealed; a list only one over the
 *   limit shows that item, not a button.
 * - Call it again after the list is drawn again; it puts back only what it tucked itself.
 */
const revealed = new Set<string>();
const tuckedBy = new WeakSet<Element>();

function molisShowMore(list: HTMLElement, { key, label, limit = 5, keep }: ShowMoreOptions) {
  list.querySelector(":scope > .mw-show-more")?.remove();
  const items = [...list.children].filter((item): item is HTMLElement => item instanceof HTMLElement);
  for (const item of items) if (tuckedBy.has(item)) { item.hidden = false; tuckedBy.delete(item); }
  const tucked = revealed.has(key) ? [] : items.slice(limit).filter((item) => !item.hidden && !(keep && item.matches(keep)));
  if (tucked.length < 2) return;
  for (const item of tucked) { item.hidden = true; tuckedBy.add(item); }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mw-btn mw-btn--ghost mw-btn--sm mw-show-more";
  button.textContent = label.replace("{n}", String(tucked.length));
  button.addEventListener("click", () => {
    revealed.add(key);
    for (const item of tucked) { item.hidden = false; tuckedBy.delete(item); }
    button.remove();
    const first = tucked[0]!, target = first.querySelector<HTMLElement>("button, a[href], [tabindex]") ?? first;
    if (target === first && !first.hasAttribute("tabindex")) first.tabIndex = -1;
    target.focus();
  });
  // Where the tucked rows are, so a row kept in sight after them (a failure) reads after the button, in its place.
  tucked.at(-1)!.after(button);
}

window.molisShowMore ??= molisShowMore;
