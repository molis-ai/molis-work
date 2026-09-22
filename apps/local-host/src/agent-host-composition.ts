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
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import type { ModelProviderStore } from "./model-provider-store.js";
import { prepareGitIndexCapability, readGitResultsCapability, type GitReviewedResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { prepareGitIndex } from "./workspace-git-index.js";
import { createGitWorktreePort } from "./git-worktrees.js";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
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
  const initialize = () => ready ??= options.prologue === undefined ? Promise.resolve() : createPrologueNodeAdapter({
      ...options.prologue,
      reviewQueue: agentHost.reviews,
      app: { appId: "io.molis.work", appVersion: "0.0.0" },
    }).then((adapter) => { prologue = adapter; agentHost.register(adapter); });
  const unregister = registerAgentHostCapabilities<MolisWorkProjectRuntime>(
    {
      register: (definition, handler) => options.localHost.registerCapability(definition, handler),
    },
    {
      agentHost: () => agentHost,
      authority: (runtime, pluginId) => startAuthority(runtime, pluginId, options.workspaceFor, options.workspacesFor, options.homeDirectory),
      boardId: (runtime) => runtime.board_id,
    },
  );
  const unregisterGit = options.localHost.registerCapability(prepareGitIndexCapability, async (project, input) => {
    await initialize();
    if (!prologue?.gitReviews) throw new Error("Git 宿主审查执行方尚未接通");
    const current = async () => options.workspacesFor ? await options.workspacesFor(project.project_id)
      : [await options.workspaceFor(project.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    const prepared = await prepareGitIndex(input, current);
    const workspace = (await current()).find(item => item.workspace_id === input.workspace_id);
    if (!workspace) throw new Error("工作区已取消授权");
    const request = await prologue.gitReviews.prepare({ board_id: project.board_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      document: { kind: "git-index", action: input.action, workspace_name: workspace.display_name ?? "当前仓库", files: prepared.files } }, prepared);
    return { review_id: request.review_id };
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
    return (await port.list()).map(tree => {
      const canonical_path = path.resolve(parent.canonical_path, tree.directory);
      return { worktree_id: tree.worktree_id, branch: tree.branch, base_commit: tree.base_commit, canonical_path,
        workspace_id: grants.find(grant => grant.realpath_verified && grant.canonical_path === canonical_path)?.workspace_id ?? null };
    });
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

  return { agentHost, get ready() { return initialize(); }, async dispose() {
    unregister();
    unregisterGit();
    unregisterGitResults();
    unregisterWriters();
    unregisterPrepareWriter();
    await ready?.catch(() => undefined);
    await prologue?.close();
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
    project_prompts: projectPrompts(runtime),
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
function projectPrompts(runtime: MolisWorkProjectRuntime): AgentPromptText[] {
  let view: ProjectGuidanceView;
  try {
    view = runtime.coordinator.readProjectGuidance(runtime.board_id);
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
    version: view.entries.length,
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
