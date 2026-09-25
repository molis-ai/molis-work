import { bindOwnerPluginAction, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { gitActions, type GitSelected } from "./action-definitions.js";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseFilePath, readWorkspaceGitCapability, prepareGitIndexCapability, readGitResultsCapability, GIT_RESULT_TYPE, type GitReviewedResult, type WorkspaceGitQuery } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { parsePorcelainStatus } from "./status.js";
import { projectGit } from "./projection.js";

export function gitActionHandlers(context: PluginStartContext, onReady: (ready: boolean) => void = () => {}): ActionHandlerBinding[] {
  const services = context.services!;
  const browsing = [projectSettingsCapabilities.browsingWorkspace];
  const reading = [...browsing, readWorkspaceGitCapability];
  const reviewResults = [...browsing, readGitResultsCapability];
  let selectionSequence = 0;
  const workspace = async () => {
    const selected = await services?.capabilities?.invoke(projectSettingsCapabilities.browsingWorkspace, []);
    if (!selected) throw new Error("请在项目设置的工作目录中选择可用浏览目录");
    return { workspace_id: selected.workspace_id, name: selected.display_name, handle: selected.workspace_id };
  };
  const read = async (query: WorkspaceGitQuery) => {
    const current = await workspace();
    if (current.workspace_id !== query.workspace_id) throw new Error("工作目录已改变，请刷新 Git");
    const result = await services.capabilities!.invoke(readWorkspaceGitCapability, query);
    if ((await workspace()).workspace_id !== current.workspace_id) throw new Error("工作目录已改变，请刷新 Git");
    return { workspace: current, result };
  };
  const savedResults = () => {
    const saved = services.storage?.get("git-results");
    return typeof saved === "string" ? JSON.parse(saved) as Record<string, { artifact_id: string; version: number }> : {};
  };
  const key = (result: GitReviewedResult) => JSON.stringify([result.workspace_id, result.operation_id]);
  const results = async () => {
    const current = await workspace();
    const items = await services.capabilities!.invoke(readGitResultsCapability, { workspace_id: current.workspace_id });
    if ((await workspace()).workspace_id !== current.workspace_id) throw new Error("工作目录已改变，请重新读取结果");
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
    bindOwnerPluginAction(context, gitActions.results, async () => {
      const value = await results();
      return { workspace: value.workspace, results: value.items.map(result => {
        try { return { result, saved: readSaved(result) }; }
        catch (error) { return { result, saved: null, unavailable: error instanceof Error ? error.message : "固定结果不可读" }; }
      }) };
    }, reviewResults),
    bindOwnerPluginAction(context, gitActions.saveResult, async (input, beforeWrite) => {
      const value = await results();
      if (!input || input.workspace_id !== value.workspace.workspace_id || typeof input.review_id !== "string") throw new Error("结果保存请求无效或工作区已切换");
      const result = value.items.find(item => item.review.review_id === input.review_id);
      if (!result) throw new Error("原操作尚未结束、结果仍未知，或不属于当前工作区，不能保存确定结果");
      const existing = readSaved(result);
      if (existing) return existing;
      await beforeWrite();
      const concurrent = readSaved(result);
      if (concurrent) return concurrent;
      const published = services.outputs!.publish({ port: "result", content: { kind: "inline", payload: JSON.parse(JSON.stringify(result)) },
        metadata: { title: (result.review.action === "stage" ? "暂存" : "取消暂存") + " · " + result.summary, operation_id: result.operation_id, review_id: result.review.review_id } });
      const reference = { artifact_id: published.artifact.artifact_id, version: published.artifact.version };
      services.outputs!.retain(reference);
      services.storage!.set("git-results", JSON.stringify({ ...savedResults(), [key(result)]: reference }));
      return { reference, result, saved_at: published.artifact.created_at };
    }, reviewResults),
    bindOwnerPluginAction(context, gitActions.prepareIndex, async (input, beforeWrite) => {
      const current = await workspace();
      if (!input || input.workspace_id !== current.workspace_id || !["stage", "unstage"].includes(String(input.action))
        || typeof input.revision !== "string" || typeof input.operation_id !== "string") throw new Error("暂存请求无效或工作区已切换");
      await beforeWrite();
      const result = await services.capabilities!.invoke(prepareGitIndexCapability, { workspace_id: current.workspace_id, path: parseFilePath(input.path),
        action: input.action as "stage" | "unstage", revision: input.revision, operation_id: input.operation_id }, { before_effect: beforeWrite });
      return result;
    }, [...browsing, prepareGitIndexCapability]),
    bindOwnerPluginAction(context, gitActions.state, async () => {
      onReady(false);
      const current = await workspace(), value = await read({ workspace_id: current.workspace_id, kind: "status" });
      const saved = services.storage?.get("git-selection");
      const selected = typeof saved === "string" ? JSON.parse(saved) as GitSelected : null;
      if (value.result.outcome !== "status") return { workspace: current,
        view: projectGit({ phase: value.result.outcome === "not-a-repository" ? "not-a-repository" : "error", status: null, message: "message" in value.result ? value.result.message : "Git 状态不可读" }), selected: null };
      const status = parsePorcelainStatus({ stdout: value.result.porcelain });
      onReady(true);
      if (status.head.kind !== "unborn" && value.result.head_commit) status.head = { ...status.head, commit: value.result.head_commit };
      return { workspace: current, view: projectGit({ phase: "ready", status }), selected: selected?.workspace_id === current.workspace_id ? selected : null };
    }, reading),
    bindOwnerPluginAction(context, gitActions.selectDiff, async (input, beforeWrite) => {
      const sequence = ++selectionSequence;
      if (!input || !["index", "worktree"].includes(String(input.side)) || typeof input.workspace_id !== "string") throw new Error("差异参数无效");
      const path = parseFilePath(input.path);
      const { workspace: current, result } = await read({ kind: "diff", workspace_id: input.workspace_id, path, side: input.side as "index" | "worktree" });
      if (result.outcome !== "diff") return { result };
      await beforeWrite();
      if (sequence !== selectionSequence) throw new Error("已切换到另一处差异");
      const published = services.outputs!.publish({ port: "changeset", content: { kind: "inline", payload: {
        workspace: { workspace_id: current.workspace_id, name: current.name }, path,
        before_exists: result.before_exists, after_exists: result.after_exists, before: result.before, after: result.after,
        git: { before_mode: result.before_mode, after_mode: result.after_mode, ...(result.previous_path ? { previous_path: [...result.previous_path] } : {}) },
        source: { kind: "comparison", comparison_id: result.revision },
      } } });
      const selected = { workspace_id: current.workspace_id, path, side: result.side, ...(result.previous_path ? { previous_path: result.previous_path } : {}),
        revision: result.revision, reference: { artifact_id: published.artifact.artifact_id, version: published.artifact.version } };
      services.storage?.set("git-selection", JSON.stringify(selected));
      return { result, selected };
    }, reading),
  ];
}
