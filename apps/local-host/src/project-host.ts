import { bindPluginNotificationFeed } from "./plugin-notification-service.js";
import { hostErrors } from "./host-errors.js";
import { informationActionProvider } from "./information-actions.js";
import { bindHomeSide, bindPluginCatalog, releaseHomeSide, type PluginFixture } from "./home-side.js";
import { homeActionProvider } from "./home-actions.js";
import { workflowEventsFeedOptions } from "./workflow-feed-options.js";
import { openProjectSchedulers, closeProjectSchedulers } from "./project-schedulers.js";
import { precompileActionSchemas, refuseCall, type CallSettled } from "@molis-ai/molis-work-kernel";
import { createConnectorMcpDirectory, type ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import { projectWorkspaceActionProvider } from "./project-workspace-actions.js";
import type { PtySpawnRequest, PtySpawnResult } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { artifactActionProvider } from "./artifact-actions.js";
import { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";
import { PersonalPlanningActions } from "./personal-planning-actions.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { createWebCatalogAccess } from "./web-catalog-access.js";
import { goalsActionProvider } from "./goals-actions.js";
import { AlchemistHostService, type AlchemistHostOptions } from "./alchemist-service-host.js";
import { charactersActionProvider } from "./characters-host.js";
import { actionUsagesProvider } from "./action-usage-actions.js";
import { ActionCallLog } from "./action-call-log.js";
import { connectorAccountActionProvider } from "./connector-account-actions.js";
import type { HostCompleteText } from "./host-complete-text.js";
import { nativeContentProviders } from "./content-action-providers.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { SystemFunctionsActions } from "./functions-actions.js";
import type { FunctionsHostOptions } from "./functions-host.js";
import { releaseAgentStudio } from "./plugin-builder/agent-surface.js";
import { releaseInstalledPlugins } from "./installed-plugin-host.js";
import { ensureProjectPluginActions, prepareInstalledPlugins } from "./project-plugin-ports.js";
import path from "node:path";
import { prepareMemoryHome } from "./memory/memory-adoption.js";
import { closeConnectorResources } from "./connector-lifecycle.js";
import { randomUUID } from "node:crypto";
import { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { LocalHost, type HostCapabilityHandler, type LocalHostOptions } from "./local-host.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { openProjectVersionStores, type ProjectVersionStores } from "./project-version-stores.js";
import { LocalProjectDatabase } from "./project-database.js";
import { registerProjectCapabilities } from "./project-capabilities.js";
import { releaseProjectPlugins } from "./project-plugins.js";
import type { LocalHostProjectClient, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionProviderRegistration, type ActionRegistryPort, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActionProvider } from "./inbox-actions.js";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { createSearchHost, type SearchHost } from "./search-actions.js";
import { createPlacementHost, type PlacementHost, type PlacementProjectRecord } from "./placement-actions.js";
import { isPersonalSpace } from "./personal-space.js";
import { registerProjectRuntimeOwner } from "./project-deleted-runtime.js";
import { localWebActionContext } from "./local-web-actions.js";
import { HomePluginHost } from "./home-plugins.js";
import { assertFixtureScopes } from "./plugin-scope-entries.js";
import { homePluginActions, withPreparedActions } from "./plugin-actions-client.js";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { hostLog, logSearchIndexFailure } from "./host-log.js";
import { withoutRefusedPlugins } from "./project-plugin-databases.js";

/** One open project: its library, Goals' coordinator, and the library's one 成果库 and process items (D3). */
export interface MolisWorkProjectRuntime extends ProjectVersionStores {
  store: LocalProjectDatabase;
  coordinator: GoalProjectApplication;
  /** Which project this runtime serves. Capabilities scope their answers to it. */
  project_id: string;
}

export interface MolisWorkLocalHostOptions {
  planningMethods?: () => readonly PlanningMethodPack[];
  clock?: () => Date;
  instanceId?: string;
  homeDirectory?: string;
  functions?: FunctionsHostOptions;
  alchemist?: AlchemistHostOptions;
  /** Shared text provider injection; null explicitly disables model completion. */
  completeText?: HostCompleteText | null;
  /**
   * Plugins that exist only for a test or a probe: the Host runs them in process, beside the shipped ones, in every project's
   * platform. Never `bundled` (they register under their installation id), and never sandboxed; one may be given a library in the
   * Home, as a start-list entry gives one to a shipped plugin. Production composition passes none. They are registered per
   * Home and read when a project's platform starts (`home-side.ts`).
   */
  pluginFixtures?: { project?: readonly PluginFixture[]; home?: readonly PluginFixture[] };
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
  private personalPlanning?: PersonalPlanningActions;
  private personalPlanningHome?: string;
  /** Tools of remote MCP connections in 服务连接, as Home actions; absent without a Home. */
  readonly connectorMcp?: ConnectorMcpDirectory;
  private catalogRunner?: LocalWebCatalogRunner;
  private webCatalog?: { home: string; access: ReturnType<typeof createWebCatalogAccess> };
  private readonly systemFunctions?: SystemFunctionsActions;
  private readonly alchemist?: AlchemistHostService;
  private agents?: { home: string; service: AgentHostComposition };
  private readonly closing: { resources?: Promise<void>; attempt?: Promise<void> } = {};
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
    if (options.homeDirectory) prepareMemoryHome(path.resolve(options.homeDirectory));
    this.personalPlanningHome = options.homeDirectory ? path.resolve(options.homeDirectory) : undefined;
    if (options.homeDirectory) this.callLog = new ActionCallLog(options.homeDirectory);
    this.host = new LocalHost({
      instanceId: options.instanceId,
      actionSettled: this.settleAction,
      actionProvidersChanged: provider => this.search?.providerChanged(provider),
      actionAvailability: options.actionAvailability,
      sceneAvailability: options.sceneAvailability,
      runtimeFactory: {
        open: async (reference) => {
          options.onRuntimeOpen?.(reference);
          const store = new LocalProjectDatabase(reference.storage_key);
          const personalMethods = options.planningMethods ?? (() => this.personalPlanningHome ? readPersonalPlanningMethodPacks(this.personalPlanningHome) : []);
          const clock = options.clock ?? (() => new Date());
          const coordinator = new GoalProjectApplication(store, clock, personalMethods);
          const runtime: MolisWorkProjectRuntime = { store, coordinator, ...openProjectVersionStores(store, clock), project_id: reference.project_id };
          try {
            const scenes = this.sceneClient(reference);
            const eventFeed = workflowEventsFeedOptions(scenes, reference.project_id);
            const feed = createLocalFeedApplication(store.db, eventFeed);
            bindPluginNotificationFeed(store.db, control => workflowEventsFeedOptions(scenes, reference.project_id, control));
            const providers: ActionProviderRegistration[] = [], add = (provider: ActionProviderRegistration) => { providers.push(provider); };
            add(goalsActionProvider(runtime, personalMethods, this.actionClient(reference)));
            add(projectWorkspaceActionProvider(reference.project_id, () => this.personalPlanningHome && this.catalogRunner ? { home: this.personalPlanningHome, run: this.catalogRunner } : undefined));
            add(artifactActionProvider(runtime, options, this.actionClient(reference)));
            for (const provider of nativeContentProviders(runtime, feed, options.homeDirectory, this.actionClient(reference), scenes, options.functions)) add(provider);
            add(inboxActionProvider(runtime, options.homeDirectory, { actions: this.actionClient(reference), scenes, functions: options.functions, readFunctions: this.systemFunctions?.read }, feed));
            if (options.homeDirectory) add(informationActionProvider(options.homeDirectory, reference.project_id, this.actionClient(reference), options.completeText));
            if (options.homeDirectory) add(charactersActionProvider(runtime, { ...options, homeDirectory: options.homeDirectory }, () => this.agents?.service.charactersCatalog(runtime)));
            if (options.homeDirectory) add(homeActionProvider(options.homeDirectory, reference.project_id,
              { actions: this.actionClient(reference), scenes, functions: options.functions, readFunctions: this.systemFunctions?.read }, (judgment, caller) => {
                new LocalSqliteJournal(store.db).appendEvent({ eventId: `event-${randomUUID()}`, projectId: reference.project_id, actorId: caller.actor_id,
                  objectType: "judgment", objectId: judgment.judgment_id, type: "judgment_completed", reason: judgment.outcome,
                  payload: { judgment_id: judgment.judgment_id }, at: judgment.created_at });
              }));
            await registerProviders(this.host.actionRegistry(reference), withoutRefusedPlugins(store.db, providers, entry => entry.provider.plugin_id));
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
      registry: this.host.actionRegistry(), client: homePluginActions(this.host), entries: BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.runtime ? [{ ...entry.runtime, manifest: entry.manifest,
        ...(entry.project_data ? { project_data: { owner_id: entry.project_plugin_id, declaration: entry.project_data } } : {}),
      }] : []), fixtures: options.pluginFixtures?.home });
    if (this.personalPlanningHome) this.personalPlanning = new PersonalPlanningActions(this.personalPlanningHome, this.host.actionRegistry(),
      () => readPersonalPlanningMethodPacks(this.personalPlanningHome!));
    if (options.homeDirectory) {
      this.alchemist = new AlchemistHostService(options.homeDirectory, options.alchemist);
      this.host.actionRegistry().registerProvider(this.alchemist.provider());
    }
    if (options.homeDirectory) this.systemFunctions = new SystemFunctionsActions(this.host.actionRegistry(), options.homeDirectory, options.functions ?? {}, caller => {
      const project = caller.project_id ? this.host.projects().find(row => row.project_id === caller.project_id) : undefined;
      if (caller.project_id && !project) throw new ActionError("actions.scope_mismatch", "判断目录缺少当前项目运行环境");
      return { actions: project ? this.actionClient(project) : this.homeActionClient(), scenes: this.sceneClient(project), projectId: project?.project_id };
    });
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(connectorAccountActionProvider(options.homeDirectory, (...args) => this.connectorMcp!.remember(...args), { library: async () => this.agents?.service.mcpLibrary(), refresh: async owner => { if (!this.agents) throw new Error("项目 MCP 运行服务未装配"); await this.agents.service.refreshExternalMcp(owner); } }, caller => this.inspectActions(caller, this.host.projects().find(project => project.project_id === caller.project_id)), caller => caller.project_id ? this.actionClient(this.host.projects().find(project => project.project_id === caller.project_id)!) : this.homeActionClient()));
    if (options.homeDirectory) {
      // Remote MCP servers connected in 服务连接: what each last offered is back in the directory at start.
      this.connectorMcp = createConnectorMcpDirectory({ localHost: this, homeDirectory: options.homeDirectory });
      try { this.connectorMcp.sync(); } catch (error) { hostLog.warn("connections", "mcp_sync_failed", error); } // The connections page lists them again.
    }
    this.host.actionRegistry().registerProvider(actionUsagesProvider(caller => {
      const project = caller.project_id ? this.host.projects().find(row => row.project_id === caller.project_id) : undefined;
      if (caller.project_id && !project) throw new ActionError("actions.scope_mismatch", "使用位置查询缺少当前项目运行环境");
      return project ? this.actionClient(project) : this.homeActionClient();
    }, options.homeDirectory));
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
  }

  /** A borrowed Web transport keeps the shared connection alive until its external Host closes. */
  ensureWebCatalog(home: string, open: Parameters<typeof createWebCatalogAccess>[1]) {
    if (this.closing.resources || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    if (this.options.homeDirectory && path.resolve(this.options.homeDirectory) !== canonicalHome || this.webCatalog && this.webCatalog.home !== canonicalHome) {
      throw new ActionError("actions.home_mismatch", "项目目录与 Host 必须属于同一个 Home");
    }
    return (this.webCatalog ??= { home: canonicalHome, access: createWebCatalogAccess(canonicalHome, open) }).access;
  }

  /** Platform startup injects the existing Catalog owner before accepting requests. */
  configurePersonalPlanning(home: string, withCatalog: LocalWebCatalogRunner): void {
    if (this.closing.resources || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    if (this.personalPlanningHome && this.personalPlanningHome !== canonicalHome) throw new ActionError("actions.scope_mismatch", "不能把个人规划服务绑定到其他 Home");
    this.personalPlanningHome = canonicalHome;
    this.personalPlanning ??= new PersonalPlanningActions(canonicalHome, this.host.actionRegistry(), () => readPersonalPlanningMethodPacks(canonicalHome));
    this.personalPlanning.configure(withCatalog);
    this.catalogRunner = withCatalog;
    bindPluginCatalog(this, canonicalHome, withCatalog);
  }

  /** A transport borrows this service; only the Host owns its lifetime. */
  ensureAgentService(homeDirectory: string, create: () => AgentHostComposition): AgentHostComposition {
    if (this.closing.resources || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    const home = path.resolve(homeDirectory);
    if (this.options.homeDirectory && path.resolve(this.options.homeDirectory) !== home || this.agents && this.agents.home !== home) {
      throw new ActionError("actions.home_mismatch", "Agent 服务与 Host 必须属于同一个 Home");
    }
    return (this.agents ??= { home, service: create() }).service;
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

  /** `preparePlugins: false` is for Host callers of what the project registers when it opens (Goals): it starts no Runtime plugin and restores no external MCP first. */
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
    await ensureProjectPluginActions({ host: this.host, options: this.options, agents: () => this.agents?.service }, reference);
    caller.signal?.throwIfAborted();
    await this.agents?.service.restoreExternalMcp(reference);
    caller.signal?.throwIfAborted();
    await this.host.withRuntime(reference, runtime => prepareInstalledPlugins({ host: this.host, options: this.options, agents: () => this.agents?.service }, reference, runtime));
    caller.signal?.throwIfAborted();
  }

  private async prepareHomeActions(): Promise<void> {
    if (this.closing.resources || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
    // The Home keeps its failed ready promise; unrelated providers remain available while its HTTP entry reports that failure.
    await this.homePlugins?.ready().catch(() => undefined);
    if (this.closing.resources || this.host.lifecycle() !== "running") throw hostErrors.closed("Local Host 已关闭");
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
    return this.host.withRuntime(reference, async runtime => { await prepareInstalledPlugins({ host: this.host, options: this.options, agents: () => this.agents?.service }, reference, runtime); return operation(runtime); });
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.host.closeProject(referenceOrStorageKey);
  }

  close(): Promise<void> {
    return this.closing.attempt ??= settleHostClose(this.closing.resources ??= (async () => {
      releaseHomeSide(this);
      await closeConnectorResources(this.options.homeDirectory, this.connectorMcp);
      await this.search?.close().catch(error => { hostLog.warn("projects", "close_step_failed", error, { step: "search" }); });
      try { this.placement?.close(); } catch (error) { hostLog.warn("projects", "close_step_failed", error, { step: "placement" }); } // One that fails to close does not keep the rest open.
      try { await this.host.close(); }
      finally {
        this.systemFunctions?.dispose();
        try { await Promise.all([this.agents?.service.dispose(), this.homePlugins?.close()]); }
        finally { await this.webCatalog?.access.close(); }
      }
    })(), this.alchemist?.close()).catch(error => { this.closing.attempt = undefined; throw error; });
  }

  get instanceId(): string {
    return this.host.instanceId;
  }

  lifecycle(): LocalHostStatus["state"] {
    return this.closing.resources && this.host.lifecycle() === "running" ? "closing" : this.host.lifecycle();
  }

  projects(): LocalHostStatus["projects"] {
    return this.host.projects();
  }

  status(): LocalHostStatus {
    return this.host.status();
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

export function createMolisWorkLocalHost(options: MolisWorkLocalHostOptions = {}): MolisWorkLocalHost {
  const host = new MolisWorkLocalHost(options);
  if (options.homeDirectory) registerProjectRuntimeOwner(host, path.resolve(options.homeDirectory));
  return host;
}

/** Retry Alchemist independently, while the remaining Host teardown retains its original lifetime. */
async function settleHostClose(host: Promise<void>, alchemist: Promise<void> | undefined): Promise<void> {
  const results = await Promise.allSettled([host, alchemist]);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}
