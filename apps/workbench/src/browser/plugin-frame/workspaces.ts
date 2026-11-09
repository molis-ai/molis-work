import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
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
  const call = (operation: "add" | "set_output", value: string) => new Promise<{ workspace_id: string } | undefined>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject });
    port.postMessage({ type: "workspace", id, operation, value } satisfies FrameUp);
  });
  return {
    add: async path => { const workspace = await call("add", path); if (!workspace) throw new Error("Workspace unavailable"); return workspace; },
    setOutput: async workspaceId => { await call("set_output", workspaceId); },
  };
}

interface DirectoryRow { workspace_id: string; display_name: string; roles: string[] }

/**
 * What the person is asked before a folder becomes the output, with what happens to the output now (specs/shared-sources-and-surfaces §3):
 * it is no longer written and its files stay; one that is only the output also leaves the project, one that is an input as well stays one.
 */
function outputQuestion(_L: Translate, asked: { plugin: string; project: string; folder: DirectoryRow }, current: DirectoryRow | undefined): string {
  const names = { plugin: asked.plugin, project: asked.project, folder: asked.folder.display_name };
  if (!current) return uiText.text("common.workspaces.allow-plugin-make-folder-output-folder-project-project", names);
  return current.roles.includes("input")
    ? uiText.text("common.workspaces.allow-plugin-make-folder-output-folder-project-project-2", { ...names, current: current.display_name })
    : uiText.text("common.workspaces.allow-plugin-make-folder-output-folder-project-project-3", { ...names, current: current.display_name });
}

/**
 * A page can request a new input folder, or that a folder of the project become its output, but only the trusted outer dialog can
 * authorize either. The dialog names a folder as the Host reads it, never as the page says.
 */
export function pageWorkspaces(port: MessagePort, scope: FrameScope, pageId: string, route: (path: string) => string,
  readText: Translate, plugin: string, project: string) {
  const dialogs = pageDialogs(scope, readText, true);
  let adding = false;
  return async (message: Extract<FrameUp, { type: "workspace" }>): Promise<void> => {
    let ownsAdd = false;
    const visible = new AbortController();
    let stop = () => {};
    try {
      if (!["add", "set_output"].includes(message.operation) || typeof message.value !== "string" || !message.value.trim() || message.value.length > 4096)
        throw new Error(uiText.text("common.workspaces.workspace-operation-failed"));
      scope.assertCurrent();
      if (adding || !scope.visible || !navigator.userActivation.isActive) throw new Error(uiText.text("common.workspaces.click-drag-file-again"));
      adding = ownsAdd = true;
      stop = scope.whenVisible(() => () => visible.abort());
      await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, headers: { "x-molis-plugin-page": pageId }, scope });
      if (message.operation === "set_output") {
        const read = await molisWorkRequest<{ directories: DirectoryRow[] }>(route("/api/project-settings/directories"), { method: "GET", scope, fallback: uiText.text("common.workspaces.couldn-t-read-project-s-folders") });
        const folder = read.directories.find(item => item.workspace_id === message.value);
        if (!folder) throw new Error(uiText.text("common.workspaces.folder-no-longer-one-project-s-folders"));
        if (folder.roles.includes("output")) { port.postMessage({ type: "workspace-result", id: message.id, workspace: { workspace_id: folder.workspace_id } } satisfies FrameDown); return; }
        if (!await dialogs.confirm(outputQuestion(readText, { plugin, project, folder }, read.directories.find(item => item.roles.includes("output"))))) throw new Error(uiText.text("common.workspaces.cancelled"));
      } else if (!await dialogs.confirm(uiText.text("common.workspaces.allow-plugin-link-folder-project-project-path", { plugin, project, path: message.value }))) throw new Error(uiText.text("common.workspaces.cancelled"));
      scope.assertCurrent(); if (!scope.visible) throw new Error(uiText.text("common.workspaces.cancelled"));
      const result = await molisWorkRequest<{ workspace?: { workspace_id: string } }>(route("/api/host/plugin-page-workspaces"), {
        body: { operation: message.operation, value: message.value }, headers: { "x-molis-context-page": pageId }, scope, signal: visible.signal,
        fallback: uiText.text("common.workspaces.unable-link-workspace"),
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
