import { ActionError, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost, createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { openPluginDatabase } from "./plugin-database.js";
import { pluginHomeFor } from "./home-side.js";
import { registerPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";

/** The Home service set deliberately contains no project Artifact, event, or wiring clients. */
export class HomePluginExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; revoke(): void; dispose(): void }>();
  constructor(private readonly options: {
    home: string; actorId: string; client: ActionClient;
    database(definition: PluginDefinition): PluginDatabaseDeclaration | undefined;
    providerFor(definition: PluginDefinition, installId: string): string;
    qualifyCaller(definition: PluginDefinition, caller: import("@molis-ai/molis-work-contracts/platform/app-host").HostPluginCaller): (() => void) | undefined;
    storage: SqlitePluginPrivateStorage;
    active(): boolean;
    record(installId: string): PluginInstanceRecord | null;
  }) {}

  async start(definition: PluginDefinition, context: PluginStartContext) {
    const manifest = definition.manifest;
    if (manifest.ports?.inputs.length || manifest.ports?.outputs.length || manifest.events?.publishes.length || manifest.events?.subscribes.length
      || manifest.artifacts.produces.length || manifest.artifacts.consumes.length || manifest.process_items?.produces.length || manifest.process_items?.consumes.length) {
      throw new Error("Home Runtime 尚未提供项目成果、端口或事件服务");
    }
    let active = true;
    const generation = this.options.record(context.install_id)?.installation_generation;
    const activeRecord = () => {
      // Check lifetime before touching the repository: shutdown may already have closed its connection.
      if (!active || !this.options.active()) throw new ActionError("actions.forbidden", "插件实例已停止或安装已变化");
      const current = this.options.record(context.install_id);
      if (!current || current.installation_generation !== generation) {
        throw new ActionError("actions.forbidden", "插件实例已停止或安装已变化");
      }
      return current;
    };
    const assertActive = () => { activeRecord(); };
    const authorize = (permission: string) => {
      if (!activeRecord().grants.includes(permission)) throw new ActionError("actions.forbidden", "插件安装已变化或授权已撤销");
      context.requireGrant(permission);
    };
    const ui = createPluginUiClient(new UiHost(), context, manifest);
    let database: ReturnType<typeof openPluginDatabase> | undefined;
    let withdrawAgentDefinitions: (() => void) | undefined;
    let withdrawCaller: (() => void) | undefined;
    const dispose = () => {
      active = false; withdrawCaller?.();
      const failures: unknown[] = [];
      for (const release of [() => database?.close(), () => withdrawAgentDefinitions?.(), () => ui.dispose()]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Home 插件服务释放失败");
    };
    try {
      const home = pluginHomeFor(this.options.home);
      const declaration = this.options.database(definition);
      if (declaration) database = openPluginDatabase(this.options.home, declaration, authorize);
      withdrawAgentDefinitions = registerPluginAgentDefinitions(home, definition, context.install_id);
      const caller = Object.freeze({ plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: this.options.actorId, project_id: null,
        declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }), assertActive });
      withdrawCaller = this.options.qualifyCaller(definition, caller);
      const authorized = { ...context, requireGrant: authorize };
      const model = pluginModelFor(home, definition, authorized, assertActive);
      const storage = manifest.permissions.some(item => item.permission === "storage:private")
        ? this.options.storage.forPlugin(authorized, manifest) : undefined;
      const hosted: PluginStartContext = Object.freeze({ ...authorized, actor_id: this.options.actorId, services: Object.freeze({
        ui: ui.client, database: database?.client, ...(model ? { model } : {}), ...(storage ? { storage } : {}),
        actions: pluginHostActions(authorized, manifest, { client: this.options.client, actor_id: this.options.actorId, assertActive, pluginCaller: caller,
          providerId: this.options.providerFor(definition, context.install_id) }),
      }) });
      const contribution = await definition.start(hosted);
      this.sessions.set(context.install_id, { context: hosted, revoke: () => { active = false; withdrawCaller?.(); }, dispose });
      return { contribution };
    } catch (error) {
      try { dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Home 插件启动与服务释放失败"); }
      throw error;
    }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id);
    session?.revoke();
    try { await definition.stop?.(session?.context ?? context); }
    finally { try { session?.dispose(); } finally { this.sessions.delete(context.install_id); } }
  }

  capturePrivateData(installId: string): unknown { return this.options.storage.snapshotInstallationData(installId); }
  restorePrivateData(installId: string, snapshot: unknown): void {
    this.options.storage.restoreInstallationData(installId, snapshot as ReturnType<SqlitePluginPrivateStorage["snapshotInstallationData"]>);
  }

  async validateUpgrade(definition: PluginDefinition, context: PluginUpgradeContext, from: PluginInstanceRecord): Promise<void> {
    if (!definition.validateUpgrade) return;
    const storage = definition.manifest.permissions.some(item => item.permission === "storage:private")
      ? this.options.storage.forPlugin(context, definition.manifest) : undefined;
    await definition.validateUpgrade({ from, context: Object.freeze({ ...context,
      services: Object.freeze(storage ? { storage: Object.freeze({ get: storage.get }) } : {}) }) });
  }
}
