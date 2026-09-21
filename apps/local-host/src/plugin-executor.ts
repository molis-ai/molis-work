import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDefinition, PluginExecutor, PluginManifest, PluginPrivateStorage, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
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

export interface PluginHostExecutorOptions {
  board_id: string;
  actor_id: string;
  artifacts: ArtifactsApplicationApi;
  ui: UiHostApi;
  privateStorageFor(context: PluginStartContext, manifest: PluginManifest): PluginPrivateStorage;
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
  private readonly sessions = new Map<string, { context: PluginStartContext; dispose(): void }>();
  private options: PluginHostExecutorOptions;

  constructor(options: PluginHostExecutorOptions) {
    this.options = options;
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
    const manifest = definition.manifest;
    const artifacts = createPluginArtifactClient({ api: this.options.artifacts, manifest, context,
      board_id: this.options.board_id, actor_id: this.options.actor_id });
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
      ...(wiring === undefined ? {} : { input_group: wiring.selectedGroup(manifest.plugin_id) }),
      services: Object.freeze({
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
          ? { capabilities: createPluginCapabilityClient(manifest, withScheduleCaller(manifest.plugin_id, this.options.capabilities)) }
          : {}),
      }) });
    try {
      const contribution = await definition.start(hostedContext);
      this.sessions.set(context.install_id, { context: hostedContext, dispose: ui.dispose });
      return { contribution };
    } catch (error) {
      ui.dispose();
      throw error;
    }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id);
    try {
      await definition.stop?.(session?.context ?? context);
    } finally {
      session?.dispose();
      this.sessions.delete(context.install_id);
    }
  }
}

function withScheduleCaller(pluginId: string, port: PluginCapabilityPort): PluginCapabilityPort {
  return {
    invoke(capability, input) {
      if (
        capability.capability_id.startsWith("schedule.")
        && input !== null
        && typeof input === "object"
        && !Array.isArray(input)
      ) {
        return port.invoke(capability, { ...input, plugin_id: pluginId });
      }
      return port.invoke(capability, input);
    },
  };
}
