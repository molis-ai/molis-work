import type { UiPageWorkspaces } from "@molis-ai/molis-work-contracts/platform/ui";
import { pageDialogs } from "./dialogs.js";
import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

export function childWorkspaces(port: MessagePort, scope: FrameScope): UiPageWorkspaces {
  let sequence = 0;
  const pending = new Map<number, { resolve(value?: { workspace_id: string }): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    const message = event.data; if (message.type !== "workspace-result") return;
    const entry = pending.get(message.id); pending.delete(message.id);
    if (message.error) entry?.reject(Object.assign(new Error(message.error), { status: message.status })); else entry?.resolve(message.workspace);
  });
  const call = (operation: "add" | "select", value: string) => new Promise<{ workspace_id: string } | undefined>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject });
    port.postMessage({ type: "workspace", id, operation, value } satisfies FrameUp);
  });
  return { add: async path => { const workspace = await call("add", path); if (!workspace) throw new Error("Workspace unavailable"); return workspace; },
    select: async id => { await call("select", id); } };
}

/** A page can request a new path, but only the trusted outer dialog can authorize its association with the current project. */
export function pageWorkspaces(port: MessagePort, scope: FrameScope, pageId: string, route: (path: string) => string,
  L: Translate, plugin: string, project: string) {
  const dialogs = pageDialogs(scope, L, true);
  let adding = false;
  return async (message: Extract<FrameUp, { type: "workspace" }>): Promise<void> => {
    const adds = message.operation === "add";
    let ownsAdd = false;
    const visible = new AbortController();
    let stop = () => {};
    try {
      if (!["add", "select"].includes(message.operation) || typeof message.value !== "string" || !message.value.trim() || message.value.length > 4096)
        throw new Error(L("工作目录操作失败"));
      scope.assertCurrent();
      if (adds) {
        if (adding || !scope.visible || !navigator.userActivation.isActive) throw new Error(L("请重新点击或拖动文件"));
        adding = ownsAdd = true;
        stop = scope.whenVisible(() => () => visible.abort());
        await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, headers: { "x-molis-plugin-page": pageId }, scope });
        if (!await dialogs.confirm(L("允许 {plugin} 为项目 {project} 关联目录？\n{path}", { plugin, project, path: message.value }))) throw new Error(L("已取消"));
        scope.assertCurrent(); if (!scope.visible) throw new Error(L("已取消"));
      }
      const result = await molisWorkRequest<{ workspace?: { workspace_id: string } }>(route("/api/host/plugin-page-workspaces"), {
        body: { operation: message.operation, value: message.value }, headers: { "x-molis-context-page": pageId }, scope, signal: visible.signal,
        fallback: L(adds ? "无法关联工作区" : "工作目录操作失败"),
      });
      scope.assertCurrent(); port.postMessage({ type: "workspace-result", id: message.id, workspace: result.workspace } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "workspace-result", id: message.id,
        error: error instanceof Error ? error.message : String(error),
        ...(error && typeof error === "object" && "status" in error && typeof error.status === "number" ? { status: error.status } : {}),
      } satisfies FrameDown);
    } finally { stop(); if (ownsAdd) adding = false; }
  };
}
