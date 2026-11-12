import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";
import { renderHomePackageDocument } from "./plugin-builder/agent-surface.js";
import { ActionError, requireSynchronous, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { openHomeInstalledPlugins, type HomeInstalledPlugins } from "./home-installed-plugins.js";
import type { InstalledRelease } from "./installed-release.js";
import { assertStageInstallation, installedStageReleaseMatches } from "./installed-stage-identity.js";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { installedPageSelection } from "./plugin-page-authority.js";
import { captureRuntimeStageOwner } from "./project-plugin-stages.js";
import { pluginErrors, type PluginDefinition, type PluginInstanceRecord, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_PRESENTATION_CAPABILITY, type UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { randomUUID } from "node:crypto";
import { installedArtifacts, supervisedArtifacts } from "./artifact-type-registry.js";
import { declarationOwnersFor, type SettingsVersionClaims } from "./declaration-owners.js";
import { HOST_BUILD_TRUST, leaveRefusal, PluginRouteRouter, PluginRuntime, PluginSupervisor, SqlitePluginConsentLedger, SqlitePluginRuntimeReleaseArtifactRepository, type PluginProjectReach } from "@molis-ai/molis-work-plugin-runtime";
import { HomePluginExecutor } from "./home-plugin-executor.js";
import { registeredNativePlugin } from "./native-plugin-release-artifact.js";
import { pluginEntryIdentity } from "./plugin-entry-identity.js";
import { registerInstalledActions } from './installed-action-registration.js';
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
import type { ProjectActions } from "./plugin-builder/catalog.js";
import type { ProjectReachConsents } from "./plugin-project-reach-consent.js";
import { assertSurfacePresentation, createHomeInstallationScope, type SurfaceInstallRegistry } from "./surface-installation.js";
import { projectedPermissionDeclarations } from "./installed-permission-projection.js";
import type { PluginRetainedItem, PluginUninstallTarget } from "@molis-ai/molis-work-contracts/platform/plugin-trust";

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
  private startFailure?: unknown;
  private installed?: HomeInstalledPlugins;
  private releaseProjectOwners?: () => void;
  private installationDirectory?: ReturnType<typeof openPluginInstallationDirectory>;
  private unwatchArtifacts?: () => void;
  readonly installationScope = createHomeInstallationScope({
    ready: () => this.ready(),
    current: () => !!this.installed && !this.closed && !this.options.ownerClosing?.(),
    catalog: () => {
      if (!this.db || this.closed) throw new ActionError("actions.plugin_unavailable", "Home 插件宿主已关闭");
      return { projectId: null, home: this.options.home, db: this.db, registry: this.options.registry,
        pending: [...this.options.entries.map(entry => entry.manifest), ...pluginFixtureEntries(this.options.fixtures ?? []).map(entry => entry.definition.manifest)] };
    },
  });
  /** Stage projection may observe the live platform without awaiting or starting the Home. */
  readonly surfacePlatform = (): HomePluginPlatform | undefined => this.closed ? undefined : this.platform;
  private readonly releaseRegistration: () => void;
  constructor(private readonly options: { home: string; actorId: string; registry: SurfaceInstallRegistry; client: ActionClient;
    entries: readonly HomePluginEntry[]; fixtures?: readonly PluginFixture[]; installed?: ReadonlySet<PluginDefinition>; projectReach?: PluginProjectReach;
    ownerClosing?(): boolean;
    settingsVersionClaims?: SettingsVersionClaims;
    projectActions?(projectId: string, pluginId: string): Promise<ProjectActions>;
    /** The Home's action directory without the Host's preparation of it (which waits for this host to be ready): what an installed package's capability catalog is read from. */
    inspect?(caller: ActionCallContext): Promise<readonly ActionView[]> | readonly ActionView[] }) {
    this.releaseRegistration = bindHomeRegistration(options.home, this, () => this.outsideBuild());
  }

  /** With start disabled, read the current platform without starting or waiting for the Home plugin owner. */
  ready({ start = true } = {}): Promise<HomePluginPlatform> {
    if (this.closed) return Promise.reject(new ActionError("actions.plugin_unavailable", "Home 插件宿主已关闭"));
    if (!start) return this.platform ? Promise.resolve(this.platform) : Promise.reject(languagePreviewUnavailable());
    if (inLanguagePreview() && !this.opening) return Promise.reject(languagePreviewUnavailable());
    return this.opening ??= this.open();
  }
  retry(): Promise<HomePluginPlatform> {
    if (this.closed || !this.retryable) return this.ready();
    return this.opening = this.open();
  }
  private async open(): Promise<HomePluginPlatform> {
    this.retryable = false; this.startFailure = undefined;
    try { return await this.start(); }
    catch (error) {
      this.startFailure = error;
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
  async projectReachConsents(): Promise<ProjectReachConsents> {
    await this.ready();
    const consent = this.installed?.projectReach;
    if (!consent || this.closed) throw new ActionError("actions.unavailable", "Home 插件的项目同意服务不可用");
    return consent;
  }
  /**
   * Installs a release read from a signed package in the Home, for the person who confirmed it (`PluginInstallService`). It runs in the
   * sandbox, under the pin that confirmation made, and appears among the personal plugins every project reaches (#679).
   */
  async installPackage(release: InstalledRelease, assertCurrent?: () => void): Promise<void> {
    await this.installationScope.run(async assertOpen => {
      const check = () => { assertOpen(); assertCurrent?.(); };
      const installed = this.installed!;
      check();
      await installed.installPackage(release, { consent: true, assertCurrent: check });
      await installed.refreshPublicActions();
    });
  }
  /** Switches an installed package off or on, or removes it (keeping its data or not): the install lifecycle a project's packages have. */
  async packageAction(pluginId: string, action: "enable" | "disable" | "uninstall", input: { keepData?: boolean; target?: PluginUninstallTarget; assertCurrent?: () => void } = {},
    control?: Partial<Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current" | "signal">>): Promise<readonly PluginRetainedItem[]> {
    const change = async (assertOpen?: () => void): Promise<readonly PluginRetainedItem[]> => {
      const assertCurrent = () => {
        assertOpen?.();
        input.assertCurrent?.();
        control?.signal?.throwIfAborted();
        requireSynchronous(control?.assert_authority_current?.());
      };
      await control?.beforeEffect?.();
      assertCurrent();
      const installed = this.installed;
      if (!installed || this.closed) throw new ActionError("actions.missing", "这个 Home 插件不是装进来的包");
      // Taken off from its trusted row alone (BL-915): its package, gone or altered as it may be, is not read; the row is found and checked there.
      if (action === "uninstall") { const retained = await installed.uninstall(pluginId, { ...input, assertCurrent }); await installed.refreshPublicActions(); return retained; }
      const record = installed.recordFor(pluginId);
      if (!record) throw new ActionError("actions.missing", "这个 Home 插件不是装进来的包");
      // Read back without asking whether the publisher is still trusted: the lifecycle refuses to enable a revoked one.
      const release = installed.packageOf(pluginId);
      if (!release) throw new Error(installed.recoveryErrors.get(pluginId) ?? "找不到已安装版本 " + record.version + " 的发布记录");
      await installed.lifecycle(action, release, { ...input, assertCurrent });
      await installed.refreshPublicActions();
      return [];
    };
    if (action !== "disable") return this.installationScope.run(change);
    await this.ready();
    return change();
  }
  /** Stops the installed packages whose publisher the person took back since this last looked (S-87), their data kept. */
  async reconcilePublishers(): Promise<void> { await this.installed?.reconcilePublishers(); }
  /** Refresh installed definitions after activation replacement and before public directory/dispatch reads them. */
  async refreshPublicActions(): Promise<void> { if (!this.closed) await this.installed?.refreshPublicActions(); }
  /** The running installed stage's release; its plugin id is the stage id, and its Manifest owns the label. None when that exact release is not what runs. */
  packageStage(pluginId: string): InstalledRelease | undefined {
    const record = this.installation(pluginId), release = this.installed?.releaseFor(pluginId);
    if (record?.state === "running" && installedStageReleaseMatches(record, release) && !this.packageError(pluginId)) return release;
  }
  /** The page the stage frames, opened under this package's Home activation for the exact installation the person saw. */
  packageDocument(pluginId: string, controlToken: string, projectId: string | null = null, accountRegistration=false, projection=false, expected?: SurfaceInstallationRef) {
    const release = this.packageStage(pluginId), record = this.installation(pluginId);
    if (expected) assertStageInstallation("home", record, expected);
    const manifest = this.platform?.supervisor.manifest(pluginId);
    const owner = manifest && captureRuntimeStageOwner(this.platform, "home", { project_plugin_id: pluginId, manifest });
    return release && owner && record && installedStageReleaseMatches(record, release, manifest) ? renderHomePackageDocument({ home: this.options.home, actorId: this.options.actorId,
      release, controlToken, projectId, accountRegistration, projection, running: () => this.installation(pluginId) ?? undefined,
      selection: installedPageSelection(record, null, () => this.installation(pluginId), owner),
      assertProject: projectId ? async () => {
        if (!this.options.projectActions) throw new ActionError("actions.forbidden", "Home 插件没有项目入口");
        await this.options.projectActions(projectId, pluginId);
      } : undefined }) : undefined;
  }
  /**
   * Why an installed package is not running, when it was not started or stopped itself; none when nothing is wrong with it: the Host's sentence, or
   * (`"code"`) the reason's own code, what the installed list hands the page (BL-915).
   */
  packageError(pluginId: string, as: "message" | "code" = "message"): string | undefined {
    return as === "code" ? this.installed?.recoveryErrors.code(pluginId) : this.installed?.recoveryErrors.get(pluginId);
  }
  /** `started` reads what a started owner runs and none before it started or after it failed: for a read that must neither start nor wait for it. */
  installations(includeSurfaceSlots = false, started = false): Array<PluginInstanceRecord & { surface_slots?: readonly UiSlotDescriptor[] }> {
    const platform = this.platform;
    if (!platform) {
      if (started) return [];
      if (this.startFailure !== undefined) throw this.startFailure;
      throw new ActionError("actions.plugin_unavailable", this.closed ? "Home 插件宿主已关闭" : "Home 插件正在启动，请稍候", { kind: "unavailable" });
    }
    return includeSurfaceSlots ? withSurfaceSlots(platform, platform.runtime.list()) : platform.runtime.list();
  }
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
  /** Only the matching trusted project half may use this Home activation as its optional permission upper bound. */
  capturePermission(project: PluginInstanceRecord, permission: string): () => void {
    const home = this.installation(project.install_id);
    if (!home || !this.dualInstance(project.plugin_id) || home.plugin_id !== project.plugin_id || home.install_id !== project.install_id
      || home.publisher_id !== project.publisher_id || home.publisher_signature !== project.publisher_signature || home.state !== "running" || !this.platform) {
      throw pluginErrors.grant_denied("个人空间插件权限当前不可用");
    }
    const check = this.platform.runtime.capturePermission(home.install_id, permission);
    return () => {
      if (this.installation(home.install_id)?.state !== "running") throw pluginErrors.grant_denied("个人空间插件权限当前不可用");
      check();
    };
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
  async stopProjectJobs(projectId: string): Promise<void> {
    await this.executor?.stopProjectJobs(projectId);
  }
  close(): Promise<void> {
    this.closed = true;
    this.releaseRegistration();
    return this.closing ??= (async () => {
      try { await this.opening; } catch { /* Startup failure was reported to its callers and released by open(). */ }
      await this.installationScope.settled();
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
      const binding = { trust: HOST_BUILD_TRUST, project_data: entry.project_data, dual_instance: entry.dual_instance };
      const loaded: ReturnType<typeof registeredNativePlugin> = registeredNativePlugin(entry, definition => identity.remember([{ ...binding, definition, localePacks: loaded.localePacks }]));
      return { ...loaded, ...binding };
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
      providerFor: identity.providerFor, dualInstance: identity.dualInstance, localePacks: identity.localePacks });
    // The Home half of a dual-instance plugin offers only its share, and no project reaches it: its ports and events are the project half's.
    const ledger = new SqlitePluginConsentLedger(db);
    recordHostAlwaysOnAgreements(ledger, new Set(entries.map(entry => entry.definition.manifest.plugin_id)), new Date().toISOString());
    const runtime: PluginRuntime = new PluginRuntime(repository, executor, { consents: ledger, scope: "home", permissionDeclarations: projectedPermissionDeclarations, hostIds: HOST_PLUGIN_IDS, inProcess: fixtureAdmission(pluginFixtureEntries(this.options.fixtures ?? []), this.options.installed), declarationOwners: declarationOwnersFor(this.options.home, { db, scope: { kind: "home" } }, (pluginId: string): PluginManifest | undefined => supervisor.manifest(pluginId), this.options.settingsVersionClaims), reservedRuleKeys: hostReservedRuleKeys,
      assertPresentation: (manifest, rollback) => assertSurfacePresentation(manifest, this.installationScope.catalog(), runtime, rollback),
      redemption: definition => identity.dualInstance(definition) ? { partial: true, outside_project: true } : {},
      actions: { registry: this.options.registry, providerId: (record, definition) => identity.providerFor(definition, record.install_id),
        register: (definition, contribution, record, registration) => registerInstalledActions(definition, contribution, record, registration,
          { registry: this.options.registry, client: this.options.client, project_id: null }),
        ...(this.options.projectReach ? { projectReach: this.options.projectReach } : {}) } });
    this.releaseProjectOwners = registerPluginProjectCleanup(this.options.home, runtime, entries.map(entry => ({
      definition: entry.definition, project_data: identity.projectDataFor(entry.definition), localePacks: identity.localePacks(entry.definition),
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
      db, privateStorage: storage, closed: () => this.closed || this.options.ownerClosing?.() === true, projectActions: this.options.projectActions,
      // An integration package's sources go to the Home's one registry, the one every project's Feed binds through (BL-530).
      integrations: { registry: () => homeIntegrationRegistry(this.options.home), connections: createCallConnectionsPort(this.options.home) },
      platform: { runtime, supervisor, router: platform.router, consents: ledger, upgrade: platform.upgrade, rollback: (pluginId, definition) => supervisor.rollback(pluginId, definition),
        start: async (started, control) => {
          control?.assertCurrent?.();
          const listed = new Set<string>();
          for (const { definition, trust } of started) {
            if (definition.execution !== "sandbox" || trust?.level !== "pinned") throw pluginErrors.home_scope_unavailable("Home 里只有来自已固定发布者的沙箱包才能这样启动");
            if (listed.has(definition.manifest.plugin_id) || ids.has(definition.manifest.plugin_id)) throw new Error("Home 插件标识重复");
            listed.add(definition.manifest.plugin_id);
          }
          return supervisor.start(started, control);
        } } });
    return platform;
  }
}

/** Each installation with the object slots its running views declare (surface-composition §14), read off the live supervisor. */
function withSurfaceSlots(platform: HomePluginPlatform, records: readonly PluginInstanceRecord[]): Array<PluginInstanceRecord & { surface_slots: readonly UiSlotDescriptor[] }> {
  return records.map(record => {
    const contribution = platform.supervisor.contribution(record.plugin_id);
    return { ...record, surface_slots: contribution?.kind === "app" ? contribution.views?.flatMap(view => view.descriptor.slots) ?? [] : [] };
  });
}
