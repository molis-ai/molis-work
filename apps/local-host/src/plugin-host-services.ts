import {
  ActionError, requireSynchronous, type ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDatabase, PluginDefinition, PluginManifest, PluginModelClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import {
  createPluginCapabilityClient,
  createPluginInputsClient,
  createPluginOutputsClient,
  type PluginCapabilityPort,
} from "@molis-ai/molis-work-plugin-runtime";
import { createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { openPluginDatabase } from "./plugin-database.js";
import type { PluginHostExecutorOptions } from "./plugin-executor.js";
import { registerPluginInstructions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";

/** What the executor keeps of one started Plugin until it stops. */
export interface HostSession {
  readonly context: PluginStartContext;
  revoke(): void;
  dispose(): void;
}

type ArtifactService = ReturnType<typeof createPluginArtifactClient>;
type PluginUi = ReturnType<typeof createPluginUiClient>;

/**
 * Everything the Host hands one Plugin when it starts: the identity it runs under and the services its Manifest declared.
 * The executor passes its options as they are at that moment (`attach` may have added the coordination services), and
 * keeps the session for the Plugin's `stop`.
 */
export function openHostSession(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext): HostSession {
  const ui = createPluginUiClient(options.ui, context, definition.manifest);
  let active = true;
  let disposeArtifacts = () => {};
  let library: ReturnType<typeof openPluginDatabase> | undefined;
  let withdrawInstructions: (() => void) | undefined;
  let withdrawCaller: (() => void) | undefined;
  const dispose = () => { active = false; withdrawCaller?.(); disposeArtifacts(); library?.close(); withdrawInstructions?.(); ui.dispose(); };
  const assertActive = () => { if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); };
  try {
    const manifest = definition.manifest;
    const pluginCaller = hostPluginCaller(options, definition, context, assertActive);
    withdrawCaller = options.qualifyCaller?.(definition, pluginCaller);
    const providerId = options.providerFor?.(definition, context.install_id) ?? context.install_id;
    const artifactService = createPluginArtifactClient({ api: options.artifacts, process: options.processItems, manifest, context, actions: options.actions,
      project_id: options.project_id, actor_id: options.actor_id });
    disposeArtifacts = artifactService.dispose;
    library = openDeclaredLibrary(options, definition, context, assertActive);
    withdrawInstructions = registerPluginInstructions(options.home, definition, context.install_id);
    const hosted = hostedContext(options, manifest, context, { pluginCaller, providerId, artifactService, ui, assertActive, isActive: () => active,
      database: library?.client, model: pluginModelFor(options.home, definition, context, assertActive) });
    return { context: hosted, revoke: () => { active = false; withdrawCaller?.(); }, dispose };
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
  return openPluginDatabase(options.home.directory, declaration, permission => { assertActive(); context.requireGrant(permission); });
}

function hostPluginCaller(options: PluginHostExecutorOptions, definition: PluginDefinition, context: PluginStartContext, assertActive: () => void): HostPluginCaller {
  const manifest = definition.manifest;
  return Object.freeze({
    plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: options.actor_id,
    project_id: options.actions.project_id,
    declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }),
    assertActive,
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
  /** The Host's text model, when the Manifest declares `model:invoke` and the Host runs the plugin itself (`pluginModelFor`). */
  readonly model: PluginModelClient | undefined;
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
      storage: manifest.permissions.some(item => item.permission === "storage:private")
        ? options.privateStorageFor(context, manifest) : undefined,
      artifacts: artifactService.client,
      ...((manifest.process_items?.produces ?? []).length > 0 ? { processItems: artifactService.process } : {}),
      ui: ui.client,
      ...(parts.database === undefined ? {} : { database: parts.database }),
      ...(parts.model === undefined ? {} : { model: parts.model }),
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
    : { manifest, graph: wiring, artifacts: artifactService.client, processItems: artifactService.process, scopeKey: options.scopeKey ?? null,
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
      ? { outputs: createPluginOutputsClient(wiringInput) }
      : {}),
    ...(declaresCapabilities && options.capabilities !== undefined
      ? { capabilities: createPluginCapabilityClient(manifest, withPluginCaller(pluginCaller, options.capabilities), isActive) }
      : {}),
  };
}

function withPluginCaller(caller: HostPluginCaller, port: PluginCapabilityPort): PluginCapabilityPort {
  return {
    ...(port.availability ? { availability: (capability: ActionReference, options?: Pick<HostCapabilityCallOptions, "consumer">) => port.availability!(capability, options) } : {}),
    invoke(capability, input, options) {
      caller.assertActive();
      const beforeEffect = options?.before_effect, current = options?.assert_authority_current, signal = options?.signal;
      const assertAuthorityCurrent = () => {
        caller.assertActive(); signal?.throwIfAborted();
        requireSynchronous(current?.(), "最终授权检查必须同步完成");
        signal?.throwIfAborted(); caller.assertActive();
      };
      const bound = { ...options, consumer: "plugin" as const, plugin_caller: caller, before_effect: async () => {
        caller.assertActive(); signal?.throwIfAborted(); await beforeEffect?.(); assertAuthorityCurrent();
      }, assert_authority_current: assertAuthorityCurrent };
      // The port knows no capability by name: a capability that depends on who is calling reads the trusted invocation itself.
      return port.invoke(capability, input, bound);
    },
  };
}
