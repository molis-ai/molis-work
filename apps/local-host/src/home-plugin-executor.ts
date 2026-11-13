import { observationPluginDataCleared } from "./observation-host.js";
import { pluginInteraction } from "./plugin-interaction.js";
import { installedPageRelease, pluginPagesFor } from "./plugin-page-authority.js";
import { installedComponentSubmit } from "./installed-action-registration.js";
import { pluginPageActions } from "./plugin-page-actions.js";
import { pluginPageFiles } from "./plugin-page-files.js";
import { ActionError, type ActionClient, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginDefinition, type PluginExecutor, type PluginInstanceRecord, type PluginStartContext, type PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient, StoppedServiceCalls, type SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost, createPluginUiClient, type PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { heldPermissions, issuePluginCaller } from "./plugin-callers.js";
import { outsidePluginAction } from "@molis-ai/molis-work-plugin-runtime";
import { openPluginDatabase } from "./plugin-database.js";
import { refuseUngivenSandboxServices } from "./plugin-sandbox-start.js";
import { removeSandboxOwnerFiles, sandboxOwnerFilesFor } from "./plugin-sandbox-owner-files.js";
import { discardInstallationOwnerData, forgetInstallationRecords, forgetLeftoverInstallationBindings } from "./plugin-installation-cleanup.js";
import { homeLibraryFor } from "./plugin-database-entries.js";
import { openSandboxHomeLibrary } from "./plugin-sandbox-home-library.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { noteRetained } from "./uninstall-retained.js";
import { openInstalledPluginLibrary, removeInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import { pluginSyncDatabaseDeclaration } from "./plugin-sync-database.js";
import { beginPartitionClearing, openPartitionedPluginDatabase, partitionDeletions, type PartitionDeletions, type PartitionedPluginDatabase } from "./plugin-database-partitions.js";
import { pluginHomeFor } from "./home-side.js";
import { declaresProjectCoordination } from "./plugin-project-coordination.js";
import { givenService } from "./plugin-declared-services.js";
import { forgetPluginAgentDefinitions, registerPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginModelFor } from "./plugin-model-service.js";
import { pluginMaterialsFor } from "./plugin-materials-service.js";
import { pluginConnectionsFor } from "./plugin-connections-service.js";
import { pluginInstallationsFor, type InstallationDirectoryClient } from "./plugin-installation-directory.js";
import { pluginEvidenceCollectorFor } from "./plugin-evidence-collector.js";
import { pluginBackgroundFor } from "./plugin-background-service.js";
import { pluginImageGenerationFor } from "./plugin-image-generation-service.js";
import { forgetSandboxImageBindings, sandboxImageDeclaration, sandboxImageGenerationFor } from "./sandbox-image-generation.js";
import { withSandboxModelSettings } from "./sandbox-model-settings.js";
import { pluginLocalToolsFor } from "./plugin-local-tools-service.js";
import { pluginProjectsFor } from "./plugin-projects-service.js";
import { DIRECTORY_READ_PERMISSION, directoryForHome, type DirectoryGrantService } from "./plugin-directory-service.js";
import { ownerFilesGiven, type PluginOwnerFilesBinding } from "./plugin-owner-files-entries.js";
import { pluginTerminalFor } from "./plugin-terminal-service.js";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";
import { syncActivation, copyActivation } from "./sync-activation.js";
import { servicesUntilStopped } from "./plugin-stopped-services.js";
import { awaitPluginStopHook, type PluginStopExecution } from "./plugin-stop-hook.js";
import { pluginTextFor, pluginTextViews } from "./plugin-host-services.js";
import { runWithPluginText } from "./web-locale.js";
import { realpathSync } from "node:fs";
import { join } from "node:path";

/** The Home service set deliberately contains no project Artifact, event, or wiring clients (`declaresProjectCoordination`, PG-025). */
export class HomePluginExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; execution: PluginStopExecution; revoke(): void; dispose(): void; partitions?: PartitionedPluginDatabase;
    background?: ReturnType<typeof pluginBackgroundFor> }>();
  /** Per installation, not per instance: a project deletion under way outlives a restart of the instance (`PartitionDeletions`). */
  private readonly partitionDeletions = new Map<string, PartitionDeletions>();
  /** A stopped sandbox library's process exit, by installation: what an uninstall waits for before it removes the library (BL-915). */
  private readonly libraryExits = new Map<string, Promise<void>>();
  /** Service calls each instance's code made after it stopped, each doing nothing (BL-411). */
  private readonly stoppedCalls = new StoppedServiceCalls();
  constructor(private readonly options: {
    home: string; actorId: string; client: ActionClient; registry: ActionRegistryPort;
    database(definition: PluginDefinition): HomePluginDatabaseDeclaration | undefined;
    ownerFiles(definition: PluginDefinition): PluginOwnerFilesBinding | undefined;
    modelConfiguration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginModelConfigurationDeclaration | undefined;
    imageGeneration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginImageGenerationDeclaration | undefined;
    providerFor(definition: PluginDefinition, installId: string): string;
    /** The Host's start list said this is the Home half of a dual-instance plugin (specs/archive/dual-instance-plugins). */
    dualInstance(definition: PluginDefinition): boolean;
    storage: SqlitePluginPrivateStorage;
    active(): boolean;
    record(installId: string): PluginInstanceRecord | null;
    /** The Home platform's `invalidateView`: what a Home instance's `services.ui.invalidate` reaches (PG-061). */
    invalidateView(pluginId: string): void;
    /** The Home's own installation records, read when an instance starts; none before the platform has them. */
    installations(): InstallationDirectoryClient | undefined;
    /** A definition's language files, registered while its instance runs (`pluginTextFor`); absent: none. */
    localePacks?(definition: PluginDefinition): PluginTextReader | null;
  }) {}

  async start(definition: PluginDefinition, context: PluginStartContext) {
    // Before anything is built: a package the sandbox cannot serve does not start here either (S-60).
    refuseUngivenSandboxServices(definition, context);
    const manifest = definition.manifest, execution = definition.execution;
    // A dual-instance plugin's Home half leaves these to its project half, and is still given none of their services here.
    if (!this.options.dualInstance(definition) && declaresProjectCoordination(manifest)) {
      throw pluginErrors.state_invalid("Home 级插件不给项目成果、端口和事件：需要它们的插件作双实例，由项目那一半拿这些服务（specs/archive/dual-instance-plugins）");
    }
    let active = true, stopped = false;
    const record = this.options.record(context.install_id), generation = record?.installation_generation;
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
      { invalidate: () => this.options.invalidateView(manifest.plugin_id), active: () => active && this.options.active(), draw: draw => runWithPluginText(context, draw) });
    let database: ReturnType<typeof openPluginDatabase> | undefined;
    let sandboxLibrary: Awaited<ReturnType<typeof openSandboxHomeLibrary>> | undefined;
    let partitions: PartitionedPluginDatabase | undefined;
    let background: ReturnType<typeof pluginBackgroundFor>;
    let terminal: ReturnType<typeof pluginTerminalFor>;
    let withdrawAgentDefinitions: (() => void) | undefined;
    let withdrawCaller: (() => void) | undefined, withdrawPages: (() => void) | undefined;
    let directory: ReturnType<DirectoryGrantService["connect"]> | undefined;
    let withdrawText: (() => void) | undefined;
    const dispose = () => {
      active = false; stopped = true;
      const failures: unknown[] = [];
      try { terminal?.dispose(); } catch (error) { failures.push(error); }
      withdrawPages?.(); directory?.dispose(); background?.close(); withdrawCaller?.();
      for (const release of [() => database?.close(), () => { if (sandboxLibrary) { sandboxLibrary.close(); this.libraryExits.set(context.install_id, sandboxLibrary.exited()); } }, () => partitions?.close(), () => withdrawAgentDefinitions?.(), () => ui.dispose(), () => withdrawText?.()]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Home 插件服务释放失败");
    };
    try {
      withdrawText = pluginTextFor(this.options, definition, context);
      const home = pluginHomeFor(this.options.home);
      const library = homeLibraryFor(definition, this.options.database(definition), this.options.record(context.install_id));
      const declaration = library?.declaration;
      if (library && definition.execution === "sandbox") {
        // The package's code is not in this process: its statements run in a process the Host can kill, over a library the ledger made for it (BL-490).
        sandboxLibrary = await openSandboxHomeLibrary(this.options.home, library.installed!, library.declaration, home.stores, authorize, context);
      }
      else if (declaration?.partition === "project") {
        partitions = openPartitionedPluginDatabase(this.options.home, declaration, authorize, context, this.deletionsOf(context.install_id));
      }
      else if (library) {
        const open = () => openPluginDatabase(this.options.home, library.declaration, authorize, context, undefined, manifest);
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
      withdrawCaller = issuePluginCaller(caller, heldPermissions(manifest, context.grants), permission => {
        try { outsidePluginAction(() => context.requireGrant(permission)); return true; } catch { return false; }
      });
      const authorized = { ...context, requireGrant: authorize };
      // A sandboxed package has no `model_configuration` or `image_generation` block: its settings and image connections are derived from its contract's effects (BL-491).
      const model = withSandboxModelSettings(pluginModelFor(home, definition, authorized, assertActive, givenService(definition, manifest.model_configuration, this.options.modelConfiguration(definition), "模型设置")), home, definition, authorized, assertActive);
      const imageGeneration = sandboxImageGenerationFor(home, definition, authorized, assertActive)
        ?? pluginImageGenerationFor(home, definition, authorized, givenService(definition, manifest.image_generation, this.options.imageGeneration(definition), "图片生成"), assertActive);
      const localTools = pluginLocalToolsFor(definition, authorized, assertActive);
      const projects = pluginProjectsFor(definition, authorized, this.options.home, assertActive);
      const materials = pluginMaterialsFor(home, definition, authorized, assertActive, null);
      const connections = pluginConnectionsFor(home, definition, authorized, assertActive);
      const installations = pluginInstallationsFor(manifest, authorized, null, this.options.installations(), assertActive, this.options.home);
      const evidenceCollector = pluginEvidenceCollectorFor(manifest, authorized, null, this.options.home, assertActive);
      directory = manifest.permissions.some(item => item.permission === DIRECTORY_READ_PERMISSION)
        ? directoryForHome(this.options.home).connect({ plugin_id: manifest.plugin_id, install_id: context.install_id, installation_generation: context.installation_generation, name: manifest.name,
          project_id: null, actor_id: this.options.actorId, assertCurrent: () => authorize(DIRECTORY_READ_PERMISSION) }) : undefined;
      // A Home instance's jobs have no project of their own: each takes the project of the call that kept it.
      background = pluginBackgroundFor(definition, authorized, assertActive, { actor_id: this.options.actorId, activation: context, home: this.options.home, record: activeRecord });
      const storage = manifest.permissions.some(item => item.permission === "storage:private")
        ? this.options.storage.forPlugin(authorized, manifest) : undefined;
      terminal = pluginTerminalFor({ home: this.options.home, manifest, context: authorized, ownerFiles: ownerFiles?.client, assertActive });
      const hosted: PluginStartContext = Object.freeze({ ...authorized, actor_id: this.options.actorId, sync: syncActivation(this.options.home, manifest, authorized, assertActive), copy: copyActivation(this.options.home, manifest, authorized, assertActive), services: Object.freeze({
        ui: ui.client, ...(database?.sync ? {sync: database.sync} : {}), interaction: pluginInteraction, terminal: terminal?.client, database: (partitions ?? database)?.client, ...(sandboxLibrary ? { database_statements: sandboxLibrary.statements } : {}), ...(ownerFiles ? { ownerFiles: ownerFiles.client } : {}), ...(model ? { model } : {}), ...(imageGeneration ? { imageGeneration } : {}), ...(localTools ? { localTools } : {}), ...(projects ? { projects } : {}), ...(materials ? { materials } : {}), ...(connections ? { connections } : {}), ...(directory ? { directory: directory.client } : {}), ...(storage ? { storage } : {}), ...(background ? { background: background.client } : {}), ...(installations ? { installations } : {}), ...(evidenceCollector ? { evidenceCollector } : {}),
        actions: pluginHostActions(authorized, manifest, { client: this.options.client, actor_id: this.options.actorId, assertActive, pluginCaller: caller,
          providerId: this.options.providerFor(definition, context.install_id) }),
      }) });
      // What a connection card binds an image target under (§13.5 C2): the namespace this instance's own image service binds under, nothing when it has none.
      const image_generation = !imageGeneration ? undefined : definition.execution === "sandbox" ? sandboxImageDeclaration(context.install_id) : manifest.image_generation;
      const submit = installedComponentSubmit(definition, { registry: this.options.registry, project_id: null }, () => this.options.record(context.install_id));
      withdrawPages = pluginPagesFor(this.options.home).connect({ manifest, install_id: context.install_id, instance: context, project_id: null, actor_id: this.options.actorId, image_generation,
        release: record && submit ? installedPageRelease(record) : undefined, componentForm: submit?.form,
        resolveFiles: owned ? pluginPageFiles(this.options.home, owned.declaration, authorize) : undefined,
        invoke: pluginPageActions(manifest, authorized, { client: this.options.client, actions: hosted.services?.actions, caller, provider: this.options.providerFor(definition, context.install_id), submit }),
        assertCurrent: permission => permission ? authorize(permission) : assertActive() });
      const given = servicesUntilStopped(hosted, () => stopped, this.stoppedCalls);
      const contribution = await runWithPluginText(context, () => background ? background.starting(() => definition.start(given)) : definition.start(given));
      this.sessions.set(context.install_id, { context: given, execution, revoke: () => { active = false; withdrawText?.(); try { terminal?.dispose(); } finally { withdrawPages?.(); directory?.dispose(); background?.close(); withdrawCaller?.(); } }, dispose, partitions, background });
      return { contribution: pluginTextViews(contribution, context) };
    } catch (error) {
      try { dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Home 插件启动与服务释放失败"); }
      throw error;
    }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id);
    session?.revoke();
    try { await awaitPluginStopHook(definition, session?.context ?? context, "home", session ? session.execution : definition.execution); }
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
  stopProjectBackground(installId: string, projectId: string): Promise<void> | undefined {
    return this.sessions.get(installId)?.background?.stopProject(projectId);
  }

  blockProjectLibrary(installId: string, projectId: string): () => void {
    return beginPartitionClearing(this.deletionsOf(installId), projectId);
  }

  /** A project closing: every running instance's jobs kept in that project stop (PG-038); its bounded executions go on. */
  async stopProjectJobs(projectId: string): Promise<void> {
    await Promise.all([...this.sessions.values()].map(session => session.background?.stopProjectJobs(projectId)));
  }

  private deletionsOf(installId: string): PartitionDeletions {
    let deletions = this.partitionDeletions.get(installId);
    if (!deletions) this.partitionDeletions.set(installId, deletions = partitionDeletions());
    return deletions;
  }

  capturePrivateData(installId: string): unknown { return this.options.storage.snapshotInstallationData(installId); }
  async uninstalled(record: PluginInstanceRecord): Promise<void> {
    forgetPluginAgentDefinitions(pluginHomeFor(this.options.home), record.install_id);
    // A Home-level installation's directory grants, in every project, go with it (PG-049); kept data does not keep them.
    directoryForHome(this.options.home).forgetInstallation(record.install_id, null);
    if (record.execution === "sandbox" && !record.retain_private_data) {
      removeSandboxOwnerFiles({ home: { directory: this.options.home }, project_id: null }, record.install_id);
      forgetSandboxImageBindings(this.options.home, record.install_id);
      // Its own library goes too, once its statement process has exited, and only the one the ledger and its verified Manifest agree on (BL-915 A).
      await this.libraryExits.get(record.install_id); this.libraryExits.delete(record.install_id);
      const manifest = new SandboxPackageStore(this.options.home).installedManifest(record), declared = manifest?.databases?.home;
      const kept = removeInstalledPluginLibrary(this.options.home, record, manifest && declared ? pluginSyncDatabaseDeclaration(manifest, declared) : undefined, pluginHomeFor(this.options.home).stores);
      if (kept) noteRetained(null, record.install_id, { kind: "home_library", reason: kept.reason });
    }
    // Its work records in every project, and the content of the calls it answered or made, go with its data (observation-collection §6).
    if (!record.retain_private_data) observationPluginDataCleared(this.options.home, record);
    forgetInstallationRecords({ home: { directory: this.options.home }, project_id: null }, record);
  }
  prepareReinstall(record: PluginInstanceRecord): void {
    forgetInstallationRecords({ home: { directory: this.options.home }, project_id: null }, record);
    this.prepareNewInstall(record.install_id);
  }
  prepareNewInstall(installId: string): void {
    forgetLeftoverInstallationBindings(this.options.home, installId, { kind: "home" });
  }
  keptDataDiscarded(record: PluginInstanceRecord): void {
    discardInstallationOwnerData({ home: { directory: this.options.home }, project_id: null }, record, id => this.options.storage.deleteInstallationData(id));
    observationPluginDataCleared(this.options.home, record);
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
