import type { ActionDefinition, ActionMetadata } from "../platform/actions.js";
import { object, id, operationId, writerDirectory, writerSource, writerIntegrationView, writerIntegrationChoice } from "./workspace-action-schemas.js";
import type { GitFileMode } from "./workspace-artifacts.js";

/**
 * The Host's Git and writer actions are offered to plugins only (PG-035): through a Manifest's `capabilities.consumes` and
 * `services.actions`, holding the permission each names. Git's are in `workspace-artifacts.ts`, which re-exports the writers'.
 */
export const gitHostAction = (title: string, description: string, kind: "query" | "operation", permission: string, input_schema: Record<string, unknown>, output_schema: Record<string, unknown>): ActionMetadata => ({
  title, description, kind, scope: "project", ...(kind === "operation" ? { effect: "write" as const } : {}), audiences: ["plugin"], permissions: [permission], subject_kinds: ["workspace"], input_schema, output_schema,
});
export const reviewIdentity = /* @__PURE__ */ object({ review_id: id });

/** A writer's own worktree under the main workspace: its branch, the commit it started from, and where it is. */
export interface WriterWorktree {
  worktree_id: string;
  branch: string;
  base_commit: string;
  /** Workspace-relative directory the worktree lives in. */
  directory: string;
}
export type WriterFileTarget = "added" | "modified" | "deleted";

export interface PreparedWriterDirectory {
  worktree_id: string;
  branch: string;
  base_commit: string;
  canonical_path: string;
  /** Present only after the Host recorded the project authorization. */
  workspace_id: string | null;
  /**
   * Why this directory in the writers' folder can no longer serve as a writer (its branch was switched, its origin is
   * missing). Such an entry is listed so the person sees it, and is never assigned or integrated.
   */
  problem?: string;
}
export interface WriterIntegrationFile {
  path: readonly string[];
  target: WriterFileTarget;
  selectable: boolean;
  reason?: string;
  revision?: string;
  before_text?: string | null;
  after_text?: string | null;
  before_mode?: GitFileMode | null;
  after_mode?: GitFileMode | null;
  /** Both sides changed this path since the child started: the base and a three-way merge for a person to finish. */
  conflict?: { base_text: string | null; merged_text: string; clean: boolean; markers: number };
}
export interface WriterIntegrationView {
  workspace_id: string;
  writer_workspace_id: string;
  source_path: string;
  target_path: string;
  branch: string;
  base_commit: string;
  files: WriterIntegrationFile[];
}

/**
 * Parallel writers' Host side, as actions only a plugin calls (PG-035), on the same terms as Git's: a writer's worktree and
 * bringing a child's result back are each a Host review a person approves, under the calling installation's `review:<kind>`
 * (S-50); integrating, and reading what would be integrated, answer only for a session the calling installation owns.
 */
export interface WriterIntegrationSource { session_id: string; run_id: string; subagent_id: string }
export const writerIntegrationCapabilities = {
  read: {
    capability_id: "projects.workspace.writers.integration.read.v1", version: 1, operation: "query",
    action: /* @__PURE__ */ gitHostAction("读取子任务成果", "读取本安装自己的会话里一个已结束子任务的独立工作树相对主工作区的逐文件变更，每个文件能否整合、为什么；两边都改过的文本给出三方合并", "query", "workspace:read",
      /* @__PURE__ */ object(writerSource), writerIntegrationView),
  } as ActionDefinition<WriterIntegrationSource, WriterIntegrationView>,
  prepare: {
    capability_id: "projects.workspace.writers.integration.prepare.v1", version: 1, operation: "command",
    action: /* @__PURE__ */ gitHostAction("发起子任务成果整合的审查", "按调用方看到的逐文件修订，为把所选文件从子任务的独立工作树整合回主工作区发起宿主审查；只返回审查身份，用户批准后才写入，期间任何一边变化都会被拒绝", "operation", "review:git-integration",
      /* @__PURE__ */ object({ ...writerSource, operation_id: operationId, files: { type: "array", items: writerIntegrationChoice } }), reviewIdentity),
  } as ActionDefinition<WriterIntegrationSource & { operation_id: string; files: readonly { path: readonly string[]; revision: string; resolution?: string }[] }, { review_id: string }>,
} as const;

export const writerDirectoryCapabilities = {
  list: {
    capability_id: "projects.workspace.writers.list.v1", version: 1, operation: "query",
    action: /* @__PURE__ */ gitHostAction("列出独立工作树", "列出主工作区下宿主创建的独立工作树，以及各自是否已授权给本项目；分支被手动切换或来源缺失的目录也列出并写明原因，但不能分配或整合", "query", "workspace:read",
      /* @__PURE__ */ object({ workspace_id: id }), { type: "array", items: writerDirectory }),
  } as ActionDefinition<{ workspace_id: string }, PreparedWriterDirectory[]>,
  prepare: {
    capability_id: "projects.workspace.writers.prepare.v1", version: 1, operation: "command",
    action: /* @__PURE__ */ gitHostAction("发起独立工作树的审查", "为在主工作区下创建一个独立工作树和本地分支、并授权本项目在其中执行发起宿主审查；只返回审查身份和将创建的目录，用户批准后才创建，期间仓库或授权变化会被拒绝", "operation", "review:git-worktree",
      /* @__PURE__ */ object({ workspace_id: id, operation_id: operationId }), /* @__PURE__ */ object({ review_id: id, directory: writerDirectory })),
  } as ActionDefinition<{ workspace_id: string; operation_id: string }, { review_id: string; directory: PreparedWriterDirectory }>,
} as const;
