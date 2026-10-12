import { ActionError, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UiHost, createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { openPluginDatabase } from "./plugin-database.js";

/** The Home service set deliberately contains no project Artifact, event, or wiring clients. */
export class HomePluginExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; revoke(): void; dispose(): void }>();
  constructor(private readonly options: {
    home: string; actorId: string; client: ActionClient;
    database(pluginId: string): PluginDatabaseDeclaration | undefined;
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
    const authorize = (permission: string) => {
      const current = this.options.record(context.install_id);
      if (!active || !current || current.installation_generation !== generation || !current.grants.includes(permission)) {
        throw new ActionError("actions.forbidden", "插件安装已变化或授权已撤销");
      }
      context.requireGrant(permission);
    };
    const assertActive = () => { if (!active) throw new ActionError("actions.forbidden", "插件实例已停止"); };
    const ui = createPluginUiClient(new UiHost(), context, manifest);
    let database: ReturnType<typeof openPluginDatabase> | undefined;
    const dispose = () => { active = false; ui.dispose(); database?.close(); };
    try {
      const declaration = this.options.database(manifest.plugin_id);
      if (declaration) database = openPluginDatabase(this.options.home, declaration, authorize);
      const hosted: PluginStartContext = Object.freeze({ ...context, actor_id: this.options.actorId, services: Object.freeze({
        ui: ui.client, database: database?.client,
        actions: pluginHostActions(context, manifest, { client: this.options.client, actor_id: this.options.actorId, assertActive }),
      }) });
      const contribution = await definition.start(hosted);
      this.sessions.set(context.install_id, { context: hosted, revoke: () => { active = false; }, dispose });
      return { contribution };
    } catch (error) { dispose(); throw error; }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id);
    session?.revoke();
    try { await definition.stop?.(session?.context ?? context); }
    finally { session?.dispose(); this.sessions.delete(context.install_id); }
  }
}
