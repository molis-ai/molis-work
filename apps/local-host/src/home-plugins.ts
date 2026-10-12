import { ActionError, type ActionClient, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_PRESENTATION_CAPABILITY } from "@molis-ai/molis-work-design-system";
import { PluginRouteRouter, PluginRuntime, PluginSupervisor, SqlitePluginRuntimeRepository, SqlitePluginRuntimeReleaseArtifactRepository,
  PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-runtime";
import { openBaselineHomeSqlite, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { HomePluginExecutor } from "./home-plugin-executor.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";

const HOME_PLUGIN_RUNTIME_BASELINE: SqliteBaseline = {
  version: 1, schema: PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL + PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
};

export interface HomePluginEntry {
  readonly scope: "home";
  readonly create: () => PluginDefinition;
  readonly database?: PluginDatabaseDeclaration;
  readonly package_name: string;
  readonly factory_export: string;
}
export interface HomePluginPlatform {
  readonly runtime: PluginRuntime;
  readonly supervisor: PluginSupervisor;
  router(): PluginRouteRouter;
}

/** Owned by the already unique local Host. Concurrent discovery and HTTP share this one startup promise. */
export class HomePluginHost {
  private opening?: Promise<HomePluginPlatform>;
  private platform?: HomePluginPlatform;
  private db?: ReturnType<typeof openBaselineHomeSqlite>;
  private closed = false;
  private retryable = false;
  constructor(private readonly options: { home: string; actorId: string; registry: ActionRegistryPort; client: ActionClient; entries: readonly HomePluginEntry[] }) {}

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
  installation(providerId: string): PluginInstanceRecord | null {
    return this.installations().find(record => record.plugin_id === providerId && record.state !== "uninstalled") ?? null;
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
      this.db?.close();
      this.db = undefined; this.platform = undefined;
    }
    if (failures.length) throw new AggregateError(failures, "Home 插件关闭失败");
  }
  private async start(): Promise<HomePluginPlatform> {
    const entries = this.options.entries.map(entry => ({ ...entry, definition: entry.create() }));
    const ids = new Set<string>(), stores = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.definition.manifest.plugin_id)) throw new Error("Home 插件标识重复");
      ids.add(entry.definition.manifest.plugin_id);
      if (entry.database) {
        if (stores.has(entry.database.store_name) || entry.database.store_name === "plugin-runtime") throw new Error("Home 插件库归属重复");
        stores.add(entry.database.store_name);
        for (const permission of ["storage:private", entry.database.read_permission, entry.database.write_permission]) {
          if (!entry.definition.manifest.permissions.some(item => item.permission === permission)) throw new Error("插件数据库权限未在清单声明");
        }
      }
    }
    const db = openBaselineHomeSqlite(this.options.home, "plugin-runtime", HOME_PLUGIN_RUNTIME_BASELINE);
    this.db = db;
    const repository = new SqlitePluginRuntimeRepository(db);
    const executor = new HomePluginExecutor({ ...this.options, record: id => repository.get(id),
      database: id => entries.find(entry => entry.definition.manifest.plugin_id === id)?.database });
    const runtime = new PluginRuntime(repository, executor, { actions: { registry: this.options.registry, providerId: record => record.plugin_id } });
    const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db), hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY] });
    this.platform = { runtime, supervisor,
      router: () => new PluginRouteRouter(supervisor, entries.map(entry => entry.definition.manifest)) };
    await supervisor.start(entries.map(entry => ({ definition: entry.definition, bundled: true,
      enabled: !repository.list().some(record => record.plugin_id === entry.definition.manifest.plugin_id && ["disabled", "uninstalled"].includes(record.state)),
      releaseArtifact: nativePluginReleaseArtifact<() => PluginDefinition>(entry.package_name, entry.factory_export, factory => factory()) })));
    return this.platform;
  }
}
