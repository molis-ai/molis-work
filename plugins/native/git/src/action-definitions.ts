import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GitOperation, GitOperationRecord, GitReviewedResult, WorkspaceGitResult, WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { object, id, text, path, workspace, reference, nullable, boolean, fileMode } from "@molis-ai/molis-work-contracts/modules/workspace-action-schemas";
import type { GitView } from "./projection.js";
const define = <Input, Output>(capability_id: string, title: string, description: string, kind: "query" | "operation", permissions: string[], input_schema: Record<string, unknown>, output_schema: Record<string, unknown>): ActionDefinition<Input, Output> => ({
  capability_id, version: 1, operation: kind === "query" ? "query" : "command", action: { title, description, kind, scope: "project",
    audiences: ["user", "agent", "workflow", "mcp"], permissions, subject_kinds: ["workspace", "git"], input_schema, output_schema },
});
const read = ["artifact:read", "storage:private"], write = [...read, "artifact:write"];
const listItem = object({ kind: { enum: ["staged", "changes", "conflicts"] }, path, orig_path: path, label: text, code: text }, ["kind", "path", "label", "code"]);
const view = object({ phase: { enum: ["waiting", "loading", "ready", "not-a-repository", "unavailable", "error"] }, head: text, tracking: text,
  staged: { type: "array", items: listItem }, changes: { type: "array", items: listItem }, conflicts: { type: "array", items: listItem }, message: text,
  recovery: text, truncated: boolean, committable: boolean, selected: listItem }, ["phase", "head", "tracking", "staged", "changes", "conflicts", "message", "truncated", "committable"]);
const selected = object({ workspace_id: id, path, side: { enum: ["index", "worktree"] }, previous_path: path, revision: id, reference }, ["workspace_id", "path", "side", "revision", "reference"]);
const diffResult = object({ outcome: { const: "diff" }, path, previous_path: path, side: { enum: ["index", "worktree"] }, before_exists: boolean, after_exists: boolean,
  before: text, after: text, before_mode: nullable(fileMode), after_mode: nullable(fileMode), revision: id }, ["outcome", "path", "side", "before_exists", "after_exists", "before", "after", "before_mode", "after_mode", "revision"]);
const failureResult = object({ outcome: { enum: ["denied", "not-a-repository", "unavailable", "changed", "unsupported", "binary", "too-large", "conflict", "missing", "error"] }, message: text });
const review = object({ review_id: id, action: { enum: ["stage", "unstage"] }, paths: { type: "array", items: text }, requested_at: text,
  decided_by: nullable(text), decided_at: nullable(text), failure_reason: text, reconciliation_reason: text,
  reconciliation: object({ actor_id: id, at: text, reason: text }) }, ["review_id", "action", "paths", "requested_at", "decided_by", "decided_at"]);
const result = object({ workspace_id: id, operation_id: id, outcome: { enum: ["succeeded", "failed", "denied", "cancelled", "expired", "reconcile", "conflict"] }, summary: text, review });
const saved = object({ reference, result, saved_at: text });
// Source control: where the repository stands, the operations asked for, and one operation to put under Host review.
const count = { type: "integer", minimum: 0 }, limited = (max: number) => ({ type: "string", maxLength: max });
const summary = object({ outcome: { const: "summary" }, branch: nullable(text), head_commit: nullable(text), upstream: nullable(text), ahead: count, behind: count,
  branches: { type: "array", items: text }, remotes: { type: "array", items: object({ name: text, url: text }) },
  staged: { type: "array", items: object({ path: text, status: text }) }, unstaged: count, conflicted: { type: "array", items: text }, merging: boolean, revision: id });
const conflictFile = object({ outcome: { const: "conflict-file" }, path: text, text: { type: "string" }, conflicts: count, ours: text, theirs: text, revision: id });
const prSupport = object({ outcome: { const: "pr-support" }, tool: { enum: ["ready", "missing", "unauthenticated", "unsupported"] }, host: nullable(text), message: text });
const operationRecord = object({ operation_id: id, review_id: id, tool: text, summary: text,
  outcome: { enum: ["pending", "running", "succeeded", "failed", "denied", "cancelled", "expired", "unknown"] }, detail: text, failure_reason: text,
  requested_at: text, decided_by: nullable(text), decided_at: nullable(text) }, ["operation_id", "review_id", "tool", "summary", "outcome", "requested_at", "decided_by", "decided_at"]);
const operation = { oneOf: [
  object({ action: { const: "commit" }, message: limited(5_000) }),
  object({ action: { const: "branch-create" }, name: limited(200), checkout: boolean }),
  object({ action: { const: "branch-switch" }, name: limited(200) }),
  object({ action: { const: "push" }, remote: limited(200), set_upstream: boolean }),
  object({ action: { const: "pr-create" }, base: limited(200), title: limited(256), body: limited(20_000), draft: boolean }),
  object({ action: { const: "merge" }, branch: limited(200) }),
  object({ action: { const: "pull" } }),
  object({ action: { const: "resolve" }, path: limited(1000), content: limited(1024 * 1024) }),
  object({ action: { const: "merge-abort" } }),
] };
interface Workspace { workspace_id: string; name: string; handle: string }
export interface GitSelected { workspace_id: string; path: readonly string[]; side: "index" | "worktree"; previous_path?: readonly string[]; revision: string; reference: ArtifactReference }
export interface GitSaved { reference: ArtifactReference; result: GitReviewedResult; saved_at: string }
export const gitActions = {
  state: define<Record<string, never>, { workspace: Workspace; view: GitView; selected: GitSelected | null }>("git.state", "读取 Git 状态", "读取当前授权仓库与原固定差异选择，不修改暂存区", "query", read, object({}), object({ workspace, view, selected: nullable(selected) })),
  selectDiff: define<{ workspace_id: string; path: readonly string[]; side: "index" | "worktree" }, { result: WorkspaceGitResult; selected?: GitSelected }>("git.select-diff", "固定 Git 差异", "保存当前暂存区或工作树的固定差异并选中它；不修改仓库", "operation", write, object({ workspace_id: id, path, side: { enum: ["index", "worktree"] } }), { oneOf: [object({ result: diffResult, selected }), object({ result: failureResult })] }),
  prepareIndex: define<{ workspace_id: string; path: readonly string[]; action: "stage" | "unstage"; revision: string; operation_id: string }, { review_id: string }>("git.prepare-index", "准备暂存审阅", "按已查看的修订生成暂存/取消暂存审阅；返回审阅身份，实际写入仍需用户审批", "operation", write, object({ workspace_id: id, path, action: { enum: ["stage", "unstage"] }, revision: id, operation_id: id }), object({ review_id: id })),
  results: define<Record<string, never>, { workspace: Workspace; results: { result: GitReviewedResult; saved: GitSaved | null; unavailable?: string }[] }>("git.results", "读取 Git 操作结果", "读取当前工作区已确定的原始审阅结果与固定归档，不把等待或未知执行当作成功", "query", read, object({}), object({ workspace, results: { type: "array", items: object({ result, saved: nullable(saved), unavailable: text }, ["result", "saved"]) } })),
  summary: define<Record<string, never>, { workspace: Workspace; summary: WorkspaceGitSummary | null; draft?: string; message?: string }>("git.summary", "读取提交与分支状态", "读取当前分支、远端跟踪、领先落后与暂存文件，并按暂存内容给出提交说明草稿；不修改仓库", "query", read, object({}), object({ workspace, summary: nullable(summary), draft: text, message: text }, ["workspace", "summary"])),
  prSupport: define<Record<string, never>, WorkspaceGitResult>("git.pr-support", "检查能否建 PR", "检查 GitHub CLI、登录状态与远端是否在 GitHub；不修改仓库", "query", read, object({}), { oneOf: [prSupport, failureResult] }),
  conflict: define<{ path: string }, WorkspaceGitResult>("git.conflict", "读取冲突文件", "读取一个合并或拉取后未解决冲突的文件当前内容（含冲突标记）；不修改仓库", "query", read, object({ path: limited(1000) }), { oneOf: [conflictFile, failureResult] }),
  operations: define<Record<string, never>, { workspace: Workspace; operations: readonly GitOperationRecord[] }>("git.operations", "读取 Git 操作记录", "读取提交、分支、推送与 PR 操作的审查结果和产出；不把等待或未知当作成功", "query", read, object({}), object({ workspace, operations: { type: "array", items: operationRecord } })),
  prepareOperation: define<{ workspace_id: string; revision: string; operation_id: string; operation: GitOperation }, { review_id: string }>("git.prepare-operation", "准备提交、分支、推送或 PR 的审阅", "按已查看的仓库状态生成宿主审阅；只有用户批准后才执行，审阅期间仓库变化会拒绝执行", "operation", read, object({ workspace_id: id, revision: id, operation_id: id, operation }), object({ review_id: id })),
  saveResult: define<{ workspace_id: string; review_id: string }, GitSaved>("git.save-result", "归档 Git 操作结果", "保存已确定的原始审阅结果，重复调用复用固定版本；不重新执行原操作", "operation", write, object({ workspace_id: id, review_id: id }), saved),
};
export const GIT_ACTIONS = Object.values(gitActions);
