import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindProjectNotifications } from "./plugin-notification-delivery.js";
import { hostErrors } from "./host-errors.js";
import { informationActionProvider } from "./information-actions.js";
import { bindHomeSide, bindPluginCatalog, releaseHomeSide, type PluginFixture } from "./home-side.js";
import { homeActionProvider } from "./home-actions.js";
import { openProjectSchedulers, closeProjectSchedulers } from "./project-schedulers.js";
import { precompileActionSchemas, refuseCall, type CallSettled } from "@molis-ai/molis-work-kernel";
import { createConnectorMcpDirectory, type ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import { projectWorkspaceActionProvider } from "./project-workspace-actions.js";
import { announceWorkspaceSettingsChange } from "./workspace-settings-events.js";
import type { PtySpawnRequest, PtySpawnResult } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { artifactActionProvider } from "./artifact-actions.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { createWebCatalogAccess } from "./web-catalog-access.js";
import { projectPluginJudge } from "./project-action-availability.js";
import { AlchemistHostService, type AlchemistHostOptions } from "./alchemist-service-host.js";
import { charactersActionProvider } from "./characters-host.js";
import { actionUsagesProvider } from "./action-usage-actions.js";
import { ActionCallLog } from "./action-call-log.js";
import { connectorAccountActionProvider } from "./connector-account-actions.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { pluginConsentProvider } from "./installed-plugin-consent-actions.js";
import { pluginInstallProviderFor } from "./plugin-trust-actions.js";
import type { HostCompleteText } from "./host-complete-text.js";
import { SystemFunctionsActions } from "./judgment-rules-actions.js";
import { seedSceneRules, type FunctionsHostOptions } from "./judgment-rules-host.js";
import { admitProviderRules } from "./scene-rule-admission.js";
import { releaseAgentStudio } from "./plugin-builder/agent-surface.js";
import { releaseInstalledPlugins } from "./installed-plugin-host.js";
import { ensureProjectPluginActions, prepareInstalledPlugins } from "./project-plugin-ports.js";
import path from "node:path";
import { prepareMemoryHome } from "./memory/memory-initialization.js";
import { closeConnectorResources } from "./connector-lifecycle.js";
import { randomUUID } from "node:crypto";
import { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { resolveConfiguredHome } from "./product-home.js";
import { LocalHost, type HostCapabilityHandler, type LocalHostOptions } from "./local-host.js";
import { openProjectVersionStores, type ProjectVersionStores } from "./project-version-stores.js";
import { LocalProjectDatabase } from "./project-database.js";
import { registerProjectCapabilities } from "./project-capabilities.js";
import { releaseProjectPlugins } from "./project-plugins.js";
import type { LocalHostProjectClient, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionProviderRegistration, type ActionRegistryPort, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { createSearchHost, type SearchHost } from "./search-actions.js";
import { createPlacementHost, type PlacementHost, type PlacementProjectRecord } from "./placement-actions.js";
import { isPersonalSpace } from "./personal-space.js";
import { registerProjectRuntimeOwner } from "./project-deleted-runtime.js";
import { installedConnectionSlots, installedPluginManifest } from "./plugin-installation-directory.js";
import { localWebActionContext } from "./local-web-actions.js";
import { HomePluginHost } from "./home-plugins.js";
import { homeProjectReach } from "./project-reach.js";
import { assertFixtureScopes } from "./plugin-scope-entries.js";
import { homePluginActions, withPreparedActions } from "./plugin-actions-client.js";
import { homePluginEntries } from "./plugin-registry.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { hostLog, logSearchIndexFailure } from "./host-log.js";
import { withoutRefusedPlugins } from "./project-plugin-databases.js";
import { closeHomeStorageLifetime, ensureHomeStorageOwner, releaseHomeStorageOwner, retainInitializationCleanup } from "./home-storage-lifetime.js";

/** One open project: its library, and the library's one 成果库 and process items (D3). */
export interface MolisWorkProjectRuntime extends ProjectVersionStores {
  store: LocalProjectDatabase;
  /** Which project this runtime serves. Capabilities scope their answers to it. */
  project_id: string;
}

export interface MolisWorkLocalHostOptions {
  clock?: () => Date;
  instanceId?: string;
  homeDirectory?: string;
  functions?: FunctionsHostOptions;
  alchemist?: AlchemistHostOptions;
  /** Shared text provider injection; null explicitly disables model completion. */
  completeText?: HostCompleteText | null;
  /**
   * Plugins that exist only for a test or a probe: the Host runs them in process, beside the shipped ones, in every project's
   * platform. Never `host` trust (they register under their installation id), and never sandboxed; one may be given a library in the
   * Home, as a start-list entry gives one to a shipped plugin. Production composition passes none. They are registered per
   * Home and read when a project's platform starts (`home-side.ts`). `installed`: definitions the test installs into the Host's
   * Runtimes itself (`runtime.install`, `platform.start`) rather than starting from a list; a set it fills before it does, so the
   * Runtime admits exactly those objects to the process (S-75 ⑥). No production code passes `pluginFixtures` (RAC-995).
   */
  pluginFixtures?: { project?: readonly PluginFixture[]; home?: readonly PluginFixture[]; installed?: ReadonlySet<PluginDefinition> };
  sceneAvailability?: LocalHostOptions<MolisWorkProjectRuntime>["sceneAvailability"];
  actionAvailability?: LocalHostOptions<MolisWorkProjectRuntime>["actionAvailability"];
  onRuntimeOpen?: (reference: LocalHostProjectReference) => void;
  onRuntimeClose?: (reference: LocalHostProjectReference) => void;
  /** Web composition supplies an empty prefix for its explicit standalone project; catalog projects use /projects/<id>. */
  projectRoutePrefix?(projectId: string): string;
  /**
   * Resolves the workspace a project is bound to. The catalog lives at the Home
   * level, above a single project's database, so the composition supplies it.
   *
   * Left out, the workspace Capability is **not registered at all**: a Plugin
   * then sees it as unavailable, which is true, instead of an answer of "no
   * workspace", which would not be.
   */
  workspacesFor?: (projectId: string) => readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** The native terminal a Character launch starts in; the web entry owns it and supplies it once it is up. */
  characterSpawn?: (request: PtySpawnRequest) => PtySpawnResult;
}

export function molisWorkHostProjectReference(input: {
  databasePath: string;
  projectId: string;
}): LocalHostProjectReference {
  const storageKey = path.resolve(input.databasePath);
  return {
    project_id: input.projectId.trim() || `database:${storageKey}`,
    storage_key: storageKey,
  };
}

/**
 * The project composition owner: one database and application per Host runtime.
 */
export class MolisWorkLocalHost {
  private readonly host: LocalHost<MolisWorkProjectRuntime>;
  private personalPlanningHome?: string;
  /** Tools of remote MCP connections in 服务连接, as Home actions; absent without a Home. */
  readonly connectorMcp?: ConnectorMcpDirectory;
  private catalogRunner?: LocalWebCatalogRunner;
  private webCatalog?: { home: string; access: ReturnType<typeof createWebCatalogAccess> };
  private readonly systemFunctions?: SystemFunctionsActions;
  private readonly alchemist?: AlchemistHostService;
  private agents?: { home: string; service: AgentHostComposition };
  private readonly closing: { started?: boolean; completed: Set<string>; attempt?: Promise<void>; work?: Promise<void> } = { completed: new Set() };
  /** Commands that ran in this Home, for the 调用记录 page; absent without a Home directory. */
  readonly callLog?: ActionCallLog;
  /** System search over this Home's plugins; absent without a Home directory. */
  readonly search?: SearchHost;
  readonly placement?: PlacementHost;
  readonly homePlugins?: HomePluginHost;
  private readonly settleAction: CallSettled = (caller, action, outcome) => {
    this.callLog?.record(caller, action, outcome);
    // Only a completed business command invalidates its views; a preparation refusal has no effect to refresh.
    if (outcome.ok && action.operation === "command" && action.provider_id) { this.search?.changed(action.provider_id, caller.project_id); this.homePlugins?.invalidateView(action.provider_id); }
  };

  constructor(private readonly options: MolisWorkLocalHostOptions = {}) {
    assertFixtureScopes(options.pluginFixtures, Boolean(options.homeDirectory));
    prepareHostMemoryHome(this, options.homeDirectory);
    try {
    this.personalPlanningHome = options.homeDirectory ? path.resolve(options.homeDirectory) : undefined;
    if (options.homeDirectory) this.callLog = new ActionCallLog(options.homeDirectory);
    this.host = new LocalHost({
      instanceId: options.instanceId,
      actionSettled: this.settleAction,
      admitActionProvider: (provider, scenes) => admitProviderRules(options.homeDirectory, provider, scenes),
      actionProvidersChanged: (provider, scenes) => {
        this.search?.providerChanged(provider);
        // A scene's own rule is written when the scene is registered, so an installed plugin's rule is there the same way a shipped one is.
        if (!scenes?.length || !options.homeDirectory) return;
        try { seedSceneRules(options.homeDirectory, provider, scenes, options.functions); } catch (error) { hostLog.warn("functions", "scene_rule_seed_failed", error); }
      },
      actionAvailability: options.actionAvailability,
      sceneAvailability: options.sceneAvailability,
      runtimeFactory: {
        open: async (reference) => {
          options.onRuntimeOpen?.(reference);
          const store = new LocalProjectDatabase(reference.storage_key);
          const clock = options.clock ?? (() => new Date());
          const runtime: MolisWorkProjectRuntime = { store, ...openProjectVersionStores(store, clock), project_id: reference.project_id };
          try {
            const scenes = this.sceneClient(reference);
            const providers: ActionProviderRegistration[] = [], add = (provider: ActionProviderRegistration) => { providers.push(provider); };
            add(projectWorkspaceActionProvider(reference.project_id, () => this.personalPlanningHome && this.catalogRunner ? { home: this.personalPlanningHome, run: this.catalogRunner } : undefined,
              workspaceId => announceWorkspaceSettingsChange(store, reference.project_id, workspaceId)));
            add(artifactActionProvider(runtime, options, this.actionClient(reference)));
            if (options.homeDirectory) add(informationActionProvider(options.homeDirectory, reference.project_id, this.actionClient(reference), options.completeText));
            if (options.homeDirectory) add(charactersActionProvider(runtime, { ...options, homeDirectory: options.homeDirectory }, () => this.agents?.service.charactersCatalog(runtime)));
            if (options.homeDirectory) add(homeActionProvider(options.homeDirectory, reference.project_id,
              { actions: this.actionClient(reference), scenes, functions: options.functions, readFunctions: this.systemFunctions?.read,
                projectPlugins: projectId => this.projectPluginReach(projectId) }, (judgment, caller) => {
                new LocalSqliteJournal(store.db).appendEvent({ eventId: `event-${randomUUID()}`, projectId: reference.project_id, actorId: caller.actor_id,
                  objectType: "judgment", objectId: judgment.judgment_id, type: "judgment_completed", reason: judgment.outcome,
                  payload: { judgment_id: judgment.judgment_id }, at: judgment.created_at });
              }));
            await registerProviders(this.host.actionRegistry(reference), withoutRefusedPlugins(store.db, providers, entry => entry.provider.plugin_id));
            bindProjectNotifications(store.db, reference.project_id, this.actionClient(reference));
            openProjectSchedulers(this, runtime, reference);
            return runtime;
          } catch (error) {
            store.close();
            throw error;
          }
        },
        close: (runtime, reference) => closeProjectRuntime(runtime, () => options.onRuntimeClose?.(reference), () => closeProjectSchedulers(this, runtime, reference), () => this.homePlugins?.stopProjectJobs(runtime.project_id)),
      },
    });
    if (options.homeDirectory) this.homePlugins = new HomePluginHost({ home: options.homeDirectory, actorId: LOCAL_PERSON_ACTOR_ID,
      registry: this.host.actionRegistry(), client: homePluginActions(this.host), inspect: caller => this.host.inspectActions(caller), entries: homePluginEntries(), fixtures: options.pluginFixtures?.home, installed: options.pluginFixtures?.installed, projectReach: homeProjectReach(options.homeDirectory, () => this.host.projects()) });
    if (options.homeDirectory) {
      this.alchemist = new AlchemistHostService(options.homeDirectory, options.alchemist);
      this.host.actionRegistry().registerProvider(this.alchemist.provider());
    }
    if (options.homeDirectory) this.systemFunctions = new SystemFunctionsActions(this.host.actionRegistry(), options.homeDirectory, options.functions ?? {}, caller => {
      const project = caller.project_id ? this.host.projects().find(row => row.project_id === caller.project_id) : undefined;
      if (caller.project_id && !project) throw new ActionError("actions.scope_mismatch", "判断目录缺少当前项目运行环境");
      return { actions: project ? this.actionClient(project) : this.homeActionClient(), scenes: this.sceneClient(project), projectId: project?.project_id };
    });
    // What the Host offers for as long as it runs, registered here and nowhere else: all `system`, none a plugin's (a plugin registers its own through the Plugin Runtime).
    const platform: ActionProviderRegistration[] = [
      actionUsagesProvider(caller => {
        const project = caller.project_id ? this.host.projects().find(row => row.project_id === caller.project_id) : undefined;
        if (caller.project_id && !project) throw new ActionError("actions.scope_mismatch", "使用位置查询缺少当前项目运行环境");
        return project ? this.actionClient(project) : this.homeActionClient();
      }, options.homeDirectory),
      ...(options.homeDirectory ? [pluginConsentProvider(new HomeConsentLedger(options.homeDirectory)), pluginInstallProviderFor(options.homeDirectory, { host: this.host, options: this.options, agents: () => this.agents?.service, homePlugins: () => this.homePlugins }), connectorAccountActionProvider(options.homeDirectory, (...args) => this.connectorMcp!.remember(...args), { library: async () => this.agents?.service.mcpLibrary(), refresh: async owner => { if (!this.agents) throw new Error("项目 MCP 运行服务未装配"); await this.agents.service.refreshExternalMcp(owner); } }, caller => this.inspectActions(caller, this.host.projects().find(project => project.project_id === caller.project_id)), caller => caller.project_id ? this.actionClient(this.host.projects().find(project => project.project_id === caller.project_id)!) : this.homeActionClient(), (caller, installId, pluginId) => installedConnectionSlots(installId, pluginId, this.homePlugins, reference => this.withProject(reference, runtime => installedPluginManifest(runtime.store.db, installId)), this.host.projects().find(project => project.project_id === caller.project_id)))] : []),
    ];
    registerHostPlatformProviders(this.host.actionRegistry(), platform);
    if (options.homeDirectory) {
      // Remote MCP servers connected in 服务连接: what each last offered is back in the directory at start.
      this.connectorMcp = createConnectorMcpDirectory({ localHost: this, homeDirectory: options.homeDirectory });
      try { this.connectorMcp.sync(); } catch (error) { hostLog.warn("connections", "mcp_sync_failed", error); } // The connections page lists them again.
    }
    registerProjectCapabilities(
      this.host,
      { workspaceFor: options.workspaceFor, workspacesFor: options.workspacesFor },
    );
    if (options.homeDirectory) bindHomeSide(this, options.homeDirectory, options);
    if (options.homeDirectory) {
      const home = options.homeDirectory;
      this.search = createSearchHost({ homeDirectory: home, registry: this.host.actionRegistry(),
        project: projectId => this.host.projects().find(row => row.project_id === projectId && row.state !== "closing"),
        projectClient: reference => this.actionClient(reference), homeClient: () => this.homeActionClient(),
        ownerContext: reference => localWebActionContext(this, reference, LOCAL_OWNER_PERMISSIONS),
        // A project is gone only when the catalog no longer has it and no runtime of it is open (deletion closes it first).
        knownProjects: async () => this.catalogRunner
          ? [...await this.catalogRunner({ homeDirectory: home }, catalog => catalog.listProjects().map(project => project.project_id)),
            ...this.host.projects().map(project => project.project_id)] : null,
        openPersonalSpace: async () => {
          const space = this.catalogRunner ? await this.catalogRunner({ homeDirectory: home }, catalog => catalog.listProjects().find(project => isPersonalSpace(project))) : undefined;
          if (!space) return undefined;
          const value = molisWorkHostProjectReference({ databasePath: space.database_path, projectId: space.project_id });
          await this.withProject(value, () => undefined);
          return value;
        },
        onError: logSearchIndexFailure });
      const reference = (project: PlacementProjectRecord) => molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      this.placement = createPlacementHost({ homeDirectory: home, registry: this.host.actionRegistry(),
        projects: async () => this.catalogRunner ? this.catalogRunner({ homeDirectory: home }, catalog => catalog.listProjects()) : null,
        ensurePersonalSpace: async () => {
          if (!this.catalogRunner) throw hostErrors.catalog_unavailable("项目目录尚未就绪，请稍后重试");
          return this.catalogRunner({ homeDirectory: home }, catalog => catalog.ensurePersonalSpace());
        },
        open: async project => { const value = reference(project); await this.withProject(value, () => undefined); return value; },
        projectClient: value => this.actionClient(value), homeClient: () => this.homeActionClient(),
        ownerContext: value => localWebActionContext(this, value, LOCAL_OWNER_PERMISSIONS) });
    }
    } catch (error) {
      // The failed object is never published. Close everything already constructed before relinquishing its lock.
      throw retainInitializationCleanup(error, () => this.close(), "initialization_cleanup_failed");
    }
  }

  /** A borrowed Web transport keeps the shared connection alive until its external Host closes. */
  ensureWebCatalog(home: string, open: Parameters<typeof createWebCatalogAccess>[1]) {
    if (this.closing.started || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    const storageOwner = ensureHomeStorageOwner(this, canonicalHome);
    if (!this.webCatalog) prepareMemoryHome(canonicalHome, storageOwner);
    return (this.webCatalog ??= { home: canonicalHome, access: createWebCatalogAccess(canonicalHome, open) }).access;
  }

  /** Platform startup injects the existing Catalog owner before accepting requests. */
  configurePersonalPlanning(home: string, withCatalog: LocalWebCatalogRunner): void {
    if (this.closing.started || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    if (this.personalPlanningHome && this.personalPlanningHome !== canonicalHome) throw new ActionError("actions.scope_mismatch", "不能把个人规划服务绑定到其他 Home");
    ensureHomeStorageOwner(this, canonicalHome);
    this.personalPlanningHome = canonicalHome;
    this.catalogRunner = withCatalog;
    bindPluginCatalog(this, canonicalHome, withCatalog);
  }

  /** A transport borrows this service; only the Host owns its lifetime. */
  ensureAgentService(homeDirectory: string, create: (owner: import("@molis-ai/molis-work-storage").StorageOwner) => AgentHostComposition): AgentHostComposition {
    if (this.closing.started || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    const home = path.resolve(homeDirectory);
    const owner = ensureHomeStorageOwner(this, home);
    return (this.agents ??= { home, service: create(owner) }).service;
  }

  /**
   * The seam a composition root wires in services this package must not depend on (the Agent Host above all, which drags a
   * vendored SDK behind it); a service nobody wired is simply not registered, which is what a Plugin then sees. A Host
   * capability is always an action (PG-035).
   */
  registerAction<Input, Output>(definition: ActionDefinition<Input, Output>, handler: HostCapabilityHandler<MolisWorkProjectRuntime, Input, Output>): () => void {
    return this.host.registerAction(definition, handler);
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    return this.host.client(reference);
  }

  /** `preparePlugins: false` skips project Runtime preparation and external MCP restoration; project Runtime actions may not be registered. Home actions are still prepared. */
  actionClient(reference: LocalHostProjectReference, preparePlugins = true): ActionClient {
    return withPreparedActions(this.host.actionClient(reference), async caller => {
      if (preparePlugins) await this.prepareProjectPlugins(reference, caller);
      caller.signal?.throwIfAborted();
      await this.prepareHomeActions();
    }, (caller, action, error) => refuseCall(this.settleAction, caller, action, error));
  }

  syncActionClient(reference: LocalHostProjectReference) { return this.host.syncActionClient(reference); }

  homeActionClient(): ActionClient {
    return withPreparedActions(this.host.homeActionClient(), () => this.prepareHomeActions(),
      (caller, action, error) => refuseCall(this.settleAction, caller, action, error));
  }

  /**
   * The person at this computer's call context for one request, as a page makes it: what the Host registers itself by the person's
   * own permissions, a Runtime plugin's actions by its running installation's grants. Make a new one per request.
   */
  localPersonContext(reference?: LocalHostProjectReference, signal?: AbortSignal): Promise<ActionCallContext> {
    return localWebActionContext(this, reference, LOCAL_OWNER_PERMISSIONS, signal);
  }

  /** Local management inspects registered metadata without borrowing execution permissions. */
  /** Registered declarations only: no Runtime preparation, availability policy or execution authority. */
  inspectActionMetadata(caller: ActionCallContext, reference?: LocalHostProjectReference) { return this.host.inspectActionMetadata(caller, reference); }

  async inspectActions(caller: ActionCallContext, reference?: LocalHostProjectReference) {
    caller.signal?.throwIfAborted();
    await this.prepareHomeActions();
    caller.signal?.throwIfAborted();
    if (reference) await this.prepareProjectPlugins(reference, caller);
    caller.signal?.throwIfAborted();
    return this.host.inspectActions(caller, reference);
  }

  private async prepareProjectPlugins(reference: LocalHostProjectReference, caller: ActionCallContext): Promise<void> {
    caller.signal?.throwIfAborted();
    if (caller.project_id !== reference.project_id.trim()) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
    await ensureProjectPluginActions({ host: this.host, options: this.options, agents: () => this.agents?.service, homePlugins: () => this.homePlugins }, reference);
    caller.signal?.throwIfAborted();
    await this.agents?.service.restoreExternalMcp(reference);
    caller.signal?.throwIfAborted();
    await this.host.withRuntime(reference, runtime => prepareInstalledPlugins({ host: this.host, options: this.options, agents: () => this.agents?.service, homePlugins: () => this.homePlugins }, reference, runtime));
    caller.signal?.throwIfAborted();
  }

  private async prepareHomeActions(): Promise<void> {
    if (this.closing.started || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    // The Home keeps its failed ready promise; unrelated providers remain available while its HTTP entry reports that failure.
    await this.homePlugins?.ready().catch(() => undefined);
    if (this.closing.started || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    this.systemFunctions?.refresh();
  }

  sceneClient(reference?: LocalHostProjectReference): ActionSceneClient {
    const client = this.host.sceneClient(reference);
    const refresh = () => this.prepareHomeActions();
    return {
      discoverScenes: async (caller, judgment) => { await refresh(); return client.discoverScenes(caller, judgment); },
      usages: async (caller, judgment) => { await refresh(); return client.usages(caller, judgment); },
      targets: async (caller, judgment, selection) => { await refresh(); return client.targets(caller, judgment, selection); },
      bind: async (caller, binding, options) => { await refresh(); return client.bind(caller, binding, options); },
      runScene: async (caller, scene, id, event) => { await refresh(); return client.runScene(caller, scene, id, event); },
    };
  }

  actionRegistry(reference?: LocalHostProjectReference): ActionRegistryPort {
    return this.host.actionRegistry(reference);
  }

  withProject<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>,
  ): Promise<Result> {
    return this.host.withRuntime(reference, async runtime => { await prepareInstalledPlugins({ host: this.host, options: this.options, agents: () => this.agents?.service, homePlugins: () => this.homePlugins }, reference, runtime); return operation(runtime); });
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.host.closeProject(referenceOrStorageKey);
  }

  close(): Promise<void> {
    return closeHomeStorageLifetime(this, this.closing, [
        ["search", () => this.search?.close()], ["placement", () => this.placement?.close()],
        ["projects", () => this.host?.close()], ["functions", () => this.systemFunctions?.dispose()],
        ["agents", () => this.agents?.service.dispose()], ["home-plugins", () => this.homePlugins?.close()],
    ], () => this.webCatalog?.access.close(), [["connectors", () => closeConnectorResources(this.options.homeDirectory, this.connectorMcp)],
      ["home-side", () => releaseHomeSide(this)], ["alchemist", () => this.alchemist?.close()]]);
  }

  get instanceId(): string {
    return this.host.instanceId;
  }

  lifecycle(): LocalHostStatus["state"] {
    return this.closing.started && this.host.lifecycle() === "running" ? "closing" : this.host.lifecycle();
  }

  projects(): LocalHostStatus["projects"] {
    return this.host.projects();
  }

  /** Does this project reach the plugin behind a provider? The one judgement actions use (`projectPluginJudge`), by the injected catalog. */
  async projectPluginReach(projectId: string): Promise<(pluginId: string) => boolean | undefined> {
    const home = this.personalPlanningHome;
    if (!this.catalogRunner || !home) throw hostErrors.catalog_unavailable("项目目录尚未就绪，请稍后重试");
    return this.catalogRunner({ homeDirectory: home }, catalog => projectPluginJudge(catalog, projectId, home));
  }

  status(): LocalHostStatus {
    return this.host.status();
  }
}

/** The Host's own providers are `system` and belong to no plugin; this is not a way to hand-register a plugin's actions. */
function registerHostPlatformProviders(registry: ActionRegistryPort, providers: readonly ActionProviderRegistration[]): void {
  for (const registration of providers) {
    if (registration.provider.kind !== "system" || registration.provider.plugin_id) throw new Error("Host 平台动作只登记 system 提供方：" + registration.provider.provider_id);
    registry.registerProvider(registration);
  }
}

/**
 * Registers a project's providers in the order they were built. Their contracts are compiled first, a little at a time,
 * so that opening a project never holds the Host for the whole of it.
 */
async function registerProviders(registry: ActionRegistryPort, providers: readonly ActionProviderRegistration[]): Promise<void> {
  await precompileActionSchemas(providers.flatMap(provider => provider.definitions));
  for (const provider of providers) registry.registerProvider(provider);
}

/**
 * Releases a project's owners (authoring and preview, installed plugins, the project's other plugins) and closes its
 * database. Every step runs even when an earlier one fails: the Host forgets the project afterwards, so a skipped step
 * would leave its instances and the SQLite handle alive for good. The failures are reported once everything ran. The Home
 * instances' jobs kept in the project stop with it (PG-038); the project's own instances stop with their whole activation.
 */
async function closeProjectRuntime(runtime: MolisWorkProjectRuntime, closed: () => void, stopSchedules: () => Promise<void>, stopHomeJobs: () => void): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (step: () => unknown) => { try { await step(); } catch (error) { failures.push(error); } };
  await attempt(stopSchedules);
  await attempt(stopHomeJobs);
  for (const release of [releaseAgentStudio, releaseInstalledPlugins, releaseProjectPlugins]) await attempt(() => release(runtime.store, runtime.project_id));
  await attempt(() => runtime.store.close());
  await attempt(closed);
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "项目关闭时有多处没有完成");
}

/** This synchronous preflight closes its own ledger before throwing; no Host business resource exists yet. */
function prepareHostMemoryHome(host: MolisWorkLocalHost, home: string | undefined): void {
  if (!home) return;
  const owner = ensureHomeStorageOwner(host, home);
  try { prepareMemoryHome(path.resolve(home), owner); }
  catch (error) { releaseHomeStorageOwner(host); throw error; }
}

export function createMolisWorkLocalHost(options: MolisWorkLocalHostOptions = {}): MolisWorkLocalHost {
  // Where the Host starts: its Home is the real path from here on, the one every service it hands the Home to compares with.
  const resolved = options.homeDirectory === undefined ? options : { ...options, homeDirectory: resolveConfiguredHome(options.homeDirectory) };
  const host = new MolisWorkLocalHost(resolved);
  if (resolved.homeDirectory) registerProjectRuntimeOwner(host, path.resolve(resolved.homeDirectory));
  return host;
}
