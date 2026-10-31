import { pluginInteraction } from "./plugin-interaction.js";
import { pluginNotificationsFor } from "./plugin-notification-service.js";
import { pluginInstallationsFor } from "./plugin-installation-directory.js";
import { pluginProjectsFor } from "./plugin-projects-service.js";
import { pluginAgentsFor } from "./plugin-agent-service.js";
import { pluginSchedulerFor } from "./plugin-scheduler-service.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { pluginPageActions } from "./plugin-page-actions.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { pluginErrors, type PluginDatabase, type PluginDefinition, type PluginManifest, type PluginModelClient, type PluginProjectDatabase, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { createPluginArtifactClient } from "@molis-ai/molis-work-module-artifacts";
import {
  assertPluginActionCurrent,
  createPluginInputsClient,
  createPluginOutputsClient,
  currentPluginInvocation,
  inPluginInstance,
  type StoppedServiceCalls,
} from "@molis-ai/molis-work-plugin-runtime";
import { createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { heldPermissions, issuePluginCaller } from "./plugin-callers.js";
import { openPluginDatabase } from "./plugin-database.js";
import { homeLibraryFor } from "./plugin-database-entries.js";
import { openInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import { openPluginProjectLibrary } from "./plugin-project-library.js";
import { pluginAttentionFor, pluginContextLedgerFor } from "./plugin-attention-service.js";
import { withArtifactJoin } from "./plugin-artifact-join.js";
import { pluginScenesFor } from "./plugin-scene-service.js";
import { pluginJudgmentsFor } from "./plugin-judgments-service.js";
import type { PluginHostExecutorOptions } from "./plugin-executor.js";
import { registerPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";
import { sandboxOwnerFilesFor } from "./plugin-sandbox-owner-files.js";
import { pluginMaterialsFor } from "./plugin-materials-service.js";
import { pluginConnectionsFor } from "./plugin-connections-service.js";
import { pluginSourcePullFor } from "./plugin-source-pull-service.js";
import { pluginBackgroundFor } from "./plugin-background-service.js";
import { DIRECTORY_READ_PERMISSION, directoryForHome, type DirectoryGrantService } from "./plugin-directory-service.js";
import { servicesUntilStopped } from "./plugin-stopped-services.js";
import { refuseUngivenSandboxServices } from "./plugin-sandbox-start.js";
import { pluginTerminalFor } from "./plugin-terminal-service.js";

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
  let background: ReturnType<typeof pluginBackgroundFor>, scheduler: ReturnType<typeof pluginSchedulerFor>, agents: ReturnType<typeof pluginAgentsFor>;
  let withdrawAgentDefinitions: (() => void) | undefined;
  let withdrawCaller: (() => void) | undefined, withdrawPages: (() => void) | undefined;
  let directory: ReturnType<DirectoryGrantService["connect"]> | undefined;
  let terminal: ReturnType<typeof pluginTerminalFor>;
  const dispose = () => { active = false; stopped = true; try { terminal?.dispose(); } finally { withdrawPages?.(); directory?.dispose(); scheduler?.dispose(); agents?.dispose(); background?.close(); withdrawCaller?.(); disposeArtifacts(); library?.close(); projectLibrary?.close(); withdrawAgentDefinitions?.(); ui.dispose(); } };
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
    const ownerFiles = sandboxOwnerFilesFor(options, definition, context, assertActive);
    withdrawAgentDefinitions = registerPluginAgentDefinitions(options.home, definition, context.install_id);
    background = pluginBackgroundFor(definition, context, assertActive, { actor_id: options.actor_id, project_id: options.project_id,
      ...(options.record ? { record: () => options.record!(context.install_id) } : {}) });
    directory = options.home && manifest.permissions.some(item => item.permission === DIRECTORY_READ_PERMISSION)
      ? directoryForHome(options.home.directory).connect({ plugin_id: manifest.plugin_id, install_id: context.install_id, installation_generation: context.installation_generation, name: manifest.name,
        project_id: options.project_id, actor_id: options.actor_id, assertCurrent: () => { assertActive(); context.requireGrant(DIRECTORY_READ_PERMISSION); } }) : undefined;
    scheduler = pluginSchedulerFor(manifest, context, projectLibrary?.client, options.scheduler, assertActive, {
      client: options.actions.client, plugin_caller: pluginCaller, provider_id: providerId, record: () => options.record?.(context.install_id) ?? null });
    agents = pluginAgentsFor(options.home, manifest, context, pluginCaller, () => options.record?.(context.install_id) ?? null);
    // A project instance has no owner files of its own: only a sandboxed package has them here, and the sandbox is refused the terminal at start.
    terminal = options.home ? pluginTerminalFor({ home: options.home.directory, manifest, context, ownerFiles: undefined, assertActive }) : undefined;
    const hosted = hostedContext(options, manifest, context, { pluginCaller, providerId, artifactService, ui, assertActive, isActive: () => active,
      scheduler: scheduler?.client, agents: agents?.client,
      database: library?.client, ownerFiles: ownerFiles?.client, project_database: projectLibrary?.client, project_statements: definition.execution === "sandbox" ? projectLibrary?.statements : undefined, model: pluginModelFor(options.home, definition, context, assertActive),
      materials: pluginMaterialsFor(options.home, definition, context, assertActive, options.project_id), connections: pluginConnectionsFor(options.home, definition, context, assertActive),
      sourcePull: pluginSourcePullFor(definition, context, assertActive, options.projectLibrary?.db,
        { ...(options.sourcePullFetch ? { fetch: options.sourcePullFetch } : {}), ...(options.sourcePullGit ? { git: options.sourcePullGit } : {}), ...(options.sourcePullIntegrations ? { integrations: options.sourcePullIntegrations } : {}), ...(options.home ? { home: options.home.directory } : {}) }),
      background: background?.client, directory: directory?.client, terminal: terminal?.client,
      projects: pluginProjectsFor(definition, context, options.home?.directory, assertActive, options.projects) });
    withdrawPages = options.home ? pluginPagesFor(options.home.directory).connect({ manifest, install_id: context.install_id, project_id: options.project_id, actor_id: options.actor_id,
      invoke: pluginPageActions(manifest, context, { client: options.actions.client, actions: hosted.services?.actions, caller: pluginCaller, provider: providerId }),
      assertCurrent: permission => { assertActive(); if (permission) context.requireGrant(permission); } }) : undefined;
    return { context: servicesUntilStopped(hosted, () => stopped, stoppedCalls), starting: run => background ? background.starting(run) : run(),
      revoke: () => { active = false; try { terminal?.dispose(); } finally { withdrawPages?.(); directory?.dispose(); scheduler?.dispose(); agents?.dispose(); background?.close(); withdrawCaller?.(); } }, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * The plugin's library in the Home, when its Manifest declares one and the Host's start list holds the definition. It is the one service the
 * Home-level instances have (`openPluginDatabase`), opened here for the length of the run: every call asks again whether this
 * instance is still the running one and still holds the grants, so a stopped, disabled, uninstalled or revoked plugin writes
 * nothing, its own `stop` hook included.
 */
function openDeclaredLibrary(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext, assertActive: () => void) {
  // A sandboxed package's library in the Home is the Home Runtime's (`openSandboxHomeLibrary`): a project's platform has no process to run its statements in.
  if (definition.execution === "sandbox" && definition.manifest.databases?.home) {
    throw pluginErrors.declaration_invalid(`沙箱插件 ${definition.manifest.plugin_id} 声明了 Home 库 ${definition.manifest.databases.home.store_name}，项目里运行的沙箱插件没有 Home 库，只有 Home Runtime 里的有`);
  }
  if (!options.home && options.dualInstance?.(definition)) return undefined;
  const library = homeLibraryFor(definition, options.databaseFor?.(definition), options.record?.(context.install_id) ?? null);
  if (library === undefined) return undefined;
  if (!options.home) throw new Error(`插件 ${definition.manifest.plugin_id} 声明了 Home 库，但这个插件平台没有 Home`);
  const { directory, stores } = options.home;
  const open = () => openPluginDatabase(directory, library.declaration, permission => { assertActive(); context.requireGrant(permission); }, context);
  return library.installed ? openInstalledPluginLibrary(directory, library.installed, library.declaration, stores, open) : open();
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

/** `services.attention` and `services.contextLedger` (PG-087, S9-0b): the project's Inbox entries and reference edges, joined to the plugin's own transaction. */
function projectServices(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext,
  database: PluginProjectDatabase | undefined, assertActive: () => void) {
  const ports = { project_id: options.project_id, actor_id: options.actor_id, connection: options.projectLibrary?.db, journal: options.projectLibrary?.journal?.writer };
  const record = () => options.record?.(context.install_id) ?? null;
  const attention = pluginAttentionFor(manifest, context, database, ports, assertActive, record);
  const contextLedger = pluginContextLedgerFor(manifest, context, database, ports, assertActive, record);
  return { ...(attention ? { attention } : {}), ...(contextLedger ? { contextLedger } : {}) };
}

/** `services.scenes` (PG-032 P1, S-89) and `services.judgments` (P2, S-90): the plugin's own consumption scenes and their judgment ledger, in the project the activation runs in. */
function sceneServices(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, assertActive: () => void) {
  const record = () => options.record?.(context.install_id) ?? null;
  const scenes = pluginScenesFor(manifest, context, { scenes: options.actions.scenes, project_id: options.project_id, assertActive, record });
  const judgments = options.home ? pluginJudgmentsFor(manifest, context, { home_directory: options.home.directory, project_id: options.project_id, assertActive, record }) : undefined;
  return { ...(scenes ? { scenes } : {}), ...(judgments ? { judgments } : {}) };
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
  /** A sandboxed plugin's declared files, in the project's directory (`sandboxOwnerFilesFor`, S-64); none for any other plugin. */
  readonly ownerFiles: import("@molis-ai/molis-work-contracts/platform/plugin").PluginOwnerFilesClient | undefined;
  /** The plugin's own tables in the project's library, if its Manifest declares them (`openProjectTables`). */
  readonly project_database: import("@molis-ai/molis-work-contracts/platform/plugin").PluginProjectDatabase | undefined;
  /** The same tables for a plugin the Host runs outside its own process: its statements run in a process the Host can kill (`openProjectTables`). It gets this in place of `project_database`. */
  readonly project_statements: import("@molis-ai/molis-work-contracts/platform/plugin").PluginProjectStatements | undefined;
  readonly agents: import("@molis-ai/molis-work-contracts/platform/plugin").PluginAgentClient | undefined;
  readonly scheduler: import("@molis-ai/molis-work-contracts/platform/plugin").PluginScheduleClient | undefined;
  /** The Host's text model, when the Manifest declares `model:read` or `model:invoke` and the Host runs the plugin itself (`pluginModelFor`); only `model:invoke` sends requests. */
  readonly model: PluginModelClient | undefined;
  readonly materials: ReturnType<typeof pluginMaterialsFor>;
  /** Requests through the accounts the person bound to the Manifest's slots, only when it declares `connections:use` (`pluginConnectionsFor`). */
  readonly connections: ReturnType<typeof pluginConnectionsFor>;
  /** Pulling public sources and reading evidence bodies and research libraries, only when the Manifest declares `sources:pull_feed`, `sources:pull_query`, `evidence:read` or `sources:read_repository` (`pluginSourcePullFor`). */
  readonly sourcePull: ReturnType<typeof pluginSourcePullFor>;
  readonly background: import("@molis-ai/molis-work-contracts/platform/plugin").PluginBackgroundClient | undefined;
  /** The person-authorized directory reader, only when the Manifest declares `directory:read`. */
  readonly directory: PluginDirectoryService | undefined;
  /** Interactive terminals started by the plugin's own user commands, only when the Manifest declares `terminal:run` (`pluginTerminalFor`, S-103). */
  readonly terminal: import("@molis-ai/molis-work-contracts/platform/plugin").PluginTerminalClient | undefined;
  /** Whether project ids the plugin holds still exist, only when the Manifest declares `projects:exist` (`pluginProjectsFor`, S-96). */
  readonly projects: import("@molis-ai/molis-work-contracts/platform/plugin").PluginProjectsClient | undefined;
}

/** The context the Plugin's `start` receives: its identity plus the services below. */
function hostedContext(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, parts: SessionParts): PluginStartContext {
  const { pluginCaller, providerId, artifactService, ui, assertActive } = parts;
  const actions = pluginHostActions(context, manifest, { ...options.actions, actor_id: options.actor_id, assertActive, pluginCaller, providerId,
    ...(options.dependencyCheck ? { dependencyCheck: options.dependencyCheck } : {}) });
  const wiring = options.wiring;
  return Object.freeze({ ...context,
    project_id: options.project_id,
    actor_id: options.actor_id,
    ...(wiring === undefined ? {} : { input_group: wiring.selectedGroup(manifest.plugin_id) }),
    services: Object.freeze({
      ...(actions ? { actions } : {}),
      notifications: pluginNotificationsFor(manifest, context, parts.project_database, options.projectLibrary?.db, options.project_id, assertActive, () => options.record?.(context.install_id) ?? null, options.installations),
      installations: pluginInstallationsFor(manifest, context, options.project_id, options.installations, assertActive),
      ...projectServices(options, manifest, context, parts.project_database, assertActive),
      ...sceneServices(options, manifest, context, assertActive),
      storage: manifest.permissions.some(item => item.permission === "storage:private")
        ? options.privateStorageFor(context, manifest) : undefined,
      artifacts: withArtifactJoin(artifactService.client, artifactService.writer, parts.project_database, context, options.project_id, assertActive,
        () => options.record?.(context.install_id) ?? null),
      ...((manifest.process_items?.produces ?? []).length > 0 ? { processItems: artifactService.process } : {}),
      ui: ui.client,
      interaction: pluginInteraction,
      ...(parts.database === undefined ? {} : { database: parts.database }),
      ...(parts.ownerFiles === undefined ? {} : { ownerFiles: parts.ownerFiles }),
      ...(parts.project_statements !== undefined ? { project_statements: parts.project_statements } : parts.project_database === undefined ? {} : { project_database: parts.project_database }),
      ...(parts.scheduler === undefined ? {} : { scheduler: parts.scheduler }),
      ...(parts.agents === undefined ? {} : { agents: parts.agents }),
      ...(parts.model === undefined ? {} : { model: parts.model }),
      ...(parts.materials === undefined ? {} : { materials: parts.materials }),
      ...(parts.connections === undefined ? {} : { connections: parts.connections }),
      ...(parts.sourcePull === undefined ? {} : { sourcePull: parts.sourcePull }),
      ...(parts.background === undefined ? {} : { background: parts.background }),
      ...(parts.directory === undefined ? {} : { directory: parts.directory }),
      ...(parts.terminal === undefined ? {} : { terminal: parts.terminal }),
      ...(parts.projects === undefined ? {} : { projects: parts.projects }),
      ...coordinationServices(options, manifest, context, parts),
    }) });
}

// Each coordination service appears only when the Manifest declared it, so the Manifest stays a complete account of what
// this Plugin can reach.
function coordinationServices(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, parts: SessionParts) {
  const { pluginCaller, artifactService } = parts;
  const wiring = options.wiring;
  const declaresInputs = (manifest.ports?.inputs ?? []).length > 0;
  const declaresOutputs = (manifest.ports?.outputs ?? []).length > 0;
  const declaresEvents = (manifest.events?.publishes ?? []).length > 0;
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
  };
}
