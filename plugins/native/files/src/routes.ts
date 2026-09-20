import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseWorkspaceRef, parseFilePath, parseFileSnapshot, parseFileTextSelection, fileSnapshotFitsInline,
  readWorkspaceFileCapability, type WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { parseReadingPosition, serializeReadingPosition, READING_POSITION_KEY } from "./position.js";

export function filesRoutes(context: PluginStartContext): PluginRouteBinding[] {
  const services = context.services;
  let openSequence = 0;
  const workspace = () => {
    const input = services?.inputs?.read("workspace");
    if (!input || input.availability !== "available") throw new Error("请先选择一个可用工作目录");
    return parseWorkspaceRef(input.payload);
  };
  const route = (route_id: string, handle: (request: PluginRouteRequest) => Promise<unknown>): PluginRouteBinding => ({
    route_id, async handle(request) {
      try { return { status: 200, body: await handle(request) }; }
      catch (error) { return { status: 400, body: { error: error instanceof Error ? error.message : "文件操作失败" } }; }
    },
  });
  async function read(id: unknown, path: readonly string[], kind: "directory" | "text") {
    const current = workspace();
    if (id !== current.workspace_id || !services?.capabilities) throw new Error("工作目录已经变化，请重新选择文件");
    const result = await services.capabilities.invoke(readWorkspaceFileCapability, { workspace_id: current.workspace_id, path, kind });
    if (workspace().workspace_id !== current.workspace_id) throw new Error("工作目录已经变化，请重试");
    return { workspace: current, result };
  }
  function body(request: PluginRouteRequest) {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new Error("文件操作参数无效");
    return request.body as Record<string, unknown>;
  }
  function readable(result: WorkspaceFileResult): asserts result is Extract<WorkspaceFileResult, { outcome: "text" }> {
    if (result.outcome !== "text") throw new Error(result.outcome === "changed" ? "文件在读取时变化，请刷新" : "文件当前不可读取，无法固定快照");
  }
  return [
    route("files.state", async () => ({ workspace: workspace(), position: parseReadingPosition(services?.storage?.get(READING_POSITION_KEY)) ?? null })),
    route("files.directory", async request => {
      const path = parseFilePath(JSON.parse(request.query.path ?? "[]"), true);
      return read(request.query.workspace_id, path, "directory");
    }),
    route("files.open", async request => {
      const sequence = ++openSequence;
      const input = body(request), path = parseFilePath(input.path);
      const value = await read(input.workspace_id, path, "text");
      if (value.result.outcome === "text") {
        const root = await read(input.workspace_id, [], "directory");
        if (sequence !== openSequence) return { ...value, path };
        services?.storage?.set(READING_POSITION_KEY, serializeReadingPosition({ workspace_id: value.workspace.workspace_id, path }));
        if (root.result.outcome === "directory") services?.outputs?.publish({ port: "files", content: { kind: "inline", payload: {
          workspace: { workspace_id: value.workspace.workspace_id, name: value.workspace.name },
          collection: { handle: value.workspace.handle, display_name: value.workspace.name, entry_count: root.result.entries.length, truncated: root.result.truncated },
          selection: { path },
        } } });
      }
      return { ...value, path };
    }),
    route("files.capture", async request => {
      const input = body(request), path = parseFilePath(input.path);
      if (!["before", "after", "selection"].includes(String(input.port))) throw new Error("快照位置无效");
      const { workspace: current, result } = await read(input.workspace_id, path, "text");
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
      const saved = services.outputs.publish({ port: String(input.port), content: { kind: "inline", payload: JSON.parse(JSON.stringify(content)) } });
      return { saved, port: input.port, snapshot: content };
    }),
  ];
}
