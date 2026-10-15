import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginManifest, PluginPrivateStorage, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginCapabilityPort, PluginEventBus, PluginInputGraph } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginPlatformHome } from "./home-side.js";
import { openHostSession, type HostSession } from "./plugin-host-services.js";

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
  /** The Home the platform reaches in process; absent or `null`: none (a developed plugin, a bare executor in a test). */
  home?: PluginPlatformHome | null;
  /**
   * The library in the Home the Host's start list declared for a definition (`PluginPlatformEntry.database`), looked up by the
   * definition object the Host listed. None for any other definition (a developed plugin that carries a built-in plugin's id,
   * a generated one), whatever its Manifest asks for; the plugin never names a library. Needs `home`.
   */
  databaseFor?(definition: PluginDefinition): PluginDatabaseDeclaration | undefined;
  /**
   * The provider id a Plugin's actions are registered under, when the Host names one (a plugin that ships with the Host: its
   * plugin_id). Without it, or for a definition it does not name, the installation id. Whatever registers the Plugin's actions
   * (the Runtime's `actions.providerId`) has to give the same answer: this is how the Plugin's own client finds them.
   */
  providerFor?(definition: PluginDefinition, installId: string): string;
  /** Host start-list qualification of this actual definition; the returned release withdraws this session before stop. */
  qualifyCaller?(definition: PluginDefinition, caller: import("@molis-ai/molis-work-contracts/platform/app-host").HostPluginCaller): (() => void) | undefined;
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
  private readonly sessions = new Map<string, HostSession>();
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
    const session = openHostSession(this.options, definition, context);
    try {
      const contribution = await definition.start(session.context);
      this.sessions.set(context.install_id, session);
      return { contribution };
    } catch (error) {
      session.dispose();
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
