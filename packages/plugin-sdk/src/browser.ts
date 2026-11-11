/// <reference lib="dom" />

/**
 * Where a floating layer goes: beside, above or below what it belongs to, kept inside the screen or the stage the person is
 * working in. A leaf with no import and no use of Node, so a page bundle can take it by itself:
 * `@molis-ai/molis-work-plugin-sdk/browser`. The toolbar that sits next to a selection, the editor's own menus and the
 * popovers in a split pane all place themselves with these, in one way.
 */
const MARGIN = 8;

export interface FloatingAnchor {
  left: number;
  top: number;
  bottom: number;
  right: number;
}

export interface FloatingSize {
  width: number;
  height: number;
}

export type FloatingMode = "below" | "above" | "beside";

const GAP = 8;
function clampTo(value: number, limit: number, length: number): number {
  return Math.round(Math.min(Math.max(MARGIN, value), Math.max(MARGIN, limit - length - MARGIN)));
}

/** Put a floating panel on the side that fits. A panel taller than the screen stays inside the margin. */
export function placeFloating(
  anchor: FloatingAnchor,
  size: FloatingSize,
  viewport: { width: number; height: number },
  mode: FloatingMode,
): { left: number; top: number } {
  return mode === "beside" ? placeBeside(anchor, size, viewport) : placeStacked(anchor, size, viewport, mode);
}

function placeBeside(anchor: FloatingAnchor, size: FloatingSize, viewport: { width: number; height: number }): { left: number; top: number } {
  const onRight = anchor.right + GAP;
  const onLeft = anchor.left - GAP - size.width;
  const left = pick(
    onRight,
    onLeft,
    onRight + size.width <= viewport.width - MARGIN,
    onLeft >= MARGIN,
    viewport.width - onRight,
    anchor.left - MARGIN,
  );
  const top = anchor.top + size.height <= viewport.height - MARGIN
    ? anchor.top
    : viewport.height - MARGIN - size.height;
  return { left: clampTo(left, viewport.width, size.width), top: clampTo(top, viewport.height, size.height) };
}

/** Above or below: the preferred side when it fits, else the other, else where there is more room. This part is the one the page programs carry. */
function placeStacked(anchor: FloatingAnchor, size: FloatingSize, viewport: { width: number; height: number }, mode: "above" | "below"): { left: number; top: number } {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.height;
  const top = mode === "above"
    ? pick(above, below, above >= MARGIN, below + size.height <= viewport.height - MARGIN, anchor.top - MARGIN, viewport.height - below)
    : pick(below, above, below + size.height <= viewport.height - MARGIN, above >= MARGIN, viewport.height - below, anchor.top - MARGIN);
  return { left: clampTo(anchor.left, viewport.width, size.width), top: clampTo(top, viewport.height, size.height) };
}

function pick(
  preferred: number,
  alternate: number,
  preferredFits: boolean,
  alternateFits: boolean,
  preferredRoom: number,
  alternateRoom: number,
): number {
  if (preferredFits) return preferred;
  if (alternateFits) return alternate;
  return preferredRoom >= alternateRoom ? preferred : alternate;
}

/** Scrolling inside a floating panel should not move that panel. Page scroll should. */
export function scrollShouldFollow(target: EventTarget | null, panel: Element | null): boolean {
  const node = globalThis.Node;
  if (!panel || !node || !(target instanceof node)) return true;
  return !panel.contains(target);
}

/**
 * Put a fixed overlay at viewport coordinates. Inside the workbench a pane can itself be the box fixed positioning is
 * measured from (it would shift the overlay by the pane's offset onto the text it belongs above): measure where it
 * landed and correct by the difference. The element must be shown when this runs.
 */
export function pinAt(el: HTMLElement, left: number, top: number): void {
  el.style.left = left + "px";
  el.style.top = top + "px";
  const box = el.getBoundingClientRect();
  const dx = Math.round(box.left - left), dy = Math.round(box.top - top);
  if (dx || dy) { el.style.left = left - dx + "px"; el.style.top = top - dy + "px"; }
}

/**
 * Place an overlay beside, above or below an anchor, inside the stage that contains it (the nearest `[data-floating-stage]`, or
 * the screen). It fits the stage but never grows past its own CSS cap, so a compact menu stays a compact scroller.
 */
export function placeOverlay(el: HTMLElement, anchor: FloatingAnchor, mode: FloatingMode, stage = "[data-floating-stage]"): void {
  const box0 = el.closest(stage)?.getBoundingClientRect();
  const left = Math.max(0, box0?.left ?? 0);
  const top = Math.max(0, box0?.top ?? 0);
  const width = Math.min(window.innerWidth, box0?.right ?? window.innerWidth) - left;
  const height = Math.min(window.innerHeight, box0?.bottom ?? window.innerHeight) - top;
  el.style.maxWidth = ""; el.style.maxHeight = "";
  const declared = getComputedStyle(el);
  const cap = (value: string) => { const px = parseFloat(value); return Number.isFinite(px) ? px : Infinity; };
  el.style.maxWidth = Math.max(0, Math.min(width - 16, cap(declared.maxWidth))) + "px";
  el.style.maxHeight = Math.max(0, Math.min(height - 16, cap(declared.maxHeight))) + "px";
  const box = el.getBoundingClientRect();
  const spot = placeFloating(
    { left: anchor.left - left, right: anchor.right - left, top: anchor.top - top, bottom: anchor.bottom - top },
    { width: box.width, height: box.height },
    { width, height },
    mode,
  );
  pinAt(el, left + spot.left, top + spot.top);
}

/** Run `run` whenever the page scrolls except inside `panel`; the returned function stops it. */
export function followScroll(panel: Element, run: () => void): () => void {
  const onScroll = (event: Event) => {
    if (!scrollShouldFollow(event.target, panel)) return;
    run();
  };
  document.addEventListener("scroll", onScroll, true);
  return () => document.removeEventListener("scroll", onScroll, true);
}

// For the page programs that carry these functions as source text (floating-source.ts): what `placeStacked` closes over.
export { GAP as FLOATING_GAP, MARGIN as FLOATING_MARGIN, clampTo, pick as pickSide, placeStacked };

/** Text to show for an error raised by a client action, including a thrown string. */
export const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Native JSON read comparison: preserve toJSON and JSON.stringify's value rules.
 * Integer-shaped keys keep JavaScript's enumeration order; this is not signing text. */
export const jsonComparisonText = (value: unknown): string | undefined => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, (item as Record<string, unknown>)[name]])) : item);

/** Shared content vocabulary for server rendering and browser consumption. */
export const CONTENT_TAGS = /* @__PURE__ */ Object.freeze([
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "hr",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "sup",
  "sub",
  "kbd",
] as const);

export const NON_TEXT_TAGS = /* @__PURE__ */ Object.freeze([
  "script",
  "style",
  "textarea",
  "option",
  "xmp",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "form",
] as const);

/** D0103: render returned content inertly; only presentation markup and explicit safe links survive. */
export function setContentHtml(target: Element, markup: string): void {
  const template = target.ownerDocument.createElement("template"); template.innerHTML = markup;
  const allowed = new Set<string>([...CONTENT_TAGS, ..."div span section header footer dl dt dd button mark svg use path line polyline rect circle".split(" ")]);
  const nonText = new Set<string>(NON_TEXT_TAGS.filter(tag => tag !== "svg"));
  const attrs = new Set("class title dir aria-label aria-hidden role colspan rowspan align width height viewBox d fill stroke stroke-width stroke-linecap stroke-linejoin x y x1 y1 x2 y2 cx cy r points data-phase data-group data-kind data-mode data-sign data-path".split(" "));
  const elements = Array.from(template.content.querySelectorAll("*"));
  for (const element of elements) {
    const tag = element.localName;
    if (nonText.has(tag) || !["http://www.w3.org/1999/xhtml", "http://www.w3.org/2000/svg"].includes(element.namespaceURI ?? "")) { element.remove(); continue; }
    if (!allowed.has(tag)) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    for (const attribute of Array.from(element.attributes)) {
      const { name, value } = attribute;
      if (name === "href" && tag === "use" && /^#icon-[a-z0-9-]+$/.test(value)) continue;
      if (name === "href" && tag === "a") {
        try { const url = new URL(value); if (url.protocol === "https:" || url.protocol === "http:") { element.setAttribute("href", url.href); continue; } }
        catch { /* A malformed or relative URL is not a content link. */ }
      }
      if (name === "open" && tag === "details") continue;
      if (name === "disabled" && tag === "button") continue;
      if (name === "style" && tag === "ol" && /^--diff-digits:\d{1,2}$/.test(value)) continue;
      if (["data-change-index", "data-diff-folded", "data-diff-unfold", "data-coding-line"].includes(name) && /^\d{1,6}$/.test(value)) continue;
      if (name === "data-coding-line-side" && ["before", "after"].includes(value)) continue;
      if (name === "data-action" && tag === "button" && value === "diff.show-file") continue;
      if (name === "hidden" && tag === "li" && /^\d{1,6}$/.test(element.getAttribute("data-diff-folded") ?? "")) continue;
      if (["fill", "stroke"].includes(name) && !/^(?:none|currentColor|#[a-f0-9]{3,8})$/i.test(value)) { element.removeAttributeNode(attribute); continue; }
      if (!attrs.has(name) || attribute.namespaceURI !== null) element.removeAttributeNode(attribute);
    }
    if (tag === "button") element.setAttribute("type", "button");
    if (tag === "a") { element.setAttribute("target", "_blank"); element.setAttribute("rel", "noopener noreferrer"); }
  }
  target.replaceChildren(template.content);
}

/** The same boundary for a content fragment passed to a streaming or composite renderer. */
export function contentHtml(markup: string, ownerDocument: Document = document): string {
  const target = ownerDocument.createElement("div"); setContentHtml(target, markup); return target.innerHTML;
}
