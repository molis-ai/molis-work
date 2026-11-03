import { createHash } from "node:crypto";
import path from "node:path";
import type { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { writerDirectoryCapabilities, writerIntegrationCapabilities, type WriterIntegrationSource } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { readWriterIntegration, prepareWriterIntegration } from "./workspace-git-integration.js";
import { createGitWorktreePort } from "./workspace-git-worktrees.js";
import { reviewAuthority } from "./plugin-callers.js";
import { hostErrors } from "./host-errors.js";

const writerErrors = defineErrorCodes("workspace_git.writer", {
  /** The main workspace, or the child's directory, is not (or no longer) authorized for this project as it was: the caller picks another, as for the Host's own workspace entries. */
  workspace_unavailable: "invalid",
  /** The repository or its authorization changed after the preview a person is reviewing. */
  changed: "conflict",
  /** The worktree was made, and recording the project's authorization for it failed; the directory and branch are kept. */
  authorization_incomplete: "internal",
  /** The session belongs to another project, plugin or installation. */
  session_foreign: "forbidden",
  /** The run or child named is not in that session, or the session has no directory to integrate into. */
  source_missing: "not_found",
  /** The run or child has not ended, or what it did still needs checking. */
  unsettled: "conflict",
});

type PrologueAdapter = Awaited<ReturnType<typeof createPrologueNodeAdapter>>;
/** What preparing and integrating need from the Agent runtime. */
export type WriterRuntimePort = Pick<PrologueAdapter, "gitReviews" | "subagents" | "readSession" | "read" | "assertDirectoriesIdle">;
export interface WriterHostActionPorts {
  readonly localHost: MolisWorkLocalHost;
  /** Starts the Agent runtime on first use; the runtime, once wired. */
  runtime(): Promise<WriterRuntimePort | undefined>;
  /** Records the project's authorization for a new worktree; called only inside the approved creation Effect. */
  readonly authorizeWriterDirectory?: (projectId: string, canonicalPath: string) => Promise<void>;
  /** The project's authorized workspaces. */
  workspaces(projectId: string): Promise<readonly ProjectWorkspaceRef[]>;
}

const ENDED = ["completed", "failed", "cancelled", "stopped"];

/**
 * Parallel writers' Host side as four plugin-only actions (PG-035): a writer's worktree and bringing a child's result back each
 * start a Host review a person approves, under the calling installation's `review:<kind>` (PG-009, S-50); the two reads list the
 * writers' directories and what a child's would bring back. Integrating answers only for a session the calling installation owns.
 */
export function registerWorkspaceGitWriters(ports: WriterHostActionPorts): () => void {
  const writerParent = async (projectId: string, workspaceId: string) => {
    const grants = await ports.workspaces(projectId);
    const parent = grants.find(item => item.workspace_id === workspaceId && item.realpath_verified);
    if (!parent) throw writerErrors.workspace_unavailable("主工作区已取消授权，不能准备或读取子目录");
    return { grants, parent, port: createGitWorktreePort(parent.canonical_path) };
  };

  const unregisterList = ports.localHost.registerAction(writerDirectoryCapabilities.list, async (project, input) => {
    const { grants, parent, port } = await writerParent(project.project_id, input.workspace_id);
    const { owned, unavailable } = await port.inspect();
    const grantFor = (canonical_path: string) => grants.find(grant => grant.realpath_verified && grant.canonical_path === canonical_path)?.workspace_id ?? null;
    return [...owned.map(tree => {
      const canonical_path = path.resolve(parent.canonical_path, tree.directory);
      return { worktree_id: tree.worktree_id, branch: tree.branch, base_commit: tree.base_commit, canonical_path, workspace_id: grantFor(canonical_path) };
    }), ...unavailable.map(entry => {
      const canonical_path = path.resolve(parent.canonical_path, entry.directory);
      return { worktree_id: path.basename(canonical_path), branch: entry.branch ?? "", base_commit: "", canonical_path, workspace_id: grantFor(canonical_path), problem: entry.reason };
    })];
  });

  const unregisterPrepare = ports.localHost.registerAction(writerDirectoryCapabilities.prepare, async (project, input, invocation) => {
    const reviews = (await ports.runtime())?.gitReviews, authorize = ports.authorizeWriterDirectory;
    if (!reviews || !authorize) throw new ActionError("actions.connection_required", "独立工作树的宿主审查与目录授权尚未装配");
    // The action's schema refuses it first; kept here for whoever reaches this handler another way.
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(input.operation_id)) throw new ActionError("actions.input_invalid", "工作树操作标识无效");
    const { parent, port } = await writerParent(project.project_id, input.workspace_id);
    const id = "writer-" + createHash("sha256").update(input.operation_id).digest("hex").slice(0, 24);
    const preview = await port.preview(id), target = path.resolve(parent.canonical_path, preview.directory);
    const check = async () => {
      const current = await writerParent(project.project_id, input.workspace_id);
      if (current.parent.canonical_path !== parent.canonical_path || JSON.stringify(await current.port.preview(id)) !== JSON.stringify(preview)) throw writerErrors.changed("主仓库或授权已改变，请重新预览独立目录");
    };
    // The caller's authority is checked again right before the review is created, as for Git's own reviews.
    await invocation.beforeEffect();
    const request = await reviews.prepare({ project_id: project.project_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      operation_kind: "git-worktree", document: { kind: "tool-operation", tool: "git-worktree-create", summary: "创建独立工作树，并授权本项目在该目录执行任务",
        fields: [{ label: "主工作区", value: parent.canonical_path }, { label: "新目录", value: target }, { label: "新分支", value: preview.branch },
          { label: "起点提交", value: preview.base_commit }, { label: "执行范围", value: "仅创建独立目录和本地分支，关联到当前项目；不发送模型任务、不修改主工作区、不推送远端。禁用 Git hooks。" }] } },
      { authority: reviewAuthority(invocation.plugin, "git-worktree"), check, async execute() {
        await check();
        await port.create(id, preview.base_commit);
        // A failure keeps the real directory and branch for inspection; never deletes user work.
        try { await authorize(project.project_id, target); }
        catch { throw writerErrors.authorization_incomplete("工作树已创建，但项目目录授权未完成；已保留目录与分支，请通过工作区入口关联该目录，不要重复创建"); }
      } });
    return { review_id: request.review_id, directory: { worktree_id: id, branch: preview.branch, base_commit: preview.base_commit, canonical_path: target, workspace_id: null } };
  });

  /** The child's result to integrate, once its session is the caller's, its run and child have ended and both directories are as the run froze them. */
  const integrationSource = async (project: MolisWorkProjectRuntime, source: WriterIntegrationSource, caller: HostPluginCaller | undefined) => {
    const runtime = await ports.runtime();
    if (!runtime?.gitReviews || !runtime.subagents) throw new ActionError("actions.connection_required", "子任务成果整合执行方尚未接通");
    const session = await runtime.readSession({ runtime_id: "prologue", session_id: source.session_id });
    assertIntegrableSession(session, project.project_id, caller);
    const ref = session.runs.find(run => run.run_id === source.run_id);
    if (!ref) throw writerErrors.source_missing("此轮执行不属于原会话");
    const run = await runtime.read(ref);
    if (!ENDED.includes(run.phase) || run.frozen.role_id !== "writers" || session.latest_run && !ENDED.includes(session.latest_run.phase)) throw writerErrors.unsettled("父任务仍在执行或需核对，暂不能整合");
    const children = await runtime.subagents.list(ref), child = children.find(c => c.subagent_id === source.subagent_id);
    // Any ended child may be brought back: one that ran out of turns after writing and testing its files still did the
    // work. What lands is exactly what the person reviews file by file, re-checked at approval; unknown outcomes still block.
    if (!child || !["completed", "failed", "cancelled"].includes(child.state) || children.some(c => ["running", "reconcile-required"].includes(c.state))) throw writerErrors.unsettled("原子任务尚未结束或有结果待核对，暂不能整合");
    const granted = await ports.workspaces(project.project_id);
    const originalDirectory = run.frozen.directory;
    if (!originalDirectory) throw writerErrors.source_missing("无目录会话不能整合工作区");
    const originalParent = granted.find(g => g.realpath_verified && g.canonical_path === originalDirectory.canonical_path);
    if (!originalParent) throw writerErrors.workspace_unavailable("原主工作区已取消授权");
    const { grants, parent } = await writerParent(project.project_id, originalParent.workspace_id);
    if (parent.canonical_path !== originalDirectory.canonical_path) throw writerErrors.workspace_unavailable("原主工作区授权已改变");
    const frozen = run.frozen.subagent_workspaces?.find(w => w.directory.canonical_path === child.workspace_path);
    const writer = frozen && grants.find(g => g.workspace_id === frozen.workspace_id && g.realpath_verified && g.canonical_path === child.workspace_path);
    if (!writer) throw writerErrors.workspace_unavailable("原子任务目录没有本轮独立写入授权");
    await runtime.assertDirectoriesIdle([parent.canonical_path, writer.canonical_path]);
    return { workspace_id: parent.workspace_id, writer_workspace_id: writer.workspace_id, grants, reviews: runtime.gitReviews };
  };

  const unregisterReadIntegration = ports.localHost.registerAction(writerIntegrationCapabilities.read, async (project, input, invocation) => {
    const { workspace_id, writer_workspace_id } = await integrationSource(project, input, invocation.plugin);
    return readWriterIntegration({ workspace_id, writer_workspace_id }, async () => (await integrationSource(project, input, invocation.plugin)).grants);
  });

  const unregisterPrepareIntegration = ports.localHost.registerAction(writerIntegrationCapabilities.prepare, async (project, input, invocation) => {
    const { workspace_id, writer_workspace_id, reviews } = await integrationSource(project, input, invocation.plugin);
    const prepared = await prepareWriterIntegration({ workspace_id, writer_workspace_id, files: input.files }, async () => (await integrationSource(project, input, invocation.plugin)).grants);
    // The caller's authority is checked again right before the review is created.
    await invocation.beforeEffect();
    const request = await reviews.prepare({ project_id: project.project_id, workspace_id, operation_id: input.operation_id,
      operation_kind: "git-integration", document: { kind: "git-integration", target_directory: prepared.view.target_path,
        source: { session_id: input.session_id, run_id: input.run_id, subagent_id: input.subagent_id, branch: prepared.view.branch, base_commit: prepared.view.base_commit, directory: prepared.view.source_path },
        files: prepared.files.map(file => ({ path: file.path.join("/"), before_text: file.before_text!, after_text: file.after_text!, before_mode: file.before_mode!, after_mode: file.after_mode! })) } },
      { ...prepared, authority: reviewAuthority(invocation.plugin, "git-integration") });
    return { review_id: request.review_id };
  });

  return () => { unregisterList(); unregisterPrepare(); unregisterReadIntegration(); unregisterPrepareIntegration(); };
}

/**
 * The session being integrated must belong to this project and to the installation making the call: the owner it recorded when
 * the Host issued that plugin its caller (plugin and installation together, never read from input), whichever plugin it is (PG-009).
 * The project is checked first, then that there is a caller at all, then whose session it is, then that its result is settled.
 */
function assertIntegrableSession(session: { owner: { project_id: string; plugin_id: string; install_id: string }; recovery?: unknown }, projectId: string, caller: HostPluginCaller | undefined): void {
  if (session.owner.project_id !== projectId) throw writerErrors.session_foreign("执行不属于本项目的会话");
  if (!caller) throw hostErrors.plugin_caller_invalid("整合子任务成果只能由插件发起");
  if (session.owner.plugin_id !== caller.plugin_id || session.owner.install_id !== caller.install_id) throw writerErrors.session_foreign("执行不属于发起整合的这份插件安装的会话");
  if (session.recovery) throw writerErrors.unsettled("原结果仍需核对，暂不能整合");
}
