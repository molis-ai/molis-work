import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FramePack, FrameScope, FrameUp } from "./types.js";

export function childView(port: MessagePort, scope: FrameScope): UiPageView {
  let sequence = 0;
  const pending = new Map<number, { resolve(html: string): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "document") return;
    const entry = pending.get(event.data.id); if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error)); else entry.resolve(event.data.html ?? "");
  });
  return { refreshShell() { if (scope.alive) port.postMessage({ type: "refresh-shell" } satisfies FrameUp); }, readDocument: () => new Promise<string>((resolve, reject) => {
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
