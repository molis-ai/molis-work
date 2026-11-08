import path from "node:path";
import type { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { directoryInputOnly, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { writerDirectoryCapabilities, writerIntegrationCapabilities, type WriterIntegrationSource } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { readWriterIntegration, prepareWriterIntegration } from "./workspace-git-integration.js";
import { createGitWorktreePort, hostWriterId } from "./workspace-git-worktrees.js";
import { reviewAuthority } from "./plugin-callers.js";
import { hostErrors } from "./host-errors.js";

const writerErrors = defineErrorCodes("workspace_git.writer", {
  /** The output, or the child's worktree, is not (or no longer) what it was for this project: the caller picks another, as for the Host's own workspace entries. */
  workspace_unavailable: "invalid",
  /** The repository or its authorization changed after the preview a person is reviewing. */
  changed: "conflict",
  /** The round was started before writers were named by their worktree: its children cannot be found again; the person starts a new round. */
  round_outdated: "conflict",
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
  /** The project's authorized workspaces. */
  workspaces(projectId: string): Promise<readonly ProjectWorkspaceRef[]>;
  /** The project's output directory: the only folder a worktree is made in or a child's result comes back to (SSC-15). */
  output(projectId: string): Promise<ProjectWorkspaceRef | null>;
}

const ENDED = ["completed", "failed", "cancelled", "stopped"];

/**
 * Parallel writers' Host side as four plugin-only actions (PG-035): a writer's worktree and bringing a child's result back each
 * start a Host review a person approves, under the calling installation's `review:<kind>` (PG-009, S-50); the two reads list the
 * writers' directories and what a child's would bring back. Integrating answers only for a session the calling installation owns.
 * A worktree is the Host's own, made in the output and named by its `worktree_id`; it is never written as a directory of the project
 * (specs/shared-sources-and-surfaces §3, plan A), and a round is let work in it by agent-host, as one of the Host's worktrees.
 */
export function registerWorkspaceGitWriters(ports: WriterHostActionPorts): () => void {
  const writerParent = async (projectId: string, workspaceId: string, write: boolean) => {
    const grants = await ports.workspaces(projectId);
    const parent = grants.find(item => item.workspace_id === workspaceId && item.realpath_verified);
    if (!parent) throw writerErrors.workspace_unavailable("主工作区已取消授权，不能准备或读取子目录");
    // Making a worktree writes the repository, and integrating writes the folder: only in the output (SSC-15).
    if (write && (await ports.output(projectId))?.workspace_id !== workspaceId) throw directoryInputOnly(workspaceId);
    return { grants, parent, port: createGitWorktreePort(parent.canonical_path) };
  };

  const unregisterList = ports.localHost.registerAction(writerDirectoryCapabilities.list, async (project, input) => {
    const { parent, port } = await writerParent(project.project_id, input.workspace_id, false);
    const { owned, unavailable } = await port.inspect();
    return [...owned.map(tree => ({ worktree_id: tree.worktree_id, branch: tree.branch, base_commit: tree.base_commit, canonical_path: path.resolve(parent.canonical_path, tree.directory) })),
      ...unavailable.map(entry => {
        const canonical_path = path.resolve(parent.canonical_path, entry.directory);
        return { worktree_id: path.basename(canonical_path), branch: entry.branch ?? "", base_commit: "", canonical_path, problem: entry.reason };
      })];
  });

  const unregisterPrepare = ports.localHost.registerAction(writerDirectoryCapabilities.prepare, async (project, input, invocation) => {
    const reviews = (await ports.runtime())?.gitReviews;
    if (!reviews) throw new ActionError("actions.connection_required", "独立工作树的宿主审查尚未装配");
    // The action's schema refuses it first; kept here for whoever reaches this handler another way.
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(input.operation_id)) throw new ActionError("actions.input_invalid", "工作树操作标识无效");
    const { parent, port } = await writerParent(project.project_id, input.workspace_id, true);
    const id = hostWriterId(input.operation_id);
    const preview = await port.preview(id), target = path.resolve(parent.canonical_path, preview.directory);
    const check = async () => {
      const current = await writerParent(project.project_id, input.workspace_id, true);
      if (current.parent.canonical_path !== parent.canonical_path || JSON.stringify(await current.port.preview(id)) !== JSON.stringify(preview)) throw writerErrors.changed("主仓库或授权已改变，请重新预览独立目录");
    };
    // The caller's authority is checked again right before the review is created, as for Git's own reviews.
    await invocation.beforeEffect();
    const request = await reviews.prepare({ project_id: project.project_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      operation_kind: "git-worktree", document: { kind: "tool-operation", tool: "git-worktree-create", summary: "创建独立工作树，供本项目的轮次在其中写入",
        fields: [{ label: "输出目录", value: parent.canonical_path }, { label: "新目录", value: target }, { label: "新分支", value: preview.branch },
          { label: "起点提交", value: preview.base_commit }, { label: "执行范围", value: "仅创建独立目录和本地分支，不加进项目的目录；不发送模型任务、不修改输出目录、不推送远端。禁用 Git hooks。" }] } },
      { authority: reviewAuthority(invocation.plugin, "git-worktree"), check, async execute() {
        await check();
        await port.create(id, preview.base_commit);
      } });
    return { review_id: request.review_id, directory: { worktree_id: id, branch: preview.branch, base_commit: preview.base_commit, canonical_path: target } };
  });

  /**
   * A round that ran in one of the Host's worktrees (Coding's 「用于下一轮」): the worktree is the one its frozen record names
   * (`directories.execution`), never one the caller names, and it is read as it is now, as a child's is. It comes back to the output
   * the round was frozen under, while that is still the output, once the round and the session's latest round have ended.
   */
  const worktreeRoundSource = async (project: MolisWorkProjectRuntime, session: Awaited<ReturnType<WriterRuntimePort["readSession"]>>,
    run: Awaited<ReturnType<WriterRuntimePort["read"]>>, runtime: WriterRuntimePort) => {
    if (!ENDED.includes(run.phase) || session.latest_run && !ENDED.includes(session.latest_run.phase)) throw writerErrors.unsettled("这一轮或会话里后来的一轮仍在执行或需核对，暂不能整合");
    const place = run.frozen.directories?.execution, directory = run.frozen.directory;
    if (place?.kind !== "worktree" || !directory?.realpath_verified) throw writerErrors.source_missing("这一轮不是在宿主的独立工作树里跑的，没有可以整合的成果");
    const output = await ports.output(project.project_id);
    if (!output?.realpath_verified || output.workspace_id !== run.frozen.directories!.output) throw writerErrors.workspace_unavailable("原主工作区已不是这个项目的输出目录，不能整合");
    const { grants, parent, port } = await writerParent(project.project_id, output.workspace_id, true);
    const tree = (await port.inspect()).owned.find(item => item.worktree_id === place.worktree_id && path.resolve(parent.canonical_path, item.directory) === directory.canonical_path);
    if (!tree) throw writerErrors.workspace_unavailable("这一轮的独立工作树已不是宿主为这个项目建的");
    await runtime.assertDirectoriesIdle([parent.canonical_path, directory.canonical_path]);
    return { workspace_id: parent.workspace_id, worktree_id: tree.worktree_id, grants, reviews: runtime.gitReviews! };
  };

  /**
   * The result to integrate, once its session is the caller's: a child of a parallel-writers round, once its run and child have ended
   * and both directories are as the run froze them; or, with no child named, a round that ran in one of the Host's worktrees.
   */
  const integrationSource = async (project: MolisWorkProjectRuntime, source: WriterIntegrationSource, caller: HostPluginCaller | undefined) => {
    const runtime = await ports.runtime();
    // A child is found through the Runtime's sub-agents; a round in a worktree needs only the reviews.
    if (!runtime?.gitReviews || source.subagent_id !== undefined && !runtime.subagents) throw new ActionError("actions.connection_required", "子任务成果整合执行方尚未接通");
    const session = await runtime.readSession({ runtime_id: "prologue", session_id: source.session_id });
    assertIntegrableSession(session, project.project_id, caller);
    const ref = session.runs.find(run => run.run_id === source.run_id);
    if (!ref) throw writerErrors.source_missing("此轮执行不属于原会话");
    const run = await runtime.read(ref);
    if (source.subagent_id === undefined) return worktreeRoundSource(project, session, run, runtime);
    if (!runtime.subagents) throw new ActionError("actions.connection_required", "子任务成果整合执行方尚未接通");
    if (!ENDED.includes(run.phase) || run.frozen.role_id !== "writers" || session.latest_run && !ENDED.includes(session.latest_run.phase)) throw writerErrors.unsettled("父任务仍在执行或需核对，暂不能整合");
    const children = await runtime.subagents.list(ref), child = children.find(c => c.subagent_id === source.subagent_id);
    // Any ended child may be brought back: one that ran out of turns after writing and testing its files still did the
    // work. What lands is exactly what the person reviews file by file, re-checked at approval; unknown outcomes still block.
    if (!child || !["completed", "failed", "cancelled"].includes(child.state) || children.some(c => ["running", "reconcile-required"].includes(c.state))) throw writerErrors.unsettled("原子任务尚未结束或有结果待核对，暂不能整合");
    const originalDirectory = run.frozen.directory;
    if (!originalDirectory) throw writerErrors.source_missing("无目录会话不能整合工作区");
    // The result comes back to the folder the round ran in, and only while it is still the project's output.
    const output = await ports.output(project.project_id);
    if (!output?.realpath_verified || output.canonical_path !== originalDirectory.canonical_path) throw writerErrors.workspace_unavailable("原主工作区已不是这个项目的输出目录，不能整合");
    const { grants, parent, port } = await writerParent(project.project_id, output.workspace_id, true);
    const frozen = run.frozen.subagent_workspaces?.find(w => w.directory.canonical_path === child.workspace_path);
    // A round recorded before writers were named by their worktree has no `worktree_id` here: it is not read another way.
    if (frozen && typeof frozen.worktree_id !== "string") throw writerErrors.round_outdated("这一轮是旧版本开的，写手的目录接不上，请重开一轮");
    const tree = frozen && (await port.inspect()).owned.find(item => item.worktree_id === frozen.worktree_id && path.resolve(parent.canonical_path, item.directory) === child.workspace_path);
    if (!frozen || !tree) throw writerErrors.workspace_unavailable("原子任务目录已不是宿主为本轮建的独立工作树");
    await runtime.assertDirectoriesIdle([parent.canonical_path, path.resolve(parent.canonical_path, tree.directory)]);
    return { workspace_id: parent.workspace_id, worktree_id: tree.worktree_id, grants, reviews: runtime.gitReviews };
  };

  const unregisterReadIntegration = ports.localHost.registerAction(writerIntegrationCapabilities.read, async (project, input, invocation) => {
    const { workspace_id, worktree_id } = await integrationSource(project, input, invocation.plugin);
    return readWriterIntegration({ workspace_id, worktree_id }, async () => (await integrationSource(project, input, invocation.plugin)).grants);
  });

  const unregisterPrepareIntegration = ports.localHost.registerAction(writerIntegrationCapabilities.prepare, async (project, input, invocation) => {
    const { workspace_id, worktree_id, reviews } = await integrationSource(project, input, invocation.plugin);
    const prepared = await prepareWriterIntegration({ workspace_id, worktree_id, files: input.files }, async () => (await integrationSource(project, input, invocation.plugin)).grants);
    // The caller's authority is checked again right before the review is created.
    await invocation.beforeEffect();
    const request = await reviews.prepare({ project_id: project.project_id, workspace_id, operation_id: input.operation_id,
      operation_kind: "git-integration", document: { kind: "git-integration", target_directory: prepared.view.target_path,
        source: { session_id: input.session_id, run_id: input.run_id, ...(input.subagent_id === undefined ? {} : { subagent_id: input.subagent_id }), branch: prepared.view.branch, base_commit: prepared.view.base_commit, directory: prepared.view.source_path },
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
