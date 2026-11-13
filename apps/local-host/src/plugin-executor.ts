import { ActionError, requireSynchronous, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import { outsidePluginAction } from "@molis-ai/molis-work-plugin-runtime";
import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginManifest, PluginPrivateStorage, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import { StoppedServiceCalls, type PluginEventBus, type PluginHostEvents, type PluginInputGraph, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import type { PluginPlatformHome } from "./home-side.js";
import { openHostSession, pluginTextViews, type HostSession } from "./plugin-host-services.js";
import { runWithPluginText } from "./web-locale.js";
import { forgetPluginAgentDefinitions } from "./plugin-instructions.js";
import { removeSandboxOwnerFiles } from "./plugin-sandbox-owner-files.js";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { discardInstallationOwnerData, forgetInstallationRecords, forgetLeftoverInstallationBindings } from "./plugin-installation-cleanup.js";
import { directoryForHome } from "./plugin-directory-service.js";
import type { SurfaceInstallRegistry } from "./surface-installation.js";
import { awaitPluginStopHook, type PluginStopExecution } from "./plugin-stop-hook.js";

export interface PluginHostExecutorOptions {
  project_id: string;
  actor_id: string;
  artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  processItems: ProcessItemsApplicationApi;
  actions: { registry: SurfaceInstallRegistry;
    client: import("@molis-ai/molis-work-contracts/platform/actions").SyncActionClient & import("@molis-ai/molis-work-contracts/platform/actions").ActionClient; project_id: string;
    /** The kernel's scene client for this project: what `services.scenes` of a plugin that declares `scenes:use` is made from (PG-032 P1). */
    scenes?: import("@molis-ai/molis-work-contracts/platform/actions").ActionSceneClient;
    /** Composition-only metadata of the whole directory (what the Plugin Builder's catalog is made from). */
    inspect?(caller: import("@molis-ai/molis-work-contracts/platform/actions").ActionCallContext): Promise<readonly import("@molis-ai/molis-work-contracts/platform/actions").ActionView[]> };
  ui: UiHostApi;
  /**
   * The language files of a definition, registered for the text tools while its session is open and taken back when it is released
   * (specs/font-and-skin-system/a-section-contract.md §8.3). Absent, or `null` for a definition: it has none, and nothing is read or registered.
   */
  localePacks?(definition: PluginDefinition): PluginTextReader | null;
  /** The Home the platform reaches in process; absent or `null`: none (a developed plugin, a bare executor in a test). */
  home?: PluginPlatformHome | null;
  /**
   * The library in the Home that a definition's Manifest declares (`databases.home`), given only to a definition object the Host's
   * start list holds. None for any other definition (a developed plugin that carries a built-in plugin's id, a generated one): a
   * Manifest that declares a library for one of those is refused (`homeLibraryFor`). Needs `home`.
   */
  databaseFor?(definition: PluginDefinition): PluginDatabaseDeclaration | undefined;
  /** The Host's checked start list identifies a dual project half; absent Home services are not redeemed for that half. */
  dualInstance?(definition: PluginDefinition): boolean;
  /**
   * The project's library, where a plugin whose Manifest declares `databases.project` gets its own tables
   * (`services.project_database`); absent or `null`: none, and such a plugin does not start.
   */
  projectLibrary?: import("./plugin-project-library.js").ProjectLibrary | null;
  installations?: Pick<import("@molis-ai/molis-work-contracts/platform/plugin").PluginInstallationClient, "list" | "get">;
  /** Stands in for the Home's project catalog behind `services.projects` (S-96); absent: the catalog of `home` is read. */
  projects?: import("@molis-ai/molis-work-plugin-runtime").PluginProjectsPort;
  /** Test seam for `services.sourcePull`: the fetch its public-feed pulls go through. Production never passes it. */
  sourcePullFetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** Test seam for `services.sourcePull.repository`: the `git` it runs. Production never passes it. */
  sourcePullGit?: import("./research-repository-read.js").ResearchGit;
  /** Test seam for `services.sourcePull.connector`: the Home's integration registry, with providers of the test's own. Production never passes it. */
  sourcePullIntegrations?: () => Promise<import("./integration-registry.js").IntegrationRegistry>;
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
  private readonly sessions = new Map<string, { session: HostSession; definition: PluginDefinition }>();
  private readonly stoppedCalls = new StoppedServiceCalls();
  /** How each running activation was admitted (in process or sandboxed), captured at start: it decides how its stop is waited for (BL-367). */
  private readonly executions = new Map<string, PluginStopExecution>();
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
    this.prepareNewInstall(record.install_id);
  }

  prepareNewInstall(installId: string): void {
    if (this.options.home) forgetLeftoverInstallationBindings(this.options.home.directory, installId, { kind: "project", project_id: this.options.project_id });
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

  /** Host composition enters the current installation through its real issued Action client. */
  async invokeOwnedAction<Input, Output>(expected: { actor_id: string; project_id: string; plugin_id: string; install_id: string; installation_generation: string },
    reference: ExactActionReference, input: Input, control: PluginExecutionControl): Promise<Output> {
    const held = this.sessions.get(expected.install_id);
    const definition = held?.definition.manifest.actions?.find(action => action.capability_id === reference.capability_id && action.version === reference.version);
    const check = () => {
      control.signal?.throwIfAborted();
      requireSynchronous(control.assert_authority_current?.());
      const record = this.options.record?.(expected.install_id), context = held?.session.context;
      if (!held || this.sessions.get(expected.install_id) !== held || !context || !record || record.state !== "running"
        || record.installation_generation !== expected.installation_generation || record.plugin_id !== expected.plugin_id
        || context.installation_generation !== expected.installation_generation || context.project_id !== expected.project_id
        || context.actor_id !== expected.actor_id || context.plugin_id !== expected.plugin_id
        || this.options.project_id !== expected.project_id || this.options.actor_id !== expected.actor_id
        || !definition || definition.operation !== "command" || !definition.action.audiences?.includes("plugin")
        || reference.provider_id !== (this.options.providerFor?.(held.definition, expected.install_id) ?? expected.install_id))
        throw new ActionError("actions.provider_stopped", "原来源安装或自有动作已不再可用");
    };
    check(); await control.beforeEffect(); check();
    const actions = held!.session.context.services?.actions;
    if (!actions) throw new ActionError("actions.unredeemed", "当前来源安装没有动作入口");
    const result = await outsidePluginAction(() => actions.invoke(definition!, input, { ...control,
      assert_authority_current: check, beforeEffect: async () => { await control.beforeEffect(); check(); } }));
    check(); return result as Output;
  }

  async start(definition: PluginDefinition, context: PluginStartContext) {
    const execution = definition.execution;
    const session = openHostSession(this.options, definition, context, this.stoppedCalls);
    try {
      const contribution = await runWithPluginText(context, () => session.starting(() => definition.start(session.context)));
      this.sessions.set(context.install_id, { session, definition });
      this.executions.set(context.install_id, execution);
      return { contribution: pluginTextViews(contribution, context) };
    } catch (error) {
      session.dispose();
      throw error;
    }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id)?.session;
    // The plugin owns its cleanup hook, so it may yield indefinitely. Revoke
    // invocation authority before waiting for it, while retaining cleanup data.
    session?.revoke();
    this.options.events?.revoke(this.options.project_id, definition.manifest.plugin_id);
    this.options.hostEvents?.revoke(this.options.project_id, definition.manifest.plugin_id);
    try {
      await awaitPluginStopHook(definition, session?.context ?? context, "project", this.executions.get(context.install_id) ?? definition.execution);
    } finally {
      this.executions.delete(context.install_id);
      session?.dispose();
      this.sessions.delete(context.install_id);
    }
  }

  async stopProjectJobs(projectId: string): Promise<void> {
    await Promise.all([...this.sessions.values()].map(held => held.session.stopProjectJobs(projectId)));
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
