import path from "node:path";
import { currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import type { PrologueInferenceClient } from "@molis-ai/molis-work-service-agent-host";
import { pdfDocumentParser } from "./pdf-document-parser.js";
import { hostErrors } from "./host-errors.js";
import type { HostPluginCaller, LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createExternalMcpDirectory } from "./external-mcp-actions.js";
import { authorizeMcpActions } from "./mcp-action-client.js";
import { taskReadableHost } from "./task-grant-actions.js";
import { assertActionInput, currentCallId, newCallId } from "@molis-ai/molis-work-kernel";
import {
  AgentHost,
  createPrologueNodeAdapter,
  registerAgentHostCapabilities,
  type AgentHostWorktree,
  type AgentStartAuthority,
  type PrologueNodeAdapterOptions,
  type AgentPromptResolver,
} from "@molis-ai/molis-work-service-agent-host";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { freezeProjectCharacter } from "./characters-host.js";
import type { ProjectDirectories, ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PrepareProjectDirectory } from "./project-capabilities.js";
import { readProjectGuidance, type ProjectGuidanceFacts } from "./goal-callers.js";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { ActionError, type ActionCallContext, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { registerWorkspaceGitActions } from "./workspace-git-actions.js";
import { registerWorkspaceGitWriters } from "./workspace-git-writers.js";
import { createGitWorktreePort } from "./workspace-git-worktrees.js";
import { draftText } from "./model-draft.js";
import { SKILLS_PROVIDER_ID, SKILLS_READ_PERMISSION } from "@molis-ai/molis-work-contracts/services/skills";
import { agentHostCapabilities, type AgentMcpLibrary, type AgentRuntimeDescriptor, type AgentSkillOwner, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import { resolveConfiguredHome } from "./product-home.js";
import { memoryForAgentRun } from "./memory/memory-host.js";
import { assistantConnectionCheckers } from "./assistant/assistant-connection-authority.js";
import { modelRoundLocale, replyLanguage } from "./reply-language.js";
import { workAuthorityCheck } from "./agent-work-authority.js";
import { currentNamedSkills, ownSkillSource, roundSkillCatalog } from "./agent-round-skills.js";
import { pluginInstallRecords } from "./plugin-install-records.js";

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
  /** The person's edits of registered prompts; runs use them from their next start. */
  prompts?: AgentPromptResolver;
  localHost: MolisWorkLocalHost;
  homeDirectory?: string;
  projectReference?(projectId: string): Promise<LocalHostProjectReference>;
  /** Resolves the workspace a project is bound to, for directory authority. */
  workspacesFor?(projectId: string): readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor(projectId: string): ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** The project's folders with their roles and revision, which a round freezes as where it works; absent where the Host keeps no catalog. */
  directoriesFor?(projectId: string): ProjectDirectories | undefined | Promise<ProjectDirectories | undefined>;
  /**
   * Before a folder of the project is touched on disk (`MolisWorkLocalHostOptions.prepareDirectory`): a round, a session or a stdio MCP
   * server makes a default output directory that is not made yet (`write`); Git reads whether it is there (`read`). Absent, every folder is
   * taken to be there.
   */
  prepareDirectory?: PrepareProjectDirectory;
  /** The owning server supplies storage and credential access for this Home. */
  prologue?: Omit<PrologueNodeAdapterOptions, "app">;
}

export interface AgentHostComposition {
  /**
   * Resolves only this live installation's declarations and the project's verified workspaces. `subject` is the task grant subject the
   * Host composed for this round (`agent:task:…`): its action calls are that subject's, reading only what the person allowed the task.
   */
  preparePlugin(caller: HostPluginCaller, subject?: string): Promise<{ authority: AgentStartAuthority; workspaces: readonly ProjectWorkspaceRef[]; output: ProjectWorkspaceRef | null }>;
  readonly inference: PrologueInferenceClient;
  readonly savedHistory: Awaited<ReturnType<typeof createPrologueNodeAdapter>>["savedHistory"];
  mcpLibrary(): Promise<AgentMcpLibrary | undefined>;
  refreshExternalMcp(owner: AgentSkillOwner): Promise<void>;
  createBuilderAgent: Awaited<ReturnType<typeof createPrologueNodeAdapter>>["createBuilderAgent"];
  readonly agentHost: AgentHost;
  /**
   * What Characters asks of the built-in Agent in one project: the engines and the actions a round may be given. Characters is a
   * provider the Host registers itself, with no plugin caller, so it is answered here rather than through the plugin-only actions.
   */
  charactersCatalog(runtime: MolisWorkProjectRuntime): { listRuntimes(): Promise<AgentRuntimeDescriptor[]>; listActions(runtimeId: string): Promise<readonly ActionView[]> };
  /** Starts the runtime when it has not started yet. */
  readonly ready: Promise<void>;
  /** Settles once the runtime has started because something needed it; waiting on it never starts the runtime. */
  readonly started: Promise<void>;
  /** Brings back a project's external MCP entries after a restart; called before the project's directory is read. */
  restoreExternalMcp(reference: LocalHostProjectReference): Promise<void>;
  /**
   * The person changed a standing decision about a site in the side panel's browser. A running runtime applies it at
   * once; a runtime not started yet reads the saved decisions when it starts.
   */
  decideSurfaceSite(decision: { scope: string; decision: "allow" | "block" | "forget" }): void;
  /** Unregisters the Capabilities this composition added. */
  dispose(): Promise<void>;
}

/**
 * Build the Agent Host and register its Capabilities against `localHost`.
 *
 * Prologue is registered when its owning server supplies storage and secrets.
 * Its capability matrix stays read-only until effect approval is connected.
 */
export function composeAgentHost(options: AgentHostCompositionOptions): AgentHostComposition {
  const agentHost = new AgentHost(options.prompts ? { prompts: options.prompts } : {});

  let prologue: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  let initialization: ReturnType<typeof createPrologueNodeAdapter> | undefined;
  let ready: Promise<void> | undefined;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  let disposed = false, disposal: Promise<void> | undefined;
  const initialize = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error("Agent 服务已关闭"));
    return ready ??= (async () => {
      if (options.prologue === undefined) return;
      // A rejected start may still own resources. Finish that instance before creating another one.
      await initialization?.close();
      if (disposed) return;
      initialization = createPrologueNodeAdapter({
        ...options.prologue,
        // Documents people bring (PDF) are read by the runtime's own parser slot, with this parser plugged in.
        documentParsers: [pdfDocumentParser],
        // File, owner and background-job waits each recheck the authority of their own source.
        checks: hostConditionChecks(options),
        reviewQueue: agentHost.reviews,
        app: { appId: "io.molis.work", appVersion: "0.0.0" },
      });
      const adapter = await initialization;
      if (disposed) return;
      prologue = adapter; agentHost.register(adapter); markStarted();
    })()
      .catch(error => { ready = undefined; throw error; });
  };
  // Connected external MCP tools join the project directory; they follow every list, save and connection change.
  const externalMcp = createExternalMcpDirectory({ localHost: options.localHost, homeDirectory: options.homeDirectory });
  const unregister = registerAgentHostCapabilities<MolisWorkProjectRuntime>(
    {
      register: (definition, handler) => { // Every Agent Host entry is an action (R8); the runtime starts on the first call.
        const started: typeof handler = async (project, input, invocation) => { await initialize(); return handler(project, input, invocation); };
        return options.localHost.registerAction(definition, started);
      },
    },
    {
      agentHost: () => agentHost,
      originalInput: (_runtime, caller) => currentOriginalInput(caller),
      authority: (runtime, pluginId, caller) => startAuthority(runtime, pluginId, options, caller),
      projectId: (runtime) => runtime.project_id,
      mcpChanged: (runtime, runtimeId, library, owner, check) => externalMcp.sync(runtime, runtimeId, library, owner, check),
      writeCheckers: async (runtime) => ({ workspaces: await workspaceGrants(options, runtime.project_id), store: keptWriteCheckers(prologue) }),
    },
  );
  // A default output directory not made yet is no repository: Git answers so without running (§3 「碰磁盘的调用方」).
  const made = async (projectId: string, workspaceId: string) => !options.prepareDirectory || (await options.prepareDirectory(projectId, workspaceId, "read")).exists;
  const unregisterGit = registerWorkspaceGitActions({ localHost: options.localHost, homeDirectory: options.homeDirectory ?? resolveConfiguredHome(),
    gitReviews: async () => { await initialize(); return prologue?.gitReviews; }, reviews: async () => { await initialize(); return agentHost.reviews; },
    workspaces: projectId => workspaceGrants(options, projectId), output: async projectId => options.workspaceFor(projectId), made });
  const unregisterWriters = registerWorkspaceGitWriters({ localHost: options.localHost, runtime: async () => { await initialize(); return prologue; },
    workspaces: projectId => workspaceGrants(options, projectId), output: async projectId => options.workspaceFor(projectId), made });
  // Drafts borrow the same owner as Agent runs; only the ephemeral model Session is scoped to the request.
  const unregisterDraft = options.localHost.registerAction(agentHostCapabilities.draftText, async (_project, input, invocation) => {
    if (!options.prologue) throw new ActionError("actions.connection_required", "模型执行方尚未接通，不能起草");
    return draftText({ homeDirectory: options.homeDirectory ?? resolveConfiguredHome(), resolveInference: async () => {
      await initialize(); if (!prologue) throw new ActionError("actions.connection_required", "模型执行方尚未接通，不能起草"); return prologue.inference;
    } }, input, { signal: invocation.signal, beforeDispatch: () => invocation.beforeEffect(), pluginId: invocation.plugin?.plugin_id });
  });
  const inference = inferenceClient(initialize, () => prologue);
  const createBuilderAgent: AgentHostComposition["createBuilderAgent"] = async input => { await initialize(); if (!prologue) throw hostErrors.builder_unavailable("Prologue 构建服务未装配"); return prologue.createBuilderAgent(input); };
  const restoreExternalMcp = (reference: LocalHostProjectReference) => disposed ? Promise.resolve()
    : externalMcp.restore(reference, async runtimeId => { await initialize(); return agentHost.adapter(runtimeId).mcpLibrary; });
  const decideSurfaceSite = (decision: { scope: string; decision: "allow" | "block" | "forget" }) => {
    // A block also withdraws any standing approval there; the driver refuses the site from now on.
    prologue?.surfaces?.decide(decision.decision === "block" ? { scope: decision.scope, decision: "forget" } : decision);
  };
  const refreshExternalMcp = async (owner: AgentSkillOwner) => {
    if (!options.projectReference) throw hostErrors.project_connection_unavailable("项目连接目录尚未装配");
    const reference = await options.projectReference(owner.project_id); await initialize();
    if (prologue?.mcpLibrary) await externalMcp.refresh(reference, "prologue", prologue.mcpLibrary, owner);
  };
  return { preparePlugin: (caller, subject) => preparePluginAgent(options, caller, subject), charactersCatalog: runtime => charactersCatalog(options, agentHost, initialize, runtime), agentHost, inference, savedHistory:{async read(id,owner,authorize){authorize();await initialize();authorize();if(!prologue)throw new Error("会话历史服务尚未装配");return prologue.savedHistory.read(id,owner,authorize);}},  createBuilderAgent, restoreExternalMcp, refreshExternalMcp, decideSurfaceSite, mcpLibrary: async () => { await initialize(); return prologue?.mcpLibrary; }, get ready() { return initialize(); }, started, dispose() {
    if (disposal) return disposal;
    disposed = true;
    unregister();
    unregisterGit();
    unregisterDraft();
    unregisterWriters();
    externalMcp.close();
    return disposal = (async () => {
      await ready?.catch(() => undefined);
      await initialization?.close();
    })().catch(error => { disposal = undefined; throw error; });
  } };
}

/** The built-in Agent's engines, and the actions its rounds may be given in this project, as Characters reads them. */
function charactersCatalog(options: AgentHostCompositionOptions, agentHost: AgentHost, initialize: () => Promise<void>, runtime: MolisWorkProjectRuntime) {
  return {
    listRuntimes: async () => { await initialize(); return agentHost.descriptors(); },
    listActions: async (runtimeId: string) => {
      await initialize();
      const authority = await startAuthority(runtime, CHARACTER_PLUGIN_ID, options);
      return authority.actions ? (await authority.actions(runtimeId)).discover() : [];
    },
  };
}

/** Where the runtime keeps the person's after-write checkers; the call that asks has started it. */
function keptWriteCheckers(prologue: { writeCheckers: AgentWriteCheckerStore } | undefined): AgentWriteCheckerStore {
  if (!prologue) throw hostErrors.agent_runtime_unavailable("Agent 运行时没有启动，读不到写后检查器");
  return prologue.writeCheckers;
}

/**
 * What one Plugin is allowed to start, resolved from its own declarations.
 *
 * A Plugin that declares no Agent gets an authority with no roles, so every
 * start attempt fails the first gate. A project with no workspace bound gets no
 * authorized directory, so it fails the third — both are true answers, and
 * neither invents a fallback.
 */
/** The project's authorized workspaces, from the list when the Host keeps one, else the single one. */
async function workspaceGrants(options: Pick<AgentHostCompositionOptions, "workspacesFor" | "workspaceFor">, projectId: string): Promise<readonly ProjectWorkspaceRef[]> {
  return options.workspacesFor ? await options.workspacesFor(projectId) : [await options.workspaceFor(projectId)].filter((item): item is ProjectWorkspaceRef => item !== null);
}

/**
 * Where a round may run in this project now (specs/shared-sources-and-surfaces §3, SSC-15): the output, verified, and the Host's own
 * worktrees of it. An input folder is read, never run in: it is named only so a request for it is refused as input-only.
 */
async function runPlaces(options: Pick<AgentHostCompositionOptions, "workspaceFor" | "directoriesFor">, projectId: string) {
  const found = await options.workspaceFor(projectId), output = found?.realpath_verified ? found : null;
  const listed = output && options.directoriesFor ? await options.directoriesFor(projectId) : undefined;
  const directories = output && listed ? { revision: listed.revision, output: { workspace_id: output.workspace_id, canonical_path: output.canonical_path },
    inputs: listed.directories.filter(row => row.roles.includes("input")).map(row => ({ workspace_id: row.workspace_id, canonical_path: row.canonical_path })) } : undefined;
  return { output, directories, worktrees: (): Promise<readonly AgentHostWorktree[]> => output ? hostWorktrees(output.canonical_path) : Promise.resolve([]) };
}

/** The worktrees the Host made of this output, as Git reports them now; reading them runs Git, so only when a round needs one. */
async function hostWorktrees(outputPath: string): Promise<readonly AgentHostWorktree[]> {
  try {
    return (await createGitWorktreePort(outputPath).inspect()).owned.map(tree => ({ worktree_id: tree.worktree_id, canonical_path: path.resolve(outputPath, tree.directory) }));
  } catch { return []; } // Not a repository, or Git cannot be run: none of its directories is a worktree the Host made.
}

async function preparePluginAgent(options: AgentHostCompositionOptions, caller: HostPluginCaller, subject?: string) {
  caller.assertActive();
  if (!caller.project_id || !options.projectReference) throw new ActionError("actions.connection_required", "Agent 需要项目连接目录");
  const reference = await options.projectReference(caller.project_id);
  caller.assertActive();
  const authority = await options.localHost.withProject(reference, runtime =>
    startAuthority(runtime, caller.plugin_id, options, caller, subject));
  const workspaces = await workspaceGrants(options, caller.project_id), output = await options.workspaceFor(caller.project_id);
  caller.assertActive();
  return { authority, workspaces, output };
}

/** The language of the plugin action this round starts in, read only for that installation's own running call (as `currentOriginalInput`). */
function currentCallLocale(caller: HostPluginCaller | undefined) {
  const invocation = currentPluginInvocation();
  return invocation && "definition" in invocation && invocation.install_id === caller?.install_id ? invocation.caller.locale : undefined;
}

function currentOriginalInput(caller: HostPluginCaller | undefined) {
  const invocation = currentPluginInvocation();
  return invocation && "definition" in invocation && invocation.install_id === caller?.install_id
    && invocation.caller.original_input?.install_id === caller.install_id
    && invocation.definition.capability_id === invocation.caller.original_input.action.capability_id
    && invocation.definition.version === invocation.caller.original_input.action.version
    ? structuredClone(invocation.caller.original_input) : undefined;
}

async function startAuthority(
  runtime: MolisWorkProjectRuntime,
  pluginId: string,
  options: AgentHostCompositionOptions,
  caller?: HostPluginCaller,
  subject?: string,
): Promise<AgentStartAuthority> {
  const { localHost, homeDirectory } = options;
  const locale = currentCallLocale(caller) ?? modelRoundLocale(homeDirectory);
  // A plugin's Agent declarations come only from its running activation (PG-051 RAC-195). A call without one (the Characters host
  // listing actions) gets none: it lists what it may call, and a run of a plugin role finds no role and is refused.
  const declared = caller ? { manifest: caller.declaration.manifest.agent, prompts: caller.declaration.agent_prompts, skills: caller.declaration.agent_skills } : undefined;
  const manifest = caller?.declaration.manifest ?? PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === pluginId)?.manifest;
  const consumesCharacters = manifest?.artifacts?.consumes?.some(type => type.artifact_type_id === CHARACTER_ARTIFACT_TYPE && type.schema_version === /* @version type.character.definition */ 1);
  const original = currentOriginalInput(caller);
  const places = await runPlaces(options, runtime.project_id);
  const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
  const record = caller ? pluginInstallRecords(runtime.store.db).get(caller.install_id) ?? localHost.homePlugins?.installation(caller.install_id) ?? null : null;
  const named = currentNamedSkills(caller);
  // The round's number: the call that starts it (agent.run.start), else a new one. The Runtime calls its tools later, in its own loop,
  // outside that call, so the number goes into every tool call's context instead of being read from the scope.
  const callId = currentCallId() ?? newCallId();
  return {
    call_id: callId,
    reply_language: replyLanguage(locale),
    ...(original ? { original_input: original } : {}),
    manifest: declared?.manifest ?? { roles: [], prompts: [] },
    // A round works in the output or one of the Host's worktrees of it, never in an input folder (SSC-15).
    authorizedDirectories: places.output ? [places.output.canonical_path] : [],
    ...(places.directories ? { directories: places.directories } : {}),
    worktrees: places.worktrees,
    // Called by agent-host once a start in the output was checked, never by listing: a default output directory is made only to be used.
    ...(places.output && options.prepareDirectory ? { prepareOutput: async () => { await options.prepareDirectory!(runtime.project_id, places.output!.workspace_id, "write"); } } : {}),
    prompts: declared?.prompts ?? [],
    skills: declared?.skills ?? [],
    // A round reads the shared catalog as the plugin that starts it, with its own grants (§3.1); only the Skills the Host's own delegation
    // named are read as the person who named them. The named list is the one the Host bound to this call, never anything in its input.
    ...(caller && record ? { skill_source: ownSkillSource(record), skillCatalog: roundSkillCatalog({ client: localHost.actionClient(reference),
      plugin: { actor_id: caller.actor_id, actor_kind: "user", project_id: runtime.project_id, audience: "plugin", permissions: [...record.grants],
        host_plugin: caller, plugin_install_id: caller.install_id, call_id: callId, locale },
      ...(named?.named.from === "host" ? { delegated: { refs: named.named.refs, person: { actor_id: named.person.actor_id, actor_kind: "user" as const,
        project_id: runtime.project_id, audience: "user" as const, permissions: [SKILLS_READ_PERMISSION], call_id: callId, locale } } } : {}),
      named: named?.named.refs ?? [] }) } : {}),
    mcp_owner: { project_id: runtime.project_id, plugin_id: pluginId },
    actions: async (runtimeId, validate, session, skillRound) => {
      // `actor_id` stays the grant's client id: `agent:<runtime>`, or the task grant subject the Host composed for a plugin's round, whose
      // catalog holds only the categories its provider offers a task now. The session is the one the Host checked against the Runtime's own
      // record when it started the round, never one read from the request or the tool input: it scopes what the tools write and who is
      // recorded as author (`agent:<runtime>:<session>`, a task's round as well).
      const source = subject ? taskReadableHost(localHost) : localHost;
      // `skill_round` is the Host's word about this round (§2.3): the grant resolution gets it, so the round's own reads of `system.skills` need
      // no separate 对外接入 grant (mcp-action-grants.ts), and the handler context gets it only on those calls. A tool call into any other
      // plugin's action never carries it, and nothing in the tool input can set it (S-skill-delegation §2.6).
      const current = async (signal?: AbortSignal, action?: ExactActionReference) => {
        const authorized = await authorizeMcpActions(source, { actor_id: subject ?? `agent:${runtimeId}`, actor_kind: "runtime", call_id: callId,
          project_id: runtime.project_id, audience: "agent", permissions: [], locale, ...(skillRound ? { skill_round: structuredClone(skillRound) } : {}),
          ...(session ? { runtime_session_id: session.session_id, audit_actor_id: `agent:${runtimeId}:${session.session_id}` } : {}), ...(signal ? { signal } : {}) }, homeDirectory, reference, async () => { caller?.assertActive(); await validate?.(); caller?.assertActive(); }, () => {
            caller?.assertActive(); signal?.throwIfAborted();
            if (localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
          });
        return { ...authorized, context: action?.provider_id === SKILLS_PROVIDER_ID ? authorized.context : withoutSkillRound(authorized.context) };
      };
      return {
        discover: async () => { const authorized = await current(); return authorized.service.discover(authorized.context); },
        invoke: async (action, input, signal) => { const authorized = await current(signal, action); return authorized.service.invoke(authorized.context, action, input); },
        check: async (action, input) => checkActionInput(await current(), action, input),
      };
    },
    ...(consumesCharacters ? { resolveCharacter: (reference, actorId) => freezeProjectCharacter(homeDirectory, actorId, runtime.project_id, runtime.artifacts.query, reference) } : {}),
    project_prompts: await projectPrompts(runtime, localHost),
    // The platform memory under the Agent work switch: the person's and this project's, where they apply.
    memory: (task, context) => memoryForAgentRun(localHost, { project_id: runtime.project_id, task, plugin_id: pluginId, ...(context?.character ? { character: context.character } : {}),
      used_for: `${manifest?.name ?? pluginId} · ${task.replace(/\s+/g, " ").trim().slice(0, 40)}` }),
  };
}

/** An input checked as dispatch will check it, against the action as this grant discovers it now; runs nothing. */
async function checkActionInput(authorized: { context: ActionCallContext; service: { discover(context: ActionCallContext): readonly ActionView[] | Promise<readonly ActionView[]> } }, reference: ExactActionReference, input: unknown): Promise<void> {
  const view = (await authorized.service.discover(authorized.context)).find(row => row.capability_id === reference.capability_id && row.version === reference.version && row.provider.provider_id === reference.provider_id);
  if (!view) throw new ActionError("actions.missing", "The original Agent action is no longer accessible");
  assertActionInput(view.action.input_schema, input);
}

/** The round's `skill_round` stays on the Host's own `system.skills` calls: no other action's handler sees it (§2.6, S-skill-delegation). */
function withoutSkillRound(context: ActionCallContext): ActionCallContext {
  if (context.skill_round === undefined) return context;
  const rest = { ...context };
  delete rest.skill_round;
  return rest;
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
  let view: ProjectGuidanceFacts;
  try {
    const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
    view = await readProjectGuidance(localHost.actionClient(reference), reference);
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

/** The catalog query that answers "which directory is this project bound to": its directories, with their roles. */
export interface WorkspaceLookupPorts {
  projectDirectories(projectId: string): { directories: readonly (ProjectWorkspaceRef & { roles: readonly string[] })[] };
}

/**
 * The project's output directory: where what names no folder reads, writes and runs (specs/shared-sources-and-surfaces §3, SSC-17).
 * Every registered project has exactly one; a project in the recycle bin lists none, and gets null.
 */
export function workspaceRefFor(
  ports: WorkspaceLookupPorts,
  projectId: string,
): ProjectWorkspaceRef | null {
  const output = ports.projectDirectories(projectId).directories.find(entry => entry.roles.includes("output"));
  return output ? { workspace_id: output.workspace_id, canonical_path: output.canonical_path, realpath_verified: output.realpath_verified, display_name: output.display_name } : null;
}

function inferenceClient(initialize: () => Promise<void>, current: () => Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined): PrologueInferenceClient {
  const get = async () => { await initialize(); const adapter = current(); if (!adapter) throw hostErrors.inference_unavailable("Prologue 推理服务未装配"); return adapter.inference; };
  return {
    completeText: async input => (await get()).completeText(input),
    completeTextResult: async input => (await get()).completeTextResult(input),
    generateImages: async input => (await get()).generateImages(input),
    evaluateTypeSafe: async input => (await get()).evaluateTypeSafe(input),
  };
}

/**
 * A round's directory is still where it may run: the output, or one of the Host's worktrees of it (SSC-15); a prepared connection proves its
 * own narrow, durable read grant. A worktree's after-write checkers are its output's: it is a checkout of the same repository.
 */
function hostConditionChecks(options: AgentHostCompositionOptions): NonNullable<PrologueNodeAdapterOptions["checks"]> {
  const home = options.homeDirectory ?? resolveConfiguredHome();
  const runsIn = async (project: string, directory: string) => {
    const places = await runPlaces(options, project);
    if (!places.output) return undefined;
    return places.output.canonical_path === directory || (await places.worktrees()).some(tree => tree.canonical_path === directory) ? places.output.workspace_id : undefined;
  };
  return { directoryAuthorized: async (project, directory) => await runsIn(project, directory) !== undefined,
    workspaceAt: runsIn,
    owned: assistantConnectionCheckers(home, options.localHost), workAuthority: workAuthorityCheck(options.localHost) };
}
