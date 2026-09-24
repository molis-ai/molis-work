import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseFilePath, parseWorkspaceRef, readWorkspaceGitCapability, prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability, GIT_RESULT_TYPE, type GitOperation, type GitReviewedResult, type WorkspaceGitQuery, type WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { parsePorcelainStatus } from "./status.js";
import { projectGit } from "./projection.js";

const STATUS_WORD: Record<string, string> = { A: "新增", M: "修改", D: "删除", R: "重命名", C: "复制", T: "类型变化" };
/** A starting point the person edits: a title from what is staged and one line per file. Never sent on its own. */
export function commitDraft(summary: WorkspaceGitSummary): string {
  const files = summary.staged;
  if (!files.length) return "";
  const base = (file: string) => file.slice(file.lastIndexOf("/") + 1), folders = new Set(files.map(file => file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""));
  const title = files.length === 1 ? `${STATUS_WORD[files[0]!.status] ?? "更新"} ${base(files[0]!.path)}`
    : folders.size === 1 && [...folders][0] ? `更新 ${[...folders][0]}/ 下的 ${files.length} 个文件` : `更新 ${files.length} 个文件`;
  return files.length === 1 ? title : `${title}\n\n${files.slice(0, 30).map(file => `- ${STATUS_WORD[file.status] ?? "更新"} ${file.path}`).join("\n")}${files.length > 30 ? `\n- 另有 ${files.length - 30} 个文件` : ""}`;
}
/** Only the shapes the Host accepts leave the page; everything else is refused here first. */
function gitOperation(value: unknown): GitOperation {
  const input = value as Record<string, unknown> | null;
  const text = (key: string, max: number) => { const found = input?.[key]; if (typeof found !== "string" || found.length > max) throw new Error("Git 操作参数无效"); return found; };
  switch (input?.action) {
    case "commit": return { action: "commit", message: text("message", 5_000) };
    case "branch-create": return { action: "branch-create", name: text("name", 200), checkout: input.checkout === true };
    case "branch-switch": return { action: "branch-switch", name: text("name", 200) };
    case "push": return { action: "push", remote: text("remote", 200), set_upstream: input.set_upstream === true };
    case "pr-create": return { action: "pr-create", base: text("base", 200), title: text("title", 256), body: text("body", 20_000), draft: input.draft === true };
    default: throw new Error("不支持的 Git 操作");
  }
}

export function gitRoutes(context: PluginStartContext, onReady: (ready: boolean) => void = () => {}): PluginRouteBinding[] {
  const services = context.services!;
  let selectionSequence = 0;
  const workspace = () => {
    const record = services.inputs?.read("workspace");
    if (!record || record.availability !== "available") throw new Error("请先在文件区选择可用工作目录");
    return parseWorkspaceRef(record.payload);
  };
  const read = async (query: WorkspaceGitQuery) => {
    const current = workspace();
    if (current.workspace_id !== query.workspace_id) throw new Error("工作目录已改变，请刷新 Git");
    const result = await services.capabilities!.invoke(readWorkspaceGitCapability, query);
    if (workspace().workspace_id !== current.workspace_id) throw new Error("工作目录已改变，请刷新 Git");
    return { workspace: current, result };
  };
  const route = (route_id: string, handler: NonNullable<PluginRouteBinding["handle"]>): PluginRouteBinding => ({ route_id, async handle(request) {
    try { return await handler(request); }
    catch (error) { return { status: 400, body: { error: error instanceof Error ? error.message : "Git 读取失败" } }; }
  } });
  const savedResults = () => {
    const saved = services.storage?.get("git-results");
    return typeof saved === "string" ? JSON.parse(saved) as Record<string, { artifact_id: string; version: number }> : {};
  };
  const key = (result: GitReviewedResult) => JSON.stringify([result.workspace_id, result.operation_id]);
  const results = async () => {
    const current = workspace();
    const items = await services.capabilities!.invoke(readGitResultsCapability, { workspace_id: current.workspace_id });
    if (workspace().workspace_id !== current.workspace_id) throw new Error("工作目录已改变，请重新读取结果");
    return { workspace: current, items };
  };
  const readSaved = (result: GitReviewedResult) => {
    const reference = savedResults()[key(result)];
    if (!reference) return null;
    const artifact = services.outputs!.read(reference);
    if (!artifact || artifact.artifact_type_id !== GIT_RESULT_TYPE || artifact.schema_version !== 1) throw new Error("原固定结果已不可读取；不会重新生成或覆盖");
    const payload = artifact.payload as unknown as GitReviewedResult;
    if (payload.workspace_id !== result.workspace_id || payload.operation_id !== result.operation_id || payload.review?.review_id !== result.review.review_id) throw new Error("固定结果与原操作不匹配");
    return { reference, result: payload, saved_at: artifact.created_at };
  };
  return [
    route("git.results", async () => {
      const value = await results();
      return { status: 200, body: { workspace: value.workspace, results: value.items.map(result => {
        try { return { result, saved: readSaved(result) }; }
        catch (error) { return { result, saved: null, unavailable: error instanceof Error ? error.message : "固定结果不可读" }; }
      }) } };
    }),
    route("git.save-result", async request => {
      const input = request.body as Record<string, unknown> | undefined;
      const value = await results();
      if (!input || input.workspace_id !== value.workspace.workspace_id || typeof input.review_id !== "string") throw new Error("结果保存请求无效或工作区已切换");
      const result = value.items.find(item => item.review.review_id === input.review_id);
      if (!result) throw new Error("原操作尚未结束、结果仍未知，或不属于当前工作区，不能保存确定结果");
      const existing = readSaved(result);
      if (existing) return { status: 200, body: existing };
      const published = services.outputs!.publish({ port: "result", content: { kind: "inline", payload: JSON.parse(JSON.stringify(result)) },
        metadata: { title: (result.review.action === "stage" ? "暂存" : "取消暂存") + " · " + result.summary, operation_id: result.operation_id, review_id: result.review.review_id } });
      const reference = { artifact_id: published.artifact.artifact_id, version: published.artifact.version };
      services.outputs!.retain(reference);
      services.storage!.set("git-results", JSON.stringify({ ...savedResults(), [key(result)]: reference }));
      return { status: 200, body: { reference, result, saved_at: published.artifact.created_at } };
    }),
    // Source control: where the repository stands, a commit message drafted from what is staged, and the operations.
    route("git.summary", async () => {
      const current = workspace(), value = await read({ workspace_id: current.workspace_id, kind: "summary" });
      if (value.result.outcome !== "summary") return { status: 200, body: { workspace: current, summary: null, message: "message" in value.result ? value.result.message : "Git 状态不可读" } };
      return { status: 200, body: { workspace: current, summary: value.result, draft: commitDraft(value.result) } };
    }),
    route("git.pr-support", async () => {
      const current = workspace(), value = await read({ workspace_id: current.workspace_id, kind: "pr-support" });
      return { status: 200, body: value.result };
    }),
    route("git.operations", async () => {
      const current = workspace();
      const operations = await services.capabilities!.invoke(readGitOperationsCapability, { workspace_id: current.workspace_id });
      return { status: 200, body: { workspace: current, operations } };
    }),
    route("git.prepare-operation", async request => {
      const input = request.body as Record<string, unknown> | undefined, current = workspace();
      if (!input || input.workspace_id !== current.workspace_id || typeof input.revision !== "string" || typeof input.operation_id !== "string") throw new Error("Git 操作请求无效或工作区已切换");
      const result = await services.capabilities!.invoke(prepareGitOperationCapability, { workspace_id: current.workspace_id, operation_id: input.operation_id, revision: input.revision, operation: gitOperation(input.operation) });
      return { status: 200, body: result };
    }),
    route("git.prepare-index", async request => {
      const input = request.body as Record<string, unknown> | undefined, current = workspace();
      if (!input || input.workspace_id !== current.workspace_id || !["stage", "unstage"].includes(String(input.action))
        || typeof input.revision !== "string" || typeof input.operation_id !== "string") throw new Error("暂存请求无效或工作区已切换");
      const result = await services.capabilities!.invoke(prepareGitIndexCapability, { workspace_id: current.workspace_id, path: parseFilePath(input.path),
        action: input.action as "stage" | "unstage", revision: input.revision, operation_id: input.operation_id });
      return { status: 200, body: result };
    }),
    route("git.state", async () => {
      onReady(false);
      const current = workspace(), value = await read({ workspace_id: current.workspace_id, kind: "status" });
      const saved = services.storage?.get("git-selection");
      const selected = typeof saved === "string" ? JSON.parse(saved) : null;
      if (value.result.outcome !== "status") return { status: 200, body: { workspace: current,
        view: projectGit({ phase: value.result.outcome === "not-a-repository" ? "not-a-repository" : "error", status: null, message: "message" in value.result ? value.result.message : "Git 状态不可读" }), selected: null } };
      const status = parsePorcelainStatus({ stdout: value.result.porcelain });
      onReady(true);
      if (status.head.kind !== "unborn" && value.result.head_commit) status.head = { ...status.head, commit: value.result.head_commit };
      return { status: 200, body: { workspace: current, view: projectGit({ phase: "ready", status }), selected: selected?.workspace_id === current.workspace_id ? selected : null } };
    }),
    route("git.select-diff", async request => {
      const sequence = ++selectionSequence;
      const input = request.body as Record<string, unknown> | undefined;
      if (!input || !["index", "worktree"].includes(String(input.side)) || typeof input.workspace_id !== "string") throw new Error("差异参数无效");
      const path = parseFilePath(input.path);
      const { workspace: current, result } = await read({ kind: "diff", workspace_id: input.workspace_id, path, side: input.side as "index" | "worktree" });
      if (sequence !== selectionSequence) throw new Error("已切换到另一处差异");
      if (result.outcome !== "diff") return { status: 200, body: { result } };
      const published = services.outputs!.publish({ port: "changeset", content: { kind: "inline", payload: {
        workspace: { workspace_id: current.workspace_id, name: current.name }, path,
        before_exists: result.before_exists, after_exists: result.after_exists, before: result.before, after: result.after,
        git: { before_mode: result.before_mode, after_mode: result.after_mode, ...(result.previous_path ? { previous_path: [...result.previous_path] } : {}) },
        source: { kind: "comparison", comparison_id: result.revision },
      } } });
      const selected = { workspace_id: current.workspace_id, path, side: result.side, previous_path: result.previous_path,
        revision: result.revision, reference: { artifact_id: published.artifact.artifact_id, version: published.artifact.version } };
      services.storage?.set("git-selection", JSON.stringify(selected));
      return { status: 200, body: { result, selected } };
    }),
  ];
}
