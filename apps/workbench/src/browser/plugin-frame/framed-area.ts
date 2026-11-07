import { overFrame } from "./over-frame.js";
import type { FrameBox, FrameScope } from "./types.js";

/**
 * A platform area drawn outside an opaque plugin page, over a place the page keeps for it (specs/proactive-assistant/
 * task-grants-platform-area.md §3.1–§3.3). The page only reports where its empty element is; the trusted document draws the
 * area as a sibling of the frame, follows that place, and lets a control in it act only on a real, deliberate press. Every
 * area a page has goes through the one registry of its page (`pageFramedAreas`): the task reads area does now, and the
 * connection card of specs/assistant-service-connections §13.5 is to (four areas a page in all, whatever their kind).
 */

/** At most this many areas on one page, of every kind together. */
export const FRAMED_AREA_LIMIT = 4;
/** Narrower than this the area is not drawn; a page narrower than it hides the area. */
export const FRAMED_AREA_MIN_WIDTH = 280;
/** The width from which an area takes its wide height step. */
export const FRAMED_AREA_WIDE_FROM = 480;
/** How long the area must have stood still, and a control must have held the keyboard focus, before a press acts. */
export const FRAMED_AREA_STEADY_MS = 500;

/**
 * Why a press did not act. `silent`: not a real press (scripted), said nowhere. `moved`: the area moved or appeared within
 * the steady time, or the focus only just arrived. `partial`: the area is not wholly in view (`reveal` says whether bringing
 * the page's element into view could help). `covered`: something lies over the control, the header or the foot.
 */
export type FramedAreaRefusal = { reason: "silent" } | { reason: "moved" } | { reason: "partial"; reveal: boolean } | { reason: "covered" };

export interface FramedAreaOptions {
  /** The area's height for each step: it follows the width alone, never what the area shows (§3.1). */
  readonly heights: { readonly narrow: number; readonly wide: number };
  /** Says when the height the page should give its element changes: a step, or 0 while the frame is too narrow for the area. */
  onHeight(height: number): void;
}

export interface FramedArea {
  /** Clips the area to the frame's visible box. */
  readonly holder: HTMLDivElement;
  /** What the kind draws into; carries `data-framed-area-head` and `data-framed-area-foot` parts for the hit test. */
  readonly surface: HTMLElement;
  /** Follows the page's reported box; `null` hides the area until the next box. */
  layout(box: FrameBox | null): void;
  /**
   * Replaces what the area shows. A control that had the keyboard focus (by its `data-framed-control` name) has it again, and
   * keeps how long it has had it: drawing the result of a press must not make the next one wait. Each `[data-framed-scroll]` part keeps its scroll position.
   */
  redraw(html: string): void;
  /** Checks 1–4 of §3.3 for one activation of `control` (a `[data-framed-control]` inside the area); `null` when it may act. */
  gate(event: MouseEvent, control: Element): FramedAreaRefusal | null;
  close(): void;
}

type Rect = { left: number; top: number; right: number; bottom: number };
const rect = (box: DOMRectReadOnly): Rect => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
const meet = (a: Rect, b: Rect): Rect => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
// Half a CSS pixel of tolerance: layout rounds, a person's area does not move by less.
const within = (inner: Rect, outer: Rect) => inner.left >= outer.left - .5 && inner.top >= outer.top - .5 && inner.right <= outer.right + .5 && inner.bottom <= outer.bottom + .5;
const crosses = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const same = (a: Rect | null, b: Rect | null) => a === b || Boolean(a && b && Math.abs(a.left - b.left) < .5 && Math.abs(a.top - b.top) < .5
  && Math.abs(a.right - b.right) < .5 && Math.abs(a.bottom - b.bottom) < .5);
const clips = (element: Element) => { const style = getComputedStyle(element); return style.overflowX !== "visible" || style.overflowY !== "visible"; };

/**
 * The trusted half: one registry per mounted page. `visible` is the page's own visibility (`parent.ts`): a hidden frame hides
 * every area. While any area is shown the registry measures each one every frame, so a move the page did not report (a pane
 * resized, the shell laid out again) restarts the steady time as well.
 */
export function pageFramedAreas(scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement, visible: () => boolean) {
  const areas = new Set<Entry>();
  const view = root.ownerDocument.defaultView ?? window;
  let scheduled = 0;
  interface Entry { area: FramedArea; box: FrameBox | null; shown: Rect | null; movedAt: number; height: number; crossed: boolean;
    focus: { name: string; at: number } | null; redrawing: boolean; press: { at: number; shown: Rect | null } | null; options: FramedAreaOptions; place(): void }

  /** Where the frame shows on screen, for one entry: its box clamped to the frame, and whether the frame is wide enough at all. */
  const place = (entry: Entry) => {
    const { holder, surface } = entry.area, box = entry.box, owner = frame.getBoundingClientRect();
    const fits = owner.width >= FRAMED_AREA_MIN_WIDTH;
    const width = box ? Math.min(owner.width, Math.max(FRAMED_AREA_MIN_WIDTH, box.width)) : 0;
    // The step follows the width the area is drawn at; without a box the element keeps the height it has.
    const height = !fits ? 0 : box ? (width >= FRAMED_AREA_WIDE_FROM ? entry.options.heights.wide : entry.options.heights.narrow) : entry.height;
    if (height !== entry.height) { entry.height = height; entry.options.onHeight(height); }
    if (!box || !fits || !visible() || !scope.visible) { hide(entry); return; }
    if (overFrame(root, owner, holder, surface, { x: Math.min(box.x, owner.width - width), y: box.y, width, height })) holder.hidden = false;
    else hide(entry);
  };
  const hide = (entry: Entry) => { entry.area.holder.hidden = true; entry.shown = null; };

  /** One frame: place every area, note which moved, hide the ones that cross another, and show which are not ready yet. */
  const tick = () => {
    scheduled = 0;
    if (!scope.alive || !areas.size) return;
    const now = performance.now();
    for (const entry of areas) {
      entry.place();
      const shown = entry.area.holder.hidden ? null : rect(entry.area.surface.getBoundingClientRect());
      if (!same(shown, entry.shown)) { entry.shown = shown; entry.movedAt = now; }
    }
    for (const entry of areas) {
      // Two areas crossing could pair one's header with the other's switches (§3.1): both hide until they part.
      const crossed = Boolean(entry.shown) && [...areas].some(other => other !== entry && other.shown && crosses(entry.shown!, other.shown));
      if (crossed !== entry.crossed) { entry.crossed = crossed; entry.area.holder.style.visibility = crossed ? "hidden" : ""; entry.area.holder.inert = crossed; }
      // Not ready yet (§3.3): within the steady time every control, and a control the focus only just reached, is faded and
      // said to be unavailable, so a person sees why a press does nothing now.
      const settling = now - entry.movedAt < FRAMED_AREA_STEADY_MS;
      const focused = entry.focus && now - entry.focus.at < FRAMED_AREA_STEADY_MS ? entry.focus.name : null;
      if (settling !== entry.area.surface.hasAttribute("data-unready")) entry.area.surface.toggleAttribute("data-unready", settling);
      for (const control of entry.area.surface.querySelectorAll<HTMLElement>("[data-framed-control]")) {
        const unready = settling || control.dataset.framedControl === focused;
        if (unready !== control.hasAttribute("aria-disabled")) { if (unready) control.setAttribute("aria-disabled", "true"); else control.removeAttribute("aria-disabled"); }
      }
    }
    if (scope.visible) scheduled = view.requestAnimationFrame(tick);
  };
  const run = () => { if (!scheduled && areas.size && scope.visible) scheduled = view.requestAnimationFrame(tick); };
  scope.whenVisible(() => { for (const entry of areas) entry.movedAt = performance.now(); run(); return () => { view.cancelAnimationFrame(scheduled); scheduled = 0; for (const entry of areas) hide(entry); }; });
  scope.own(() => { view.cancelAnimationFrame(scheduled); for (const entry of [...areas]) entry.area.close(); });

  /** Whether the whole area is in view: the frame's visible box, the window and every clipping box of the trusted document. */
  const wholeInView = (entry: Entry, shown: Rect) => {
    let room = meet(rect(frame.getBoundingClientRect()), { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight });
    for (let node = entry.area.holder.parentElement; node && node !== root.ownerDocument.documentElement; node = node.parentElement)
      if (clips(node)) room = meet(room, rect(node.getBoundingClientRect()));
    return within(shown, room);
  };
  /** Whether the control lies wholly inside every scrolling part of the area (a list row half scrolled out does not act). */
  const controlInView = (entry: Entry, control: Element) => {
    const own = rect(control.getBoundingClientRect());
    for (let node = control.parentElement; node && node !== entry.area.surface; node = node.parentElement)
      if (clips(node) && !within(own, rect(node.getBoundingClientRect()))) return false;
    return true;
  };
  /** The topmost element at a part's centre is in the area: nothing of the page or the shell lies over it. */
  const onTop = (entry: Entry, part: Element | null) => {
    if (!part) return false;
    const box = part.getBoundingClientRect(), hit = root.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return Boolean(hit && entry.area.surface.contains(hit));
  };

  return {
    /** A new area, or `null` when the page has its four already. */
    open(options: FramedAreaOptions): FramedArea | null {
      if (areas.size >= FRAMED_AREA_LIMIT) return null;
      const holder = document.createElement("div"), surface = document.createElement("section");
      holder.dataset.framedArea = ""; holder.hidden = true;
      // Above the reviews and embeds a page asks for (z-index 1), so neither can lie over it.
      holder.style.cssText = "position:absolute;overflow:hidden;z-index:2";
      surface.style.cssText = "position:absolute;box-sizing:border-box";
      holder.append(surface); root.append(holder);
      const entry: Entry = { box: null, shown: null, movedAt: performance.now(), height: -1, crossed: false, focus: null, redrawing: false, press: null, options, place: () => place(entry),
        area: {
          holder, surface,
          layout(box) {
            entry.box = box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
            entry.place(); run();
          },
          redraw(html) {
            const name = entry.focus?.name;
            // A scrolling part keeps its place across a redraw, so a row changed low in a list stays where the person left it.
            const scrolled = [...surface.querySelectorAll<HTMLElement>("[data-framed-scroll]")].map(part => part.scrollTop);
            entry.redrawing = true;
            try {
              surface.innerHTML = html;
              surface.querySelectorAll<HTMLElement>("[data-framed-scroll]").forEach((part, index) => { part.scrollTop = scrolled[index] ?? 0; });
              if (name) surface.querySelector<HTMLElement>(`[data-framed-control="${CSS.escape(name)}"]`)?.focus({ preventScroll: true });
            } finally { entry.redrawing = false; }
          },
          gate(event, control) {
            if (!event.isTrusted || !surface.contains(control)) return { reason: "silent" };
            const shown = entry.shown;
            if (!shown || entry.crossed || holder.hidden || !visible() || !wholeInView(entry, shown)) return { reason: "partial", reveal: true };
            if (!controlInView(entry, control)) return { reason: "partial", reveal: false };
            if (![control, surface.querySelector("[data-framed-area-head]"), surface.querySelector("[data-framed-area-foot]")].every(part => onTop(entry, part))) return { reason: "covered" };
            // A press is timed from its pointerdown, as the browser stamped it, never from when this handler runs; one made with the
            // keyboard (no pointer, `detail` 0) also needs the focus to have stayed on the control for the steady time.
            const keyboard = event.detail === 0, press = entry.press;
            entry.press = null;
            const at = keyboard ? event.timeStamp : press?.at;
            if (at === undefined || at - entry.movedAt < FRAMED_AREA_STEADY_MS || !keyboard && !same(press!.shown, shown)) return { reason: "moved" };
            if (keyboard && (!entry.focus || entry.focus.name !== (control as HTMLElement).dataset.framedControl || at - entry.focus.at < FRAMED_AREA_STEADY_MS)) return { reason: "moved" };
            return null;
          },
          close() { if (!areas.delete(entry)) return; holder.remove(); },
        } };
      // Capture, so a control's own handler sees the press already noted; the area measured as it was at that moment. A pointerdown a
      // script dispatched is no press: it must not stand in for the person's before a scripted click.
      surface.addEventListener("pointerdown", event => {
        if (!event.isTrusted) return;
        const now = rect(surface.getBoundingClientRect());
        if (!same(now, entry.shown)) { entry.shown = now; entry.movedAt = event.timeStamp; }
        entry.press = { at: event.timeStamp, shown: now };
      }, true);
      // The focus is kept by the control's name, so a redraw that puts it back on the same control keeps its time.
      surface.addEventListener("focusin", event => {
        const name = (event.target as HTMLElement).dataset?.framedControl ?? "";
        if (!(entry.redrawing && entry.focus?.name === name)) entry.focus = { name, at: event.timeStamp };
        run();
      });
      surface.addEventListener("focusout", () => { if (!entry.redrawing) entry.focus = null; });
      areas.add(entry);
      return entry.area;
    },
  };
}
export type PageFramedAreas = ReturnType<typeof pageFramedAreas>;
