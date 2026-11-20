import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiPageInstructionSettings, UiPageWorkspaces } from "@molis-ai/molis-work-contracts/platform/ui";
import { pageDialogs } from "./dialogs.js";
import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

interface WorkspaceAnswer { workspace?: { workspace_id: string }; instructions?: UiPageInstructionSettings }
export function childWorkspaces(port: MessagePort, scope: FrameScope): UiPageWorkspaces {
  let sequence = 0;
  const pending = new Map<number, { resolve(value: WorkspaceAnswer): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    const message = event.data; if (message.type !== "workspace-result") return;
    const entry = pending.get(message.id); pending.delete(message.id);
    if (message.error) entry?.reject(Object.assign(new Error(message.error), { status: message.status })); else entry?.resolve({ workspace: message.workspace, instructions: message.instructions });
  });
  const call = (operation: "add" | "set_output" | "read_instructions", value: string) => new Promise<WorkspaceAnswer>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject });
    port.postMessage({ type: "workspace", id, operation, value } satisfies FrameUp);
  });
  return {
    add: async path => { const workspace = (await call("add", path)).workspace; if (!workspace) throw new Error("Workspace unavailable"); return workspace; },
    setOutput: async workspaceId => { await call("set_output", workspaceId); },
    readInstructions: async () => {
      const instructions = (await call("read_instructions", "on")).instructions;
      if (!instructions) throw new Error("Instructions unavailable");
      return instructions;
    },
  };
}

interface DirectoryRow { workspace_id: string; display_name: string; roles: string[] }
interface DirectoriesRead { directories: DirectoryRow[]; revision: string }

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
      if (!["add", "set_output", "read_instructions"].includes(message.operation) || typeof message.value !== "string" || !message.value.trim() || message.value.length > 4096)
        throw new Error(uiText.text("common.workspaces.workspace-operation-failed"));
      scope.assertCurrent();
      if (adding || !scope.visible || !navigator.userActivation.isActive) throw new Error(uiText.text("common.workspaces.click-drag-file-again"));
      adding = ownsAdd = true;
      stop = scope.whenVisible(() => () => visible.abort());
      // What the person confirms is the folders as read for the dialog: their revision goes with the change, so one made elsewhere in
      // between (another window, the project settings) refuses it as stale instead of applying to folders the person did not see.
      let revision: string | undefined;
      await molisWorkRequest(route("/api/host/plugin-page-check"), { body: {}, headers: { "x-molis-plugin-page": pageId }, scope });
      if (message.operation === "set_output") {
        const read = await molisWorkRequest<DirectoriesRead>(route("/api/project-settings/directories"), { method: "GET", scope, fallback: uiText.text("common.workspaces.couldn-t-read-project-s-folders") });
        revision = read.revision;
        const folder = read.directories.find(item => item.workspace_id === message.value);
        if (!folder) throw new Error(uiText.text("common.workspaces.folder-no-longer-one-project-s-folders"));
        if (folder.roles.includes("output")) { port.postMessage({ type: "workspace-result", id: message.id, workspace: { workspace_id: folder.workspace_id } } satisfies FrameDown); return; }
        if (!await dialogs.confirm(outputQuestion(readText, { plugin, project, folder }, read.directories.find(item => item.roles.includes("output"))))) throw new Error(uiText.text("common.workspaces.cancelled"));
      } else if (message.operation === "read_instructions") {
        if (message.value !== "on") throw new Error(uiText.text("common.workspaces.workspace-operation-failed"));
        const read = await molisWorkRequest<DirectoriesRead>(route("/api/project-settings/directories"), { method: "GET", scope, fallback: uiText.text("common.workspaces.couldn-t-read-project-s-folders") });
        revision = read.revision;
        const output = read.directories.find(item => item.roles.includes("output"));
        if (!output || !await dialogs.confirm(uiText.text("common.workspaces.allow-plugin-read-instructions", { plugin, project, folder: output.display_name }))) throw new Error(uiText.text("common.workspaces.cancelled"));
      } else if (!await dialogs.confirm(uiText.text("common.workspaces.allow-plugin-link-folder-project-project-path", { plugin, project, path: message.value }))) throw new Error(uiText.text("common.workspaces.cancelled"));
      scope.assertCurrent(); if (!scope.visible) throw new Error(uiText.text("common.workspaces.cancelled"));
      const result = await molisWorkRequest<{ workspace?: { workspace_id: string }; instructions?: UiPageInstructionSettings }>(route("/api/host/plugin-page-workspaces"), {
        // Adding a folder asks only about its path, so it carries no revision (JSON leaves the undefined field out).
        body: { operation: message.operation, value: message.value, expected_revision: revision },
        headers: { "x-molis-context-page": pageId }, scope, signal: visible.signal, fallback: uiText.text("common.workspaces.unable-link-workspace"),
      // This route writes only `projects.directories.*`, whose one conflict is a revision changed since the read.
      }).catch((error: { code?: string; message: string }) => {
        if (error?.code === "actions.conflict") error.message = uiText.text("common.workspaces.folders-changed-elsewhere");
        throw error;
      });
      scope.assertCurrent(); port.postMessage({ type: "workspace-result", id: message.id, workspace: result.workspace, instructions: result.instructions } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "workspace-result", id: message.id,
        error: error instanceof Error ? error.message : String(error),
        ...(error && typeof error === "object" && "status" in error && typeof error.status === "number" ? { status: error.status } : {}),
      } satisfies FrameDown);
    } finally { stop(); if (ownsAdd) adding = false; }
  };
}
