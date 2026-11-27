import { observationPluginDataCleared } from "./observation-host.js";
import { pluginInteraction } from "./plugin-interaction.js";
import { installedPageRelease, pluginPagesFor } from "./plugin-page-authority.js";
import { installedComponentSubmit } from "./installed-action-registration.js";
import { pluginPageActions } from "./plugin-page-actions.js";
import { pluginPageFiles } from "./plugin-page-files.js";
import { ActionError, type ActionClient, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginDatabaseVersionSwitch, type PluginDefinition, type PluginExecutor, type PluginInstanceRecord, type PluginStartContext, type PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginOwnerFilesClient, StoppedServiceCalls, type SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost, createPluginUiClient, type PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { pluginHostActions } from "./plugin-actions-client.js";
import { heldPermissions, issuePluginCaller } from "./plugin-callers.js";
import { outsidePluginAction, pluginActivationOpen } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { publisherStanding } from "./installed-publisher-standing.js";
import { openPluginDatabase } from "./plugin-home-database-client.js";
import { refuseUngivenSandboxServices } from "./plugin-sandbox-start.js";
import { removeSandboxOwnerFiles, sandboxOwnerFilesFor } from "./plugin-sandbox-owner-files.js";
import { discardInstallationOwnerData, forgetInstallationRecords, forgetLeftoverInstallationBindings } from "./plugin-installation-cleanup.js";
import { homeLibraryFor } from "./plugin-database-entries.js";
import { commitInstalledDatabaseUpgrade, withInstalledHomeSnapshot } from "./plugin-sandbox-database-upgrade.js";
import { installedHomeUpgradeBlocked } from "./installed-home-upgrade-recovery.js";
import { openSandboxHomeLibrary } from "./plugin-sandbox-home-library.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { noteRetained } from "./uninstall-retained.js";
import { openInstalledPluginLibrary, removeInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import { pluginSyncDatabaseDeclaration } from "./plugin-sync-database.js";
import { pluginHomeFor } from "./home-side.js";
import { declaresProjectHalf } from "./plugin-project-coordination.js";
import { homePluginArtifactsFor, type HomeProjectArtifactStores } from "./plugin-home-artifacts.js";
import { copyOutTypes } from "./artifact-type-registry.js";
import { isHostedPlatformPart } from "./platform-part-routes.js";
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
import { disposeWorkTerminalsForOwner, registerWorkTerminalOwner } from "./work-terminal-service.js";
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
  private readonly sessions = new Map<string, { context: PluginStartContext; execution: PluginStopExecution; revoke(): void; dispose(): void;
    background?: ReturnType<typeof pluginBackgroundFor> }>();
  /** A stopped sandbox library's process exit, by installation: what an uninstall waits for before it removes the library (BL-915). */
  private readonly libraryExits = new Map<string, Promise<void>>();
  /** Service calls each instance's code made after it stopped, each doing nothing (BL-411). */
  private readonly stoppedCalls = new StoppedServiceCalls();
  constructor(private readonly options: {
    home: string; actorId: string; client: ActionClient; registry: ActionRegistryPort;
    database(definition: PluginDefinition): HomePluginDatabaseDeclaration | undefined;
    ownerFiles(definition: PluginDefinition): PluginOwnerFilesBinding | undefined;
    imageGeneration(definition: PluginDefinition): import("@molis-ai/molis-work-contracts/platform/plugin").PluginImageGenerationDeclaration | undefined;
    /** The Host's start list said this is the Home half of a dual-instance plugin (specs/archive/dual-instance-plugins). */
    dualInstance(definition: PluginDefinition): boolean;
    storage: SqlitePluginPrivateStorage;
    active(): boolean;
    record(installId: string): PluginInstanceRecord | null;
    /** The Home platform's `invalidateView`: what a Home instance's `services.ui.invalidate` reaches (PG-061). */
    invalidateView(pluginId: string): void;
    wakeView(pluginId: string): void;
    /** The Home's own installation records, read when an instance starts; none before the platform has them. */
    installations(): InstallationDirectoryClient | undefined;
    /** A definition's language files, registered while its instance runs (`pluginTextFor`); absent: none. */
    localePacks?(definition: PluginDefinition): PluginTextReader | null;
    /** The open projects' 成果库, for what a Home instance consumes (`homePluginArtifactsFor`); absent: it reads none. */
    projectArtifacts?: HomeProjectArtifactStores;
  }) {}

  async start(definition: PluginDefinition, context: PluginStartContext) {
    // Before anything is built: a package the sandbox cannot serve does not start here either (S-60).
    refuseUngivenSandboxServices(definition, context);
    const manifest = definition.manifest, execution = definition.execution;
    // A dual-instance plugin's Home half leaves these to its project half, and is still given none of their services here.
    if (!this.options.dualInstance(definition) && declaresProjectHalf(manifest)) {
      throw pluginErrors.state_invalid("Home 级插件不往项目里固定成果，也不给端口和事件：需要它们的插件作双实例，由项目那一半拿这些服务（specs/archive/dual-instance-plugins）");
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
    let background: ReturnType<typeof pluginBackgroundFor>;
    let terminal: ReturnType<typeof pluginTerminalFor>;
    let withdrawAgentDefinitions: (() => void) | undefined;
    let withdrawCaller: (() => void) | undefined, withdrawPages: (() => void) | undefined;
    let directory: ReturnType<DirectoryGrantService["connect"]> | undefined;
    let withdrawText: (() => void) | undefined;
    const dispose = () => {
      active = false; stopped = true;
      const failures: unknown[] = [];
      try { terminal?.dispose(); disposeWorkTerminalsForOwner({ home: this.options.home, install_id: context.install_id }); } catch (error) { failures.push(error); }
      withdrawPages?.(); directory?.dispose(); background?.close(); withdrawCaller?.();
      for (const release of [() => database?.close(), () => { if (sandboxLibrary) { sandboxLibrary.close(); this.libraryExits.set(context.install_id, sandboxLibrary.exited()); } }, () => withdrawAgentDefinitions?.(), () => ui.dispose(), () => withdrawText?.()]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Home 插件服务释放失败");
    };
    try {
      withdrawText = pluginTextFor(this.options, definition, context);
      const home = pluginHomeFor(this.options.home);
      if (record && installedHomeUpgradeBlocked(this.options.home, record)) throw pluginErrors.upgrade_validation_failed("等待 Home 插件库完成恢复");
      const library = homeLibraryFor(definition, this.options.database(definition), record);

      if (library && definition.execution === "sandbox") {
        // The package's code is not in this process: its statements run in a process the Host can kill, over a library the ledger made for it (BL-490).
        sandboxLibrary = await openSandboxHomeLibrary(this.options.home, library.installed!, library.declaration, home.stores, authorize, context);
      }
      else if (library) {
        const open = () => openPluginDatabase(this.options.home, library.declaration, authorize, context, manifest);
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
      // A sandboxed package has no `image_generation` block: its model settings and image connections are derived from its contract's effects (BL-491).
      const model = withSandboxModelSettings(pluginModelFor(home, definition, authorized, assertActive), home, definition, authorized, assertActive);
      const imageGeneration = sandboxImageGenerationFor(home, definition, authorized, assertActive)
        ?? pluginImageGenerationFor(home, definition, authorized, givenService(definition, manifest.image_generation, this.options.imageGeneration(definition), "图片生成"), assertActive);
      const localTools = pluginLocalToolsFor(definition, authorized, assertActive);
      const projects = pluginProjectsFor(definition, authorized, this.options.home, assertActive);
      const materials = pluginMaterialsFor(home, definition, authorized, assertActive, null);
      const connections = pluginConnectionsFor(home, definition, authorized, assertActive);
      const installations = pluginInstallationsFor(manifest, authorized, null, this.options.installations(), assertActive, this.options.home);
      const evidenceCollector = pluginEvidenceCollectorFor(manifest, authorized, null, this.options.home, assertActive);
      // A platform part that takes text out of projects (Shelf) reads what producers mark `copy_out`, never a list of plugin types (44B review P-07).
      const artifacts = homePluginArtifactsFor(manifest, authorized, this.options.projectArtifacts, assertActive, isHostedPlatformPart(manifest.plugin_id) ? () => copyOutTypes() : undefined);
      directory = manifest.permissions.some(item => item.permission === DIRECTORY_READ_PERMISSION)
        ? directoryForHome(this.options.home).connect({ plugin_id: manifest.plugin_id, install_id: context.install_id, installation_generation: context.installation_generation, name: manifest.name,
          project_id: null, actor_id: this.options.actorId, assertCurrent: () => authorize(DIRECTORY_READ_PERMISSION) }) : undefined;
      // A Home instance's jobs have no project of their own: each takes the project of the call that kept it.
      background = pluginBackgroundFor(definition, authorized, assertActive, { actor_id: this.options.actorId, activation: context, home: this.options.home, record: activeRecord });
      const storage = manifest.permissions.some(item => item.permission === "storage:private")
        ? this.options.storage.forPlugin(authorized, manifest) : undefined;
      terminal = pluginTerminalFor({ home: this.options.home, manifest, context: authorized, ownerFiles: ownerFiles?.client, assertActive });
      const hosted: PluginStartContext = Object.freeze({ ...authorized, ...(home.startedAt ? { host_started_at: home.startedAt } : {}), actor_id: this.options.actorId, sync: syncActivation(this.options.home, manifest, authorized, assertActive), copy: copyActivation(this.options.home, manifest, authorized, assertActive), services: Object.freeze({
        ui: ui.client, ...(database?.sync ? {sync: database.sync} : {}), interaction: pluginInteraction, terminal: terminal?.client, database: database?.client, ...(sandboxLibrary ? { database_statements: sandboxLibrary.statements } : {}), ...(ownerFiles ? { ownerFiles: ownerFiles.client } : {}), ...(model ? { model } : {}), ...(imageGeneration ? { imageGeneration } : {}), ...(localTools ? { localTools } : {}), ...(projects ? { projects } : {}), ...(materials ? { materials } : {}), ...(connections ? { connections } : {}), ...(directory ? { directory: directory.client } : {}), ...(storage ? { storage } : {}), ...(background ? { background: background.client } : {}), ...(installations ? { installations } : {}), ...(evidenceCollector ? { evidenceCollector } : {}), ...(artifacts ? { artifacts } : {}),
        actions: pluginHostActions(authorized, manifest, { client: this.options.client, actor_id: this.options.actorId, assertActive, pluginCaller: caller }),
      }) });
      // What a connection card binds an image target under (§13.5 C2): the namespace this instance's own image service binds under, nothing when it has none.
      const image_generation = !imageGeneration ? undefined : definition.execution === "sandbox" ? sandboxImageDeclaration(context.install_id) : manifest.image_generation;
      const submit = installedComponentSubmit(definition, { registry: this.options.registry, project_id: null }, () => this.options.record(context.install_id));
      withdrawPages = pluginPagesFor(this.options.home).connect({ manifest, install_id: context.install_id, instance: context, project_id: null, actor_id: this.options.actorId, image_generation,
        release: record && submit ? installedPageRelease(record) : undefined, componentForm: submit?.form,
        resolveFiles: owned ? pluginPageFiles(this.options.home, owned.declaration, authorize) : undefined,
        invoke: pluginPageActions(manifest, authorized, { client: this.options.client, actions: hosted.services?.actions, caller, provider: context.provider_id, submit }),
        assertCurrent: permission => permission ? authorize(permission) : assertActive() });
      const given = servicesUntilStopped(hosted, () => stopped, this.stoppedCalls);
      const contribution = await runWithPluginText(context, () => background ? background.starting(() => definition.start(given)) : definition.start(given));
      const homeStanding = record?.publisher_trust === "pinned" ? publisherStanding(new HomeConsentLedger(this.options.home)) : undefined;
      registerWorkTerminalOwner({
        home: this.options.home, install_id: context.install_id, project_id: null,
        installation_generation: context.installation_generation, plugin_id: manifest.plugin_id,
        publisher_key_id: record?.publisher_trust === "pinned" ? record.publisher_signature : null,
        assertActive: () => {
          assertActive();
          if (!pluginActivationOpen(context)) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
          if (homeStanding && record && !homeStanding.trusted(record)) throw new ActionError("actions.forbidden", "此插件发布者已被撤销信任");
        },
        requireGrant: permission => authorize(permission),
      });
      this.sessions.set(context.install_id, { context: given, execution, revoke: () => { active = false; this.options.wakeView(manifest.plugin_id); withdrawText?.(); try { terminal?.dispose(); disposeWorkTerminalsForOwner({ home: this.options.home, install_id: context.install_id }); } finally { withdrawPages?.(); directory?.dispose(); background?.close(); withdrawCaller?.(); } }, dispose, background });
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

  /** The executor's first part of deleting a project: the running instance's background executions accepted in the project stop. */
  stopProjectBackground(installId: string, projectId: string): Promise<void> | undefined {
    return this.sessions.get(installId)?.background?.stopProject(projectId);
  }

  /** A project closing: every running instance's jobs kept in that project stop (PG-038); its bounded executions go on. */
  async stopProjectJobs(projectId: string): Promise<void> {
    await Promise.all([...this.sessions.values()].map(session => session.background?.stopProjectJobs(projectId)));
  }

  /** Whether an instance runs a background execution or a job in the project. Its terminals are not the project's: closing it leaves them. */
  hasProjectWork(projectId: string): boolean {
    return [...this.sessions.values()].some(session => !!session.background?.hasProjectWork(projectId));
  }

  /** Synchronous count of active background executions and command-kept jobs across Home plugin instances. */
  activeWorkCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) count += session.background?.activeWorkCount() ?? 0;
    return count;
  }

  capturePrivateData(installId: string): unknown { return this.options.storage.snapshotInstallationData(installId); }
  async uninstalled(record: PluginInstanceRecord): Promise<void> {
    forgetPluginAgentDefinitions(pluginHomeFor(this.options.home), record.install_id);
    // A Home-level installation's directory grants, in every project, go with it (PG-049); kept data does not keep them.
    directoryForHome(this.options.home).forgetInstallation(record.install_id, null);
    // A following install can discard even a retained library. Its statement process must have exited.
    await this.libraryExits.get(record.install_id); this.libraryExits.delete(record.install_id);
    if (record.execution === "sandbox" && !record.retain_private_data) {
      removeSandboxOwnerFiles({ home: { directory: this.options.home }, project_id: null }, record.install_id);
      forgetSandboxImageBindings(this.options.home, record.install_id);
      // Its own library goes too, once its statement process has exited, and only the one the ledger and its verified Manifest agree on (BL-915 A).
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

  async commitDatabaseUpgrade(definition: PluginDefinition, change: PluginDatabaseVersionSwitch): Promise<void> {
    const { assertCurrent, ...expected } = change, home = pluginHomeFor(this.options.home);
    await this.libraryExits.get(change.current.install_id);
    this.libraryExits.delete(change.current.install_id);
    await withInstalledHomeSnapshot(home, change, () => commitInstalledDatabaseUpgrade({
      op: "upgrade-home-database", home: home.directory, target: definition.manifest, change: expected,
      reserved: home.stores.stores.map(({ path, owner }) => ({ path, owner })),
    }, () => { assertCurrent(); home.assertStorageOwner(); }));
  }

  async validateUpgrade(definition: PluginDefinition, context: PluginUpgradeContext, from: PluginInstanceRecord): Promise<void> {
    if (!definition.validateUpgrade) return;
    const storage = definition.manifest.permissions.some(item => item.permission === "storage:private")
      ? this.options.storage.forPlugin(context, definition.manifest) : undefined;
    await definition.validateUpgrade({ from, context: Object.freeze({ ...context,
      services: Object.freeze(storage ? { storage: Object.freeze({ get: storage.get }) } : {}) }) });
  }
}
