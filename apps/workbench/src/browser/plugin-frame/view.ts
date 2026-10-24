import { childEmbeds } from "./embed.js";
import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FramePack, FrameScope, FrameUp } from "./types.js";

/** Existing row-based clients and clients that open directly by id share the shell's selection intent. */
export function pageSelection(root: HTMLElement, scope: FrameScope, row: FramePack["searchRow"]) {
  let stop = () => {};
  scope.own(() => stop());
  return (detail: unknown) => {
    stop();
    const itemId = detail && typeof detail === "object" && "itemId" in detail ? detail.itemId : undefined;
    root.dispatchEvent(new CustomEvent("molis-work:select-item", { detail }));
    if (!row || typeof itemId !== "string" || !itemId) return;
    const observer = new MutationObserver(check), deadline = setTimeout(() => stop(), 10000);
    stop = () => { observer.disconnect(); clearTimeout(deadline); };
    function check() {
      if (!scope.alive) { stop(); return; }
      try {
        if (JSON.parse(root.getAttribute("data-assistant-context") || "{}").object?.id === itemId) { stop(); return; }
      } catch { /* Only a valid object identity marks the requested record open. */ }
      const element = [...root.querySelectorAll<HTMLElement>(row!.selector)].find(element => element.dataset[row!.idDataset] === itemId);
      if (element) { stop(); element.click(); }
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-assistant-context"] });
    queueMicrotask(check);
  };
}

/** The shell's return-to-list intent applies inside the isolated document as it does to Host surfaces. */
export function collapsePage(root: HTMLElement): void {
  if (root.dataset.expanded === "false") return;
  root.dataset.expanded = "false";
  const workspace = root.querySelector<HTMLElement>(".plugin-stage-workspace, [data-artifact-stage-workspace], [data-schedule-stage-workspace]");
  if (workspace) workspace.hidden = true;
  root.querySelectorAll(".is-selected").forEach(row => {
    row.classList.remove("is-selected");
    if (row.hasAttribute("aria-selected")) row.setAttribute("aria-selected", "false");
  });
  [root, ...root.querySelectorAll("[data-assistant-context]")].forEach(node => {
    try {
      const context = JSON.parse(node.getAttribute("data-assistant-context") ?? "null");
      if (!context?.object) return;
      delete context.object; delete context.unsaved; node.setAttribute("data-assistant-context", JSON.stringify(context));
    } catch { /* An invalid context does not describe an open record. */ }
  });
  root.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: null } }));
}

export function childView(port: MessagePort, scope: FrameScope): UiPageView<HTMLElement> {
  let sequence = 0;
  const pending = new Map<number, { resolve(html: string): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "document") return;
    const entry = pending.get(event.data.id); if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error)); else entry.resolve(event.data.html ?? "");
  });
  return { onClosing(action) { if (scope.alive) port.postMessage({ type: "on-closing", action } satisfies FrameUp); }, embed: childEmbeds(port, scope), refreshShell() { if (scope.alive) port.postMessage({ type: "refresh-shell" } satisfies FrameUp); }, readDocument: () => new Promise<string>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject }); port.postMessage({ type: "read-document", id } satisfies FrameUp);
  }) };
}

/** Address and contribution come from the trusted mount; a child supplies neither. No owner document reaches the port. */
export async function readPageDocument(port: MessagePort, id: number, root: HTMLElement, route: (path: string) => string,
  pack: FramePack, pageId: string, scope: FrameScope): Promise<void> {
  const check = () => molisWorkRequest(route("/api/plugins/" + pack.plugin_id + "/view-revision"), { scope, headers: { "x-molis-plugin-page": pageId } });
  try {
    await check();
    const source = await molisWorkRequest<string>(location.pathname + location.search, { as: "text", scope });
    const document = new DOMParser().parseFromString(source, "text/html");
    const surface = [...document.querySelectorAll<HTMLElement>("[data-work-surface]")].find(candidate => candidate.dataset.workSurface === root.dataset.workSurface);
    const data = surface?.querySelector("script[data-plugin-document]")?.textContent;
    if (!data) throw new Error("View unavailable");
    const html: unknown = JSON.parse(data);
    if (typeof html !== "string") throw new Error("View unavailable");
    await check(); scope.assertCurrent();
    port.postMessage({ type: "document", id, html } satisfies FrameDown);
  } catch (error) {
    if (scope.alive) port.postMessage({ type: "document", id, error: error instanceof Error ? error.message : "View unavailable" } satisfies FrameDown);
  }
}
