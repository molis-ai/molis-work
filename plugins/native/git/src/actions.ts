import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction, parsePorcelainStatus } from "@molis-ai/molis-work-plugin-sdk";
import { gitActions, type GitSelected } from "./action-definitions.js";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseFilePath, workspaceReadActions, prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability, GIT_RESULT_SCHEMA_VERSION, GIT_RESULT_TYPE,
  type GitOperation, type GitReviewedResult, type WorkspaceGitQuery, type WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { projectGit } from "./projection.js";
import { gitErrors } from "./errors.js";

const STATUS_WORD: Record<string, string> = { A: "新增", M: "修改", D: "删除", R: "重命名", C: "复制", T: "类型变化" };
/** A starting point the person edits: a title from what is staged and one line per file. Never sent on its own. */
function commitDraft(summary: WorkspaceGitSummary): string {
  const files = summary.staged;
  if (!files.length) return "";
  const base = (file: string) => file.slice(file.lastIndexOf("/") + 1), folders = new Set(files.map(file => file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""));
  const title = files.length === 1 ? `${STATUS_WORD[files[0]!.status] ?? "更新"} ${base(files[0]!.path)}`
    : folders.size === 1 && [...folders][0] ? `更新 ${[...folders][0]}/ 下的 ${files.length} 个文件` : `更新 ${files.length} 个文件`;
  return files.length === 1 ? title : `${title}\n\n${files.slice(0, 30).map(file => `- ${STATUS_WORD[file.status] ?? "更新"} ${file.path}`).join("\n")}${files.length > 30 ? `\n- 另有 ${files.length - 30} 个文件` : ""}`;
}
/** Only the shapes the Host accepts go on; everything else is refused here first. */
function gitOperation(value: unknown): GitOperation {
  const input = value as Record<string, unknown> | null;
  const text = (key: string, max: number) => { const found = input?.[key]; if (typeof found !== "string" || found.length > max) throw gitErrors.invalid("Git 操作参数无效"); return found; };
  switch (input?.action) {
    case "commit": return { action: "commit", message: text("message", 5_000) };
    case "branch-create": return { action: "branch-create", name: text("name", 200), checkout: input.checkout === true };
    case "branch-switch": return { action: "branch-switch", name: text("name", 200) };
    case "push": return { action: "push", remote: text("remote", 200), set_upstream: input.set_upstream === true };
    case "pr-create": return { action: "pr-create", base: text("base", 200), title: text("title", 256), body: text("body", 20_000), draft: input.draft === true };
    case "merge": return { action: "merge", branch: text("branch", 200) };
    case "pull": return { action: "pull" };
    case "resolve": return { action: "resolve", path: text("path", 1000), content: text("content", 1024 * 1024) };
    case "merge-abort": return { action: "merge-abort" };
    default: throw gitErrors.invalid("不支持的 Git 操作");
  }
}

export function gitActionHandlers(context: PluginStartContext): ActionHandlerBinding[] {
  const services = context.services!;
  const browsing = [projectDirectoryActions.get];
  const reviewResults = [...browsing, readGitResultsCapability];
  let selectionSequence = 0;
  /**
   * The project folder a call names, or the project's output when it names none (SSC-17): the page keeps which folder it shows and
   * says so. With `fallback`, a folder that has left the project reads as the output instead of refusing.
   */
  const workspace = async (id?: unknown, fallback = false) => {
    const all = await services.actions!.invoke(projectDirectoryActions.get, {});
    const asked = typeof id === "string" && id ? id : null;
    const named = asked ? all.directories.find(item => item.workspace_id === asked) : undefined;
    const selected = named ?? (!asked || fallback ? all.directories.find(item => item.roles.includes("output")) : undefined);
    if (!selected) throw gitErrors.invalid(asked && !fallback ? "这个文件夹已不在当前项目里，请刷新 Git" : "这个项目还没有输出目录，请在项目设置的「输入与输出」里指定");
    return { workspace_id: selected.workspace_id, name: selected.display_name, handle: selected.workspace_id };
  };
  const read = async (query: WorkspaceGitQuery) => {
    const current = await workspace(query.workspace_id);
    const result = await services.actions!.invoke(workspaceReadActions.git, query);
    if ((await workspace(query.workspace_id)).workspace_id !== current.workspace_id) throw gitErrors.invalid("这个文件夹已不在当前项目里，请刷新 Git");
    return { workspace: current, result };
  };
  const savedResults = () => {
    const saved = services.storage?.get("git-results");
    return typeof saved === "string" ? JSON.parse(saved) as Record<string, { artifact_id: string; version: number }> : {};
  };
  const key = (result: GitReviewedResult) => JSON.stringify([result.workspace_id, result.operation_id]);
  const results = async (id?: string) => {
    const current = await workspace(id);
    const items = await services.actions!.invoke(readGitResultsCapability, { workspace_id: current.workspace_id });
    if ((await workspace(current.workspace_id)).workspace_id !== current.workspace_id) throw gitErrors.invalid("这个文件夹已不在当前项目里，请重新读取结果");
    return { workspace: current, items };
  };
  const readSaved = (result: GitReviewedResult) => {
    const reference = savedResults()[key(result)];
    if (!reference) return null;
    const artifact = services.outputs!.read(reference);
    if (!artifact || artifact.artifact_type_id !== GIT_RESULT_TYPE || artifact.schema_version !== GIT_RESULT_SCHEMA_VERSION) throw gitErrors.invalid("原固定结果已不可读取；不会重新生成或覆盖");
    const payload = artifact.payload as unknown as GitReviewedResult;
    if (payload.workspace_id !== result.workspace_id || payload.operation_id !== result.operation_id || payload.review?.review_id !== result.review.review_id) throw gitErrors.invalid("固定结果与原操作不匹配");
    return { reference, result: payload, saved_at: artifact.created_at };
  };
  return [
    bindOwnerPluginAction(context, gitActions.results, async input => {
      const value = await results(input?.workspace_id);
      return { workspace: value.workspace, results: value.items.map(result => {
        try { return { result, saved: readSaved(result) }; }
        catch (error) { return { result, saved: null, unavailable: error instanceof Error ? error.message : "固定结果不可读" }; }
      }) };
    }, reviewResults),
    bindOwnerPluginAction(context, gitActions.saveResult, async (input, beforeWrite) => {
      if (!input || typeof input.workspace_id !== "string" || !input.workspace_id || typeof input.review_id !== "string") throw gitErrors.invalid("结果保存请求无效");
      const value = await results(input.workspace_id);
      const result = value.items.find(item => item.review.review_id === input.review_id);
      if (!result) throw gitErrors.invalid("原操作尚未结束、结果仍未知，或不属于当前工作区，不能保存确定结果");
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
      if (!input || typeof input.workspace_id !== "string" || !input.workspace_id || !["stage", "unstage"].includes(String(input.action))
        || typeof input.revision !== "string" || typeof input.operation_id !== "string") throw gitErrors.invalid("暂存请求无效");
      const current = await workspace(input.workspace_id);
      await beforeWrite();
      const result = await services.actions!.invoke(prepareGitIndexCapability, { workspace_id: current.workspace_id, path: parseFilePath(input.path),
        action: input.action as "stage" | "unstage", revision: input.revision, operation_id: input.operation_id }, { beforeEffect: beforeWrite });
      return result;
    }, [...browsing, prepareGitIndexCapability]),
    // Source control: commit, branch, push and PR, each prepared against the repository as the person saw it and run
    // only after Host review.
    bindOwnerPluginAction(context, gitActions.summary, async input => {
      const current = await workspace(input?.workspace_id), value = await read({ workspace_id: current.workspace_id, kind: "summary" });
      if (value.result.outcome !== "summary") return { workspace: current, summary: null, message: "message" in value.result ? value.result.message : "Git 状态不可读" };
      return { workspace: current, summary: value.result, draft: commitDraft(value.result) };
    }, browsing),
    bindOwnerPluginAction(context, gitActions.prSupport, async input => {
      const current = await workspace(input?.workspace_id);
      return (await read({ workspace_id: current.workspace_id, kind: "pr-support" })).result;
    }, browsing),
    // A file a merge or pull left conflicted, markers included, so the person can pick and edit before resolving.
    bindOwnerPluginAction(context, gitActions.conflict, async (input) => {
      if (!input || typeof input.path !== "string" || !input.path) throw gitErrors.invalid("请选择冲突文件");
      const current = await workspace(input.workspace_id);
      return (await read({ workspace_id: current.workspace_id, kind: "conflict", path: input.path })).result;
    }, browsing),
    bindOwnerPluginAction(context, gitActions.operations, async input => {
      const current = await workspace(input?.workspace_id);
      const operations = await services.actions!.invoke(readGitOperationsCapability, { workspace_id: current.workspace_id });
      if ((await workspace(current.workspace_id)).workspace_id !== current.workspace_id) throw gitErrors.invalid("这个文件夹已不在当前项目里，请重新读取操作记录");
      return { workspace: current, operations };
    }, [...browsing, readGitOperationsCapability]),
    bindOwnerPluginAction(context, gitActions.prepareOperation, async (input, beforeWrite) => {
      if (!input || typeof input.workspace_id !== "string" || !input.workspace_id || typeof input.revision !== "string" || typeof input.operation_id !== "string") throw gitErrors.invalid("Git 操作请求无效");
      const current = await workspace(input.workspace_id);
      const operation = gitOperation(input.operation);
      await beforeWrite();
      return services.actions!.invoke(prepareGitOperationCapability, { workspace_id: current.workspace_id, operation_id: input.operation_id, revision: input.revision, operation },
        { beforeEffect: beforeWrite });
    }, [...browsing, prepareGitOperationCapability]),
    bindOwnerPluginAction(context, gitActions.state, async input => {
      const current = await workspace(input?.workspace_id, true), value = await read({ workspace_id: current.workspace_id, kind: "status" });
      const saved = services.storage?.get("git-selection");
      const selected = typeof saved === "string" ? JSON.parse(saved) as GitSelected : null;
      if (value.result.outcome !== "status") return { workspace: current,
        view: projectGit({ phase: value.result.outcome === "not-a-repository" ? "not-a-repository" : "error", status: null, message: "message" in value.result ? value.result.message : "Git 状态不可读" }), selected: null };
      const status = parsePorcelainStatus({ stdout: value.result.porcelain });
      if (status.head.kind !== "unborn" && value.result.head_commit) status.head = { ...status.head, commit: value.result.head_commit };
      return { workspace: current, view: projectGit({ phase: "ready", status }), selected: selected?.workspace_id === current.workspace_id ? selected : null };
    }, browsing),
    bindOwnerPluginAction(context, gitActions.selectDiff, async (input, beforeWrite) => {
      const sequence = ++selectionSequence;
      if (!input || !["index", "worktree"].includes(String(input.side)) || typeof input.workspace_id !== "string") throw gitErrors.invalid("差异参数无效");
      const path = parseFilePath(input.path);
      const { workspace: current, result } = await read({ kind: "diff", workspace_id: input.workspace_id, path, side: input.side as "index" | "worktree" });
      if (result.outcome !== "diff") return { result };
      await beforeWrite();
      if (sequence !== selectionSequence) throw gitErrors.invalid("已切换到另一处差异");
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
    }, browsing),
  ];
}
