import { currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import type { PrologueInferenceClient } from "@molis-ai/molis-work-service-agent-host";
import { pdfDocumentParser } from "./pdf-document-parser.js";
import { hostErrors } from "./host-errors.js";
import type { HostPluginCaller, LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createExternalMcpDirectory } from "./external-mcp-actions.js";
import { authorizeMcpActions } from "./mcp-action-client.js";
import { assertActionInput, currentCallId, newCallId } from "@molis-ai/molis-work-kernel";
import {
  AgentHost,
  createPrologueNodeAdapter,
  registerAgentHostCapabilities,
  type AgentStartAuthority,
  type PrologueNodeAdapterOptions,
  type AgentPromptResolver,
} from "@molis-ai/molis-work-service-agent-host";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { freezeProjectCharacter } from "./characters-host.js";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readProjectGuidance } from "./goals-actions.js";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { ActionError, type ActionCallContext, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { registerWorkspaceGitActions } from "./workspace-git-actions.js";
import { registerWorkspaceGitWriters } from "./workspace-git-writers.js";
import { draftText } from "./model-draft.js";
import { agentHostCapabilities, type AgentMcpLibrary, type AgentRuntimeDescriptor, type AgentSkillOwner, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import { resolveConfiguredHome } from "./product-home.js";
import { memoryForAgentRun } from "./memory/memory-host.js";
import { assistantConnectionCheckers } from "./assistant/assistant-connection-authority.js";
import { workAuthorityCheck } from "./agent-work-authority.js";

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
  /** Called only inside the approved worktree-creation Effect. */
  authorizeWriterDirectory?(projectId: string, canonicalPath: string): Promise<void>;
  localHost: MolisWorkLocalHost;
  homeDirectory?: string;
  projectReference?(projectId: string): Promise<LocalHostProjectReference>;
  /** Resolves the workspace a project is bound to, for directory authority. */
  workspacesFor?(projectId: string): readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor(projectId: string): ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** The owning server supplies storage and credential access for this Home. */
  prologue?: Omit<PrologueNodeAdapterOptions, "app">;
}

export interface AgentHostComposition {
  /** Resolves only this live installation's declarations and the project's verified workspaces. */
  preparePlugin(caller: HostPluginCaller): Promise<{ authority: AgentStartAuthority; workspaces: readonly ProjectWorkspaceRef[] }>;
  readonly inference: PrologueInferenceClient;
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
      authority: (runtime, pluginId, caller) => startAuthority(runtime, pluginId, options.workspaceFor, options.localHost, options.workspacesFor, options.homeDirectory, caller),
      projectId: (runtime) => runtime.project_id,
      mcpChanged: (runtime, runtimeId, library, owner, check) => externalMcp.sync(runtime, runtimeId, library, owner, check),
      writeCheckers: async (runtime) => ({ workspaces: await workspaceGrants(options, runtime.project_id), store: keptWriteCheckers(prologue) }),
    },
  );
  const unregisterGit = registerWorkspaceGitActions({ localHost: options.localHost, homeDirectory: options.homeDirectory ?? resolveConfiguredHome(),
    gitReviews: async () => { await initialize(); return prologue?.gitReviews; }, reviews: async () => { await initialize(); return agentHost.reviews; },
    workspaces: projectId => workspaceGrants(options, projectId) });
  const unregisterWriters = registerWorkspaceGitWriters({ localHost: options.localHost, authorizeWriterDirectory: options.authorizeWriterDirectory,
    runtime: async () => { await initialize(); return prologue; }, workspaces: projectId => workspaceGrants(options, projectId) });
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
  return { preparePlugin: caller => preparePluginAgent(options, caller), charactersCatalog: runtime => charactersCatalog(options, agentHost, initialize, runtime), agentHost, inference, createBuilderAgent, restoreExternalMcp, refreshExternalMcp, decideSurfaceSite, mcpLibrary: async () => { await initialize(); return prologue?.mcpLibrary; }, get ready() { return initialize(); }, started, dispose() {
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
      const authority = await startAuthority(runtime, CHARACTER_PLUGIN_ID, options.workspaceFor, options.localHost, options.workspacesFor, options.homeDirectory);
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

async function preparePluginAgent(options: AgentHostCompositionOptions, caller: HostPluginCaller) {
  caller.assertActive();
  if (!caller.project_id || !options.projectReference) throw new ActionError("actions.connection_required", "Agent 需要项目连接目录");
  const reference = await options.projectReference(caller.project_id);
  caller.assertActive();
  const authority = await options.localHost.withProject(reference, runtime =>
    startAuthority(runtime, caller.plugin_id, options.workspaceFor, options.localHost, options.workspacesFor, options.homeDirectory, caller));
  const workspaces = await workspaceGrants(options, caller.project_id);
  caller.assertActive();
  return { authority, workspaces };
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
  workspaceFor: AgentHostCompositionOptions["workspaceFor"],
  localHost: MolisWorkLocalHost,
  workspacesFor?: AgentHostCompositionOptions["workspacesFor"],
  homeDirectory?: string,
  caller?: HostPluginCaller,
): Promise<AgentStartAuthority> {
  // A plugin's Agent declarations come only from its running activation (PG-051 RAC-195). A call without one (the Characters host
  // listing actions) gets none: it lists what it may call, and a run of a plugin role finds no role and is refused.
  const declared = caller ? { manifest: caller.declaration.manifest.agent, prompts: caller.declaration.agent_prompts, skills: caller.declaration.agent_skills } : undefined;
  const manifest = caller?.declaration.manifest ?? PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === pluginId)?.manifest;
  const consumesCharacters = manifest?.artifacts?.consumes?.some(type => type.artifact_type_id === CHARACTER_ARTIFACT_TYPE && type.schema_version === 1);
  const original = currentOriginalInput(caller);
  const workspace = await workspaceFor(runtime.project_id);
  const workspaces = workspacesFor ? await workspacesFor(runtime.project_id) : workspace ? [workspace] : [];
  // The round's number: the call that starts it (agent.run.start), else a new one. The Runtime calls its tools later, in its own loop,
  // outside that call, so the number goes into every tool call's context instead of being read from the scope.
  const callId = currentCallId() ?? newCallId();
  return {
    call_id: callId,
    ...(original ? { original_input: original } : {}),
    manifest: declared?.manifest ?? { roles: [], prompts: [] },
    authorizedDirectories: workspaces.filter(entry => entry.realpath_verified).map(entry => entry.canonical_path),
    prompts: declared?.prompts ?? [],
    skills: declared?.skills ?? [],
    method_owner: { project_id: runtime.project_id, plugin_id: pluginId },
    actions: async (runtimeId, validate, session) => {
      const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
      // `actor_id` stays the grant's client id (`agent:<runtime>`). The session is the one the Host checked against the Runtime's own record
      // when it started the round, never one read from the request or the tool input: it scopes what the tools write and who is recorded as author.
      const current = (signal?: AbortSignal) => authorizeMcpActions(localHost, { actor_id: `agent:${runtimeId}`, actor_kind: "runtime", call_id: callId,
        project_id: runtime.project_id, audience: "agent", permissions: [], ...(session ? { runtime_session_id: session.session_id, audit_actor_id: `agent:${runtimeId}:${session.session_id}` } : {}), ...(signal ? { signal } : {}) }, homeDirectory, reference, async () => { caller?.assertActive(); await validate?.(); caller?.assertActive(); }, () => {
          caller?.assertActive(); signal?.throwIfAborted();
          if (localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
        });
      return {
        discover: async () => { const authorized = await current(); return authorized.service.discover(authorized.context); },
        invoke: async (action, input, signal) => { const authorized = await current(signal); return authorized.service.invoke(authorized.context, action, input); },
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
    const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
    view = await readProjectGuidance(localHost.actionClient(reference, false), reference);
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

function inferenceClient(initialize: () => Promise<void>, current: () => Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined): PrologueInferenceClient {
  const get = async () => { await initialize(); const adapter = current(); if (!adapter) throw hostErrors.inference_unavailable("Prologue 推理服务未装配"); return adapter.inference; };
  return {
    completeText: async input => (await get()).completeText(input),
    completeTextResult: async input => (await get()).completeTextResult(input),
    generateImages: async input => (await get()).generateImages(input),
    evaluateTypeSafe: async input => (await get()).evaluateTypeSafe(input),
  };
}

/** A file keeps its project directory grant; a prepared connection proves its own narrow, durable read grant. */
function hostConditionChecks(options: AgentHostCompositionOptions): NonNullable<PrologueNodeAdapterOptions["checks"]> {
  const home = options.homeDirectory ?? resolveConfiguredHome();
  return { directoryAuthorized: async (project, directory) => (await workspaceGrants(options, project)).some(entry => entry.realpath_verified && entry.canonical_path === directory),
    workspaceAt: async (project, directory) => (await workspaceGrants(options, project)).find(entry => entry.realpath_verified && entry.canonical_path === directory)?.workspace_id,
    owned: assistantConnectionCheckers(home, options.localHost), workAuthority: workAuthorityCheck(options.localHost) };
}
