import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
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
import { bindActionClient, ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

export interface PluginHostExecutorOptions {
  board_id: string;
  actor_id: string;
  artifacts: ArtifactsApplicationApi;
  actions: { registry: import("@molis-ai/molis-work-contracts/platform/actions").ActionRegistryPort;
    client: import("@molis-ai/molis-work-contracts/platform/actions").SyncActionClient & import("@molis-ai/molis-work-contracts/platform/actions").ActionClient; project_id: string };
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
        board_id: this.options.board_id, project_id: this.options.actions.project_id,
        declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }),
        assertActive: () => { if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); },
      });
      const artifactService = createPluginArtifactClient({ api: this.options.artifacts, manifest, context, actions: this.options.actions,
        board_id: this.options.board_id, actor_id: this.options.actor_id });
      const artifacts = artifactService.client;
      disposeArtifacts = artifactService.dispose;
      const actionCaller = (): ActionCallContext => {
        if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
        return {
          actor_id: this.options.actor_id, project_id: this.options.actions.project_id,
          audience: "user", permissions: context.grants,
          allowed_actions: (manifest.actions ?? []).map(action => ({ ...action, provider_id: context.install_id })),
          validate_authority: reference => {
            if (!active) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
            const action = manifest.actions?.find(item => item.capability_id === reference.capability_id && item.version === reference.version);
            if (!action) throw new ActionError("actions.forbidden", "插件未声明提供此动作");
            for (const permission of action.action.permissions) context.requireGrant(permission);
          },
        };
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
        : { manifest, graph: wiring, artifacts, scopeKey: this.options.scopeKey ?? null,
            requireGrant: (permission: string) => context.requireGrant(permission),
            latestVersion: (artifactId: string) => this.options.artifacts.query.latestArtifactVersion(this.options.board_id, artifactId)?.version ?? 0 };

      const hostedContext: PluginStartContext = Object.freeze({ ...context,
        board_id: this.options.board_id,
        actor_id: this.options.actor_id,
        ...(wiring === undefined ? {} : { input_group: wiring.selectedGroup(manifest.plugin_id) }),
        services: Object.freeze({
          ...(manifest.actions?.length ? { actions: bindActionClient(this.options.actions.client, actionCaller) } : {}),
          storage: manifest.permissions.some(item => item.permission === "storage:private")
            ? this.options.privateStorageFor(context, manifest) : undefined,
          artifacts,
          ui: ui.client,
          ...(declaresEvents && this.options.events !== undefined
            ? { events: this.options.events.clientFor({
              board_id: this.options.board_id,
              plugin_id: manifest.plugin_id,
              install_id: context.install_id,
            }) }
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
      board_id: this.options.board_id,
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
