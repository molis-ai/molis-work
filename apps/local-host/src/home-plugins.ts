import type { HomePluginNavigationEntry } from "@molis-ai/molis-work-app-workbench";
import { renderHomePackageDocument } from "./plugin-builder/agent-surface.js";
import { ActionError, type ActionCallContext, type ActionClient, type ActionRegistryPort, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { openHomeInstalledPlugins, type HomeInstalledPlugins } from "./home-installed-plugins.js";
import type { InstalledRelease } from "./installed-release.js";
import { pluginErrors, type PluginDefinition, type PluginInstanceRecord, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_PRESENTATION_CAPABILITY } from "@molis-ai/molis-work-contracts/platform/ui";
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
import { fixtureAdmission, pluginFixtureEntries, pluginHomeFor, fixtureDeclarationsFor, type PluginFixture } from "./home-side.js";
import { assertOwnerFilesEntries } from "./plugin-owner-files-entries.js";
import { recordHostAlwaysOnAgreements } from "./always-on-plugins.js";
import { openHomePluginStore } from "./home-plugin-store.js";
import { openPluginInstallationDirectory } from "./plugin-installation-directory.js";
import { HOST_PLUGIN_IDS } from "./host-plugin-ids.js";
import type { PluginPlatform } from "./plugin-platform.js";
import { closeHomePlugins } from "./plugin-platform-close.js";
import { bindHomeRegistration } from "./home-registration.js";
import { hostReservedRuleKeys } from "./scene-rule-admission.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { createCallConnectionsPort } from "./connector-plugin-requests.js";

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
  private installed?: HomeInstalledPlugins;
  private releaseProjectOwners?: () => void;
  private installationDirectory?: ReturnType<typeof openPluginInstallationDirectory>;
  private unwatchArtifacts?: () => void;
  private readonly releaseRegistration: () => void;
  constructor(private readonly options: { home: string; actorId: string; registry: ActionRegistryPort; client: ActionClient;
    entries: readonly HomePluginEntry[]; fixtures?: readonly PluginFixture[]; installed?: ReadonlySet<PluginDefinition>; projectReach?: PluginProjectReach;
    /** The Home's action directory without the Host's preparation of it (which waits for this host to be ready): what an installed package's capability catalog is read from. */
    inspect?(caller: ActionCallContext): Promise<readonly ActionView[]> | readonly ActionView[] }) {
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
   * The plugins registered in the Home, as its pages and routes find them (#679, S-31): the start list's entries, the Host's
   * fixtures, then the signed packages installed in the Home that draw a stage (BL-713). A shipped plugin is keyed by its project
   * key; any other by its plugin id, which has a dot where a project key has none.
   */
  registered(): readonly { readonly key: string; readonly manifest: PluginManifest }[] {
    return [...this.options.entries.map(entry => ({ key: entry.key ?? entry.manifest.plugin_id, manifest: entry.manifest })),
      ...pluginFixtureEntries(this.options.fixtures ?? []).map(entry => ({ key: entry.definition.manifest.plugin_id, manifest: entry.definition.manifest })),
      ...this.installed?.pages() ?? []];
  }
  /**
   * The registered Home plugins outside the start list that have no project half, by plugin id: personal plugins of every project
   * unless it hides them (#679, B3). A dual-instance one is reached through its project half, as before.
   */
  outsideBuild(): readonly string[] {
    return [...pluginFixtureEntries(this.options.fixtures ?? []).map(entry => entry.definition.manifest.plugin_id).filter(id => !this.dualInstance(id)),
      ...this.installed?.running() ?? []];
  }
  /** Whether this is a signed package installed in the Home (BL-628), as opposed to a plugin of the Host's build or one of its fixtures. */
  hasPackage(pluginId: string, retryUninstall = false): boolean { return this.installed?.recordFor(pluginId, retryUninstall) !== undefined; }
  /**
   * Installs a release read from a signed package in the Home, for the person who confirmed it (`PluginInstallService`). It runs in the
   * sandbox, under the pin that confirmation made, and appears among the personal plugins every project reaches (#679).
   */
  async installPackage(release: InstalledRelease): Promise<void> {
    await this.ready();
    const installed = this.installed;
    if (!installed || this.closed) throw new ActionError("actions.plugin_unavailable", "Home 插件宿主已关闭");
    await installed.installPackage(release, { consent: true });
    await installed.refreshPublicActions();
  }
  /** Switches an installed package off or on, or removes it (keeping its data or not): the install lifecycle a project's packages have. */
  async packageAction(pluginId: string, action: "enable" | "disable" | "uninstall", input: { keepData?: boolean } = {}): Promise<void> {
    await this.ready();
    const installed = this.installed, record = installed?.recordFor(pluginId, action === "uninstall");
    if (!installed || this.closed || !record) throw new ActionError("actions.missing", "这个 Home 插件不是装进来的包");
    // Read back without asking whether the publisher is still trusted: the lifecycle refuses to enable a revoked one, and can still take it off.
    const release = installed.packageOf(pluginId, action === "uninstall");
    if (!release) throw new Error(installed.recoveryErrors.get(pluginId) ?? "找不到已安装版本 " + record.version + " 的发布记录");
    await installed.lifecycle(action, release, input);
    await installed.refreshPublicActions();
  }
  /** Stops the installed packages whose publisher the person took back since this last looked (S-87), their data kept. */
  async reconcilePublishers(): Promise<void> { await this.installed?.reconcilePublishers(); }
  /**
   * The signed packages installed in the Home, as the tool bar offers them: those that run and those that were running and did not come
   * back (their page says why), by name. A Home that did not start offers none, nor one whose library cannot be read now.
   */
  async navigation(): Promise<HomePluginNavigationEntry[]> {
    let pages: { key: string; manifest: PluginManifest }[];
    try { await this.ready(); pages = this.installed?.pages() ?? []; }
    catch { return []; /* A Home that did not start, or whose library broke since, has no packages to offer. */ }
    return pages.map(({ key, manifest }) => {
      const icon = manifest.ui?.views?.find(view => view.slot === "stage")?.icon;
      return { plugin_id: key, name: manifest.name, ...icon ? { icon } : {}, surface: this.packageSurface(key) ?? key };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  /**
   * The id of a running installed package's stage in the workbench: its plugin id, which is also the key the Home registered it under, so the
   * switcher and the tab strip find the plugin's name and icon by the stage's id as they do for every other Home plugin. None for what is not
   * such a package, is not running, or did not come back.
   */
  packageSurface(pluginId: string): string | undefined {
    return this.installed?.releaseFor(pluginId) && this.installation(pluginId)?.state === "running" && !this.packageError(pluginId) ? pluginId : undefined;
  }
  /** The page that stage frames (`?frame=workbench`), opened for the person under the package's Home activation. Throws when that is not open. */
  packageDocument(pluginId: string, controlToken: string): string | undefined {
    const release = this.packageSurface(pluginId) ? this.installed?.releaseFor(pluginId) : undefined;
    return release ? renderHomePackageDocument({ home: this.options.home, actorId: this.options.actorId, release, controlToken }) : undefined;
  }
  /** Why an installed package is not running, when it was not started or stopped itself; none when nothing is wrong with it. */
  packageError(pluginId: string): string | undefined { return this.installed?.recoveryErrors.get(pluginId); }
  installations(): PluginInstanceRecord[] { return this.platform?.runtime.list() ?? []; }
  manifest(pluginId: string): PluginManifest | undefined {
    return this.platform?.supervisor.manifest(pluginId)
      ?? this.options.entries.find(entry => entry.manifest.plugin_id === pluginId)?.manifest
      ?? pluginFixtureEntries(this.options.fixtures ?? []).find(entry => entry.definition.manifest.plugin_id === pluginId)?.definition.manifest
      // A package switched off is not known to the supervisor after a restart, and is still the person's to switch on.
      ?? this.installed?.releaseFor(pluginId)?.packaged?.manifest;
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
    this.installed?.close(); this.installed = undefined;
    try {
      const platform = this.platform;
      // closeHomePlugins says what is stopped, and what is only revoked; a record it cannot read is one of the failures thrown below.
      if (platform) await closeHomePlugins(platform, failures);
    } finally {
      this.releaseProjectOwners?.(); this.releaseProjectOwners = undefined;
      this.installationDirectory?.dispose(); this.installationDirectory = undefined;
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
      invalidateView: pluginId => this.platform?.invalidateView(pluginId), installations: () => this.installationDirectory?.client, database: identity.databaseFor,
      modelConfiguration: identity.modelConfigurationFor, imageGeneration: identity.imageGenerationFor, ownerFiles: identity.ownerFilesFor,
      providerFor: identity.providerFor, dualInstance: identity.dualInstance });
    // The Home half of a dual-instance plugin offers only its share, and no project reaches it: its ports and events are the project half's.
    const ledger = new SqlitePluginConsentLedger(db);
    recordHostAlwaysOnAgreements(ledger, new Set(entries.map(entry => entry.definition.manifest.plugin_id)), new Date().toISOString());
    const runtime = new PluginRuntime(repository, executor, { consents: ledger, scope: "home", hostIds: HOST_PLUGIN_IDS, inProcess: fixtureAdmission(pluginFixtureEntries(this.options.fixtures ?? []), this.options.installed), declarationOwners: declarationOwnersFor(this.options.home, { db, scope: { kind: "home" } }, (pluginId: string): PluginManifest | undefined => supervisor.manifest(pluginId)), reservedRuleKeys: hostReservedRuleKeys,
      redemption: definition => identity.dualInstance(definition) ? { partial: true, outside_project: true } : {},
      actions: { registry: this.options.registry, providerId: (record, definition) => identity.providerFor(definition, record.install_id),
        ...(this.options.projectReach ? { projectReach: this.options.projectReach } : {}) } });
    this.releaseProjectOwners = registerPluginProjectCleanup(this.options.home, runtime, entries.map(entry => ({
      definition: entry.definition, project_data: identity.projectDataFor(entry.definition),
    })), executor);
    const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db), hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY] });
    this.installationDirectory = openPluginInstallationDirectory(db, repository, pluginId => supervisor.manifest(pluginId));
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
    const platform = this.platform;
    // The packages installed in the Home start after the Host's own plugins, each on its own: one that cannot start leaves its reason and nothing else less (BL-628).
    // The way to start one is not on the platform this method returns: only a sandboxed definition under a pinned publisher goes through it (S-80).
    this.installed = await openHomeInstalledPlugins({ home: this.options.home, actorId: this.options.actorId, actions: { registry: this.options.registry, client: this.options.client, ...this.options.inspect ? { inspect: this.options.inspect } : {} },
      db, privateStorage: storage, closed: () => this.closed,
      // An integration package's sources go to the Home's one registry, the one every project's Feed binds through (BL-530).
      integrations: { registry: () => homeIntegrationRegistry(this.options.home), connections: createCallConnectionsPort(this.options.home) },
      platform: { runtime, supervisor, router: platform.router, consents: ledger, upgrade: platform.upgrade, rollback: (pluginId, definition) => supervisor.rollback(pluginId, definition),
        start: async started => {
          const listed = new Set<string>();
          for (const { definition, trust } of started) {
            if (definition.execution !== "sandbox" || trust?.level !== "pinned") throw pluginErrors.home_scope_unavailable("Home 里只有来自已固定发布者的沙箱包才能这样启动");
            if (listed.has(definition.manifest.plugin_id) || ids.has(definition.manifest.plugin_id)) throw new Error("Home 插件标识重复");
            listed.add(definition.manifest.plugin_id);
          }
          return supervisor.start(started);
        } } });
    return platform;
  }
}
