import { ActionError, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient, type SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost, createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { heldPermissions, issuePluginCaller } from "./plugin-callers.js";
import { openPluginDatabase } from "./plugin-database.js";
import { beginPartitionClearing, openPartitionedPluginDatabase, partitionDeletions, type PartitionDeletions, type PartitionedPluginDatabase } from "./plugin-database-partitions.js";
import { openPluginFiles } from "./plugin-files.js";
import { pluginHomeFor } from "./home-side.js";
import { registerPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";
import { pluginMaterialsFor } from "./plugin-materials-service.js";
import { pluginBackgroundFor } from "./plugin-background-service.js";
import { pluginImageGenerationFor } from "./plugin-image-generation-service.js";
import type { PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { DIRECTORY_READ_PERMISSION, directoryForHome } from "./plugin-directory-service.js";
import type { PluginOwnerFilesBinding } from "./plugin-owner-files-entries.js";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";

/** The Home service set deliberately contains no project Artifact, event, or wiring clients. */
export class HomePluginExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; revoke(): void; dispose(): void; partitions?: PartitionedPluginDatabase;
    background?: ReturnType<typeof pluginBackgroundFor> }>();
  /** Per installation, not per instance: a project deletion under way outlives a restart of the instance (`PartitionDeletions`). */
  private readonly partitionDeletions = new Map<string, PartitionDeletions>();
  constructor(private readonly options: {
    home: string; actorId: string; client: ActionClient;
    database(definition: PluginDefinition): HomePluginDatabaseDeclaration | undefined;
    files(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginFilesDeclaration | undefined;
    ownerFiles(definition: PluginDefinition): PluginOwnerFilesBinding | undefined;
    modelConfiguration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginModelConfigurationDeclaration | undefined;
    imageGeneration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginImageGenerationDeclaration | undefined;
    providerFor(definition: PluginDefinition, installId: string): string;
    /** The Host's start list said this is the Home half of a dual-instance plugin (specs/dual-instance-plugins). */
    dualInstance(definition: PluginDefinition): boolean;
    storage: SqlitePluginPrivateStorage;
    active(): boolean;
    record(installId: string): PluginInstanceRecord | null;
  }) {}

  async start(definition: PluginDefinition, context: PluginStartContext) {
    const manifest = definition.manifest;
    // A dual-instance plugin's Home half leaves these to its project half, and is still given none of their services here.
    if (!this.options.dualInstance(definition) && (manifest.ports?.inputs.length || manifest.ports?.outputs.length || manifest.events?.publishes.length || manifest.events?.subscribes.length
      || manifest.artifacts.produces.length || manifest.artifacts.consumes.length || manifest.process_items?.produces.length || manifest.process_items?.consumes.length)) {
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
    let partitions: PartitionedPluginDatabase | undefined;
    let files: ReturnType<typeof openPluginFiles> | undefined;
    let background: ReturnType<typeof pluginBackgroundFor>;
    let withdrawAgentDefinitions: (() => void) | undefined;
    let withdrawCaller: (() => void) | undefined;
    const dispose = () => {
      active = false; background?.close(); withdrawCaller?.();
      const failures: unknown[] = [];
      for (const release of [() => database?.close(), () => partitions?.close(), () => files?.close(), () => withdrawAgentDefinitions?.(), () => ui.dispose()]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Home 插件服务释放失败");
    };
    try {
      const home = pluginHomeFor(this.options.home);
      const declaration = this.options.database(definition);
      if (declaration?.partition === "project") {
        partitions = openPartitionedPluginDatabase(this.options.home, declaration, authorize, context.install_id, this.deletionsOf(context.install_id));
      }
      else if (declaration) database = openPluginDatabase(this.options.home, declaration, authorize, context.install_id);
      const fileDeclaration = this.options.files(definition);
      if (fileDeclaration) files = openPluginFiles(this.options.home, fileDeclaration, authorize, context.install_id);
      const owned = this.options.ownerFiles(definition);
      const ownerFiles = owned ? createPluginOwnerFilesClient(manifest, owned.declaration, openPluginOwnerFiles(this.options.home, owned.declaration),
        { install_id: context.install_id, assertActive, requireGrant: authorize }) : undefined;
      if (owned?.initialize && context.grants.includes("storage:private") && context.grants.includes(owned.declaration.write_permission)) ownerFiles!.initializeTrusted(owned.initialize);
      withdrawAgentDefinitions = registerPluginAgentDefinitions(home, definition, context.install_id);
      const caller = Object.freeze({ plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: this.options.actorId, project_id: null,
        declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }), assertActive });
      withdrawCaller = issuePluginCaller(caller, heldPermissions(manifest, context.grants));
      const authorized = { ...context, requireGrant: authorize };
      const model = pluginModelFor(home, definition, authorized, assertActive, this.options.modelConfiguration(definition));
      const imageGeneration = pluginImageGenerationFor(home, definition, authorized, this.options.imageGeneration(definition), assertActive);
      const materials = pluginMaterialsFor(home, definition, authorized, assertActive, null);
      const directory = manifest.permissions.some(item => item.permission === DIRECTORY_READ_PERMISSION) ? directoryForHome(this.options.home) : undefined;
      const directoryService: PluginDirectoryService | undefined = directory
        ? { read: (request, signal) => { assertActive(); authorize(DIRECTORY_READ_PERMISSION); return directory.read(request, signal); } } : undefined;
      // A Home instance's jobs have no project of their own: each takes the project of the call that kept it.
      background = pluginBackgroundFor(definition, authorized, assertActive, { actor_id: this.options.actorId, record: activeRecord });
      const storage = manifest.permissions.some(item => item.permission === "storage:private")
        ? this.options.storage.forPlugin(authorized, manifest) : undefined;
      const hosted: PluginStartContext = Object.freeze({ ...authorized, actor_id: this.options.actorId, services: Object.freeze({
        ui: ui.client, database: (partitions ?? database)?.client, ...(files ? { files: files.client } : {}), ...(ownerFiles ? { ownerFiles: ownerFiles.client } : {}), ...(model ? { model } : {}), ...(imageGeneration ? { imageGeneration } : {}), ...(materials ? { materials } : {}), ...(directoryService ? { directory: directoryService } : {}), ...(storage ? { storage } : {}), ...(background ? { background: background.client } : {}),
        actions: pluginHostActions(authorized, manifest, { client: this.options.client, actor_id: this.options.actorId, assertActive, pluginCaller: caller,
          providerId: this.options.providerFor(definition, context.install_id) }),
      }) });
      const contribution = await (background ? background.starting(() => definition.start(hosted)) : definition.start(hosted));
      this.sessions.set(context.install_id, { context: hosted, revoke: () => { active = false; background?.close(); withdrawCaller?.(); }, dispose, partitions, background });
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

  /**
   * The executor's part of deleting a project, when the installation's library is partitioned by project: the running instance closes
   * the project's library (`PartitionedPluginDatabase.clearProject`); running or not, the project is refused to every call begun so far
   * and, until the returned function says the files are gone, to an instance started meanwhile too.
   */
  clearProjectLibrary(installId: string, projectId: string): () => void {
    return this.sessions.get(installId)?.partitions?.clearProject(projectId) ?? beginPartitionClearing(this.deletionsOf(installId), projectId);
  }

  /** The executor's first part of deleting a project: the running instance's background executions accepted in the project stop. */
  stopProjectBackground(installId: string, projectId: string): void {
    this.sessions.get(installId)?.background?.stopProject(projectId);
  }

  /** A project closing: every running instance's jobs kept in that project stop (PG-038); its bounded executions go on. */
  stopProjectJobs(projectId: string): void {
    for (const session of this.sessions.values()) session.background?.stopProjectJobs(projectId);
  }

  private deletionsOf(installId: string): PartitionDeletions {
    let deletions = this.partitionDeletions.get(installId);
    if (!deletions) this.partitionDeletions.set(installId, deletions = partitionDeletions());
    return deletions;
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
