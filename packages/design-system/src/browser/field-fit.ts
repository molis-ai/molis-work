import { fieldHeight } from "../field-fit.js";

/**
 * Intrinsic sizing's one program per document (specs/visual-ui-experience §composer-mentions, VUX-16). A `data-fit` field
 * grows with what is written; where the engine has `field-sizing: content` the stylesheet alone does it. Elsewhere this
 * program measures: on each input, when a page puts a field in, when its width changes (lines rewrap) and when fonts load.
 * - Measuring puts the height down to nothing first (its min-height holds it), so a field also falls back when lines go,
 *   and its `rows` do not set a floor the engine's own sizing would not.
 * - The field's own scroll and every scrolled ancestor's are put back after the measure: the brief collapse must not jump
 *   the page or the field.
 * - Past its max the field scrolls inside; a caret at the end stays in view (typing at the end, a long paste, a draft put
 *   back), a caret elsewhere keeps the field where the person left it.
 * `window.molisFit(field)` is for a value set by code, which sends no input event.
 */
const SELECTOR = "textarea[data-fit]";
const grows = !globalThis.CSS?.supports?.("field-sizing", "content");
const widths = new WeakMap<HTMLTextAreaElement, number>();

function scrolled(field: HTMLElement) {
  const kept: [Element, number][] = [];
  for (let node = field.parentElement; node; node = node.parentElement) if (node.scrollTop) kept.push([node, node.scrollTop]);
  const page = document.scrollingElement;
  if (page?.scrollTop) kept.push([page, page.scrollTop]);
  return kept;
}
function caretInView(field: HTMLTextAreaElement, top: number) {
  const atEnd = document.activeElement === field && field.selectionEnd === field.value.length;
  field.scrollTop = atEnd ? field.scrollHeight : top;
}
function measure(field: HTMLTextAreaElement) {
  if (!field.isConnected || !field.clientWidth) return;
  const style = getComputedStyle(field);
  const px = (value: string) => parseFloat(value) || 0;
  const frame = style.boxSizing === "border-box"
    ? px(style.borderTopWidth) + px(style.borderBottomWidth)
    : -(px(style.paddingTop) + px(style.paddingBottom));
  const max = parseFloat(style.maxHeight);
  const kept = scrolled(field), top = field.scrollTop;
  field.style.height = "0px";
  field.style.height = `${fieldHeight(field.scrollHeight + frame, px(style.minHeight), Number.isFinite(max) ? max : Infinity)}px`;
  for (const [node, at] of kept) node.scrollTop = at;
  caretInView(field, top);
  widths.set(field, field.clientWidth);
}
function fit(field: HTMLTextAreaElement) {
  if (grows) measure(field);
  else caretInView(field, field.scrollTop);
}

const sized = grows && typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const field = target as HTMLTextAreaElement;
      if (widths.get(field) !== field.clientWidth) measure(field);
    }
  })
  : null;
const seen = new WeakSet<HTMLTextAreaElement>();
function scan() {
  for (const field of document.querySelectorAll<HTMLTextAreaElement>(SELECTOR)) {
    if (seen.has(field)) continue;
    seen.add(field);
    sized?.observe(field);
    measure(field);
  }
}
// Typing at the end shows the whole last line in both ways: the engine's own sizing brings the caret into view, but can
// leave the line's lower part under the edge.
addEventListener("input", (event) => { if (event.target instanceof HTMLTextAreaElement && event.target.matches(SELECTOR)) fit(event.target); }, true);
if (grows) {
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); };
  const marked = (node: Node) => node instanceof Element && (node.matches(SELECTOR) || node.querySelector(SELECTOR) !== null);
  // A field a page puts in is measured before it is painted: a mutation callback runs ahead of the frame.
  new MutationObserver((records) => { if (records.some((record) => [...record.addedNodes].some(marked))) scan(); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", later);
  document.fonts?.addEventListener?.("loadingdone", () => document.querySelectorAll<HTMLTextAreaElement>(SELECTOR).forEach(measure));
  later();
}

window.molisFit = fit;
