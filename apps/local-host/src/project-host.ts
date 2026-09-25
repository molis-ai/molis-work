import { artifactActionProvider } from "./artifact-actions.js";
import { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";
import { PersonalPlanningActions } from "./personal-planning-actions.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
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
import { lingguangActionProvider } from "./lingguang-actions.js";
import type { HostCompleteText } from "./host-complete-text.js";
import { nativeContentProviders } from "./content-action-providers.js";
import { createLocalFeedApplication, withLocalFeedJudgments } from "./feed-application.js";
import { createInboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import { SystemFunctionsActions } from "./functions-actions.js";
import type { FunctionsHostOptions } from "./functions-host.js";
import { releaseBuilderSurface } from "./plugin-builder-surface.js";
import { InteractionObserver, goalActionObservation } from './casebook/observer.js';
import path from "node:path";
import { existsSync } from "node:fs";
import { ProjectRecoveryError } from "./project-migrations.js";
import { LocalHost, LocalHostError, type LocalHostOptions } from "./local-host.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { LocalProjectDatabase } from "./project-database.js";
import { registerProjectCapabilities } from "./project-capabilities.js";
import { ensureProjectPlugins, releaseProjectPlugins } from "./project-plugins.js";
import type { HostCapabilityDefinition, LocalHostProjectClient, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError, type ActionCallContext, type ActionClient, type ActionRegistryPort, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActionProvider } from "./inbox-actions.js";
import type { AgentHostComposition } from "./agent-host-composition.js";

export interface MolisWorkProjectRuntime {
  store: LocalProjectDatabase;
  coordinator: GoalProjectApplication;
  /** Which project this runtime serves. Capabilities scope their answers to it. */
  project_id: string;
  /** The board behind this project. Review queues and events are board scoped. */
  board_id: string;
  interactionObserver?: InteractionObserver;
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
  sceneAvailability?: LocalHostOptions<MolisWorkProjectRuntime>["sceneAvailability"];
  actionAvailability?: LocalHostOptions<MolisWorkProjectRuntime>["actionAvailability"];
  onRuntimeOpen?: (reference: LocalHostProjectReference) => void;
  onRuntimeClose?: (reference: LocalHostProjectReference) => void;
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
  boardId: string;
  projectId?: string | null;
}): LocalHostProjectReference {
  const storageKey = path.resolve(input.databasePath);
  const boardId = input.boardId.trim() || `database:${storageKey}`;
  return {
    project_id: input.projectId?.trim() || boardId,
    board_id: boardId,
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
  private readonly systemFunctions?: SystemFunctionsActions;
  private readonly images?: ImagesHostService;
  private readonly alchemist?: AlchemistHostService;
  private readonly existingOnly = new Set<string>();
  private agents?: { home: string; service: AgentHostComposition };
  private closing?: Promise<void>;

  constructor(private readonly options: MolisWorkLocalHostOptions = {}) {
    this.personalPlanningHome = options.homeDirectory ? path.resolve(options.homeDirectory) : undefined;
    this.host = new LocalHost({
      instanceId: options.instanceId,
      actionAvailability: options.actionAvailability,
      sceneAvailability: options.sceneAvailability,
      observation: {
        before: (runtime, reference, capability, input, caller) => {
          runtime.interactionObserver ??= new InteractionObserver(runtime.store, runtime.coordinator, reference.board_id, reference.project_id);
          const observed = caller.audience === "mcp" ? goalActionObservation(capability, input, reference.board_id, caller) : null;
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
          if (recovering && !store.goalsQuery.getBoard(reference.board_id)) {
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
            board_id: reference.board_id,
          };
          try {
            const scenes = this.sceneClient(reference);
            const feed = createLocalFeedApplication(store.db, { ...withLocalFeedJudgments(options.homeDirectory),
              inboxJudgment: createInboxJudgmentTrigger({ scenes, boardId: reference.board_id,
                context: () => ({ actor_id: "workflow-events", project_id: reference.project_id, audience: "workflow",
                  permissions: ["inbox:read", "model:invoke", "functions:invoke"] }) }),
            });
            const registry = this.host.actionRegistry(reference);
            registry.registerProvider(goalsActionProvider(runtime, personalMethods));
            registry.registerProvider(artifactActionProvider(runtime, options));
            for (const provider of nativeContentProviders(runtime, feed, options.homeDirectory)) registry.registerProvider(provider);
            if (options.homeDirectory) registry.registerProvider(pagesActionProvider(options.homeDirectory, runtime, this.actionClient(reference), options.completeText));
            if (options.homeDirectory) registry.registerProvider(pptActionProvider(options.homeDirectory, runtime));
            if (options.homeDirectory) registry.registerProvider(formActionProvider(options.homeDirectory, runtime, options.completeText));
            if (options.homeDirectory) registry.registerProvider(datasetActionProvider(options.homeDirectory, runtime, options.completeText));
            if (options.homeDirectory) registry.registerProvider(lingguangActionProvider(options.homeDirectory, reference.project_id, this.actionClient(reference), options.completeText));
            registry.registerProvider(inboxActionProvider(runtime, options.homeDirectory, { actions: this.actionClient(reference), scenes, functions: options.functions }, feed));
            return runtime;
          } catch (error) {
            store.close();
            throw error;
          }
        },
        close: async (runtime, reference) => {
          await releaseProjectPlugins(runtime.store, runtime.board_id);
          await releaseBuilderSurface(runtime.store, runtime.board_id);
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
    if (options.homeDirectory) this.systemFunctions = new SystemFunctionsActions(this.host.actionRegistry(), options.homeDirectory, options.functions);
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(jellyActionProvider(options.homeDirectory, options.completeText));
    if (options.homeDirectory) this.host.actionRegistry().registerProvider(cogniaActionProvider(options.homeDirectory, this.homeActionClient(), options.completeText));
    registerProjectCapabilities(
      this.host,
      { workspaceFor: options.workspaceFor, workspacesFor: options.workspacesFor },
    );
  }

  /** Platform startup injects the existing Catalog owner before accepting requests. */
  configurePersonalPlanning(home: string, withCatalog: LocalWebCatalogRunner): void {
    if (this.closing || this.host.lifecycle() !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
    const canonicalHome = path.resolve(home);
    if (this.personalPlanningHome && this.personalPlanningHome !== canonicalHome) throw new ActionError("actions.scope_mismatch", "不能把个人规划服务绑定到其他 Home");
    this.personalPlanningHome = canonicalHome;
    this.personalPlanning ??= new PersonalPlanningActions(canonicalHome, this.host.actionRegistry(), () => readPersonalPlanningMethodPacks(canonicalHome));
    this.personalPlanning.configure(withCatalog);
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

  private prepareProjectPlugins(reference: LocalHostProjectReference, caller: ActionCallContext): Promise<unknown> {
    if (caller.project_id !== reference.project_id.trim()) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
    return this.host.withRuntime(reference, runtime => ensureProjectPlugins({
      store: runtime.store, boardId: runtime.board_id, actorId: "web-user", homeDirectory: this.options.homeDirectory,
      goalTitle: id => runtime.coordinator.goalQueries.getGoal(runtime.board_id, id)?.title,
      capabilities: this.host.client(reference),
      actions: { registry: this.host.actionRegistry(reference), client: { ...this.host.actionClient(reference), ...this.host.syncActionClient(reference) }, project_id: reference.project_id },
      characterWorkspaces: async () => this.options.workspacesFor ? await this.options.workspacesFor(reference.project_id)
        : this.options.workspaceFor ? [await this.options.workspaceFor(reference.project_id)].filter((value): value is ProjectWorkspaceRef => !!value) : [],
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
      bind: async (caller, binding) => { refresh(); return client.bind(caller, binding); },
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
    return this.host.withRuntime(reference, operation);
  }

  /** Only the configured owner calls this; never initialize, create or migrate a project. */
  async restoreExistingProject(reference: LocalHostProjectReference): Promise<void> {
    this.existingOnly.add(reference.storage_key);
    try { await this.withProject(reference, () => undefined); }
    finally { this.existingOnly.delete(reference.storage_key); }
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.host.closeProject(referenceOrStorageKey);
  }

  close(): Promise<void> {
    return this.closing ??= (async () => {
      try { await this.host.close(); }
      finally {
        this.systemFunctions?.dispose();
        await Promise.all([this.agents?.service.dispose(), this.images?.close(), this.alchemist?.close()]);
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
  return new MolisWorkLocalHost(options);
}
