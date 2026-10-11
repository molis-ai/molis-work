import {
  ActionError, bindActionClient,
  type ActionCallContext, type ActionDefinition, type ActionReference, type BoundActionClient,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import {
  createPluginCapabilityClient,
  createPluginInputsClient,
  createPluginOutputsClient,
  type PluginCapabilityPort,
} from "@molis-ai/molis-work-plugin-runtime";
import { createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { HOST_PROVIDER_ID } from "./local-host.js";
import type { PluginHostExecutorOptions } from "./plugin-executor.js";

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
  const dispose = () => { active = false; disposeArtifacts(); ui.dispose(); };
  const assertActive = () => { if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); };
  try {
    const manifest = definition.manifest;
    const pluginCaller = hostPluginCaller(options, definition, context, assertActive);
    const artifactService = createPluginArtifactClient({ api: options.artifacts, process: options.processItems, manifest, context, actions: options.actions,
      project_id: options.project_id, actor_id: options.actor_id });
    disposeArtifacts = artifactService.dispose;
    const hosted = hostedContext(options, manifest, context, { pluginCaller, artifactService, ui, assertActive, isActive: () => active });
    return { context: hosted, revoke: () => { active = false; }, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
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

/**
 * The Plugin's own action client. What its own actions cannot work without (`required_actions`) is Host actions it also
 * lists under `capabilities.consumes`. The kernel checks those dependencies for the caller of each own action, so the caller
 * must be able to see them (`allowed_actions`); being seen is not being callable: the kernel asks `validate_authority`
 * only about the action that is invoked, and for the Plugin's own client that is always one of its own actions.
 *
 * The client exists when the Plugin has actions of its own or lists anything under `consumes`: a Plugin with no action
 * of its own still reaches a Host action it consumes. Without either there is nothing to call.
 */
function ownActionClient(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, assertActive: () => void,
  pluginCaller: HostPluginCaller): BoundActionClient | undefined {
  const consumed = new Set(manifest.capabilities.consumes);
  const required = (manifest.actions ?? []).flatMap(action => action.action.required_actions ?? [])
    .map(reference => ({ capability_id: reference.capability_id, version: reference.version, provider_id: reference.provider_id ?? HOST_PROVIDER_ID }));
  const sameAction = (left: ActionReference, right: ActionReference) => left.capability_id === right.capability_id && left.version === right.version;
  const actionCaller = (): ActionCallContext => {
    assertActive();
    return {
      actor_id: options.actor_id, project_id: options.actions.project_id,
      audience: "user", permissions: context.grants,
      allowed_actions: [...(manifest.actions ?? []).map(action => ({ ...action, provider_id: context.install_id })), ...required],
      validate_authority: reference => {
        assertActive();
        const action = manifest.actions?.find(item => sameAction(item, reference));
        if (!action) throw new ActionError("actions.forbidden", "插件未声明提供此动作");
        for (const permission of action.action.permissions) context.requireGrant(permission);
      },
    };
  };
  // An action of the Host (not of another Plugin) that the Manifest lists under `capabilities.consumes`. The Plugin
  // reaches it as the plugin audience, with its own grants and the exact action named, so the kernel applies what it
  // applies to every plugin: the audience the action is offered to, the permissions it needs, its availability and
  // its input schema.
  const dependencyCaller = (definition: ActionDefinition): ActionCallContext => {
    assertActive();
    return {
      actor_id: options.actor_id, project_id: options.actions.project_id, audience: "plugin", permissions: context.grants,
      host_plugin: pluginCaller, plugin_install_id: context.install_id,
      allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id: HOST_PROVIDER_ID }],
      validate_authority: () => {
        assertActive();
        for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
      },
    };
  };
  const ownActions = bindActionClient(options.actions.client, actionCaller);
  return !manifest.actions?.length && consumed.size === 0 ? undefined : {
    discover: async () => (await ownActions.discover()).filter(view => view.provider.provider_id === context.install_id),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      if ((manifest.actions ?? []).some(action => sameAction(action, definition))) return ownActions.invoke(definition, input);
      if (!consumed.has(definition.capability_id)) throw new ActionError("actions.forbidden", "插件没有声明消费这项宿主动作");
      return await options.actions.client.invoke(dependencyCaller(definition), definition, input) as Output;
    },
  };
}

interface SessionParts {
  readonly pluginCaller: HostPluginCaller;
  readonly artifactService: ArtifactService;
  readonly ui: PluginUi;
  readonly assertActive: () => void;
  readonly isActive: () => boolean;
}

/** The context the Plugin's `start` receives: its identity plus the services below. */
function hostedContext(options: PluginHostExecutorOptions, manifest: PluginManifest, context: PluginStartContext, parts: SessionParts): PluginStartContext {
  const { pluginCaller, artifactService, ui, assertActive } = parts;
  const actions = ownActionClient(options, manifest, context, assertActive, pluginCaller);
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
      const bound = { ...options, consumer: "plugin" as const, plugin_caller: caller, before_effect: async () => {
        caller.assertActive(); await options?.before_effect?.(); caller.assertActive();
      } };
      if (
        capability.capability_id.startsWith("schedule.")
        && input !== null
        && typeof input === "object"
        && !Array.isArray(input)
      ) {
        return port.invoke(capability, { ...input, plugin_id: caller.plugin_id }, bound);
      }
      return port.invoke(capability, input, bound);
    },
  };
}
