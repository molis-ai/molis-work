import { bindOwnerPluginAction, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { object, id, integer, path, rootPath, workspace, fileResult, nullable, snapshot, publication } from "@molis-ai/molis-work-contracts/modules/workspace-action-schemas";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseFilePath, parseFileSnapshot, parseFileTextSelection, fileSnapshotFitsInline,
  readWorkspaceFileCapability, type WorkspaceFileResult, type FileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseReadingPosition, serializeReadingPosition, READING_POSITION_KEY, type ReadingPosition } from "./position.js";


const define = <Input, Output>(capability_id: string, title: string, description: string, input_schema: Record<string, unknown>, output_schema: Record<string, unknown>): ActionDefinition<Input, Output> => ({
  capability_id, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project",
    audiences: ["user", "agent", "workflow", "mcp"], permissions: ["artifact:read", "artifact:write", "storage:private"], subject_kinds: ["workspace", "file"], input_schema, output_schema },
});
interface FileWorkspace { workspace_id: string; name: string; handle: string }
interface FileRead { workspace: FileWorkspace; result: WorkspaceFileResult }
export interface FileInput { workspace_id: string; path: readonly string[] }
export interface FileCaptureInput extends FileInput { port: "before" | "after" | "selection"; fingerprint: string; start?: number; end?: number }
export const filesActions = {
  state: define<Record<string, never>, { workspace: FileWorkspace; position: ReadingPosition | null }>("files.state", "同步文件浏览状态", "读取当前浏览目录和阅读位置；切换目录时使旧快照输出失效", object({}), object({ workspace, position: nullable(object({ workspace_id: id, path })) })),
  directory: define<FileInput, FileRead>("files.directory", "浏览目录", "列出当前授权目录下的内容；工作区切换时同步失效原输出", object({ workspace_id: id, path: rootPath }), object({ workspace, result: fileResult })),
  open: define<FileInput, FileRead & { path: readonly string[] }>("files.open", "打开文件", "有界读取当前工作区的文本，保存阅读位置并更新文件集合输出", object({ workspace_id: id, path }), object({ workspace, result: fileResult, path })),
  capture: define<FileCaptureInput, { saved: ArtifactVersionResult; port: "before" | "after" | "selection"; snapshot: FileSnapshot }>("files.capture", "固定文件快照", "重新读取并核对已查看的指纹，保存固定全文或选区；不改写原文件", object({ workspace_id: id, path, port: { enum: ["before", "after", "selection"] }, fingerprint: id, start: integer, end: integer }, ["workspace_id", "path", "port", "fingerprint"]), object({ saved: publication, port: { enum: ["before", "after", "selection"] }, snapshot })),
};
export const FILES_ACTIONS = Object.values(filesActions);

export function filesActionHandlers(context: PluginStartContext): ActionHandlerBinding[] {
  const services = context.services;
  const browsing = [projectSettingsCapabilities.browsingWorkspace];
  const reading = [...browsing, readWorkspaceFileCapability];
  let openSequence = 0;
  let previousWorkspace = services?.storage?.get("last-workspace") ?? null;
  const workspace = async (beforeWrite: () => Promise<void>) => {
    const selected = await services?.capabilities?.invoke(projectSettingsCapabilities.browsingWorkspace, []);
    const id = selected?.workspace_id ?? null;
    if (id !== previousWorkspace) {
      await beforeWrite();
      previousWorkspace = id;
      if (id) services?.storage?.set("last-workspace", id);
      else services?.storage?.delete("last-workspace");
      for (const port of ["files", "before", "after", "selection"]) services?.outputs?.invalidate(port, "工作目录已切换，请在当前目录重新固定快照");
    }
    if (!selected) throw new Error("请在项目设置的工作目录中选择可用浏览目录");
    return { workspace_id: selected.workspace_id, name: selected.display_name, handle: selected.workspace_id };
  };
  async function read(id: unknown, path: readonly string[], kind: "directory" | "text", beforeWrite: () => Promise<void>) {
    const current = await workspace(beforeWrite);
    if (id !== current.workspace_id || !services?.capabilities) throw new Error("工作目录已经变化，请重新选择文件");
    const result = await services.capabilities.invoke(readWorkspaceFileCapability, { workspace_id: current.workspace_id, path, kind });
    if ((await workspace(beforeWrite)).workspace_id !== current.workspace_id) throw new Error("工作目录已经变化，请重试");
    return { workspace: current, result };
  }
  function readable(result: WorkspaceFileResult): asserts result is Extract<WorkspaceFileResult, { outcome: "text" }> {
    if (result.outcome !== "text") throw new Error(result.outcome === "changed" ? "文件在读取时变化，请刷新" : "文件当前不可读取，无法固定快照");
  }
  return [
    bindOwnerPluginAction(context, filesActions.state, async (_input, beforeWrite) => ({ workspace: await workspace(beforeWrite), position: parseReadingPosition(services?.storage?.get(READING_POSITION_KEY)) ?? null }), browsing),
    bindOwnerPluginAction(context, filesActions.directory, async (input, beforeWrite) => {
      const path = parseFilePath(input.path, true);
      return read(input.workspace_id, path, "directory", beforeWrite);
    }, reading),
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
    }, reading),
    bindOwnerPluginAction(context, filesActions.capture, async (input, beforeWrite) => {
      const path = parseFilePath(input.path);
      if (!["before", "after", "selection"].includes(String(input.port))) throw new Error("快照位置无效");
      const { workspace: current, result } = await read(input.workspace_id, path, "text", beforeWrite);
      readable(result);
      if (input.fingerprint !== result.fingerprint) throw new Error("文件已改变，请刷新并查看后再固定快照");
      const base = { workspace: { workspace_id: current.workspace_id, name: current.name }, path, text: result.text };
      let content = parseFileSnapshot(base);
      if (input.port === "selection") {
        if (typeof input.start !== "number" || typeof input.end !== "number" || input.end > result.text.length) throw new Error("选区已经失效，请重新选择");
        content = parseFileTextSelection({ ...base, start: input.start, end: input.end, text: result.text.slice(input.start, input.end) });
      }
      if (!fileSnapshotFitsInline(content)) throw new Error("内容超过快照上限，请选择较小的文本片段");
      if (!services?.outputs) throw new Error("文件快照输出尚未装配");
      await beforeWrite();
      const saved = services.outputs.publish({ port: String(input.port), content: { kind: "inline", payload: JSON.parse(JSON.stringify(content)) } });
      return { saved, port: input.port, snapshot: content };
    }, reading),
  ];
}
