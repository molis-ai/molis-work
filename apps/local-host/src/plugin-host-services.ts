import { pluginInteraction } from "./plugin-interaction.js";
import { pluginNotificationsFor } from "./plugin-notification-service.js";
import { pluginInstallationsFor } from "./plugin-installation-directory.js";
import { pluginAgentsFor } from "./plugin-agent-service.js";
import { pluginSchedulerFor } from "./plugin-scheduler-service.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { pluginPageActions } from "./plugin-page-actions.js";
import {
  ActionError, requireSynchronous, type ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDatabase, PluginDefinition, PluginManifest, PluginModelClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import {
  assertPluginActionCurrent,
  assertCapturedPluginActionCurrent,
  createPluginCapabilityClient,
  createPluginInputsClient,
  createPluginOutputsClient,
  currentPluginInvocation,
  inPluginInstance,
  markPluginActionChecked,
  pluginInvocationReadOnly,
  type PluginCapabilityPort,
  type PluginInstance,
  type StoppedServiceCalls,
} from "@molis-ai/molis-work-plugin-runtime";
import { createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { heldPermissions, issuePluginCaller } from "./plugin-callers.js";
import { openPluginDatabase } from "./plugin-database.js";
import { openPluginFiles } from "./plugin-files.js";
import { openPluginProjectLibrary } from "./plugin-project-library.js";
import type { PluginHostExecutorOptions } from "./plugin-executor.js";
import { registerPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";
import { pluginMaterialsFor } from "./plugin-materials-service.js";
import { pluginConnectionsFor } from "./plugin-connections-service.js";
import { pluginBackgroundFor } from "./plugin-background-service.js";
import { DIRECTORY_READ_PERMISSION, directoryForHome, type DirectoryGrantService } from "./plugin-directory-service.js";
import { servicesUntilStopped } from "./plugin-stopped-services.js";
import { refuseUngivenSandboxServices } from "./plugin-sandbox-start.js";

/** What the executor keeps of one started Plugin until it stops. */
export interface HostSession {
  readonly context: PluginStartContext;
  /** Runs the Plugin's `start()`: until it settles, the activation may keep its jobs outside every action (PG-038). */
  starting<T>(run: () => T): T;
  revoke(): void;
  dispose(): void;
}

type ArtifactService = ReturnType<typeof createPluginArtifactClient>;
type PluginUi = ReturnType<typeof createPluginUiClient>;

/**
 * Everything the Host hands one Plugin when it starts: the identity it runs under and the services its Manifest declared.
 * The executor passes its options as they are at that moment (`attach` may have added the coordination services), and
 * keeps the session for the Plugin's `stop`. Once the session is disposed, what the Plugin's code left running calls on those
 * services does nothing and is counted in `stoppedCalls` (BL-411, `servicesUntilStopped`).
 */
export function openHostSession(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext,
  stoppedCalls: StoppedServiceCalls): HostSession {
  let active = true, stopped = false;
  const ui = createPluginUiClient(options.ui, context, definition.manifest,
    { invalidate: () => options.invalidateView?.(context.plugin_id), active: () => active });
  let disposeArtifacts = () => {};
  let library: ReturnType<typeof openPluginDatabase> | undefined;
  let projectLibrary: ReturnType<typeof openPluginProjectLibrary> | undefined;
  let files: ReturnType<typeof openPluginFiles> | undefined;
  let background: ReturnType<typeof pluginBackgroundFor>, scheduler: ReturnType<typeof pluginSchedulerFor>, agents: ReturnType<typeof pluginAgentsFor>;
  let withdrawAgentDefinitions: (() => void) | undefined;
  let withdrawCaller: (() => void) | undefined, withdrawPages: (() => void) | undefined;
  let directory: ReturnType<DirectoryGrantService["connect"]> | undefined;
  const dispose = () => { active = false; stopped = true; withdrawPages?.(); directory?.dispose(); scheduler?.dispose(); agents?.dispose(); background?.close(); withdrawCaller?.(); disposeArtifacts(); library?.close(); projectLibrary?.close(); files?.close(); withdrawAgentDefinitions?.(); ui.dispose(); };
  const assertActive = () => { if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); };
  try {
    // Running in a sandbox is an install trust; what the package asks for that the sandbox is not given stops its start with a code (S-60).
    refuseUngivenSandboxServices(definition, context);
    const manifest = definition.manifest;
    const pluginCaller = hostPluginCaller(options, definition, context, assertActive);
    withdrawCaller = issuePluginCaller(pluginCaller, heldPermissions(manifest, context.grants));
    const providerId = options.providerFor?.(definition, context.install_id) ?? context.install_id;
    const artifactService = createPluginArtifactClient({ assertInput: assertActionInput, api: options.artifacts, process: options.processItems, manifest, context, actions: options.actions, plugin_caller: pluginCaller,
      project_id: options.project_id, actor_id: options.actor_id, assertCallerCurrent: () => assertPluginActionCurrent(context),
      // A version pinned inside one of this installation's actions is the caller's (an Agent, a workflow, an MCP client, the person).
      author: () => { const scope = currentPluginInvocation(); return inPluginInstance(scope, context) ? scope!.caller.actor_id : undefined; } });
    disposeArtifacts = artifactService.dispose;
    library = openDeclaredLibrary(options, definition, context, assertActive);
    projectLibrary = openProjectTables(options, definition, context, assertActive);
    const fileDeclaration = options.filesFor?.(definition);
    if (fileDeclaration) {
      if (!options.home) throw new Error("私有文件服务需要 Home");
      files = openPluginFiles(options.home.directory, fileDeclaration, permission => { assertActive(); context.requireGrant(permission); }, context);
    }
    withdrawAgentDefinitions = registerPluginAgentDefinitions(options.home, definition, context.install_id);
    background = pluginBackgroundFor(definition, context, assertActive, { actor_id: options.actor_id, project_id: options.project_id,
      ...(options.record ? { record: () => options.record!(context.install_id) } : {}) });
    directory = options.home && manifest.permissions.some(item => item.permission === DIRECTORY_READ_PERMISSION)
      ? directoryForHome(options.home.directory).connect({ plugin_id: manifest.plugin_id, install_id: context.install_id, installation_generation: context.installation_generation, name: manifest.name,
        project_id: options.project_id, actor_id: options.actor_id, assertCurrent: () => { assertActive(); context.requireGrant(DIRECTORY_READ_PERMISSION); } }) : undefined;
    scheduler = pluginSchedulerFor(manifest, context, projectLibrary?.client, options.scheduler, assertActive, {
      client: options.actions.client, plugin_caller: pluginCaller, provider_id: providerId, record: () => options.record?.(context.install_id) ?? null });
    agents = pluginAgentsFor(options.home, manifest, context, pluginCaller, () => options.record?.(context.install_id) ?? null);
    const hosted = hostedContext(options, manifest, context, { pluginCaller, providerId, artifactService, ui, assertActive, isActive: () => active,
      scheduler: scheduler?.client, agents: agents?.client,
      database: library?.client, project_database: projectLibrary?.client, project_statements: definition.execution === "sandbox" ? projectLibrary?.statements : undefined, files: files?.client, model: pluginModelFor(options.home, definition, context, assertActive),
      materials: pluginMaterialsFor(options.home, definition, context, assertActive, options.project_id), connections: pluginConnectionsFor(options.home, definition, context, assertActive),
      background: background?.client, directory: directory?.client });
    withdrawPages = options.home ? pluginPagesFor(options.home.directory).connect({ manifest, install_id: context.install_id, project_id: options.project_id, actor_id: options.actor_id,
      invoke: pluginPageActions(manifest, context, { client: options.actions.client, actions: hosted.services?.actions, caller: pluginCaller, provider: providerId }),
      assertCurrent: permission => { assertActive(); if (permission) context.requireGrant(permission); } }) : undefined;
    return { context: servicesUntilStopped(hosted, () => stopped, stoppedCalls), starting: run => background ? background.starting(run) : run(),
      revoke: () => { active = false; withdrawPages?.(); directory?.dispose(); scheduler?.dispose(); agents?.dispose(); background?.close(); withdrawCaller?.(); }, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * The plugin's library in the Home, when the Host's start list declared one for this definition. It is the one service the
 * Home-level instances have (`openPluginDatabase`), opened here for the length of the run: every call asks again whether this
 * instance is still the running one and still holds the grants, so a stopped, disabled, uninstalled or revoked plugin writes
 * nothing, its own `stop` hook included.
 */
function openDeclaredLibrary(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext, assertActive: () => void) {
  const declaration = options.databaseFor?.(definition);
  if (declaration === undefined) return undefined;
  if (!options.home) throw new Error(`插件 ${definition.manifest.plugin_id} 声明了 Home 库，但这个插件平台没有 Home`);
  return openPluginDatabase(options.home.directory, declaration, permission => { assertActive(); context.requireGrant(permission); }, context);
}

/**
 * The plugin's own tables in the project's library, when its Manifest declares them (`databases.project`). Unlike a library in
 * the Home, the declaration is the plugin's own: the platform makes the tables and checks them against the ledger when the
 * plugin starts, and checks every statement against them after. Every call follows the same rules as a library in the Home.
 */
function openProjectTables(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext, assertActive: () => void) {
  if (!definition.manifest.databases?.project) return undefined;
  if (!options.projectLibrary) throw new Error(`插件 ${definition.manifest.plugin_id} 声明了项目库，但这个插件平台没有项目库`);
  return openPluginProjectLibrary(options.projectLibrary, definition.manifest, permission => { assertActive(); context.requireGrant(permission); }, context);
}

function hostPluginCaller(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext, assertActive: () => void): HostPluginCaller {
  const manifest = definition.manifest;
  return Object.freeze({
    plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: options.actor_id,
    project_id: options.actions.project_id,
    declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }),
    assertActive: () => {
      assertActive();
      if (options.record && options.record(context.install_id)?.plugin_id !== manifest.plugin_id) throw new ActionError("actions.forbidden", "插件安装身份已变化");
    },
  });
}

interface SessionParts {
  readonly pluginCaller: HostPluginCaller;
  /** What the Plugin's actions are registered under (`PluginHostExecutorOptions.providerFor`). */
  readonly providerId: string;
  readonly artifactService: ArtifactService;
  readonly ui: PluginUi;
  readonly assertActive: () => void;
  readonly isActive: () => boolean;
  /** The library the Host's start list declared for this plugin, if any (`openDeclaredLibrary`). */
  readonly database: PluginDatabase | undefined;
  /** The plugin's own tables in the project's library, if its Manifest declares them (`openProjectTables`). */
  readonly project_database: import("@molis-ai/molis-work-contracts/platform/plugin").PluginProjectDatabase | undefined;
  /** The same tables for a plugin the Host runs outside its own process: its statements run in a process the Host can kill (`openProjectTables`). It gets this in place of `project_database`. */
  readonly project_statements: import("@molis-ai/molis-work-contracts/platform/plugin").PluginProjectStatements | undefined;
  readonly agents: import("@molis-ai/molis-work-contracts/platform/plugin").PluginAgentClient | undefined;
  readonly scheduler: import("@molis-ai/molis-work-contracts/platform/plugin").PluginScheduleClient | undefined;
  readonly files: import("@molis-ai/molis-work-contracts/platform/plugin").PluginFilesClient | undefined;
  /** The Host's text model, when the Manifest declares `model:read` or `model:invoke` and the Host runs the plugin itself (`pluginModelFor`); only `model:invoke` sends requests. */
  readonly model: PluginModelClient | undefined;
  readonly materials: ReturnType<typeof pluginMaterialsFor>;
  /** Requests through the accounts the person bound to the Manifest's slots, only when it declares `connections:use` (`pluginConnectionsFor`). */
  readonly connections: ReturnType<typeof pluginConnectionsFor>;
  readonly background: import("@molis-ai/molis-work-contracts/platform/plugin").PluginBackgroundClient | undefined;
  /** The person-authorized directory reader, only when the Manifest declares `directory:read`. */
  readonly directory: PluginDirectoryService | undefined;
}

/** The context the Plugin's `start` receives: its identity plus the services below. */
function hostedContext(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, parts: SessionParts): PluginStartContext {
  const { pluginCaller, providerId, artifactService, ui, assertActive } = parts;
  const actions = pluginHostActions(context, manifest, { ...options.actions, actor_id: options.actor_id, assertActive, pluginCaller, providerId });
  const wiring = options.wiring;
  return Object.freeze({ ...context,
    project_id: options.project_id,
    actor_id: options.actor_id,
    ...(wiring === undefined ? {} : { input_group: wiring.selectedGroup(manifest.plugin_id) }),
    services: Object.freeze({
      ...(actions ? { actions } : {}),
      notifications: pluginNotificationsFor(manifest, context, parts.project_database, options.projectLibrary?.db, options.project_id, assertActive, () => options.record?.(context.install_id) ?? null, options.installations),
      installations: pluginInstallationsFor(manifest, context, options.project_id, options.installations, assertActive),
      storage: manifest.permissions.some(item => item.permission === "storage:private")
        ? options.privateStorageFor(context, manifest) : undefined,
      artifacts: artifactService.client,
      ...((manifest.process_items?.produces ?? []).length > 0 ? { processItems: artifactService.process } : {}),
      ui: ui.client,
      interaction: pluginInteraction,
      ...(parts.database === undefined ? {} : { database: parts.database }),
      ...(parts.project_statements !== undefined ? { project_statements: parts.project_statements } : parts.project_database === undefined ? {} : { project_database: parts.project_database }),
      ...(parts.scheduler === undefined ? {} : { scheduler: parts.scheduler }),
      ...(parts.agents === undefined ? {} : { agents: parts.agents }),
      ...(parts.files === undefined ? {} : { files: parts.files }),
      ...(parts.model === undefined ? {} : { model: parts.model }),
      ...(parts.materials === undefined ? {} : { materials: parts.materials }),
      ...(parts.connections === undefined ? {} : { connections: parts.connections }),
      ...(parts.background === undefined ? {} : { background: parts.background }),
      ...(parts.directory === undefined ? {} : { directory: parts.directory }),
      ...coordinationServices(options, manifest, context, parts),
    }) });
}

// Each coordination service appears only when the Manifest declared it, so the Manifest stays a complete account of what
// this Plugin can reach.
function coordinationServices(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, parts: SessionParts) {
  const { pluginCaller, artifactService, isActive } = parts;
  const wiring = options.wiring;
  const declaresInputs = (manifest.ports?.inputs ?? []).length > 0;
  const declaresOutputs = (manifest.ports?.outputs ?? []).length > 0;
  const declaresEvents = (manifest.events?.publishes ?? []).length > 0;
  const declaresCapabilities = manifest.capabilities.consumes.length > 0;
  const wiringInput = wiring === undefined
    ? undefined
    : { manifest, install_id: context.install_id, installation_generation: context.installation_generation, graph: wiring, artifacts: artifactService.client, processItems: artifactService.process, scopeKey: options.scopeKey ?? null,
        requireGrant: (permission: string) => context.requireGrant(permission),
        latestVersion: (artifactId: string) => options.processItems.query.latestArtifactVersion(options.project_id, artifactId)?.version ?? 0 };
  return {
    ...(declaresEvents && options.events !== undefined
      ? { events: options.events.clientFor({
        project_id: options.project_id,
        plugin_id: manifest.plugin_id,
        install_id: context.install_id,
      }, pluginCaller.assertActive) }
      : {}),
    ...(declaresInputs && wiringInput !== undefined
      ? { inputs: createPluginInputsClient(wiringInput) }
      : {}),
    ...(declaresOutputs && wiringInput !== undefined
      ? { outputs: createPluginOutputsClient(wiringInput, pluginCaller.assertActive) }
      : {}),
    ...(declaresCapabilities && options.capabilities !== undefined
      ? { capabilities: createPluginCapabilityClient(manifest, withPluginCaller(pluginCaller, context, options.capabilities), isActive) }
      : {}),
  };
}

function withPluginCaller(caller: HostPluginCaller, instance: PluginInstance, port: PluginCapabilityPort): PluginCapabilityPort {
  return {
    ...(port.availability ? { availability: (capability: ActionReference, options?: Pick<HostCapabilityCallOptions, "consumer">) => port.availability!(capability, options) } : {}),
    invoke(capability, input, options) {
      const outer = currentPluginInvocation();
      caller.assertActive();
      assertCapturedPluginActionCurrent(outer, instance);
      const beforeEffect = options?.before_effect, current = options?.assert_authority_current, signal = options?.signal;
      const assertAuthorityCurrent = () => {
        caller.assertActive(); signal?.throwIfAborted();
        requireSynchronous(current?.(), "最终授权检查必须同步完成");
        assertCapturedPluginActionCurrent(outer, instance);
        signal?.throwIfAborted(); caller.assertActive();
      };
      const bound = { ...options, ...(pluginInvocationReadOnly(outer) ? { query_only: true as const } : {}), consumer: "plugin" as const, plugin_caller: caller, before_effect: async () => {
        caller.assertActive(); signal?.throwIfAborted(); await beforeEffect?.(); assertAuthorityCurrent();
      }, assert_authority_current: assertAuthorityCurrent };
      // The port knows no capability by name: a capability that depends on who is calling reads the trusted invocation itself.
      // A command it accepted passed every check of the call it was made in: from then on that call may keep a job (PG-038).
      return port.invoke(capability, input, bound).then(output => { if (capability.operation !== "query") markPluginActionChecked(outer); return output; });
    },
  };
}
