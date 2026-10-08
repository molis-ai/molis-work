import { observeGitOperations } from "./git-operation-notifications.js";
import { informationActionProvider } from "./information-actions.js";
import { ensureSystemAgentService, releaseSystemAgentService } from "./system-agent-service.js";
import { homeActionProvider } from "./home-actions.js";
import { workflowEventsFeedOptions } from "./workflow-feed-options.js";
import { bindScheduleDeliveryFeed } from "./schedule-runtime.js";
import { SessionRuntimeService } from "./session-runtime-resources.js";
import { workActionProvider } from "./work-actions.js";
import { createConnectorMcpDirectory, type ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import { projectWorkspaceActionProvider } from "./project-workspace-actions.js";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { artifactActionProvider } from "./artifact-actions.js";
import { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";
import { PersonalPlanningActions } from "./personal-planning-actions.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { createWebCatalogAccess } from "./web-catalog-access.js";
import { goalsActionProvider } from "./goals-actions.js";
import { ImagesHostService } from "./images-service-host.js";
import { AlchemistHostService, type AlchemistHostOptions } from "./alchemist-service-host.js";
import { imagesActionProvider } from "./images-actions.js";
import { pptActionProvider } from "./ppt-actions.js";
import { cogniaActionProvider } from "./cognia-actions.js";
import { pagesActionProvider } from "./pages-actions.js";
import { formActionProvider } from "./form-actions.js";
import { datasetActionProvider } from "./dataset-actions.js";
import { jellyActionProvider } from "./jelly-actions.js";
import { todoActionProvider } from "./todo-actions.js";
import { lingguangActionProvider } from "./lingguang-actions.js";
import { scheduleActionProvider, scheduleReminderActionProvider } from "./schedule-actions.js";
import { shelfActionProvider, shelfProjectActionProvider } from "./shelf-actions.js";
import { experimentsActionProvider } from "./experiments-actions.js";
import { workflowsActionProvider } from "./workflows-actions.js";
import { actionUsagesProvider } from "./action-usage-actions.js";
import { ActionCallLog } from "./action-call-log.js";
import { connectorAccountActionProvider } from "./connector-account-actions.js";
import type { HostCompleteText } from "./host-complete-text.js";
import { nativeContentProviders } from "./content-action-providers.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { SystemFunctionsActions } from "./functions-actions.js";
import type { FunctionsHostOptions } from "./functions-host.js";
import { releaseAgentStudio } from "./plugin-builder/agent-surface.js";
import { ensureInstalledPlugins, releaseInstalledPlugins } from "./installed-plugin-host.js";
import { InteractionObserver, goalActionObservation } from './casebook/observer.js';
import path from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { ProjectRecoveryError } from "./project-database.js";
import { LocalHost, LocalHostError, type LocalHostOptions } from "./local-host.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { LocalProjectDatabase } from "./project-database.js";
import { registerProjectCapabilities } from "./project-capabilities.js";
import { ensureProjectPlugins, releaseProjectPlugins } from "./project-plugins.js";
import { configuredModelChoices } from "./configured-models.js";
import type { HostCapabilityDefinition, LocalHostProjectClient, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError, type ActionCallContext, type ActionClient, type ActionRegistryPort, type ActionSceneClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActionProvider } from "./inbox-actions.js";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { createSearchHost, type SearchHost } from "./search-actions.js";
import { createPlacementHost, type PlacementHost, type PlacementProjectRecord } from "./placement-actions.js";
import { isPersonalSpace } from "./personal-space.js";
import { registerProjectRuntimeOwner } from "./project-deleted-runtime.js";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";

export interface MolisWorkProjectRuntime {
  store: LocalProjectDatabase;
  coordinator: GoalProjectApplication;
  /** Which project this runtime serves. Capabilities scope their answers to it. */
  project_id: string;
  interactionObserver?: InteractionObserver;
}

export interface MolisWorkLocalHostOptions {
  planningMethods?: () => readonly PlanningMethodPack[];
  clock?: () => Date;
  instanceId?: string;
  homeDirectory?: string;
  runtimeSessionTransport?: RuntimeSessionTransport;
  functions?: FunctionsHostOptions;
  alchemist?: AlchemistHostOptions;
  /** Shared text provider injection; null explicitly disables model completion. */
  completeText?: HostCompleteText | null;
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
  private readonly images?: ImagesHostService;
  private readonly alchemist?: AlchemistHostService;
  private readonly existingOnly = new Set<string>();
  private agents?: { home: string; service: AgentHostComposition };
  private closing?: Promise<void>;
  private readonly sessions: SessionRuntimeService;
  /** Commands that ran in this Home, for the 调用记录 page; absent without a Home directory. */
  readonly callLog?: ActionCallLog;
  /** System search over this Home's plugins; absent without a Home directory. */
  readonly search?: SearchHost;
  readonly placement?: PlacementHost;

  constructor(private readonly options: MolisWorkLocalHostOptions = {}) {
    this.sessions = new SessionRuntimeService(options);
    this.personalPlanningHome = options.homeDirectory ? path.resolve(options.homeDirectory) : undefined;
    if (options.homeDirectory) this.callLog = new ActionCallLog(options.homeDirectory);
    this.host = new LocalHost({
      instanceId: options.instanceId,
      actionSettled: (caller, action, outcome) => {
        this.callLog?.record(caller, action, outcome);
        // Any successful command, from a page, the Assistant, a workflow or MCP, may change what search should find.
        if (outcome.ok && action.operation === "command" && action.provider_id) this.search?.changed(action.provider_id, caller.project_id);
      },
      actionProvidersChanged: provider => this.search?.providerChanged(provider),
      actionAvailability: options.actionAvailability,
      sceneAvailability: options.sceneAvailability,
      observation: {
        before: (runtime, reference, capability, input, caller) => {
          runtime.interactionObserver ??= new InteractionObserver(runtime.store, runtime.coordinator, reference.project_id, reference.project_id);
          const observed = caller.audience === "mcp" ? goalActionObservation(capability, input, reference.project_id, caller) : null;
          if (observed) return runtime.interactionObserver.before(observed.capability, observed.input);
          return runtime.interactionObserver.before(capability, input);
        },
        after: (runtime, ticket, result, threw) => runtime.interactionObserver?.after(ticket, result, threw),
      },
      runtimeFactory: {
        open: (reference) => {
          options.onRuntimeOpen?.(reference);
          const recovering = this.existingOnly.has(reference.storage_key);
          if (recovering && !existsSync(reference.storage_key)) throw new ProjectRecoveryError("project_recovery_missing");
          const store = new LocalProjectDatabase(reference.storage_key, { existingOnly: recovering });
          if (recovering && !store.goalsQuery.getBoard(reference.project_id)) {
            store.close();
            throw new ProjectRecoveryError("project_recovery_board_missing");
          }
          const personalMethods = options.planningMethods ?? (() => this.personalPlanningHome ? readPersonalPlanningMethodPacks(this.personalPlanningHome) : []);
          const coordinator = new GoalProjectApplication(
            store,
            options.clock ?? (() => new Date()),
            personalMethods,
          );
          const runtime: MolisWorkProjectRuntime = {
            store,
            coordinator,
            project_id: reference.project_id,
          };
          try {
            const scenes = this.sceneClient(reference);
            const eventFeed = workflowEventsFeedOptions(scenes, reference.project_id);
            const feed = createLocalFeedApplication(store.db, eventFeed);
            // Reminders and scheduled results are delivered into Feed by the Scheduler's wakeup, with the same judgments.
            bindScheduleDeliveryFeed(store.db, eventFeed);
            const registry = this.host.actionRegistry(reference);
            registry.registerProvider(goalsActionProvider(runtime, personalMethods, this.actionClient(reference)));
            registry.registerProvider(workActionProvider(reference.project_id, this.sessions, this.actionClient(reference)));
            registry.registerProvider(projectWorkspaceActionProvider(reference.project_id, this.sessions,
              () => this.personalPlanningHome && this.catalogRunner ? { home: this.personalPlanningHome, run: this.catalogRunner } : undefined));
            registry.registerProvider(artifactActionProvider(runtime, options, this.actionClient(reference)));
            for (const provider of nativeContentProviders(runtime, feed, options.homeDirectory, this.actionClient(reference), scenes, options.functions)) registry.registerProvider(provider);
            if (options.homeDirectory) registry.registerProvider(pagesActionProvider(options.homeDirectory, runtime, this.actionClient(reference), options.completeText));
            if (options.homeDirectory) registry.registerProvider(pptActionProvider(options.homeDirectory, runtime, options.completeText, this.actionClient(reference)));
            if (options.homeDirectory) registry.registerProvider(formActionProvider(options.homeDirectory, runtime, options.completeText));
            if (options.homeDirectory) registry.registerProvider(datasetActionProvider(options.homeDirectory, runtime, options.completeText));
            if (options.homeDirectory) registry.registerProvider(lingguangActionProvider(options.homeDirectory, reference.project_id, this.actionClient(reference), options.completeText));
            registry.registerProvider(inboxActionProvider(runtime, options.homeDirectory, { actions: this.actionClient(reference), scenes, functions: options.functions }, feed));
            registry.registerProvider(scheduleActionProvider(runtime));
            registry.registerProvider(scheduleReminderActionProvider(runtime, options.projectRoutePrefix?.(reference.project_id)));
            if (options.homeDirectory) registry.registerProvider(informationActionProvider(options.homeDirectory, reference.project_id, this.actionClient(reference), options.completeText));
            if (options.homeDirectory) registry.registerProvider(shelfProjectActionProvider(runtime, options.homeDirectory));
            if (options.homeDirectory) registry.registerProvider(workflowsActionProvider(options.homeDirectory, reference.project_id, this.actionClient(reference), options.completeText));
            if (options.homeDirectory) registry.registerProvider(homeActionProvider(options.homeDirectory, reference.project_id,
              { actions: this.actionClient(reference), scenes, functions: options.functions }, (judgment, caller) => {
                new LocalSqliteJournal(store.db).appendEvent({ eventId: `event-${randomUUID()}`, projectId: reference.project_id, actorId: caller.actor_id,
                  objectType: "judgment", objectId: judgment.judgment_id, type: "judgment_completed", reason: judgment.outcome,
                  payload: { judgment_id: judgment.judgment_id }, at: judgment.created_at });
              }));
            return runtime;
          } catch (error) {
            store.close();
            throw error;
          }
        },
        close: async (runtime, reference) => {
          await releaseAgentStudio(runtime.store, runtime.project_id);
          await releaseInstalledPlugins(runtime.store, runtime.project_id);
          await releaseProjectPlugins(runtime.store, runtime.project_id);
          runtime.store.close();
          options.onRuntimeClose?.(reference);
        },
      },
    });
    if (this.personalPlanningHome) this.personalPlanning = new PersonalPlanningActions(this.personalPlanningHome, this.host.actionRegistry(),
      () => readPersonalPlanningMethodPacks(this.personalPlanningHome!));
    if (options.homeDirectory) {
      this.images = new ImagesHostService(options.homeDirectory);
      this.host.actionRegistry().registerProvider(imagesActionProvider(this.images));
      this.alchemist = new AlchemistHostService(options.homeDirectory, options.alchemist);
      this.host.actionRegistry().registerProvider(this.alchemist.provider());
    }
    if (options.homeDirectory) this.systemFunctions = new SystemFunctionsActions(this.host.actionRegistry(), options.homeDirectory, options.functions ?? {}, caller => {
      const project = caller.project_id ? this.host.status().projects.find(row => row.project_id === caller.project_id) : undefined;
      if (caller.project_id && !project) throw new ActionError("actions.scope_mismatch", "判断目录缺少当前项目运行环境");
      return { actions: project ? this.actionClient(project) : this.homeActionClient(), scenes: this.sceneClient(project), projectId: project?.project_id };
    });
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(jellyActionProvider(options.homeDirectory, options.completeText));
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(todoActionProvider(options.homeDirectory, options.completeText));
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(cogniaActionProvider(options.homeDirectory, this.homeActionClient(), options.completeText));
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(shelfActionProvider(options.homeDirectory));
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(experimentsActionProvider(options.homeDirectory, this.homeActionClient()));
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(connectorAccountActionProvider(options.homeDirectory));
    if (options.homeDirectory) {
      // Remote MCP servers connected in 服务连接: what each last offered is back in the directory at start.
      this.connectorMcp = createConnectorMcpDirectory({ localHost: this, homeDirectory: options.homeDirectory });
      try { this.connectorMcp.sync(); } catch { /* The connections page lists them again. */ }
    }
    this.host.actionRegistry().registerProvider(actionUsagesProvider(caller => {
      const project = caller.project_id ? this.host.status().projects.find(row => row.project_id === caller.project_id) : undefined;
      if (caller.project_id && !project) throw new ActionError("actions.scope_mismatch", "使用位置查询缺少当前项目运行环境");
      return project ? this.actionClient(project) : this.homeActionClient();
    }, options.homeDirectory));
    registerProjectCapabilities(
      this.host,
      { workspaceFor: options.workspaceFor, workspacesFor: options.workspacesFor },
    );
    if (options.homeDirectory) ensureSystemAgentService(this, options.homeDirectory, undefined, { workspaceFor: options.workspaceFor, workspacesFor: options.workspacesFor });
    if (options.homeDirectory) {
      const home = options.homeDirectory;
      this.search = createSearchHost({ homeDirectory: home, registry: this.host.actionRegistry(),
        project: projectId => this.host.status().projects.find(row => row.project_id === projectId && row.state !== "closing"),
        projectClient: reference => this.actionClient(reference), homeClient: () => this.homeActionClient(),
        ownerContext: reference => localWebActionContext(this, reference, LOCAL_OWNER_PERMISSIONS),
        // A project is gone only when the catalog no longer has it and no runtime of it is open (deletion closes it first).
        knownProjects: async () => this.catalogRunner
          ? [...await this.catalogRunner({ homeDirectory: home }, catalog => catalog.listProjects().map(project => project.project_id)),
            ...this.host.status().projects.map(project => project.project_id)] : null,
        openPersonalSpace: async () => {
          const space = this.catalogRunner ? await this.catalogRunner({ homeDirectory: home }, catalog => catalog.listProjects().find(project => isPersonalSpace(project))) : undefined;
          if (!space) return undefined;
          const value = molisWorkHostProjectReference({ databasePath: space.database_path, projectId: space.project_id });
          await this.withProject(value, () => undefined);
          return value;
        },
        onError: (error, where) => { if (process.env.MOLIS_WORK_SEARCH_DEBUG) console.warn(`[search] ${where}:`, error); } });
      const reference = (project: PlacementProjectRecord) => molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      this.placement = createPlacementHost({ homeDirectory: home, registry: this.host.actionRegistry(),
        projects: async () => this.catalogRunner ? this.catalogRunner({ homeDirectory: home }, catalog => catalog.listProjects()) : null,
        ensurePersonalSpace: async () => {
          if (!this.catalogRunner) throw new ActionError("placement.catalog_unavailable", "项目目录尚未就绪，请稍后重试");
          return this.catalogRunner({ homeDirectory: home }, catalog => catalog.ensurePersonalSpace());
        },
        open: async project => { const value = reference(project); await this.withProject(value, () => undefined); return value; },
        projectClient: value => this.actionClient(value), homeClient: () => this.homeActionClient(),
        ownerContext: value => localWebActionContext(this, value, LOCAL_OWNER_PERMISSIONS) });
    }
  }

  /** A borrowed Web transport keeps the shared connection alive until its external Host closes. */
  ensureWebCatalog(home: string, open: Parameters<typeof createWebCatalogAccess>[1]) {
    if (this.closing || this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    if (this.options.homeDirectory && path.resolve(this.options.homeDirectory) !== canonicalHome || this.webCatalog && this.webCatalog.home !== canonicalHome) {
      throw new ActionError("actions.home_mismatch", "项目目录与 Host 必须属于同一个 Home");
    }
    return (this.webCatalog ??= { home: canonicalHome, access: createWebCatalogAccess(canonicalHome, open) }).access;
  }

  /** Platform startup injects the existing Catalog owner before accepting requests. */
  configurePersonalPlanning(home: string, withCatalog: LocalWebCatalogRunner): void {
    if (this.closing || this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    if (this.personalPlanningHome && this.personalPlanningHome !== canonicalHome) throw new ActionError("actions.scope_mismatch", "不能把个人规划服务绑定到其他 Home");
    this.personalPlanningHome = canonicalHome;
    this.personalPlanning ??= new PersonalPlanningActions(canonicalHome, this.host.actionRegistry(), () => readPersonalPlanningMethodPacks(canonicalHome));
    this.personalPlanning.configure(withCatalog);
    this.catalogRunner = withCatalog;
  }

  /** A transport borrows this service; only the Host owns its lifetime. */
  ensureAgentService(homeDirectory: string, create: () => AgentHostComposition): AgentHostComposition {
    if (this.closing || this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
    const home = path.resolve(homeDirectory);
    if (this.options.homeDirectory && path.resolve(this.options.homeDirectory) !== home || this.agents && this.agents.home !== home) {
      throw new ActionError("actions.home_mismatch", "Agent 服务与 Host 必须属于同一个 Home");
    }
    return (this.agents ??= { home, service: create() }).service;
  }

  /**
   * Register one more Capability against this Host.
   *
   * The seam exists so a composition root can wire in services this package
   * must not depend on — the Agent Host above all, which drags a vendored SDK
   * behind it. Whoever owns that service registers it; `local-host` stays free
   * of the dependency, and a service nobody wired is simply not registered,
   * which is what a Plugin should then see.
   */
  registerCapability<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: (runtime: MolisWorkProjectRuntime, input: Input, invocation: import("@molis-ai/molis-work-contracts/platform/app-host").HostCapabilityInvocation) => Output | Promise<Output>,
  ): () => void {
    return this.host.register(definition, handler);
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    return this.host.client(reference);
  }

  actionClient(reference: LocalHostProjectReference): ActionClient {
    const client = this.withSystemActions(this.host.actionClient(reference));
    return {
      discover: async caller => { await this.prepareProjectPlugins(reference, caller); return client.discover(caller); },
      invoke: async (caller, action, input) => { await this.prepareProjectPlugins(reference, caller); return client.invoke(caller, action, input); },
    };
  }

  syncActionClient(reference: LocalHostProjectReference) {
    return this.host.syncActionClient(reference);
  }

  homeActionClient(): ActionClient {
    return this.withSystemActions(this.host.homeActionClient());
  }

  /** Local management inspects registered metadata without borrowing execution permissions. */
  async inspectActions(caller: ActionCallContext, reference?: LocalHostProjectReference) {
    if (this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
    this.systemFunctions?.refresh();
    if (reference) await this.prepareProjectPlugins(reference, caller);
    return this.host.inspectActions(caller, reference);
  }

  private async prepareProjectPlugins(reference: LocalHostProjectReference, caller: ActionCallContext): Promise<void> {
    if (caller.project_id !== reference.project_id.trim()) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
    await this.ensureProjectPluginActions(reference);
    await this.agents?.service.restoreExternalMcp(reference);
    await this.host.withRuntime(reference, runtime => this.prepareInstalledPlugins(reference, runtime));
  }

  private async prepareInstalledPlugins(reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime): Promise<void> {
    if (!this.options.homeDirectory) return;
    const installed = await ensureInstalledPlugins({ store: runtime.store, projectId: runtime.project_id, homeDirectory: this.options.homeDirectory, actorId: LOCAL_PERSON_ACTOR_ID,
      routePrefix: this.options.projectRoutePrefix?.(reference.project_id) ?? `/projects/${encodeURIComponent(reference.project_id)}`,
      capabilities: this.host.client(reference),
      actions: { registry: this.host.actionRegistry(reference), client: { ...this.host.actionClient(reference), ...this.host.syncActionClient(reference) }, project_id: reference.project_id,
        // This internal directory is already in a prepared Host; recursing through the public entry would wait on itself.
        inspect: caller => this.host.inspectActions(caller, reference) } });
    await installed.refreshPublicActions();
  }

  private ensureProjectPluginActions(reference: LocalHostProjectReference): Promise<unknown> {
    return this.host.withRuntime(reference, runtime => ensureProjectPlugins({
      store: runtime.store, projectId: runtime.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: this.options.homeDirectory,
      goalTitle: id => runtime.coordinator.goalQueries.getGoal(runtime.project_id, id)?.title,
      capabilities: this.host.client(reference),
      actions: { registry: this.host.actionRegistry(reference), client: { ...this.host.actionClient(reference), ...this.host.syncActionClient(reference) }, project_id: reference.project_id },
      characterWorkspaces: async () => this.options.workspacesFor ? await this.options.workspacesFor(reference.project_id)
        : this.options.workspaceFor ? [await this.options.workspaceFor(reference.project_id)].filter((value): value is ProjectWorkspaceRef => !!value) : [],
      ...(this.agents ? { observeGitOperations: listener => observeGitOperations(this.agents!.service.agentHost.reviews, runtime.project_id, listener) } : {}),
      // Headless callers reach Coding's actions through the Host's own Agent service; page adapters may still attach theirs.
      ...(this.agents && this.options.homeDirectory ? { execution: { ready: () => this.agents!.service.ready,
        models: async () => configuredModelChoices(this.options.homeDirectory!) } } : {}),
    }));
  }

  private withSystemActions(client: ActionClient): ActionClient {
    const refresh = () => {
      if (this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
      this.systemFunctions?.refresh();
    };
    return {
      discover: async caller => { refresh(); return client.discover(caller); },
      invoke: async (caller, capability, input) => { refresh(); return client.invoke(caller, capability, input); },
    };
  }

  sceneClient(reference?: LocalHostProjectReference): ActionSceneClient {
    const client = this.host.sceneClient(reference);
    const refresh = () => {
      if (this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
      this.systemFunctions?.refresh();
    };
    return {
      discoverScenes: async (caller, judgment) => { refresh(); return client.discoverScenes(caller, judgment); },
      usages: async (caller, judgment) => { refresh(); return client.usages(caller, judgment); },
      targets: async (caller, judgment, selection) => { refresh(); return client.targets(caller, judgment, selection); },
      bind: async (caller, binding, options) => { refresh(); return client.bind(caller, binding, options); },
      runScene: async (caller, scene, id, event) => { refresh(); return client.runScene(caller, scene, id, event); },
    };
  }

  actionRegistry(reference?: LocalHostProjectReference): ActionRegistryPort {
    return this.host.actionRegistry(reference);
  }

  withProject<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>,
  ): Promise<Result> {
    return this.host.withRuntime(reference, async runtime => { await this.prepareInstalledPlugins(reference, runtime); return operation(runtime); });
  }

  /** Only the configured owner calls this; never initialize, create or migrate a project. */
  async restoreExistingProject(reference: LocalHostProjectReference): Promise<void> {
    this.existingOnly.add(reference.storage_key);
    try { await this.ensureProjectPluginActions(reference); await this.withProject(reference, () => undefined); }
    finally { this.existingOnly.delete(reference.storage_key); }
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.host.closeProject(referenceOrStorageKey);
  }

  configureSessionRuntime(home: string, transport?: RuntimeSessionTransport): void { this.sessions.configure(home, transport); }
  sessionResources() { return this.sessions.resources(); }

  close(): Promise<void> {
    return this.closing ??= (async () => {
      releaseSystemAgentService(this);
      this.connectorMcp?.close();
      await this.search?.close().catch(() => undefined);
      try { this.placement?.close(); } catch { /* closing anyway */ }
      try { await this.host.close(); }
      finally {
        this.systemFunctions?.dispose();
        try { await Promise.all([this.agents?.service.dispose(), this.images?.close(), this.alchemist?.close(), this.sessions.close()]); }
        finally { await this.webCatalog?.access.close(); }
      }
    })();
  }

  get instanceId(): string {
    return this.host.instanceId;
  }

  lifecycle(): LocalHostStatus["state"] {
    return this.host.lifecycle();
  }

  status(): LocalHostStatus {
    return this.host.status();
  }
}

export function createMolisWorkLocalHost(options: MolisWorkLocalHostOptions = {}): MolisWorkLocalHost {
  const host = new MolisWorkLocalHost(options);
  if (options.homeDirectory) registerProjectRuntimeOwner(host, path.resolve(options.homeDirectory));
  return host;
}
