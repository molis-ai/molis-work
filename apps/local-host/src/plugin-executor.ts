import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginManifest, PluginPrivateStorage, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import {
  createPluginCapabilityClient,
  createPluginInputsClient,
  createPluginOutputsClient,
  type PluginCapabilityPort,
  type PluginEventBus,
  type PluginInputGraph,
} from "@molis-ai/molis-work-plugin-runtime";
import { createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { HOST_PROVIDER_ID } from "./local-host.js";
import { bindActionClient, ActionError, type ActionCallContext, type ActionDefinition, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

export interface PluginHostExecutorOptions {
  project_id: string;
  actor_id: string;
  artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  processItems: ProcessItemsApplicationApi;
  actions: { registry: import("@molis-ai/molis-work-contracts/platform/actions").ActionRegistryPort;
    client: import("@molis-ai/molis-work-contracts/platform/actions").SyncActionClient & import("@molis-ai/molis-work-contracts/platform/actions").ActionClient; project_id: string;
    /** Composition-only metadata of the whole directory (what the Plugin Builder's catalog is made from). */
    inspect?(caller: import("@molis-ai/molis-work-contracts/platform/actions").ActionCallContext): Promise<readonly import("@molis-ai/molis-work-contracts/platform/actions").ActionView[]> };
  ui: UiHostApi;
  privateStorageFor(context: PluginUpgradeContext, manifest: PluginManifest): PluginPrivateStorage;
  capturePrivateData?(installId: string): Promise<unknown> | unknown;
  restorePrivateData?(installId: string, snapshot: unknown): Promise<void> | void;
  /**
   * Coordination services, attached after construction.
   *
   * They cannot be constructor arguments: the event bus and input graph need a
   * lifecycle, the lifecycle needs the Plugin Runtime, and the Runtime needs
   * this executor. `attach` is the one explicit seam that breaks that cycle
   * instead of hiding it behind a lazily-read global.
   */
  events?: PluginEventBus;
  wiring?: PluginInputGraph;
  capabilities?: PluginCapabilityPort;
  /**
   * Opaque scope key stamped on this Plugin's outputs, so the Host can tell two
   * inputs belong to the same scope without reading business fields.
   */
  scopeKey?: string | null;
}

/** Trusted in-process Host composition, not an isolation boundary for arbitrary JavaScript. */
export class PluginHostExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; revoke(): void; dispose(): void }>();
  private options: PluginHostExecutorOptions;

  constructor(options: PluginHostExecutorOptions) {
    this.options = options;
  }

  capturePrivateData(installId: string): Promise<unknown> | unknown {
    return this.options.capturePrivateData?.(installId);
  }

  restorePrivateData(installId: string, snapshot: unknown): Promise<void> | void {
    return this.options.restorePrivateData?.(installId, snapshot);
  }

  /**
   * Bind the coordination services once they exist. Call it before starting any
   * Plugin: a Plugin that declared ports or events and starts without them
   * would silently run without the surfaces its Manifest promised.
   */
  attach(services: {
    events?: PluginEventBus;
    wiring?: PluginInputGraph;
    capabilities?: PluginCapabilityPort;
    scopeKey?: string | null;
  }): void {
    this.options = { ...this.options, ...services };
  }

  async start(definition: PluginDefinition, context: PluginStartContext) {
    const ui = createPluginUiClient(this.options.ui, context, definition.manifest);
    let active = true;
    let disposeArtifacts = () => {};
    const dispose = () => { active = false; disposeArtifacts(); ui.dispose(); };
    try {
      const manifest = definition.manifest;
      const pluginCaller: import("@molis-ai/molis-work-contracts/platform/app-host").HostPluginCaller = Object.freeze({
        plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: this.options.actor_id,
        project_id: this.options.actions.project_id,
        declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }),
        assertActive: () => { if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); },
      });
      const artifactService = createPluginArtifactClient({ api: this.options.artifacts, process: this.options.processItems, manifest, context, actions: this.options.actions,
        project_id: this.options.project_id, actor_id: this.options.actor_id });
      const artifacts = artifactService.client;
      disposeArtifacts = artifactService.dispose;
      // What the Plugin's own actions cannot work without (`required_actions`) is Host actions it also lists under
      // `capabilities.consumes`. The kernel checks those dependencies for the caller of each own action, so the caller
      // must be able to see them (`allowed_actions`); being seen is not being callable: the kernel asks
      // `validate_authority` only about the action that is invoked, and for the Plugin's own client that is always one
      // of its own actions.
      const consumed = new Set(manifest.capabilities.consumes);
      const required = (manifest.actions ?? []).flatMap(action => action.action.required_actions ?? [])
        .map(reference => ({ capability_id: reference.capability_id, version: reference.version, provider_id: reference.provider_id ?? HOST_PROVIDER_ID }));
      const sameAction = (left: ActionReference, right: ActionReference) => left.capability_id === right.capability_id && left.version === right.version;
      const actionCaller = (): ActionCallContext => {
        if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
        return {
          actor_id: this.options.actor_id, project_id: this.options.actions.project_id,
          audience: "user", permissions: context.grants,
          allowed_actions: [...(manifest.actions ?? []).map(action => ({ ...action, provider_id: context.install_id })), ...required],
          validate_authority: reference => {
            if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
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
        if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
        return {
          actor_id: this.options.actor_id, project_id: this.options.actions.project_id, audience: "plugin", permissions: context.grants,
          host_plugin: pluginCaller, plugin_install_id: context.install_id,
          allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id: HOST_PROVIDER_ID }],
          validate_authority: () => {
            if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
            for (const permission of definition.action?.permissions ?? []) context.requireGrant(permission);
          },
        };
      };
      // The client exists when the Plugin has actions of its own or lists anything under `consumes`: a Plugin with no
      // action of its own still reaches a Host action it consumes. Without either there is nothing to call.
      const ownActions = bindActionClient(this.options.actions.client, actionCaller);
      const actions: BoundActionClient | undefined = !manifest.actions?.length && consumed.size === 0 ? undefined : {
        discover: async () => (await ownActions.discover()).filter(view => view.provider.provider_id === context.install_id),
        invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
          if ((manifest.actions ?? []).some(action => sameAction(action, definition))) return ownActions.invoke(definition, input);
          if (!consumed.has(definition.capability_id)) throw new ActionError("actions.forbidden", "插件没有声明消费这项宿主动作");
          return await this.options.actions.client.invoke(dependencyCaller(definition), definition, input) as Output;
        },
      };
      // Each service appears only when the Manifest declared it, so the Manifest
      // stays a complete account of what this Plugin can reach.
      const wiring = this.options.wiring;
      const declaresInputs = (manifest.ports?.inputs ?? []).length > 0;
      const declaresOutputs = (manifest.ports?.outputs ?? []).length > 0;
      const declaresEvents = (manifest.events?.publishes ?? []).length > 0;
      const declaresCapabilities = manifest.capabilities.consumes.length > 0;
      const wiringInput = wiring === undefined
        ? undefined
        : { manifest, graph: wiring, artifacts, processItems: artifactService.process, scopeKey: this.options.scopeKey ?? null,
            requireGrant: (permission: string) => context.requireGrant(permission),
            latestVersion: (artifactId: string) => this.options.processItems.query.latestArtifactVersion(this.options.project_id, artifactId)?.version ?? 0 };

      const hostedContext: PluginStartContext = Object.freeze({ ...context,
        project_id: this.options.project_id,
        actor_id: this.options.actor_id,
        ...(wiring === undefined ? {} : { input_group: wiring.selectedGroup(manifest.plugin_id) }),
        services: Object.freeze({
          ...(actions ? { actions } : {}),
          storage: manifest.permissions.some(item => item.permission === "storage:private")
            ? this.options.privateStorageFor(context, manifest) : undefined,
          artifacts,
          ...((manifest.process_items?.produces ?? []).length > 0 ? { processItems: artifactService.process } : {}),
          ui: ui.client,
          ...(declaresEvents && this.options.events !== undefined
            ? { events: this.options.events.clientFor({
              project_id: this.options.project_id,
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
          ...(declaresCapabilities && this.options.capabilities !== undefined
            ? { capabilities: createPluginCapabilityClient(manifest, withPluginCaller(pluginCaller, this.options.capabilities), () => active) }
            : {}),
        }) });
      const contribution = await definition.start(hostedContext);
      this.sessions.set(context.install_id, { context: hostedContext, revoke: () => { active = false; }, dispose });
      return { contribution };
    } catch (error) {
      dispose();
      throw error;
    }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id);
    // The plugin owns its cleanup hook, so it may yield indefinitely. Revoke
    // invocation authority before waiting for it, while retaining cleanup data.
    session?.revoke();
    this.options.events?.revoke(this.options.project_id, definition.manifest.plugin_id);
    try {
      await definition.stop?.(session?.context ?? context);
    } finally {
      session?.dispose();
      this.sessions.delete(context.install_id);
    }
  }

  async validateUpgrade(definition: PluginDefinition, context: PluginUpgradeContext, from: PluginInstanceRecord): Promise<void> {
    if (!definition.validateUpgrade) return;
    const manifest = definition.manifest;
    const services = manifest.permissions.some(item => item.permission === "storage:private")
      ? { storage: Object.freeze({ get: (key: string) => this.options.privateStorageFor(context, manifest).get(key) }) }
      : {};
    const hostedContext: PluginUpgradeContext = Object.freeze({
      ...context,
      project_id: this.options.project_id,
      services: Object.freeze(services),
    });
    await definition.validateUpgrade({ from, context: hostedContext });
  }
}

function withPluginCaller(caller: import("@molis-ai/molis-work-contracts/platform/app-host").HostPluginCaller, port: PluginCapabilityPort): PluginCapabilityPort {
  return {
    ...(port.availability ? { availability: (capability: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference,
      options?: Pick<import("@molis-ai/molis-work-contracts/platform/app-host").HostCapabilityCallOptions, "consumer">) => port.availability!(capability, options) } : {}),
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
