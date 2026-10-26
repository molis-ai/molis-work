import { ActionError, type ActionClient, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginInstallRecords } from "./plugin-install-records.js";
import type { PluginDefinition, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_PRESENTATION_CAPABILITY } from "@molis-ai/molis-work-design-system";
import { randomUUID } from "node:crypto";
import { installedArtifacts, supervisedArtifacts } from "./artifact-type-registry.js";
import { declarationOwnersFor } from "./declaration-owners.js";
import { HOST_BUILD_TRUST, leaveRefusal, PluginRouteRouter, PluginRuntime, PluginSupervisor, SqlitePluginConsentLedger, SqlitePluginRuntimeReleaseArtifactRepository, type PluginProjectReach } from "@molis-ai/molis-work-plugin-runtime";
import { HomePluginExecutor } from "./home-plugin-executor.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";
import { pluginEntryIdentity } from "./plugin-entry-identity.js";
import { assertDatabaseEntries } from "./plugin-database-entries.js";
import { assertModelConfigurationEntries } from "./model-configuration-entries.js";
import { assertImageGenerationEntries } from "./plugin-image-generation-entries.js";
import { assertProjectCleanupEntries, registerPluginProjectCleanup, type PluginProjectCleanup } from "./plugin-project-cleanup.js";
import { pluginFixtureEntries, pluginHomeFor, fixtureDeclarationsFor, type PluginFixture } from "./home-side.js";
import { assertOwnerFilesEntries } from "./plugin-owner-files-entries.js";
import { recordHostAlwaysOnAgreements } from "./always-on-plugins.js";
import { openHomePluginStore } from "./home-plugin-store.js";
import { HOST_PLUGIN_IDS } from "./host-plugin-ids.js";
import type { PluginPlatform } from "./plugin-platform.js";
import { bindHomeRegistration } from "./home-registration.js";
import { hostReservedRuleKeys } from "./scene-rule-admission.js";

export interface HomePluginEntry {
  readonly scope: "home";
  /** The key its page and a project's plugin list use: a shipped plugin's project key. Without one it is its plugin id. */
  readonly key?: string;
  readonly manifest: PluginManifest;
  readonly create: () => PluginDefinition;
  readonly project_data?: PluginProjectCleanup;
  readonly dual_instance?: true;
  readonly package_name: string;
  readonly factory_export: string;
}
export type HomePluginPlatform = Pick<PluginPlatform, "runtime" | "supervisor" | "router" | "upgrade" | "viewRevision" | "invalidateView">;

/** Owned by the already unique local Host. Concurrent discovery and HTTP share this one startup promise. */
export class HomePluginHost {
  private opening?: Promise<HomePluginPlatform>;
  private platform?: HomePluginPlatform;
  private executor?: HomePluginExecutor;
  private db?: ReturnType<typeof openHomePluginStore>["db"];
  private closed = false;
  private closing?: Promise<void>;
  private retryable = false;
  private releaseProjectOwners?: () => void;
  private unwatchArtifacts?: () => void;
  private readonly releaseRegistration: () => void;
  constructor(private readonly options: { home: string; actorId: string; registry: ActionRegistryPort; client: ActionClient;
    entries: readonly HomePluginEntry[]; fixtures?: readonly PluginFixture[]; projectReach?: PluginProjectReach }) {
    this.releaseRegistration = bindHomeRegistration(options.home, this, () => this.outsideBuild());
  }

  ready(): Promise<HomePluginPlatform> {
    if (this.closed) return Promise.reject(new ActionError("actions.plugin_unavailable", "Home 插件宿主已关闭"));
    return this.opening ??= this.open();
  }
  retry(): Promise<HomePluginPlatform> {
    if (this.closed || !this.retryable) return this.ready();
    return this.opening = this.open();
  }
  private async open(): Promise<HomePluginPlatform> {
    this.retryable = false;
    try { return await this.start(); }
    catch (error) {
      // A failed cleanup must not allow a second instance beside unreleased resources.
      try { await this.release(); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Home 插件启动与清理失败"); }
      this.retryable = true;
      throw error;
    }
  }
  /**
   * The plugins registered in the Home, as its pages and routes find them (#679, S-31): the start list's entries, then the Host's
   * fixtures. A shipped plugin is keyed by its project key; any other by its plugin id, which has a dot where a project key has none.
   */
  registered(): readonly { readonly key: string; readonly manifest: PluginManifest }[] {
    return [...this.options.entries.map(entry => ({ key: entry.key ?? entry.manifest.plugin_id, manifest: entry.manifest })),
      ...pluginFixtureEntries(this.options.fixtures ?? []).map(entry => ({ key: entry.definition.manifest.plugin_id, manifest: entry.definition.manifest }))];
  }
  /**
   * The registered Home plugins outside the start list that have no project half, by plugin id: personal plugins of every project
   * unless it hides them (#679, B3). A dual-instance one is reached through its project half, as before.
   */
  outsideBuild(): readonly string[] {
    return pluginFixtureEntries(this.options.fixtures ?? []).map(entry => entry.definition.manifest.plugin_id).filter(id => !this.dualInstance(id));
  }
  installations(): PluginInstanceRecord[] { return this.platform?.runtime.list() ?? []; }
  manifest(pluginId: string): PluginManifest | undefined {
    return this.platform?.supervisor.manifest(pluginId)
      ?? this.options.entries.find(entry => entry.manifest.plugin_id === pluginId)?.manifest
      ?? pluginFixtureEntries(this.options.fixtures ?? []).find(entry => entry.definition.manifest.plugin_id === pluginId)?.definition.manifest;
  }
  /** Whether the Host's start list (a catalog entry's `runtime`, or a Home fixture) says this is the Home half of a dual-instance plugin. */
  dualInstance(pluginId: string): boolean {
    return this.options.entries.some(entry => entry.dual_instance === true && entry.manifest.plugin_id === pluginId)
      || (this.options.fixtures ?? []).some(fixture => !("manifest" in fixture) && fixture.dual_instance === true && fixture.definition.manifest.plugin_id === pluginId);
  }
  installation(providerId: string): PluginInstanceRecord | null {
    return this.installations().find(record => (record.plugin_id === providerId || record.install_id === providerId) && record.state !== "uninstalled") ?? null;
  }
  /** Why the plugin may not be switched off or uninstalled (it is 常开 and the person's agreement stands); asked before anything is touched. */
  leaveRefusal(providerId: string, action: "停用" | "卸载"): ActionError | undefined {
    return leaveRefusal(this.db ? new SqlitePluginConsentLedger(this.db) : undefined, this.installation(providerId), action);
  }
  invalidateView(providerId: string): void {
    const record = this.installation(providerId);
    if (record) this.platform?.invalidateView(record.plugin_id);
  }
  /** A project closed: the Home instances' jobs kept in it stop (PG-038). Their bounded executions keep their call's authority and go on. */
  stopProjectJobs(projectId: string): void {
    this.executor?.stopProjectJobs(projectId);
  }
  close(): Promise<void> {
    this.closed = true;
    this.releaseRegistration();
    return this.closing ??= (async () => {
      try { await this.opening; } catch { /* Startup failure was reported to its callers and released by open(). */ }
      await this.release();
    })().catch(error => { this.closing = undefined; throw error; });
  }
  private async release(): Promise<void> {
    const failures: unknown[] = [];
    try {
      const platform = this.platform;
      for (const record of platform?.runtime.list() ?? []) {
        if (record.state === "running") {
          try { await platform!.runtime.stop(record.install_id, { preserve_enabled: true }); } catch (error) { failures.push(error); }
        }
        platform!.supervisor.revoke(record.plugin_id);
      }
    } finally {
      this.releaseProjectOwners?.(); this.releaseProjectOwners = undefined;
      this.unwatchArtifacts?.(); this.unwatchArtifacts = undefined;
      this.db?.close();
      this.db = undefined; this.platform = undefined; this.executor = undefined;
    }
    if (failures.length) throw new AggregateError(failures, "Home 插件关闭失败");
  }
  private async start(): Promise<HomePluginPlatform> {
    const identity = pluginEntryIdentity();
    const shipped = this.options.entries.map(entry => {
      const definition = entry.create();
      return { definition, trust: HOST_BUILD_TRUST, project_data: entry.project_data, dual_instance: entry.dual_instance,
        releaseArtifact: nativePluginReleaseArtifact<() => PluginDefinition>(entry.package_name, entry.factory_export, factory => {
          const released = factory();
          identity.remember([{ definition: released, trust: HOST_BUILD_TRUST, project_data: identity.projectDataFor(definition),
            dual_instance: entry.dual_instance }]);
          return released;
        }) };
    });
    const entries = [...shipped, ...pluginFixtureEntries(this.options.fixtures ?? [])];
    const ids = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.definition.manifest.plugin_id)) throw new Error("Home 插件标识重复");
      ids.add(entry.definition.manifest.plugin_id);
    }
    const home = pluginHomeFor(this.options.home);
    assertOwnerFilesEntries(entries, fixtureDeclarationsFor(this.options.home, "project"), home);
    assertDatabaseEntries(entries, home, "home");
    assertModelConfigurationEntries(entries, home);
    assertImageGenerationEntries(entries, home);
    assertProjectCleanupEntries(entries);
    identity.remember(entries);
    const { db, storage } = openHomePluginStore(this.options.home);
    this.db = db;
    const repository = pluginInstallRecords(db);
    const executor = this.executor = new HomePluginExecutor({ ...this.options, storage, active: () => !this.closed, record: id => repository.get(id),
      invalidateView: pluginId => this.platform?.invalidateView(pluginId), database: identity.databaseFor,
      modelConfiguration: identity.modelConfigurationFor, imageGeneration: identity.imageGenerationFor, ownerFiles: identity.ownerFilesFor,
      providerFor: identity.providerFor, dualInstance: identity.dualInstance });
    // The Home half of a dual-instance plugin offers only its share, and no project reaches it: its ports and events are the project half's.
    const ledger = new SqlitePluginConsentLedger(db);
    recordHostAlwaysOnAgreements(ledger, new Set(entries.map(entry => entry.definition.manifest.plugin_id)), new Date().toISOString());
    const runtime = new PluginRuntime(repository, executor, { consents: ledger, scope: "home", hostIds: HOST_PLUGIN_IDS, declarationOwners: declarationOwnersFor(this.options.home, { db, scope: { kind: "home" } }), reservedRuleKeys: hostReservedRuleKeys,
      redemption: definition => identity.dualInstance(definition) ? { partial: true, outside_project: true } : {},
      actions: { registry: this.options.registry, providerId: (record, definition) => identity.providerFor(definition, record.install_id),
        ...(this.options.projectReach ? { projectReach: this.options.projectReach } : {}) } });
    this.releaseProjectOwners = registerPluginProjectCleanup(this.options.home, runtime, entries.map(entry => ({
      definition: entry.definition, project_data: identity.projectDataFor(entry.definition),
    })), executor);
    const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db), hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY] });
    const epoch = randomUUID(), revisions = new Map<string, number>();
    this.unwatchArtifacts = installedArtifacts.watch(supervisedArtifacts(supervisor, runtime, () => !this.closed));
    this.platform = { runtime, supervisor, upgrade: (pluginId, definition, options) => supervisor.upgrade(pluginId, definition, options),
      invalidateView: pluginId => {
        if (!this.closed && supervisor.state(pluginId)?.status === "running") revisions.set(pluginId, (revisions.get(pluginId) ?? 0) + 1);
      },
      viewRevision: pluginId => `${epoch}:${revisions.get(pluginId) ?? 0}`,
      router: () => new PluginRouteRouter(supervisor, supervisor.states().flatMap(state => {
        const manifest = supervisor.manifest(state.plugin_id);
        return manifest ? [manifest] : [];
      })) };
    await supervisor.start(entries.map(entry => ({ ...entry,
      enabled: !repository.list().some(record => record.plugin_id === entry.definition.manifest.plugin_id && ["disabled", "uninstalled"].includes(record.state)),
    })));
    return this.platform;
  }
}
