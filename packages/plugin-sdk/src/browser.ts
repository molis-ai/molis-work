/// <reference lib="dom" />

import type { UiPluginClientHost, UiRequestScope } from "@molis-ai/molis-work-contracts/platform/ui";

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

export const statusOf = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;
export const codeOf = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;
export const isAbort = (error: unknown): boolean => (error as { name?: string } | null)?.name === "AbortError";

/** Bind the page's missing-element diagnostic once, then query required parts of its markup. */
export function requiredQuery(missing: (selector: string) => string) {
  return <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(missing(selector));
    return node;
  };
}

/** A one-line cell whose full text is also its tooltip. */
export function textCell(className: string, text: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.title = text;
  node.textContent = text;
  return node;
}

type PluginRequestHost = Pick<UiPluginClientHost, "pluginRoute"> & Partial<Pick<UiPluginClientHost, "route" | "readRefusal">>;

interface PluginRequestOptions {
  fallback(): string;
  readonly codes?: Readonly<Record<string, () => string>>;
  readonly readRefusal?: boolean;
  readonly scope?: UiRequestScope;
  readonly project?: {
    id(): string;
    missing(): string;
    /** For routes that still declare a project field in both the query and the write body. */
    readonly includeInRequest?: boolean;
  };
}

/** Adapt a page's JSON GET/POST to the Host request, preserving its failure object and cancellation. */
export function pluginRequest(host: PluginRequestHost, { fallback, codes, readRefusal, scope, project }: PluginRequestOptions) {
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
    const projectId = project?.id();
    if (project && !projectId) throw new Error(project.missing());
    let url = host.route && path.startsWith("/api/") ? host.route(path) : host.pluginRoute(path);
    const wireProject = project?.includeInRequest ? projectId : undefined;
    if (wireProject) url += (url.includes("?") ? "&" : "?") + "project_id=" + encodeURIComponent(wireProject);
    const fields = method === "POST" && body !== undefined ? (wireProject ? { ...body, project_id: wireProject } : body) : undefined;
    try {
      return await molisWorkRequest<T>(url, { method, body: fields, scope, signal, fallback: fallback() });
    } catch (error) {
      if (error instanceof Error && !isAbort(error)) {
        const code = codeOf(error), status = statusOf(error);
        const message = readRefusal && method === "GET" && status !== undefined ? host.readRefusal?.(status, code) : undefined;
        const translated = message || (code && codes && Object.hasOwn(codes, code) ? codes[code]?.() : undefined);
        if (translated) error.message = translated;
      }
      throw error;
    }
  };
}

/** Native JSON read comparison: preserve toJSON and JSON.stringify's value rules.
 * Integer-shaped keys keep JavaScript's enumeration order; this is not signing text. */
export const jsonComparisonText = (value: unknown): string | undefined => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, (item as Record<string, unknown>)[name]])) : item);
