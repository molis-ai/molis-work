import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";
import { childPlaces, overFrame } from "./over-frame.js";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

type EmbedMessage = Extract<FrameUp, { type: "embed-open" | "embed-layout" | "embed-close" }>;

/** Content is composed by the shell as a sibling of the opaque page. No content document or channel enters that page. */
export function pageEmbeds(port: MessagePort, scope: FrameScope, root: HTMLElement, owner: HTMLIFrameElement, pageId: string, route: (path: string) => string) {
  const entries = new Map<number, { frame: HTMLIFrameElement; box: HTMLDivElement }>();
  const close = (id: number) => { entries.get(id)?.box.remove(); entries.delete(id); };
  scope.own(() => { for (const id of entries.keys()) close(id); });
  scope.whenVisible(() => {
    for (const entry of entries.values()) entry.box.hidden = false;
    return () => { for (const entry of entries.values()) entry.box.hidden = true; };
  });
  const targetUrl = (surface: string, id: string, title: string, key: number) => {
    if (!/^[a-z][a-z0-9-]{0,100}$/u.test(surface) || surface === root.dataset.workSurface || !id || id.length > 1000 || title.length > 1000
      || !document.querySelector('[data-work-surface="' + CSS.escape(surface) + '"]')) throw new Error("Content view unavailable");
    const url = new URL(route("/"), location.origin);
    url.searchParams.set("workbenchPane", "embedded-" + key);
    url.searchParams.set("panePlugin", surface); url.searchParams.set("paneItem", id); url.searchParams.set("paneTitle", title);
    return url.href;
  };
  scope.listen(window, "message", event => {
    const message = event as MessageEvent;
    if (message.origin !== location.origin || message.data?.type !== "workbench-pane-open") return;
    const entry = [...entries].find(([, entry]) => entry.frame.contentWindow === message.source);
    if (!entry) return;
    try { entry[1].frame.src = targetUrl(message.data.plugin, message.data.itemId, message.data.title ?? "", entry[0]); }
    catch { /* A nested view cannot choose an address outside this project's visible content. */ }
  });
  return async (message: EmbedMessage) => {
    if (!Number.isSafeInteger(message.id) || message.id < 1) return;
    if (message.type === "embed-close") { close(message.id); return; }
    if (message.type === "embed-layout") {
      const entry = entries.get(message.id); if (!entry) return;
      const box = message.box;
      if (!scope.visible || !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) { entry.box.hidden = true; return; }
      entry.box.hidden = !overFrame(root, owner.getBoundingClientRect(), entry.box, entry.frame, box);
      return;
    }
    if (entries.has(message.id) || entries.size >= 4) return;
    const frame = document.createElement("iframe"), box = document.createElement("div");
    entries.set(message.id, { frame, box });
    try {
      const { surface, itemId, title = "" } = message.target;
      if (typeof surface !== "string" || typeof itemId !== "string" || typeof title !== "string") throw new Error("Content view unavailable");
      const url = targetUrl(surface, itemId, title, message.id);
      await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, scope, headers: { "x-molis-plugin-page": pageId } });
      scope.assertCurrent(); if (entries.get(message.id)?.frame !== frame) return;
      box.style.cssText = "position:absolute;overflow:hidden;z-index:1"; box.hidden = true;
      frame.style.cssText = "position:absolute;border:0;background:var(--surface)";
      frame.title = title || surface; frame.dataset.pluginEmbedded = surface;
      frame.addEventListener("load", () => { if (scope.alive) port.postMessage({ type: "embedded", id: message.id } satisfies FrameDown); }, { once: true });
      box.append(frame); root.append(box); frame.src = url;
    } catch (error) {
      close(message.id);
      if (scope.alive) port.postMessage({ type: "embedded", id: message.id, error: error instanceof Error ? error.message : "Content view unavailable" } satisfies FrameDown);
    }
  };
}

/** Slots report geometry only. The content remains inaccessible to the plugin and moves with the visible slot. */
export function childEmbeds(port: MessagePort, scope: FrameScope): UiPageView<HTMLElement>["embed"] {
  let sequence = 0;
  const entries = new Map<number, { element: HTMLElement; resolve(): void; reject(error: Error): void }>();
  const send = (message: FrameUp) => port.postMessage(message);
  const close = (id: number) => {
    const entry = entries.get(id); if (!entry) return;
    entry.reject(new Error("View closed")); entries.delete(id); places.untrack(id); send({ type: "embed-close", id });
  };
  const places = childPlaces(scope, (id, box) => send({ type: "embed-layout", id, box }), id => close(id));
  scope.own(() => { for (const id of entries.keys()) close(id); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "embedded") return;
    const entry = entries.get(event.data.id); if (!entry) return;
    places.resend(event.data.id);
    if (event.data.error) { entry.reject(new Error(event.data.error)); close(event.data.id); } else entry.resolve();
  });
  return (element, target) => {
    scope.assertCurrent();
    const id = ++sequence;
    const ready = new Promise<void>((resolve, reject) => entries.set(id, { element, resolve, reject }));
    send({ type: "embed-open", id, target });
    places.track(id, element);
    return { ready, dispose: () => close(id) };
  };
}
