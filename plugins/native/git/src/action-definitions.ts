import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { workspaceReadActions, type GitOperation, type GitOperationRecord, type GitReviewedResult, type WorkspaceGitResult, type WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { object, id, text, integer, path, workspace, reference, nullable, boolean, fileMode, gitOperation as operation, gitOperationRecord as operationRecord, gitReviewedResult as result } from "@molis-ai/molis-work-contracts/modules/workspace-action-schemas";
import type { GitView } from "./projection.js";
const define = <Input, Output>(capability_id: string, version: number, title: string, description: string, kind: "query" | "operation", permissions: string[], input_schema: Record<string, unknown>, output_schema: Record<string, unknown>): ActionDefinition<Input, Output> => createActionDefinition<Input, Output>(capability_id, kind === "query" ? "query" : "command", { title, description, kind,
    audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions, subject_kinds: ["workspace", "git"], input_schema, output_schema }, version);
const read = ["artifact:read", "storage:private"], write = [...read, "artifact:write"];
/**
 * An action that cannot work without reading the repository says so: it needs the one workspace Git read action, and the
 * callers of the action hold `workspace:read` for it (a declaration never grants what the dependency needs).
 */
const readingRepository = <Input, Output>(definition: ActionDefinition<Input, Output>): ActionDefinition<Input, Output> => ({ ...definition, action: { ...definition.action,
  permissions: [...definition.action.permissions, "workspace:read"],
  required_actions: [{ capability_id: workspaceReadActions.git.capability_id, version: workspaceReadActions.git.version }] } });
const listItem = object({ kind: { enum: ["staged", "changes", "conflicts"] }, path, orig_path: path, label: text, code: text }, ["kind", "path", "label", "code"]);
const view = object({ phase: { enum: ["waiting", "loading", "ready", "not-a-repository", "unavailable", "error"] }, head: text, upstream: nullable(object({ name: text, ahead: integer, behind: integer })),
  staged: { type: "array", items: listItem }, changes: { type: "array", items: listItem }, conflicts: { type: "array", items: listItem }, message: text,
  reason: { const: "directory_not_created" }, recovery: text, truncated: boolean, committable: boolean, selected: listItem }, ["phase", "head", "upstream", "staged", "changes", "conflicts", "message", "truncated", "committable"]);
const selected = object({ workspace_id: id, path, side: { enum: ["index", "worktree"] }, previous_path: path, revision: id, reference }, ["workspace_id", "path", "side", "revision", "reference"]);
const diffResult = object({ outcome: { const: "diff" }, path, previous_path: path, side: { enum: ["index", "worktree"] }, before_exists: boolean, after_exists: boolean,
  before: text, after: text, before_mode: nullable(fileMode), after_mode: nullable(fileMode), revision: id }, ["outcome", "path", "side", "before_exists", "after_exists", "before", "after", "before_mode", "after_mode", "revision"]);
const failureResult = object({ outcome: { enum: ["denied", "not-a-repository", "unavailable", "changed", "unsupported", "binary", "too-large", "conflict", "missing", "error"] }, message: text });
const saved = object({ reference, result, saved_at: text });
// Source control: where the repository stands, the operations asked for, and one operation to put under Host review.
const count = { type: "integer", minimum: 0 }, limited = (max: number) => ({ type: "string", maxLength: max });
const summary = object({ outcome: { const: "summary" }, branch: nullable(text), head_commit: nullable(text), upstream: nullable(text), ahead: count, behind: count,
  branches: { type: "array", items: text }, remotes: { type: "array", items: object({ name: text, url: text }) },
  staged: { type: "array", items: object({ path: text, status: text }) }, unstaged: count, conflicted: { type: "array", items: text }, merging: boolean, revision: id });
const conflictFile = object({ outcome: { const: "conflict-file" }, path: text, text: { type: "string" }, conflicts: count, ours: text, theirs: text, revision: id });
const prSupport = object({ outcome: { const: "pr-support" }, tool: { enum: ["ready", "missing", "unauthenticated", "unsupported"] }, host: nullable(text), message: text,
  local_remote: object({ name: text, url: text }) }, ["outcome", "tool", "host", "message"]);
interface Workspace { workspace_id: string; name: string; handle: string }
/** The project folder the page shows (page state); none names the project's output. */
interface Named { workspace_id?: string }
const named = object({ workspace_id: id }, []);
export interface GitSelected { workspace_id: string; path: readonly string[]; side: "index" | "worktree"; previous_path?: readonly string[]; revision: string; reference: ArtifactReference }
interface GitSaved { reference: ArtifactReference; result: GitReviewedResult; saved_at: string }
export const gitActions = {
  // Version 2: the view gives the upstream as fields (name, ahead, behind) instead of one sentence (user 2026-10-23 ⑧).
  state: readingRepository(define<Named, { workspace: Workspace; view: GitView; selected: GitSelected | null }>("git.state", /* @version action.git.state */ 1, "读取 Git 状态", "读取所指项目文件夹（没指定、或它已不在项目里时是输出目录）的仓库状态与原固定差异选择，不修改暂存区", "query", read, named, object({ workspace, view, selected: nullable(selected) }))),
  selectDiff: readingRepository(define<{ workspace_id: string; path: readonly string[]; side: "index" | "worktree" }, { result: WorkspaceGitResult; selected?: GitSelected }>("git.select-diff", /* @version action.git.select-diff */ 1, "固定 Git 差异", "保存当前暂存区或工作树的固定差异并选中它；不修改仓库", "operation", write, object({ workspace_id: id, path, side: { enum: ["index", "worktree"] } }), { oneOf: [object({ result: diffResult, selected }), object({ result: failureResult })] })),
  prepareIndex: define<{ workspace_id: string; path: readonly string[]; action: "stage" | "unstage"; revision: string; operation_id: string }, { review_id: string }>("git.prepare-index", /* @version action.git.prepare-index */ 1, "准备暂存审阅", "按已查看的修订生成暂存/取消暂存审阅；返回审阅身份，实际写入仍需用户审批", "operation", write, object({ workspace_id: id, path, action: { enum: ["stage", "unstage"] }, revision: id, operation_id: id }), object({ review_id: id })),
  results: define<Named, { workspace: Workspace; results: { result: GitReviewedResult; saved: GitSaved | null; unavailable?: string }[] }>("git.results", /* @version action.git.results */ 1, "读取 Git 操作结果", "读取所指项目文件夹（没指定时是输出目录）已确定的原始审阅结果与固定归档，不把等待或未知执行当作成功", "query", read, named, object({ workspace, results: { type: "array", items: object({ result, saved: nullable(saved), unavailable: text }, ["result", "saved"]) } })),
  summary: readingRepository(define<Named, { workspace: Workspace; summary: WorkspaceGitSummary | null; draft?: string; message?: string }>("git.summary", /* @version action.git.summary */ 1, "读取提交与分支状态", "读取所指项目文件夹（没指定时是输出目录）的当前分支、远端跟踪、领先落后与暂存文件，并按暂存内容给出提交说明草稿；不修改仓库", "query", read, named, object({ workspace, summary: nullable(summary), draft: text, message: text }, ["workspace", "summary"]))),
  prSupport: readingRepository(define<Named, WorkspaceGitResult>("git.pr-support", /* @version action.git.pr-support */ 1, "检查能否建 PR", "检查 GitHub CLI、登录状态与所指项目文件夹（没指定时是输出目录）的远端是否在 GitHub；不修改仓库", "query", read, named, { oneOf: [prSupport, failureResult] })),
  conflict: readingRepository(define<Named & { path: string }, WorkspaceGitResult>("git.conflict", /* @version action.git.conflict */ 1, "读取冲突文件", "读取所指项目文件夹（没指定时是输出目录）里一个合并或拉取后未解决冲突的文件当前内容（含冲突标记）；不修改仓库", "query", read, object({ path: limited(1000), workspace_id: id }, ["path"]), { oneOf: [conflictFile, failureResult] })),
  operations: define<Named, { workspace: Workspace; operations: readonly GitOperationRecord[] }>("git.operations", /* @version action.git.operations */ 1, "读取 Git 操作记录", "读取所指项目文件夹（没指定时是输出目录）提交、分支、推送与 PR 操作的审查结果和产出；不把等待或未知当作成功", "query", read, named, object({ workspace, operations: { type: "array", items: operationRecord } })),
  prepareOperation: define<{ workspace_id: string; revision: string; operation_id: string; operation: GitOperation }, { review_id: string }>("git.prepare-operation", /* @version action.git.prepare-operation */ 1, "准备提交、分支、推送或 PR 的审阅", "按已查看的仓库状态生成宿主审阅；只有用户批准后才执行，审阅期间仓库变化会拒绝执行", "operation", read, object({ workspace_id: id, revision: id, operation_id: id, operation }), object({ review_id: id })),
  saveResult: define<{ workspace_id: string; review_id: string }, GitSaved>("git.save-result", /* @version action.git.save-result */ 1, "归档 Git 操作结果", "保存已确定的原始审阅结果，重复调用复用固定版本；不重新执行原操作", "operation", write, object({ workspace_id: id, review_id: id }), saved),
};
export const GIT_ACTIONS = Object.values(gitActions);
