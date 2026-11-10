import type { SurfaceHomeDisplay } from "../surface-home-display.js";
import { homeButton, isPlacementControl, renderPositionGroup, type HomeControl } from "./project-home-render.js";
import { reconcileSurfaceRows } from "./project-home.js";
import { mountDiscussionObjects } from "./project-position-discussion.js";
import { createPositionPeek } from "./project-position-peek.js";
import { createPositionCorrections } from "./project-position-corrections.js";
import { positionMenuKey } from "./project-position-menu.js";

export type PositionView = {
  paint(data: SurfaceHomeDisplay, index?: number): void; clear(): void; destroy(): void; expanded(): boolean; suspend(): void;
  recovery(): ReturnType<ReturnType<typeof createPositionCorrections>["recovery"]>; update(): Promise<void>;
};
type PositionOptions = { source(): Record<string, unknown>; group?: number; batched?: boolean; defaults?: boolean; headerOnly?: boolean; onNavigate?(): void };
export type ReadPosition = <Result>(body: Record<string, unknown>, signal: AbortSignal) => Promise<Result>;
export type PositionMount = (root: HTMLElement, read: ReadPosition, options: PositionOptions) => PositionView;
export interface PositionHost {
  navigationFrom(source: HTMLElement): (result: unknown) => boolean;
  translate(text: string, values?: Record<string, string | number>): string;
  changed(): void;
  receipt(message: string): void;
}

export function createPositionViews(host: PositionHost) {
  const visible = (root: HTMLElement) => root.isConnected && !root.ownerDocument.hidden && !root.closest("[hidden]")
    && (!root.ownerDocument.defaultView?.frameElement || !root.ownerDocument.defaultView.frameElement.closest("[hidden]"));
  const mounts = new Set<ReturnType<typeof mount>>();
  let discussionObjects: ReturnType<typeof mountDiscussionObjects> | undefined;
  function mount(root: HTMLElement, read: ReadPosition, options: PositionOptions) {
    const { source, group = 0 } = options, doc = root.ownerDocument;
    const markup = new WeakMap<Element, string>(), controls = new Map<string, HomeControl>();
    let reading: AbortController | undefined, clicking: AbortController | undefined, data: SurfaceHomeDisplay | undefined;
    let expanded = false, dirty = true, destroyed = false;
    const peek = createPositionPeek(root, read, host, { source, expanded: () => expanded, visible: () => visible(root),
      displayed: () => data, lookup: key => controls.get(key), navigate: open });
    const corrections = createPositionCorrections(root, { defaults: options.defaults, headerOnly: options.headerOnly, translate: host.translate,
      send: (correct, signal) => read({ ...source(), correct, ...(expanded ? { expanded: true } : {}) }, signal), changed: host.changed, note: host.receipt });
    const suspend = () => { peek.scrub(); corrections.suspend(); };
    const paint = (value: SurfaceHomeDisplay, index = group) => {
      suspend();
      data = value; controls.clear();
      const { html, overflow } = renderPositionGroup(value, index, controls, undefined, corrections.rendering(value));
      reconcileSurfaceRows(root, html + (overflow ? homeButton("expand", host.translate("另有 {count} 件", { count: overflow })) : ""), markup);
      corrections.afterPaint();
      void peek.refresh();
    };
    const clear = () => {
      reading?.abort(); clicking?.abort(); reading = clicking = undefined;
      controls.clear(); data = undefined; corrections.clear(); root.replaceChildren(); dirty = true; peek.close();
    };
    const update = async (force = true) => {
      if (destroyed || !visible(root) || (!force && (!dirty || reading))) return;
      reading?.abort(); suspend();
      const task = reading = new AbortController();
      try {
        const recovery = corrections.recovery();
        const value = await read<SurfaceHomeDisplay>({ ...source(), ...(expanded ? { expanded: true } : {}), ...(recovery ? { recovery } : {}) }, task.signal);
        if (task.signal.aborted || reading !== task || !visible(root)) return;
        const expand = root.querySelector<HTMLElement>('[data-home-control="expand"]');
        const following = expand === doc.activeElement ? root.querySelectorAll("[data-home-row]").length : -1;
        paint(value); dirty = false;
        if (following >= 0 && doc.activeElement === doc.body) root.querySelectorAll("[data-home-row]")[following]?.querySelector<HTMLElement>("button,summary")?.focus();
      } catch {
        if (task.signal.aborted || reading !== task) return;
        clear();
      } finally { if (reading === task) reading = undefined; }
    };
    async function open(click: HomeControl, focus: HTMLElement) {
      if (clicking || !visible(root)) return;
      const task = clicking = new AbortController(), navigate = host.navigationFrom(root);
      focus.setAttribute("aria-busy", "true");
      try {
        const result = await read({ ...source(), click, ...(expanded ? { expanded: true } : {}) }, task.signal);
        if (task.signal.aborted || clicking !== task || !visible(root)) return;
        if (navigate(result)) { peek.close(false); options.onNavigate?.(); }
      } catch {
        if (!task.signal.aborted && clicking === task) await update();
      } finally { focus.removeAttribute("aria-busy"); if (clicking === task) clicking = undefined; }
    }
    const onClick = (event: Event) => {
      const hit = (event.target as Element)?.closest<HTMLElement>("[data-home-control],[data-presentation-action],.mw-presentation__row-title[aria-haspopup]");
      if (!hit || !root.contains(hit)) return;
      const key = hit.dataset.homeControl ?? hit.dataset.presentationAction ?? hit.closest<HTMLElement>("[data-home-row-peek]")?.dataset.homeRowPeek;
      if (!key) return;
      if (corrections.handle(key, hit, event)) return;
      const menu = hit.closest("details"), focus = menu?.querySelector("summary") ?? hit;
      menu?.removeAttribute("open");
      if (key === "expand") { expanded = true; void update(); return; }
      const click = controls.get(key);
      if (click && (click.target.kind === "peek" || isPlacementControl(click.target.kind))) peek.open(key, focus);
      else if (click) void open(click, focus);
    };
    const keydown = (event: KeyboardEvent) => {
      positionMenuKey(event);
      if ((event.key === "Enter" || event.key === " ") && (event.target as Element)?.matches(".mw-presentation__row-title[aria-haspopup]")) {
        event.preventDefault(); onClick(event);
      }
    };
    root.addEventListener("click", onClick); root.addEventListener("keydown", keydown);
    const entry = { paint, update, clear, recovery: corrections.recovery, expanded: () => expanded, suspend, invalidate() { dirty = true; if (visible(root)) void update(); else clear(); },
      destroy() { destroyed = true; clear(); peek.destroy(); root.removeEventListener("click", onClick); root.removeEventListener("keydown", keydown); mounts.delete(entry); } };
    if (!options.batched) mounts.add(entry);
    return entry;
  }
  function discussion(frame: HTMLIFrameElement, api: Parameters<typeof mountDiscussionObjects>[1]) {
    discussionObjects?.clear();
    discussionObjects = mountDiscussionObjects(frame, api, mount, visible, host.translate);
    return discussionObjects.bridge;
  }
  const invalidate = () => { for (const entry of mounts) entry.invalidate(); discussionObjects?.invalidate(); };
  return { mount, invalidate, discussion };
}
