import {
  AgentHost,
  CliAgentAdapter,
  createNodeCliProcessPort,
  createPrologueNodeAdapter,
  registerAgentHostCapabilities,
  type AgentStartAuthority,
  type PrologueNodeAdapterOptions,
} from "@molis-ai/molis-work-service-agent-host";
import { BUILTIN_PLUGIN_AGENTS, BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";
import { freezeProjectCharacter } from "./characters-host.js";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readProjectGuidanceCapability } from "@molis-ai/molis-work-plugin-goals";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import type { ModelProviderStore } from "./model-provider-store.js";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability, type GitOperationRecord, type GitReviewedResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { prepareGitOperation } from "./git-operations.js";
import { draftText } from "./model-draft.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { resolveConfiguredHome } from "./product-home.js";
import { readFile, rename, writeFile } from "node:fs/promises";
import { prepareGitIndex } from "./workspace-git-index.js";
import { readWriterIntegration, prepareWriterIntegration } from "./git-writer-integration.js";
import { createGitWorktreePort } from "./git-worktrees.js";
import { writerDirectoryCapabilities, writerIntegrationCapabilities, type WriterIntegrationSource } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Wires the Agent Host into a running Host.
 *
 * This is the step that turns "a Plugin could reach the Agent Host" into "it
 * can". Everything it needs — which Plugins declare Agents, which directory is
 * authorized, which model is configured — is resolved from facts the Host
 * already owns, so a Plugin cannot name a role, a directory or a model that is
 * not already its own.
 */

export interface AgentHostCompositionOptions {
  /** Called only inside the approved worktree-creation Effect. */
  authorizeWriterDirectory?(projectId: string, canonicalPath: string): Promise<void>;
  localHost: MolisWorkLocalHost;
  homeDirectory?: string;
  /** Resolves the workspace a project is bound to, for directory authority. */
  workspacesFor?(projectId: string): readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor(projectId: string): ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** Configured providers, used to decide whether a CLI Runtime has a model. */
  models?: ModelProviderStore;
  /** CLI executables to register. Absent ones are simply not registered. */
  cliRuntimes?: ReadonlyArray<{ runtime_id: string; display_name: string; command: string }>;
  /** The owning server supplies storage and credential access for this Home. */
  prologue?: Omit<PrologueNodeAdapterOptions, "app">;
}

export interface AgentHostComposition {
  readonly agentHost: AgentHost;
  readonly ready: Promise<void>;
  /** Unregisters the Capabilities this composition added. */
  dispose(): Promise<void>;
}

const DEFAULT_CLI_RUNTIMES = [
  { runtime_id: "claude-code", display_name: "Claude Code", command: "claude" },
] as const;

/**
 * Build the Agent Host and register its Capabilities against `localHost`.
 *
 * Prologue is registered when its owning server supplies storage and secrets.
 * Its capability matrix stays read-only until effect approval is connected.
 */
export function composeAgentHost(options: AgentHostCompositionOptions): AgentHostComposition {
  const agentHost = new AgentHost();

  for (const runtime of options.cliRuntimes ?? DEFAULT_CLI_RUNTIMES) {
    agentHost.register(new CliAgentAdapter({
      runtime_id: runtime.runtime_id,
      display_name: runtime.display_name,
      command: runtime.command,
      process: createNodeCliProcessPort(),
      // The model is a Host fact. No configuration means no model, and the
      // adapter reports that rather than picking one.
      model: async () => options.models?.resolveConfiguration()?.model.model_id ?? null,
    }));
  }

  let prologue: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  let ready: Promise<void> | undefined;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const initialize = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error("Agent 服务已关闭"));
    return ready ??= (options.prologue === undefined ? Promise.resolve() : createPrologueNodeAdapter({
      ...options.prologue,
      reviewQueue: agentHost.reviews,
      app: { appId: "io.molis.work", appVersion: "0.0.0" },
    }).then((adapter) => { prologue = adapter; agentHost.register(adapter); }))
      .catch(error => { ready = undefined; throw error; });
  };
  const unregister = registerAgentHostCapabilities<MolisWorkProjectRuntime>(
    {
      register: (definition, handler) => options.localHost.registerCapability(definition, handler),
    },
    {
      agentHost: () => agentHost,
      authority: (runtime, pluginId) => startAuthority(runtime, pluginId, options.workspaceFor, options.localHost, options.workspacesFor, options.homeDirectory),
      boardId: (runtime) => runtime.board_id,
    },
  );
  const unregisterGit = options.localHost.registerCapability(prepareGitIndexCapability, async (project, input, invocation) => {
    await initialize();
    if (!prologue?.gitReviews) throw new Error("Git 宿主审查执行方尚未接通");
    const current = async () => options.workspacesFor ? await options.workspacesFor(project.project_id)
      : [await options.workspaceFor(project.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    const prepared = await prepareGitIndex(input, current);
    const workspace = (await current()).find(item => item.workspace_id === input.workspace_id);
    if (!workspace) throw new Error("工作区已取消授权");
    await invocation.beforeEffect();
    const request = await prologue.gitReviews.prepare({ board_id: project.board_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      document: { kind: "git-index", action: input.action, workspace_name: workspace.display_name ?? "当前仓库", files: prepared.files } }, prepared);
    return { review_id: request.review_id };
  });


  // Commit, branch, push and PR: prepared against the repository as the person saw it, run only as the review shows.
  // What each produced is kept beside the review, since a receipt only says whether it happened.
  const detailsFile = path.join(options.homeDirectory ?? resolveConfiguredHome(), "git-operation-details.json");
  const readDetails = async (): Promise<Record<string, string>> => { try { return JSON.parse(await readFile(detailsFile, "utf8")); } catch { return {}; } };
  const saveDetail = async (key: string, detail: string) => {
    const next = { ...await readDetails(), [key]: detail }, temporary = detailsFile + "." + process.pid + ".tmp";
    await writeFile(temporary, JSON.stringify(next)); await rename(temporary, detailsFile);
  };
  const unregisterGitOperation = options.localHost.registerCapability(prepareGitOperationCapability, async (project, input, invocation) => {
    await initialize();
    if (!prologue?.gitReviews) throw new Error("Git 宿主审查执行方尚未接通");
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(input.operation_id)) throw new Error("Git 操作标识无效");
    const grants = options.workspacesFor ? await options.workspacesFor(project.project_id)
      : [await options.workspaceFor(project.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    const workspace = grants.find(item => item.workspace_id === input.workspace_id && item.realpath_verified);
    if (!workspace) throw new Error("工作区已取消授权");
    const prepared = await prepareGitOperation(workspace, input.revision, input.operation);
    // The caller's authority is checked again right before the review is created, as for staging.
    await invocation.beforeEffect();
    const request = await prologue.gitReviews.prepare({ board_id: project.board_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      operation_kind: "git-operation", document: { kind: "tool-operation", tool: prepared.tool, summary: prepared.summary, fields: prepared.fields } },
      { check: prepared.check, async execute() {
        const detail = await prepared.execute();
        try { await saveDetail(`${project.board_id}:${input.operation_id}`, detail); } catch { /* the operation happened; only its description is missing */ }
      } });
    return { review_id: request.review_id };
  });
  // A short draft from the model (a commit message): its own throwaway runtime, no tools, no review queue.
  const unregisterDraft = options.localHost.registerCapability(agentHostCapabilities.draftText, async (project, input) => {
    if (!options.prologue) throw new Error("模型执行方尚未接通，不能起草");
    const { reviewQueue: _queue, storageRoot: _root, ...prologue } = options.prologue;
    return draftText(prologue, path.join(options.homeDirectory ?? resolveConfiguredHome(), "agent-drafts"), project.board_id, input);
  });
  const unregisterGitOperations = options.localHost.registerCapability(readGitOperationsCapability, async (project, input) => {
    await initialize();
    const grants = options.workspacesFor ? await options.workspacesFor(project.project_id)
      : [await options.workspaceFor(project.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    if (!grants.some(item => item.workspace_id === input.workspace_id && item.realpath_verified)) throw new Error("工作区已取消授权，不能读取操作结果");
    await agentHost.reviews.refresh(project.board_id);
    const details = await readDetails(), records: GitOperationRecord[] = [];
    for (const request of agentHost.reviews.list(project.board_id)) {
      if (request.operation?.kind !== "git-operation" || request.operation.workspace_id !== input.workspace_id || request.document.kind !== "tool-operation") continue;
      const receipt = agentHost.reviews.receipt(request.review_id);
      const outcome: GitOperationRecord["outcome"] = !receipt ? "unknown" : receipt.effect_uncertain ? "unknown" : receipt.status === "pending" ? "pending"
        : receipt.status === "rejected" ? "denied" : receipt.status === "cancelled" ? "cancelled" : receipt.status === "expired" ? "expired"
        : receipt.effect_settled ? "succeeded" : receipt.effect_error ? "failed" : "running";
      const detail = details[`${project.board_id}:${request.operation.operation_id}`];
      records.push({ operation_id: request.operation.operation_id, review_id: request.review_id, tool: request.document.tool, summary: request.document.summary, outcome,
        ...(outcome === "succeeded" && detail ? { detail } : {}), ...(receipt?.effect_error ? { failure_reason: receipt.effect_error } : {}),
        requested_at: request.requested_at, decided_by: receipt?.decided_by ?? null, decided_at: receipt?.decided_at ?? null });
    }
    return records.reverse();
  });
  const unregisterGitResults = options.localHost.registerCapability(readGitResultsCapability, async (project, input) => {
    await initialize();
    const grants = options.workspacesFor ? await options.workspacesFor(project.project_id)
      : [await options.workspaceFor(project.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    if (!grants.some(item => item.workspace_id === input.workspace_id && item.realpath_verified)) throw new Error("工作区已取消授权，不能读取操作结果");
    await agentHost.reviews.refresh(project.board_id);
    const results: GitReviewedResult[] = [];
    for (const request of agentHost.reviews.list(project.board_id)) {
      if (request.operation?.kind !== "git-index" || request.operation.workspace_id !== input.workspace_id || request.document.kind !== "git-index") continue;
      const receipt = agentHost.reviews.receipt(request.review_id);
      if (!receipt || receipt.effect_uncertain || receipt.delivery_error || receipt.status === "pending") continue;
      if (receipt.status === "approved" && !receipt.effect_settled && !receipt.effect_error) continue;
      const outcome = receipt.status === "rejected" ? "denied" : receipt.status === "cancelled" ? "cancelled"
        : receipt.status === "expired" ? "expired" : receipt.effect_settled ? "succeeded" : "failed";
      const summary = outcome === "succeeded" ? (request.document.action === "stage" ? "已将审查版本放入暂存区；磁盘文件未改写。" : "已取消所选版本的暂存；磁盘文件未改写。")
        : outcome === "denied" ? "用户拒绝，原操作未执行。" : outcome === "cancelled" ? "原等待已撤回，没有重新执行。"
        : outcome === "expired" ? "原等待已过期，没有重新执行。" : receipt.reconciliation ? "已核对原操作未发生；不会自动重试。" : "原操作未完成；具体说明保留在宿主审查记录中。";
      results.push({ workspace_id: input.workspace_id, operation_id: request.operation.operation_id, outcome, summary,
        review: { review_id: request.review_id, action: request.document.action, paths: request.document.files.map(file => file.path),
          requested_at: request.requested_at, decided_by: receipt.decided_by, decided_at: receipt.decided_at,
          ...(receipt.effect_error ? { failure_reason: receipt.effect_error } : {}),
          ...(receipt.reconciliation ? { reconciliation: receipt.reconciliation } : {}) } });
    }
    return results.reverse();
  });

  const writerParent = async (projectId: string, workspaceId: string) => {
    const grants = options.workspacesFor ? await options.workspacesFor(projectId)
      : [await options.workspaceFor(projectId)].filter((item): item is ProjectWorkspaceRef => item !== null);
    const parent = grants.find(item => item.workspace_id === workspaceId && item.realpath_verified);
    if (!parent) throw new Error("主工作区已取消授权，不能准备或读取子目录");
    return { grants, parent, port: createGitWorktreePort(parent.canonical_path) };
  };
  const unregisterWriters = options.localHost.registerCapability(writerDirectoryCapabilities.list, async (project, input) => {
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
  const unregisterPrepareWriter = options.localHost.registerCapability(writerDirectoryCapabilities.prepare, async (project, input) => {
    await initialize();
    if (!prologue?.gitReviews || !options.authorizeWriterDirectory) throw new Error("独立工作树的宿主审查与目录授权尚未装配");
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(input.operation_id)) throw new Error("工作树操作标识无效");
    const { parent, port } = await writerParent(project.project_id, input.workspace_id);
    const id = "writer-" + createHash("sha256").update(input.operation_id).digest("hex").slice(0, 24);
    const preview = await port.preview(id), target = path.resolve(parent.canonical_path, preview.directory);
    const check = async () => {
      const current = await writerParent(project.project_id, input.workspace_id);
      if (current.parent.canonical_path !== parent.canonical_path || JSON.stringify(await current.port.preview(id)) !== JSON.stringify(preview)) throw new Error("主仓库或授权已改变，请重新预览独立目录");
    };
    const request = await prologue.gitReviews.prepare({ board_id: project.board_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      operation_kind: "git-worktree", document: { kind: "tool-operation", tool: "git-worktree-create", summary: "创建独立工作树，并授权本项目在该目录执行任务",
        fields: [{ label: "主工作区", value: parent.canonical_path }, { label: "新目录", value: target }, { label: "新分支", value: preview.branch },
          { label: "起点提交", value: preview.base_commit }, { label: "执行范围", value: "仅创建独立目录和本地分支，关联到当前项目；不发送模型任务、不修改主工作区、不推送远端。禁用 Git hooks。" }] } },
      { check, async execute() {
        await check();
        await port.create(id, preview.base_commit);
        // A failure keeps the real directory and branch for inspection; never deletes user work.
        try { await options.authorizeWriterDirectory!(project.project_id, target); }
        catch { throw new Error("工作树已创建，但项目目录授权未完成；已保留目录与分支，请通过工作区入口关联该目录，不要重复创建"); }
      } });
    return { review_id: request.review_id, directory: { worktree_id: id, branch: preview.branch, base_commit: preview.base_commit, canonical_path: target, workspace_id: null } };
  });

  const integrationSource = async (project: MolisWorkProjectRuntime, source: WriterIntegrationSource) => {
    await initialize();
    if (!prologue?.gitReviews || !prologue.subagents) throw new Error("子任务成果整合执行方尚未接通");
    const session = await prologue.readSession({ runtime_id: "prologue", session_id: source.session_id });
    if (session.owner.board_id !== project.board_id || session.owner.plugin_id !== "io.molis.work.coding" || session.recovery) throw new Error("执行不属于本项目的 Coding 会话，或原结果仍需核对");
    const ref = session.runs.find(run => run.run_id === source.run_id);
    if (!ref) throw new Error("此轮执行不属于原会话");
    const run = await prologue.read(ref);
    if (!["completed", "failed", "cancelled", "stopped"].includes(run.phase) || run.frozen.role_id !== "writers" || session.latest_run && !["completed", "failed", "cancelled", "stopped"].includes(session.latest_run.phase)) throw new Error("父任务仍在执行或需核对，暂不能整合");
    const children = await prologue.subagents.list(ref), child = children.find(c => c.subagent_id === source.subagent_id);
    // Any ended child may be brought back: one that ran out of turns after writing and testing its files still did the
    // work. What lands is exactly what the person reviews file by file, re-checked at approval; unknown outcomes still block.
    if (!child || !["completed", "failed", "cancelled"].includes(child.state) || children.some(c => ["running", "reconcile-required"].includes(c.state))) throw new Error("原子任务尚未结束或有结果待核对，暂不能整合");
    const granted = options.workspacesFor ? await options.workspacesFor(project.project_id)
      : [await options.workspaceFor(project.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    const originalParent = granted.find(g => g.realpath_verified && g.canonical_path === run.frozen.directory.canonical_path);
    if (!originalParent) throw new Error("原主工作区已取消授权");
    const { grants, parent } = await writerParent(project.project_id, originalParent.workspace_id);
    if (parent.canonical_path !== run.frozen.directory.canonical_path) throw new Error("原主工作区授权已改变");
    const frozen = run.frozen.subagent_workspaces?.find(w => w.directory.canonical_path === child.workspace_path);
    const writer = frozen && grants.find(g => g.workspace_id === frozen.workspace_id && g.realpath_verified && g.canonical_path === child.workspace_path);
    if (!writer) throw new Error("原子任务目录没有本轮独立写入授权");
    await prologue.assertDirectoriesIdle([parent.canonical_path, writer.canonical_path]);
    return { workspace_id: parent.workspace_id, writer_workspace_id: writer.workspace_id, grants };
  };
  const unregisterReadIntegration = options.localHost.registerCapability(writerIntegrationCapabilities.read, async (project, input) => {
    const source = await integrationSource(project, input);
    return readWriterIntegration(source, async () => (await integrationSource(project, input)).grants);
  });
  const unregisterPrepareIntegration = options.localHost.registerCapability(writerIntegrationCapabilities.prepare, async (project, input) => {
    const source = await integrationSource(project, input);
    const prepared = await prepareWriterIntegration({ ...source, files: input.files }, async () => (await integrationSource(project, input)).grants);
    const request = await prologue!.gitReviews!.prepare({ board_id: project.board_id, workspace_id: source.workspace_id, operation_id: input.operation_id,
      operation_kind: "git-integration", document: { kind: "git-integration", target_directory: prepared.view.target_path,
        source: { session_id: input.session_id, run_id: input.run_id, subagent_id: input.subagent_id, branch: prepared.view.branch, base_commit: prepared.view.base_commit, directory: prepared.view.source_path },
        files: prepared.files.map(file => ({ path: file.path.join("/"), before_text: file.before_text!, after_text: file.after_text!, before_mode: file.before_mode!, after_mode: file.after_mode! })) } }, prepared);
    return { review_id: request.review_id };
  });

  return { agentHost, get ready() { return initialize(); }, dispose() {
    if (disposal) return disposal;
    disposed = true;
    unregister();
    unregisterGit();
    unregisterGitOperation();
    unregisterDraft();
    unregisterGitOperations();
    unregisterGitResults();
    unregisterWriters();
    unregisterPrepareWriter();
    unregisterReadIntegration();
    unregisterPrepareIntegration();
    return disposal = (async () => {
      await ready?.catch(() => undefined);
      await prologue?.close();
    })();
  } };
}

/**
 * What one Plugin is allowed to start, resolved from its own declarations.
 *
 * A Plugin that declares no Agent gets an authority with no roles, so every
 * start attempt fails the first gate. A project with no workspace bound gets no
 * authorized directory, so it fails the third — both are true answers, and
 * neither invents a fallback.
 */
async function startAuthority(
  runtime: MolisWorkProjectRuntime,
  pluginId: string,
  workspaceFor: AgentHostCompositionOptions["workspaceFor"],
  localHost: MolisWorkLocalHost,
  workspacesFor?: AgentHostCompositionOptions["workspacesFor"],
  homeDirectory?: string,
): Promise<AgentStartAuthority> {
  const declared = BUILTIN_PLUGIN_AGENTS.get(pluginId);
  const manifest = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === pluginId)?.manifest;
  const consumesCharacters = manifest?.artifacts?.consumes?.some(type => type.artifact_type_id === CHARACTER_ARTIFACT_TYPE && type.schema_version === 1);
  const workspace = await workspaceFor(runtime.project_id);
  const workspaces = workspacesFor ? await workspacesFor(runtime.project_id) : workspace ? [workspace] : [];
  return {
    manifest: declared?.manifest ?? { roles: [], prompts: [] },
    authorizedDirectories: workspaces.filter(entry => entry.realpath_verified).map(entry => entry.canonical_path),
    prompts: declared?.prompts ?? [],
    skills: declared?.skills ?? [],
    method_owner: { board_id: runtime.board_id, plugin_id: pluginId },
    ...(consumesCharacters ? { resolveCharacter: (reference, actorId) => freezeProjectCharacter(homeDirectory, actorId, runtime.board_id, runtime.coordinator.artifacts.query, reference) } : {}),
    project_prompts: await projectPrompts(runtime, localHost),
  };
}

/**
 * The project's own layer, from the guidance its user confirmed.
 *
 * Taken from the Host rather than from the Plugin package: conventions belong
 * to the project, and a Plugin able to ship them would be speaking for every
 * project it is installed in.
 *
 * A project with nothing confirmed contributes **nothing**. The guidance view
 * still renders a prefix in that case — one that says no guidance has been
 * confirmed — and passing that along would turn "this project has said nothing"
 * into an instruction, which is a different claim.
 */
async function projectPrompts(runtime: MolisWorkProjectRuntime, localHost: MolisWorkLocalHost): Promise<AgentPromptText[]> {
  let view: ProjectGuidanceView;
  try {
    view = await localHost.client({ project_id: runtime.project_id, board_id: runtime.board_id, storage_key: runtime.store.path })
      .invoke(readProjectGuidanceCapability, { board_id: runtime.board_id });
  } catch {
    // Guidance is an addition, not a precondition. A project whose guidance
    // cannot be read still starts Runs; it just starts them without this layer.
    return [];
  }
  if (view.entries.length === 0) return [];
  return [{
    prompt_id: "project-guidance",
    // The version moves with the content, so a frozen Run records which
    // guidance it actually ran with rather than just that some existed.
    version: view.revisions.length,
    layer: "project",
    body: view.runtime_prompt_prefix,
  }];
}

/** The two catalog queries needed to answer "which directory is this project bound to". */
export interface WorkspaceLookupPorts {
  preferredWorkspacePath(projectId: string): string | null;
  listWorkspaceDirectory(projectId?: string): readonly ProjectWorkspaceRef[];
}

/**
 * The workspace a project is bound to, or null when it has none.
 *
 * Prefers the path the user set as preferred, and falls back to the single
 * bound directory when there is exactly one. With several bound and no
 * preference it returns null rather than picking: guessing which directory an
 * Agent may write in is not a choice this code gets to make.
 */
export function workspaceRefFor(
  ports: WorkspaceLookupPorts,
  projectId: string,
): ProjectWorkspaceRef | null {
  const bound = ports.listWorkspaceDirectory(projectId);
  if (bound.length === 0) return null;
  const preferred = ports.preferredWorkspacePath(projectId);
  if (preferred !== null) {
    return bound.find((entry) => entry.canonical_path === preferred) ?? null;
  }
  return bound.length === 1 ? bound[0]! : null;
}
