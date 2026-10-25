import { pluginInteraction } from "./plugin-interaction.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { pluginPageActions } from "./plugin-page-actions.js";
import { pluginPageFiles } from "./plugin-page-files.js";
import { ActionError, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient, StoppedServiceCalls, type SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost, createPluginUiClient } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { heldPermissions, issuePluginCaller } from "./plugin-callers.js";
import { openPluginDatabase } from "./plugin-database.js";
import { refuseUngivenSandboxServices } from "./plugin-sandbox-start.js";
import { removeSandboxOwnerFiles, sandboxOwnerFilesFor } from "./plugin-sandbox-owner-files.js";
import { discardInstallationOwnerData, forgetInstallationRecords } from "./plugin-installation-cleanup.js";
import { homeLibraryFor } from "./plugin-database-entries.js";
import { openInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import { beginPartitionClearing, openPartitionedPluginDatabase, partitionDeletions, type PartitionDeletions, type PartitionedPluginDatabase } from "./plugin-database-partitions.js";
import { pluginHomeFor } from "./home-side.js";
import { givenService } from "./plugin-declared-services.js";
import { forgetPluginAgentDefinitions, registerPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";
import { pluginMaterialsFor } from "./plugin-materials-service.js";
import { pluginConnectionsFor } from "./plugin-connections-service.js";
import { pluginBackgroundFor } from "./plugin-background-service.js";
import { pluginImageGenerationFor } from "./plugin-image-generation-service.js";
import { pluginLocalToolsFor } from "./plugin-local-tools-service.js";
import { DIRECTORY_READ_PERMISSION, directoryForHome, type DirectoryGrantService } from "./plugin-directory-service.js";
import { ownerFilesGiven, type PluginOwnerFilesBinding } from "./plugin-owner-files-entries.js";
import { pluginTerminalFor } from "./plugin-terminal-service.js";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";
import { servicesUntilStopped } from "./plugin-stopped-services.js";
import { realpathSync } from "node:fs";
import { join } from "node:path";

/** The Home service set deliberately contains no project Artifact, event, or wiring clients. */
export class HomePluginExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; revoke(): void; dispose(): void; partitions?: PartitionedPluginDatabase;
    background?: ReturnType<typeof pluginBackgroundFor> }>();
  /** Per installation, not per instance: a project deletion under way outlives a restart of the instance (`PartitionDeletions`). */
  private readonly partitionDeletions = new Map<string, PartitionDeletions>();
  /** Service calls each instance's code made after it stopped, each doing nothing (BL-411). */
  private readonly stoppedCalls = new StoppedServiceCalls();
  constructor(private readonly options: {
    home: string; actorId: string; client: ActionClient;
    database(definition: PluginDefinition): HomePluginDatabaseDeclaration | undefined;
    ownerFiles(definition: PluginDefinition): PluginOwnerFilesBinding | undefined;
    modelConfiguration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginModelConfigurationDeclaration | undefined;
    imageGeneration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginImageGenerationDeclaration | undefined;
    providerFor(definition: PluginDefinition, installId: string): string;
    /** The Host's start list said this is the Home half of a dual-instance plugin (specs/dual-instance-plugins). */
    dualInstance(definition: PluginDefinition): boolean;
    storage: SqlitePluginPrivateStorage;
    active(): boolean;
    record(installId: string): PluginInstanceRecord | null;
    /** The Home platform's `invalidateView`: what a Home instance's `services.ui.invalidate` reaches (PG-061). */
    invalidateView(pluginId: string): void;
  }) {}

  async start(definition: PluginDefinition, context: PluginStartContext) {
    // Before anything is built: a package the sandbox cannot serve does not start here either (S-60).
    refuseUngivenSandboxServices(definition, context);
    const manifest = definition.manifest;
    // A dual-instance plugin's Home half leaves these to its project half, and is still given none of their services here.
    if (!this.options.dualInstance(definition) && (manifest.ports?.inputs.length || manifest.ports?.outputs.length || manifest.events?.publishes.length || manifest.events?.subscribes.length
      || manifest.artifacts.produces.length || manifest.artifacts.consumes.length || manifest.process_items?.produces.length || manifest.process_items?.consumes.length)) {
      throw new Error("Home Runtime 尚未提供项目成果、端口或事件服务");
    }
    let active = true, stopped = false;
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
    const ui = createPluginUiClient(new UiHost(), context, manifest,
      { invalidate: () => this.options.invalidateView(manifest.plugin_id), active: () => active && this.options.active() });
    let database: ReturnType<typeof openPluginDatabase> | undefined;
    let partitions: PartitionedPluginDatabase | undefined;
    let background: ReturnType<typeof pluginBackgroundFor>;
    let terminal: ReturnType<typeof pluginTerminalFor>;
    let withdrawAgentDefinitions: (() => void) | undefined;
    let withdrawCaller: (() => void) | undefined, withdrawPages: (() => void) | undefined;
    let directory: ReturnType<DirectoryGrantService["connect"]> | undefined;
    const dispose = () => {
      active = false; stopped = true; withdrawPages?.(); terminal?.dispose(); directory?.dispose(); background?.close(); withdrawCaller?.();
      const failures: unknown[] = [];
      for (const release of [() => database?.close(), () => partitions?.close(), () => withdrawAgentDefinitions?.(), () => ui.dispose()]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Home 插件服务释放失败");
    };
    try {
      const home = pluginHomeFor(this.options.home);
      const library = homeLibraryFor(definition, this.options.database(definition), this.options.record(context.install_id));
      const declaration = library?.declaration;
      if (declaration?.partition === "project") {
        partitions = openPartitionedPluginDatabase(this.options.home, declaration, authorize, context, this.deletionsOf(context.install_id));
      }
      else if (library) {
        const open = () => openPluginDatabase(this.options.home, library.declaration, authorize, context);
        database = library.installed ? openInstalledPluginLibrary(this.options.home, library.installed, library.declaration, home.stores, open) : open();
      }
      // A sandboxed package is installed, not on the start list: its files are its installation's folder of the Home (S-64), the same client over the same port.
      const owned = definition.execution === "sandbox" ? undefined : ownerFilesGiven(definition, this.options.ownerFiles(definition));
      const ownerFiles = owned ? createPluginOwnerFilesClient(manifest, owned.declaration, openPluginOwnerFiles(this.options.home, owned.declaration),
        { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: authorize }, join(realpathSync(this.options.home), owned.declaration.store_name))
        : sandboxOwnerFilesFor({ home: { directory: this.options.home }, project_id: null }, definition, { install_id: context.install_id, installation_generation: context.installation_generation, requireGrant: authorize }, assertActive);
      withdrawAgentDefinitions = registerPluginAgentDefinitions(home, definition, context.install_id);
      const caller = Object.freeze({ plugin_id: manifest.plugin_id, install_id: context.install_id, actor_id: this.options.actorId, project_id: null,
        declaration: structuredClone({ manifest, agent_prompts: definition.agent_prompts, agent_skills: definition.agent_skills }), assertActive });
      withdrawCaller = issuePluginCaller(caller, heldPermissions(manifest, context.grants));
      const authorized = { ...context, requireGrant: authorize };
      const model = pluginModelFor(home, definition, authorized, assertActive, givenService(definition, manifest.model_configuration, this.options.modelConfiguration(definition), "模型设置"));
      const imageGeneration = pluginImageGenerationFor(home, definition, authorized, givenService(definition, manifest.image_generation, this.options.imageGeneration(definition), "图片生成"), assertActive);
      const localTools = pluginLocalToolsFor(definition, authorized, assertActive);
      const materials = pluginMaterialsFor(home, definition, authorized, assertActive, null);
      const connections = pluginConnectionsFor(home, definition, authorized, assertActive);
      directory = manifest.permissions.some(item => item.permission === DIRECTORY_READ_PERMISSION)
        ? directoryForHome(this.options.home).connect({ plugin_id: manifest.plugin_id, install_id: context.install_id, installation_generation: context.installation_generation, name: manifest.name,
          project_id: null, actor_id: this.options.actorId, assertCurrent: () => authorize(DIRECTORY_READ_PERMISSION) }) : undefined;
      // A Home instance's jobs have no project of their own: each takes the project of the call that kept it.
      background = pluginBackgroundFor(definition, authorized, assertActive, { actor_id: this.options.actorId, record: activeRecord });
      const storage = manifest.permissions.some(item => item.permission === "storage:private")
        ? this.options.storage.forPlugin(authorized, manifest) : undefined;
      terminal = pluginTerminalFor(this.options.home, manifest, authorized, ownerFiles?.client, assertActive);
      const hosted: PluginStartContext = Object.freeze({ ...authorized, actor_id: this.options.actorId, services: Object.freeze({
        ui: ui.client, interaction: pluginInteraction, terminal: terminal?.client, database: (partitions ?? database)?.client, ...(ownerFiles ? { ownerFiles: ownerFiles.client } : {}), ...(model ? { model } : {}), ...(imageGeneration ? { imageGeneration } : {}), ...(localTools ? { localTools } : {}), ...(materials ? { materials } : {}), ...(connections ? { connections } : {}), ...(directory ? { directory: directory.client } : {}), ...(storage ? { storage } : {}), ...(background ? { background: background.client } : {}),
        actions: pluginHostActions(authorized, manifest, { client: this.options.client, actor_id: this.options.actorId, assertActive, pluginCaller: caller,
          providerId: this.options.providerFor(definition, context.install_id) }),
      }) });
      withdrawPages = pluginPagesFor(this.options.home).connect({ manifest, install_id: context.install_id, project_id: null, actor_id: this.options.actorId,
        resolveFiles: owned ? pluginPageFiles(this.options.home, owned.declaration, authorize) : undefined,
        invoke: pluginPageActions(manifest, authorized, { client: this.options.client, actions: hosted.services?.actions, caller, provider: this.options.providerFor(definition, context.install_id) }),
        assertCurrent: permission => permission ? authorize(permission) : assertActive() });
      const given = servicesUntilStopped(hosted, () => stopped, this.stoppedCalls);
      const contribution = await (background ? background.starting(() => definition.start(given)) : definition.start(given));
      this.sessions.set(context.install_id, { context: given, revoke: () => { active = false; withdrawPages?.(); terminal?.dispose(); directory?.dispose(); background?.close(); withdrawCaller?.(); }, dispose, partitions, background });
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
  uninstalled(record: PluginInstanceRecord): void {
    forgetPluginAgentDefinitions(pluginHomeFor(this.options.home), record.install_id);
    if (record.execution === "sandbox" && !record.retain_private_data) removeSandboxOwnerFiles({ home: { directory: this.options.home }, project_id: null }, record.install_id);
    if (!record.retain_private_data) forgetInstallationRecords({ home: { directory: this.options.home }, project_id: null }, record);
  }
  keptDataDiscarded(record: PluginInstanceRecord): void {
    discardInstallationOwnerData({ home: { directory: this.options.home }, project_id: null }, record, id => this.options.storage.deleteInstallationData(id));
  }
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
