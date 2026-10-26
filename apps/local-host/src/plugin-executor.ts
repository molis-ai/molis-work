import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginManifest, PluginPrivateStorage, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import { StoppedServiceCalls, type PluginEventBus, type PluginHostEvents, type PluginInputGraph, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginPlatformHome } from "./home-side.js";
import { openHostSession, type HostSession } from "./plugin-host-services.js";
import { forgetPluginAgentDefinitions } from "./plugin-instructions.js";
import { removeSandboxOwnerFiles } from "./plugin-sandbox-owner-files.js";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { discardInstallationOwnerData, forgetInstallationRecords } from "./plugin-installation-cleanup.js";
import { directoryForHome } from "./plugin-directory-service.js";

export interface PluginHostExecutorOptions {
  project_id: string;
  actor_id: string;
  artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  processItems: ProcessItemsApplicationApi;
  actions: { registry: import("@molis-ai/molis-work-contracts/platform/actions").ActionRegistryPort;
    client: import("@molis-ai/molis-work-contracts/platform/actions").SyncActionClient & import("@molis-ai/molis-work-contracts/platform/actions").ActionClient; project_id: string;
    /** The kernel's scene client for this project: what `services.scenes` of a plugin that declares `scenes:use` is made from (PG-032 P1). */
    scenes?: import("@molis-ai/molis-work-contracts/platform/actions").ActionSceneClient;
    /** Composition-only metadata of the whole directory (what the Plugin Builder's catalog is made from). */
    inspect?(caller: import("@molis-ai/molis-work-contracts/platform/actions").ActionCallContext): Promise<readonly import("@molis-ai/molis-work-contracts/platform/actions").ActionView[]> };
  ui: UiHostApi;
  /** The Home the platform reaches in process; absent or `null`: none (a developed plugin, a bare executor in a test). */
  home?: PluginPlatformHome | null;
  /**
   * The library in the Home that a definition's Manifest declares (`databases.home`), given only to a definition object the Host's
   * start list holds. None for any other definition (a developed plugin that carries a built-in plugin's id, a generated one): a
   * Manifest that declares a library for one of those is refused (`homeLibraryFor`). Needs `home`.
   */
  databaseFor?(definition: PluginDefinition): PluginDatabaseDeclaration | undefined;
  /**
   * The project's library, where a plugin whose Manifest declares `databases.project` gets its own tables
   * (`services.project_database`); absent or `null`: none, and such a plugin does not start.
   */
  projectLibrary?: import("./plugin-project-library.js").ProjectLibrary | null;
  installations?: import("./plugin-installation-directory.js").InstallationDirectoryClient;
  scheduler?: import("@molis-ai/molis-work-service-scheduler").ScheduleService;
  /**
   * The provider id a Plugin's actions are registered under, when the Host names one (a plugin that ships with the Host: its
   * plugin_id). Without it, or for a definition it does not name, the installation id. Whatever registers the Plugin's actions
   * (the Runtime's `actions.providerId`) has to give the same answer: this is how the Plugin's own client finds them.
   */
  providerFor?(definition: PluginDefinition, installId: string): string;
  /**
   * The installation's record as the Runtime's repository holds it now. An activation's jobs read it before every write
   * (`services.background.keep`, PG-038); without it a job is refused, never trusted.
   */
  record?(installId: string): PluginInstanceRecord | null;
  /**
   * The pages of a running plugin read again (`PluginPlatform.invalidateView`): what a plugin's `services.ui.invalidate` reaches
   * (PG-061). Absent: nothing watches this executor's pages (a developed plugin, a bare executor in a test), and the call does nothing.
   */
  invalidateView?(pluginId: string): void;
  privateStorageFor(context: PluginUpgradeContext, manifest: PluginManifest): PluginPrivateStorage;
  /** The private KV owner's synchronous deletion port; required to reinstall a non-retaining uninstalled record. */
  deleteInstallationData?(installId: string): void;
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
  /** What the Host itself tells one installation (X-6). Never handed to a Plugin: only `stop` reaches it. */
  hostEvents?: PluginHostEvents;
  wiring?: PluginInputGraph;
  /** Whether an action a plugin consumes is registered and ready in this project: what `services.actions.availability` asks. */
  dependencyCheck?: PluginDependencyCheck;
  /**
   * Opaque scope key stamped on this Plugin's outputs, so the Host can tell two
   * inputs belong to the same scope without reading business fields.
   */
  scopeKey?: string | null;
}

/** Trusted in-process Host composition, not an isolation boundary for arbitrary JavaScript. */
export class PluginHostExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, HostSession>();
  private readonly stoppedCalls = new StoppedServiceCalls();
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

  uninstalled(record: PluginInstanceRecord): void {
    forgetPluginAgentDefinitions(this.options.home, record.install_id);
    // The local directories the person granted it in this project go with it (PG-049); kept data does not keep them.
    if (this.options.home) directoryForHome(this.options.home.directory).forgetInstallation(record.install_id, this.options.project_id);
    // A sandboxed installation that keeps no data keeps no files either (S-64); one that keeps it leaves its folder to the same installation id.
    if (record.execution === "sandbox" && !record.retain_private_data) removeSandboxOwnerFiles({ home: this.options.home, project_id: this.options.project_id }, record.install_id);
    // File registrations and record bindings are authorization, removed on every uninstall even when private data is kept (BL-356).
    forgetInstallationRecords({ home: this.options.home, project_id: this.options.project_id }, record);
  }

  prepareReinstall(record: PluginInstanceRecord): void {
    forgetInstallationRecords({ home: this.options.home, project_id: this.options.project_id }, record);
  }

  keptDataDiscarded(record: PluginInstanceRecord): void {
    discardInstallationOwnerData({ home: this.options.home, project_id: this.options.project_id }, record, this.options.deleteInstallationData);
  }

  /** How many service calls an instance's code made after it stopped, each doing nothing (BL-411); in memory, from this process. */
  stoppedServiceCalls(instance: PluginInstance): number {
    return this.stoppedCalls.count(instance);
  }

  /**
   * Bind the coordination services once they exist. Call it before starting any
   * Plugin: a Plugin that declared ports or events and starts without them
   * would silently run without the surfaces its Manifest promised.
   */
  attach(services: {
    events?: PluginEventBus;
    hostEvents?: PluginHostEvents;
    wiring?: PluginInputGraph;
    dependencyCheck?: PluginDependencyCheck;
    scopeKey?: string | null;
  }): void {
    this.options = { ...this.options, ...services };
  }

  async start(definition: PluginDefinition, context: PluginStartContext) {
    const session = openHostSession(this.options, definition, context, this.stoppedCalls);
    try {
      const contribution = await session.starting(() => definition.start(session.context));
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
    this.options.hostEvents?.revoke(this.options.project_id, definition.manifest.plugin_id);
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
