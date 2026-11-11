import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { createActionDefinition, bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import { object, id, integer, path, rootPath, workspace, fileResult, nullable, snapshot, publication } from "@molis-ai/molis-work-contracts/modules/workspace-action-schemas";
import { projectDirectoryActions, type ProjectDirectories, type ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseFilePath, parseFileSnapshot, parseFileTextSelection, fileSnapshotFitsInline, resolveWorkspaceId,
  workspaceReadActions, type WorkspaceFileResult, type FileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseReadingPosition, serializeReadingPosition, READING_POSITION_KEY, type ReadingPosition } from "./position.js";
import { filesErrors } from "./errors.js";

const define = <Input, Output>(capability_id: string, version: number, title: string, description: string, input_schema: Record<string, unknown>, output_schema: Record<string, unknown>): ActionDefinition<Input, Output> => createActionDefinition<Input, Output>(capability_id, "command", { title, description,
    audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions: ["artifact:read", "artifact:write", "storage:private"], subject_kinds: ["workspace", "file"], input_schema, output_schema }, version);
/**
 * An action that cannot work without reading the linked folder says so: it needs the one workspace read action, and the
 * callers of the action hold `workspace:read` for it (a declaration never grants what the dependency needs).
 */
const readingFolder = <Input, Output>(definition: ActionDefinition<Input, Output>): ActionDefinition<Input, Output> => ({ ...definition, action: { ...definition.action,
  permissions: [...definition.action.permissions, "workspace:read"],
  required_actions: [{ capability_id: workspaceReadActions.file.capability_id, version: workspaceReadActions.file.version }] } });
interface FileWorkspace { workspace_id: string; name: string; handle: string }
interface FileRead { workspace: FileWorkspace; result: WorkspaceFileResult }
export interface FileInput { workspace_id: string; path: readonly string[] }
/** The folder the page browses now (page state), or none for the project's output. */
export interface FileStateInput { workspace_id?: string }
export interface FileCaptureInput extends FileInput { port: "before" | "after" | "selection"; fingerprint: string; start?: number; end?: number }
export const filesActions = {
  state: define<FileStateInput, { workspace: FileWorkspace; resolved: string | null; position: ReadingPosition | null }>("files.state", /* @version action.files.state */ 1, "同步文件浏览状态", "读取要浏览的项目文件夹（没指定时是输出目录）和阅读位置；所浏览的文件夹换了或不在项目里了，使旧快照输出失效", object({ workspace_id: id }, []), object({ workspace, resolved: nullable(id), position: nullable(object({ workspace_id: id, path })) })),
  directory: readingFolder(define<FileInput, FileRead>("files.directory", /* @version action.files.directory */ 1, "浏览目录", "列出当前授权目录下的内容；工作区切换时同步失效原输出", object({ workspace_id: id, path: rootPath }), object({ workspace, result: fileResult }))),
  open: readingFolder(define<FileInput, FileRead & { path: readonly string[] }>("files.open", /* @version action.files.open */ 1, "打开文件", "有界读取当前工作区的文本，保存阅读位置并更新文件集合输出", object({ workspace_id: id, path }), object({ workspace, result: fileResult, path }))),
  capture: readingFolder(define<FileCaptureInput, { saved: ArtifactVersionResult; port: "before" | "after" | "selection"; snapshot: FileSnapshot }>("files.capture", /* @version action.files.capture */ 1, "固定文件快照", "重新读取并核对已查看的指纹，保存固定全文或选区；不改写原文件", object({ workspace_id: id, path, port: { enum: ["before", "after", "selection"] }, fingerprint: id, start: integer, end: integer }, ["workspace_id", "path", "port", "fingerprint"]), object({ saved: publication, port: { enum: ["before", "after", "selection"] }, snapshot }))),
};
export const FILES_ACTIONS = Object.values(filesActions);

/** The folder of this project an id names on this device: one of its folders, or the one the person named for another device's (SSC-26). */
const folderOf = (all: ProjectDirectories, id: string): ProjectDirectory | null => {
  const resolved = resolveWorkspaceId(id, all);
  return resolved ? all.directories.find(item => item.workspace_id === resolved) ?? null : null;
};

/**
 * Which folder Files reads. The page keeps the folder it browses (page state) and names it; with none named it is the project's
 * output (specs/shared-sources-and-surfaces SSC-17). The snapshots Files handed on came from one folder: reading another, or that
 * folder leaving the project, withdraws them.
 */
export function filesBrowsing(context: PluginStartContext) {
  const services = context.services;
  let previousWorkspace = services?.storage?.get("last-workspace") ?? null;
  return {
    /** The last folder snapshots came from, or null. */
    get last() { return previousWorkspace; },
    /**
     * The folder `id` names (or the output, when `id` is absent or names none of the project's), and the folder `id` itself named,
     * or null; with `beforeWrite`, a change from the last folder is recorded and its snapshots withdrawn.
     */
    async confirm(beforeWrite?: () => Promise<void>, id?: string | null) {
      const all = await services?.actions?.invoke(projectDirectoryActions.get, {});
      const named = all && id ? folderOf(all, id) : null;
      const selected = named ?? all?.directories.find(item => item.roles.includes("output")) ?? null;
      const now = selected?.workspace_id ?? null;
      if (beforeWrite && now !== previousWorkspace) {
        await beforeWrite();
        if (now) services?.storage?.set("last-workspace", now);
        else services?.storage?.delete("last-workspace");
        for (const port of ["files", "before", "after", "selection"]) services?.outputs?.invalidate(port, "浏览的文件夹换了，请在这个文件夹里重新固定快照");
        previousWorkspace = now;
      }
      return { selected, named, all };
    },
  };
}

export function filesActionHandlers(context: PluginStartContext, folder = filesBrowsing(context)): ActionHandlerBinding[] {
  const services = context.services;
  const browsing = [projectDirectoryActions.get];
  let openSequence = 0;
  const shown = (selected: ProjectDirectory) => ({ workspace_id: selected.workspace_id, name: selected.display_name, handle: selected.workspace_id });
  const workspace = async (beforeWrite?: () => Promise<void>, id?: string | null) => {
    const { selected } = await folder.confirm(beforeWrite, id);
    if (!selected) throw filesErrors.invalid("这个项目还没有输出目录，请在项目设置的「输入与输出」里指定");
    return shown(selected);
  };
  async function read(id: unknown, path: readonly string[], kind: "directory" | "text" | "bytes", beforeWrite?: () => Promise<void>) {
    const current = typeof id === "string" && id ? await workspace(beforeWrite, id) : null;
    if (!current || id !== current.workspace_id || !services?.actions) throw filesErrors.invalid("这个文件夹已不在项目里，请刷新后重新选择文件");
    const result = await services.actions.invoke(workspaceReadActions.file, { workspace_id: current.workspace_id, path, kind });
    if ((await workspace(beforeWrite, current.workspace_id)).workspace_id !== current.workspace_id) throw filesErrors.invalid("这个文件夹已不在项目里，请重试");
    return { workspace: current, result };
  }
  function readable(result: WorkspaceFileResult): asserts result is Extract<WorkspaceFileResult, { outcome: "text" }> {
    if (result.outcome !== "text") throw filesErrors.invalid(result.outcome === "changed" ? "文件在读取时变化，请刷新" : "文件当前不可读取，无法固定快照");
  }
  return [
    bindOwnerPluginAction(context, filesActions.state, async (input, beforeWrite) => {
      const asked = typeof input?.workspace_id === "string" && input.workspace_id ? input.workspace_id : null;
      const { selected, named } = await folder.confirm(beforeWrite, asked);
      if (!selected) throw filesErrors.invalid("这个项目还没有输出目录，请在项目设置的「输入与输出」里指定");
      return { workspace: shown(selected), resolved: named?.workspace_id ?? null, position: parseReadingPosition(services?.storage?.get(READING_POSITION_KEY)) ?? null };
    }, browsing),
    bindOwnerPluginAction(context, filesActions.directory, async (input, beforeWrite) => {
      const path = parseFilePath(input.path, true);
      return read(input.workspace_id, path, "directory", beforeWrite);
    }, browsing),
    bindOwnerPluginAction(context, filesActions.open, async (input, beforeWrite) => {
      const sequence = ++openSequence;
      const path = parseFilePath(input.path);
      const value = await read(input.workspace_id, path, "text", beforeWrite);
      if (value.result.outcome === "text") {
        const root = await read(input.workspace_id, [], "directory", beforeWrite);
        await beforeWrite();
        if (sequence !== openSequence) return { ...value, path };
        services?.storage?.set(READING_POSITION_KEY, serializeReadingPosition({ workspace_id: value.workspace.workspace_id, path }));
        if (root.result.outcome === "directory") services?.outputs?.publish({ port: "files", content: { kind: "inline", payload: {
          workspace: { workspace_id: value.workspace.workspace_id, name: value.workspace.name },
          collection: { handle: value.workspace.handle, display_name: value.workspace.name, entry_count: root.result.entries.length, truncated: root.result.truncated },
          selection: { path },
        } } });
      }
      return { ...value, path };
    }, browsing),
    bindOwnerPluginAction(context, filesActions.capture, async (input, beforeWrite) => {
      const path = parseFilePath(input.path);
      if (!["before", "after", "selection"].includes(String(input.port))) throw filesErrors.invalid("快照位置无效");
      const { workspace: current, result } = await read(input.workspace_id, path, "text", beforeWrite);
      readable(result);
      if (input.fingerprint !== result.fingerprint) throw filesErrors.invalid("文件已改变，请刷新并查看后再固定快照");
      const base = { workspace: { workspace_id: current.workspace_id, name: current.name }, path, text: result.text };
      let content = parseFileSnapshot(base);
      if (input.port === "selection") {
        if (typeof input.start !== "number" || typeof input.end !== "number" || input.end > result.text.length) throw filesErrors.invalid("选区已经失效，请重新选择");
        content = parseFileTextSelection({ ...base, start: input.start, end: input.end, text: result.text.slice(input.start, input.end) });
      }
      if (!fileSnapshotFitsInline(content)) throw filesErrors.invalid("内容超过快照上限，请选择较小的文本片段");
      if (!services?.outputs) throw new Error("文件快照输出尚未装配");
      await beforeWrite();
      const saved = services.outputs.publish({ port: String(input.port), content: { kind: "inline", payload: JSON.parse(JSON.stringify(content)) } });
      return { saved, port: input.port, snapshot: content };
    }, browsing),
  ];
}
