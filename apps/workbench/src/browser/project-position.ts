import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "../surface-home-display.js";
import { homeButton, homeWord, renderHomePeek, renderPositionGroup, type HomeControl } from "./project-home-render.js";
import { reconcileSurfaceRows } from "./project-home.js";
import { mountDiscussionObjects } from "./project-position-discussion.js";

export type PositionView = {
  paint(data: SurfaceHomeDisplay, index?: number): void; clear(): void; destroy(): void; expanded(): boolean;
};
type PositionOptions = { source(): Record<string, unknown>; group?: number; batched?: boolean; onNavigate?(): void };
export type PositionMount = (root: HTMLElement, read: Read, options: PositionOptions) => PositionView;
type Read = <Result>(body: Record<string, unknown>, signal: AbortSignal) => Promise<Result>;
type Offers = (options: {
  root: HTMLElement; current: () => { subject: SurfaceHomeRowDisplay["subject"] } | null;
  api: (path: string, method: string, body: unknown) => Promise<unknown>; projectKey: string;
  translate: PositionHost["translate"]; refresh: () => Promise<void>; confirm: true;
}) => { refresh(): void; clear(): void };
export interface PositionHost {
  navigationFrom(source: HTMLElement): (result: unknown) => boolean;
  offerApi(path: string, method: string, body: unknown, signal: AbortSignal): Promise<unknown>;
  offers: Offers;
  translate(text: string, values?: Record<string, string | number>): string;
  projectKey: string;
  changed(): void;
}
type ClickResult = { kind: "peek"; row: SurfaceHomeRowDisplay } | { kind: "stage" };

export function createPositionViews(host: PositionHost) {
  const visible = (root: HTMLElement) => root.isConnected && !root.ownerDocument.hidden && !root.closest("[hidden]")
    && (!root.ownerDocument.defaultView?.frameElement || !root.ownerDocument.defaultView.frameElement.closest("[hidden]"));
  const mounts = new Set<ReturnType<typeof mount>>();
  let discussionObjects: ReturnType<typeof mountDiscussionObjects> | undefined;
  function mount(root: HTMLElement, read: Read, options: PositionOptions) {
    const { source, group = 0 } = options, doc = root.ownerDocument;
    const markup = new WeakMap<Element, string>(), controls = new Map<string, HomeControl>();
    let reading: AbortController | undefined, clicking: AbortController | undefined, data: SurfaceHomeDisplay | undefined;
    let expanded = false, dirty = true, destroyed = false;
    let details: HTMLDialogElement | undefined, selected: SurfaceHomeRowDisplay | null = null, returnTo: HTMLElement | null = null;
    let offers: ReturnType<Offers> | undefined, inspect: AbortController | undefined;
    const paint = (value: SurfaceHomeDisplay, index = group) => {
      data = value; controls.clear();
      const { html, overflow } = renderPositionGroup(value, index, controls);
      reconcileSurfaceRows(root, html + (overflow ? homeButton("expand", host.translate("另有 {count} 件", { count: overflow })) : ""), markup);
    };
    const close = () => { offers?.clear(); selected = null; inspect?.abort(); if (details?.open) details.close(); };
    const clear = () => {
      reading?.abort(); clicking?.abort(); reading = clicking = undefined;
      close(); controls.clear(); data = undefined; root.replaceChildren(); dirty = true;
    };
    const update = async (force = true) => {
      if (destroyed || !visible(root) || (!force && (!dirty || reading))) return;
      reading?.abort();
      const task = reading = new AbortController();
      try {
        const value = await read<SurfaceHomeDisplay>({ ...source(), ...(expanded ? { expanded: true } : {}) }, task.signal);
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
    const showPeek = (row: SurfaceHomeRowDisplay, focus: HTMLElement) => {
      if (!data) return;
      if (!details) {
        const dialog = details = doc.createElement("dialog");
        dialog.className = "mw-dialog home-peek"; dialog.setAttribute("aria-label", homeWord("open"));
        dialog.innerHTML = '<div class="mw-dialog__shell">' + homeButton("close", host.translate("关闭")) + '<div data-position-peek></div><div data-home-offers></div></div>';
        doc.body.append(dialog);
        dialog.addEventListener("close", () => { close(); if (returnTo?.isConnected) returnTo.focus({ preventScroll: true }); returnTo = null; });
        dialog.addEventListener("click", event => {
          if ((event.target as Element)?.closest('[data-home-control="close"]')) { close(); return; }
          const button = (event.target as Element)?.closest<HTMLElement>("[data-presentation-action]");
          if (button) void activate(button.dataset.presentationAction ?? "", button);
        });
        offers = host.offers({ root: dialog, current: () => selected, projectKey: host.projectKey, translate: host.translate, confirm: true,
          api: (path, method, body) => inspect ? host.offerApi(path, method, body, inspect.signal) : Promise.reject(new DOMException("View closed", "AbortError")),
          async refresh() { await update(); host.changed(); } });
      }
      selected = row; inspect?.abort(); inspect = new AbortController(); returnTo = focus;
      details.querySelector("[data-position-peek]")!.innerHTML = renderHomePeek(data, row, controls);
      if (!details.open) details.showModal();
      details.querySelector<HTMLElement>("button")?.focus();
      offers?.refresh();
    };
    async function activate(key: string, focus: HTMLElement) {
      if (clicking || !visible(root)) return;
      if (key === "expand") { expanded = true; await update(); return; }
      const click = controls.get(key);
      if (!click) return;
      const task = clicking = new AbortController(), navigate = host.navigationFrom(root);
      focus.setAttribute("aria-busy", "true");
      try {
        const result = await read<ClickResult>({ ...source(), click, ...(expanded ? { expanded: true } : {}) }, task.signal);
        if (task.signal.aborted || clicking !== task || !visible(root)) return;
        if (result.kind === "peek") showPeek(result.row, focus);
        else if (navigate(result)) { close(); options.onNavigate?.(); }
      } catch {
        if (!task.signal.aborted && clicking === task) await update();
      } finally { focus.removeAttribute("aria-busy"); if (clicking === task) clicking = undefined; }
    }
    const onClick = (event: Event) => {
      const hit = (event.target as Element)?.closest<HTMLElement>("[data-home-control],[data-presentation-action],.mw-presentation__row-title[aria-haspopup]");
      if (!hit || !root.contains(hit)) return;
      const key = hit.dataset.homeControl ?? hit.dataset.presentationAction ?? hit.closest<HTMLElement>("[data-home-row-peek]")?.dataset.homeRowPeek;
      if (key) { hit.closest("details")?.removeAttribute("open"); void activate(key, hit); }
    };
    const keydown = (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && (event.target as Element)?.matches(".mw-presentation__row-title[aria-haspopup]")) {
        event.preventDefault(); onClick(event);
      }
    };
    root.addEventListener("click", onClick); root.addEventListener("keydown", keydown);
    const entry = { paint, update, clear, expanded: () => expanded, invalidate() { dirty = true; if (visible(root)) void update(); else clear(); },
      destroy() { destroyed = true; clear(); details?.remove(); root.removeEventListener("click", onClick); root.removeEventListener("keydown", keydown); mounts.delete(entry); } };
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
