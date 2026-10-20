import { overflowSides } from "../overflow-sides.js";

/**
 * The overflow fade's one sensor per document (specs/visual-ui-experience §overflow-fade, VUX-27). A strip marked
 * `data-overflow-fade` is measured in the next frame after it scrolls, resizes, its content, class, style or direction changes,
 * or fonts load, and `data-more` is written only when the answer changes. Strips are found on load, after each click or
 * focus, as the segmented thumbs are, and when a page puts one in later (a list row drawn after load). A box that does not scroll (overflow visible) is never masked: the mask would cut off
 * what it lets show.
 */
const seen = new WeakSet<HTMLElement>();
const due = new Set<HTMLElement>();

function measure() {
  const found = [...due].map((node) => {
    const scrolls = /auto|scroll|hidden/.test(getComputedStyle(node).overflowX);
    return [node, overflowSides(Math.abs(node.scrollLeft), scrolls ? node.scrollWidth - node.clientWidth : 0)] as const;
  });
  due.clear();
  for (const [node, more] of found) {
    if ((node.dataset.more || "") === more) continue;
    if (more) node.dataset.more = more;
    else delete node.dataset.more;
  }
}
function check(node: HTMLElement) {
  if (!due.size) requestAnimationFrame(measure);
  due.add(node);
}
const strips = () => document.querySelectorAll<HTMLElement>("[data-overflow-fade]");
const sized = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => entries.forEach((entry) => check(entry.target as HTMLElement))) : null;

function watch(node: HTMLElement) {
  if (seen.has(node)) return;
  seen.add(node);
  node.addEventListener("scroll", () => check(node), { passive: true });
  sized?.observe(node);
  new MutationObserver(() => check(node)).observe(node, { childList: true, subtree: true, characterData: true, attributeFilter: ["class", "style", "dir"] });
  check(node);
}
let queued = false;
function scan() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; strips().forEach(watch); });
}
for (const type of ["click", "focusin"]) addEventListener(type, scan, true);
addEventListener("pageshow", scan);
document.addEventListener("DOMContentLoaded", scan);
document.fonts?.addEventListener?.("loadingdone", () => strips().forEach(check));
const marked = (node: Node) => node instanceof Element && (node.matches("[data-overflow-fade]") || node.querySelector("[data-overflow-fade]") !== null);
new MutationObserver((records) => { if (records.some((record) => [...record.addedNodes].some(marked))) scan(); }).observe(document.documentElement, { childList: true, subtree: true });
scan();
