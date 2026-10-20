import { ActionError, type ActionClient, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_PRESENTATION_CAPABILITY } from "@molis-ai/molis-work-design-system";
import { randomUUID } from "node:crypto";
import { PluginRouteRouter, PluginRuntime, PluginSupervisor, SqlitePluginRuntimeRepository, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import { HomePluginExecutor } from "./home-plugin-executor.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";
import { pluginEntryIdentity } from "./plugin-entry-identity.js";
import { assertDatabaseEntries } from "./plugin-database-entries.js";
import { assertFilesEntries } from "./plugin-files-entries.js";
import { assertModelConfigurationEntries } from "./model-configuration-entries.js";
import { assertImageGenerationEntries } from "./plugin-image-generation-entries.js";
import { assertProjectCleanupEntries, registerPluginProjectCleanup, type PluginProjectCleanup } from "./plugin-project-cleanup.js";
import { pluginFixtureEntries, pluginHomeFor, fixtureDeclarationsFor, type PluginFixture } from "./home-side.js";
import { assertOwnerFilesEntries } from "./plugin-owner-files-entries.js";
import { openHomePluginStore } from "./home-plugin-store.js";
import type { PluginPlatform } from "./plugin-platform.js";

export interface HomePluginEntry {
  readonly scope: "home";
  readonly manifest: PluginManifest;
  readonly create: () => PluginDefinition;
  readonly database?: HomePluginDatabaseDeclaration;
  readonly files?: import("@molis-ai/molis-work-contracts/platform/plugin").PluginFilesDeclaration;
  readonly owner_files?: import("@molis-ai/molis-work-contracts/platform/plugin").PluginOwnerFilesDeclaration;
  readonly initialize_owner_files?: (writer: import("@molis-ai/molis-work-contracts/platform/plugin").PluginOwnerFilesWriter) => void;
  readonly model_configuration?: import("@molis-ai/molis-work-contracts/platform/plugin").PluginModelConfigurationDeclaration;
  readonly image_generation?: import("@molis-ai/molis-work-contracts/platform/plugin").PluginImageGenerationDeclaration;
  readonly project_data?: PluginProjectCleanup;
  readonly package_name: string;
  readonly factory_export: string;
}
export type HomePluginPlatform = Pick<PluginPlatform, "runtime" | "supervisor" | "router" | "upgrade" | "viewRevision" | "invalidateView">;

/** Owned by the already unique local Host. Concurrent discovery and HTTP share this one startup promise. */
export class HomePluginHost {
  private opening?: Promise<HomePluginPlatform>;
  private platform?: HomePluginPlatform;
  private db?: ReturnType<typeof openHomePluginStore>["db"];
  private closed = false;
  private retryable = false;
  private releaseProjectOwners?: () => void;
  constructor(private readonly options: { home: string; actorId: string; registry: ActionRegistryPort; client: ActionClient;
    entries: readonly HomePluginEntry[]; fixtures?: readonly PluginFixture[] }) {}

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
  installations(): PluginInstanceRecord[] { return this.platform?.runtime.list() ?? []; }
  manifest(pluginId: string): PluginManifest | undefined {
    return this.platform?.supervisor.manifest(pluginId)
      ?? this.options.entries.find(entry => entry.manifest.plugin_id === pluginId)?.manifest
      ?? pluginFixtureEntries(this.options.fixtures ?? []).find(entry => entry.definition.manifest.plugin_id === pluginId)?.definition.manifest;
  }
  installation(providerId: string): PluginInstanceRecord | null {
    return this.installations().find(record => (record.plugin_id === providerId || record.install_id === providerId) && record.state !== "uninstalled") ?? null;
  }
  invalidateView(providerId: string): void {
    const record = this.installation(providerId);
    if (record) this.platform?.invalidateView(record.plugin_id);
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try { await this.opening; } catch { /* Startup failure was reported to its callers and released by open(). */ }
    await this.release();
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
      this.db?.close();
      this.db = undefined; this.platform = undefined;
    }
    if (failures.length) throw new AggregateError(failures, "Home 插件关闭失败");
  }
  private async start(): Promise<HomePluginPlatform> {
    const identity = pluginEntryIdentity();
    const shipped = this.options.entries.map(entry => {
      const definition = entry.create();
      return { definition, bundled: true, database: entry.database, files: entry.files, owner_files: entry.owner_files, initialize_owner_files: entry.initialize_owner_files,
        model_configuration: entry.model_configuration, image_generation: entry.image_generation, project_data: entry.project_data,
        releaseArtifact: nativePluginReleaseArtifact<() => PluginDefinition>(entry.package_name, entry.factory_export, factory => {
          const released = factory();
          identity.remember([{ definition: released, bundled: true, database: entry.database, files: identity.filesFor(definition),
            owner_files: identity.ownerFilesFor(definition)?.declaration, initialize_owner_files: identity.ownerFilesFor(definition)?.initialize,
            model_configuration: identity.modelConfigurationFor(definition), image_generation: identity.imageGenerationFor(definition), project_data: identity.projectDataFor(definition) }]);
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
    assertFilesEntries(entries, home);
    assertModelConfigurationEntries(entries, home);
    assertImageGenerationEntries(entries, home);
    assertProjectCleanupEntries(entries);
    identity.remember(entries);
    const { db, storage } = openHomePluginStore(this.options.home);
    this.db = db;
    const repository = new SqlitePluginRuntimeRepository(db);
    const executor = new HomePluginExecutor({ ...this.options, storage, active: () => !this.closed, record: id => repository.get(id), database: identity.databaseFor, files: identity.filesFor,
      modelConfiguration: identity.modelConfigurationFor, imageGeneration: identity.imageGenerationFor, projectData: identity.projectDataFor, ownerFiles: identity.ownerFilesFor,
      providerFor: identity.providerFor });
    const runtime = new PluginRuntime(repository, executor, { actions: { registry: this.options.registry,
      providerId: (record, definition) => identity.providerFor(definition, record.install_id) } });
    this.releaseProjectOwners = registerPluginProjectCleanup(this.options.home, runtime, entries.map(entry => ({
      definition: entry.definition, project_data: identity.projectDataFor(entry.definition), database: identity.databaseFor(entry.definition),
    })), executor);
    const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db), hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY] });
    const epoch = randomUUID(), revisions = new Map<string, number>();
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
