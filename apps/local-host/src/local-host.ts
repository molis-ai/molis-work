import { hostErrors } from "./host-errors.js";
import { withSceneConfigurationActions } from "./scene-configuration-actions.js";
import { HomeLine } from "./home-line.js";
import { randomUUID } from "node:crypto";
import type {
  HostCapabilityDescriptor,
  HostCapabilityCallOptions,
  LocalHostProjectClient,
  LocalHostProjectReference,
  LocalHostStatus,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionService, CapabilityRegistry, refuseCall, registeredActionMetadata, type CallReports, type RetainedActionDirectory } from "@molis-ai/molis-work-kernel";
import type { ActionSelection } from "@molis-ai/molis-work-kernel";
import { projectCallCaller } from "./project-call-caller.js";
import { ActionError, requireSynchronous, type SyncActionClient, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionReference,
  type ActionProviderRegistration, type ActionView, type ActionSceneClient, type ActionSceneDefinition, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostBoundSession } from "@molis-ai/molis-work-plugin-sdk";
import { dependencyCaller, verifiedCaller } from "./plugin-callers.js";
import { HostAvailability } from "./local-host-availability.js";
import { callSignal, hostAuthorityContext, snapshotCaller } from "./local-host-caller.js";
import { ProjectLine, normalizeReference, runsBesideLine } from "./local-host-project-line.js";
import { createSceneClient, type SceneHost } from "./local-host-scenes.js";
import { createSyncActionClient, type SyncClientHost } from "./local-host-sync-client.js";
import type { HostActionClient, HostCapabilityHandler, LocalHostOptions } from "./local-host-types.js";
import { isMcpToolCapability } from "./mcp-tool-actions.js";
import type { SurfaceInstallRegistry } from "./surface-installation.js";

export type { ActionAvailabilityPolicy, HostCapabilityHandler, LocalHostOptions, LocalHostRuntimeFactory } from "./local-host-types.js";

/** The provider of the Host's own actions: a capability registered with an `action` and no provider of its own (the workspace reads, for one). */
export const HOST_PROVIDER_ID = "platform";

interface ProjectActionClient extends HostActionClient {
  discoverRetained(caller: ActionExecutionContext): Promise<RetainedActionDirectory>;
}

/**
 * One process-local composition owner. Each project's runtime is opened once and its queued action calls are serialized through
 * it (`ProjectLine`); the Home's calls wait in `HomeLine`. What the Host adds is the action registry and the clients built on it:
 * availability is `HostAvailability`'s, scenes are `createSceneClient`'s, the synchronous client for plugins `createSyncActionClient`'s.
 */
export class LocalHost<Runtime> {
  readonly instanceId: string;
  readonly capabilities = new CapabilityRegistry<ActionCallContext>();
  private readonly reports: CallReports = { settled: (caller, action, outcome) => this.options.actionSettled?.(caller, action, outcome),
    observed: (caller, action, observation) => this.options.actionObserved?.(caller, action, observation) };
  private readonly actionService = new ActionService(this.capabilities, { assertCurrent: () => {
    if (this.state !== "running" || this.line.scopeClosing()) throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
  }, beforeEffect: (caller, reference) => this.availability.check(caller, reference),
    admit: (caller, reference) => this.availability.check(caller, reference), ...this.reports });
  private readonly line: ProjectLine<Runtime>;
  private readonly availability: HostAvailability;
  private readonly sceneHost: SceneHost;
  private readonly syncHost: SyncClientHost<Runtime>;
  private readonly homeLine = new HomeLine();
  private readonly globalActionDisposers = new Set<() => void>();
  private readonly catalogProjectActions = new WeakSet<HostCapabilityDescriptor>();
  private state: "running" | "closing" | "closed" = "running";

  constructor(private readonly options: LocalHostOptions<Runtime>) {
    this.instanceId = options.instanceId?.trim() || `local-host-${randomUUID()}`;
    this.line = new ProjectLine(options.runtimeFactory, {
      assertRunning: () => this.assertRunning(),
      assertProjectAvailable: projectId => options.assertProjectAvailable?.(projectId),
      running: () => this.state === "running",
      concurrent: capability => runsBesideLine(this.capabilities.descriptor(capability, capability.action_provider?.project_id)),
    });
    this.availability = new HostAvailability(this.actionService, this.capabilities, options);
    this.sceneHost = {
      actionService: this.actionService, options,
      assertRunning: () => this.assertRunning(),
      authorityCurrent: project => this.state === "running" && (!project || !this.line.isClosing(project.storage_key)) && !this.line.scopeClosing(),
      withRuntime: (project, operation) => this.withRuntime(project, operation),
      discoverActions: (caller, select) => this.availability.discover(caller, select),
      checkActionAvailability: (caller, capability) => this.availability.check(caller, capability),
      queueScene: (project, id, version, operation) => project
        ? this.line.enqueue(project, { capability_id: `scene.${id}`, version }, operation, true)
        : this.homeLine.run(operation, "step"),
      stepClient: project => project ? this.actionClient(project, true) : this.homeActionClient(true),
    };
    this.syncHost = { actionService: this.actionService, line: this.line, options, assertRunning: () => this.assertRunning() };
  }

  /** An action of the Host's own (the workspace reads, a model draft), called as every action is; its runtime is the Host's active project scope, never the caller's. */
  registerAction<Input, Output>(definition: ActionDefinition<Input, Output>, handler: HostCapabilityHandler<Runtime, Input, Output>): () => void {
    this.assertRunning(); return this.actionService.registerProvider({
      provider: definition.action_provider ?? { provider_id: HOST_PROVIDER_ID, title: "Molis Work", kind: "system" }, definitions: [definition],
      handlers: [{ ...definition, handle: (caller, input) => {
        const scope = this.line.currentScope();
        if (!scope?.active || scope.entry.reference.project_id !== caller.project_id) throw new ActionError("actions.host_context_missing", "此能力需要 Host 的项目运行环境");
        return handler(scope.runtime, input as Input, { ...(caller.signal ? { signal: caller.signal } : {}), ...(caller.host_plugin ? { plugin: caller.host_plugin, consumer: "plugin" as const } : {}),
          ...(hostBoundSession(caller) ? { runtime_session_id: hostBoundSession(caller) } : {}), call_id: caller.call_id, beforeEffect: caller.beforeEffect,
          assertAuthorityCurrent: () => { requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成"); } });
      } }],
    });
  }

  /** Composition-only registration. Project authority comes from the owner, never the Plugin; project Catalog actions keep project scope while the Home owns their lifetime. */
  actionRegistry(reference?: LocalHostProjectReference, routing?: "project-catalog"): SurfaceInstallRegistry {
    const project = reference ? normalizeReference(reference) : undefined;
    if (project && routing) throw new ActionError("actions.scope_mismatch", "项目目录动作由 Home 登记");
    const entry = project ? this.line.ensureEntry(project) : undefined;
    const registerProvider = (registration: ActionProviderRegistration) => {
      this.assertRunning();
      if (entry && !this.line.isLive(entry)) {
        throw hostErrors.project_closing("能力来源所属项目已关闭");
      }
      if (registration.provider.project_id && registration.provider.project_id !== project?.project_id) {
        throw new ActionError("actions.scope_mismatch", "能力来源不能注册到其他项目");
      }
      if (routing && (registration.provider.kind !== "system" || registration.provider.plugin_id !== undefined
        || registration.provider.plugin_install_id !== undefined || registration.provider.project_id !== undefined || registration.scenes?.length
        || registration.definitions.some(definition => definition.action.scope !== "project"))) {
        throw new ActionError("actions.scope_mismatch", "目录登记只接受系统提供的项目动作");
      }
      const bound = { ...registration.provider, ...(project ? { project_id: project.project_id } : {}) };
      this.options.admitActionProvider?.(bound, registration.scenes);
      const remove = this.actionService.registerProvider({ ...withSceneConfigurationActions(registration, this.sceneClient(project)),
        provider: bound,
        availability: caller => this.state !== "running" || entry?.state === "closing"
          ? { available: false, code: "actions.host_closed", reason: "能力所在运行环境已关闭" }
          : registration.availability?.(caller) ?? { available: true },
      });
      if (routing) {
        for (const definition of registration.definitions) this.catalogProjectActions.add(this.capabilities.descriptor(definition)!);
      }
      const owner = entry?.actionDisposers ?? this.globalActionDisposers;
      const announce = (scenes?: readonly ActionSceneDefinition[]) => { try { this.options.actionProvidersChanged?.(bound, scenes); } catch { /* An observer never changes registration. */ } };
      const dispose = () => { remove(); owner.delete(dispose); announce(); };
      owner.add(dispose); announce(registration.scenes);
      return dispose;
    };
    return { registerProvider, presentationSystemActions: () => this.capabilities.descriptors(descriptor => descriptor.action?.scope === (project ? "project" : "home")
      && descriptor.action_provider?.kind === "system" && (!descriptor.action_provider.project_id || descriptor.action_provider.project_id === project?.project_id)
      && !isMcpToolCapability(descriptor.capability_id)).map(({ capability_id, version }) => ({ capability_id, version })) };
  }

  /** The same registration instance that permits dispatch without a project runtime. */
  projectCatalogActionDescriptor(reference: ActionReference) {
    const descriptor = this.capabilities.descriptor(reference);
    return descriptor && this.catalogProjectActions.has(descriptor) ? descriptor : undefined;
  }

  private metadataCaller(caller: ActionCallContext, reference?: LocalHostProjectReference): ActionCallContext {
    this.assertRunning(); caller.signal?.throwIfAborted();
    const project = reference ? normalizeReference(reference) : undefined;
    if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "目录上下文与项目不一致");
    if (project) this.line.assertCompatibleReference(project);
    return snapshotCaller(caller);
  }

  projectClosingSignal(reference: LocalHostProjectReference): AbortSignal | undefined {
    this.assertProjectOpenForCatalog(reference);
    return this.line.existingObservation(reference)?.observing.signal;
  }

  assertProjectOpenForCatalog(reference: LocalHostProjectReference): void {
    this.assertRunning();
    this.line.assertCompatibleReference(reference);
    this.options.assertProjectAvailable?.(reference.project_id);
    if (this.line.isClosing(reference.storage_key)) throw new ActionError("actions.host_closed", "原项目正在关闭");
  }

  /** System capabilities share the registry but do not create a fictitious project Runtime. */
  inspectActionMetadata(caller: ActionCallContext, reference?: LocalHostProjectReference) {
    return registeredActionMetadata(this.capabilities, this.metadataCaller(caller, reference));
  }

  /** A proposal keeps the original registration and caller, independently of a later approval request. */
  prepareActionReview(caller: ActionCallContext, view: ActionView, input: unknown, project?: LocalHostProjectReference, related?: ExactActionReference) {
    const bound = this.metadataCaller(caller, project), held = this.actionService.prepareReview(bound, view, input);
    const other = related && this.actionService.holdReviewRegistration(bound, related);
    const assertCurrent = () => {
      this.assertRunning();
      if (project) { this.line.assertCompatibleReference(project); if (this.line.isClosing(project.storage_key)) throw new ActionError("actions.host_closed", "原项目正在关闭"); }
      held.assertCurrent();
      other?.assertCurrent();
    };
    return { assertCurrent, beforeEffect: async () => { assertCurrent(); await held.beforeEffect(); await other?.beforeEffect(); assertCurrent(); } };
  }

  /** The same registered scene declarations and visibility rules discovery uses; never an execution grant. */
  inspectSceneMetadata(caller: ActionCallContext, reference?: LocalHostProjectReference) {
    return this.actionService.inspectSceneMetadata(this.metadataCaller(caller, reference));
  }

  holdRequiredScene(caller: ActionCallContext, scene: { scene_id: string; version: number }, reference?: LocalHostProjectReference) {
    return this.actionService.holdRequiredScene(this.metadataCaller(caller, reference), scene);
  }

  async inspectActions(caller: ActionCallContext, reference?: LocalHostProjectReference, prepareRuntime = true): Promise<ActionView[]> {
    this.assertRunning();
    caller.signal?.throwIfAborted();
    const project = reference ? normalizeReference(reference) : undefined;
    if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "目录上下文与项目不一致");
    const bound = snapshotCaller(caller);
    if (project && prepareRuntime) await this.withRuntime(project, () => undefined);
    caller.signal?.throwIfAborted();
    return this.availability.views(bound, this.actionService.inspect(bound));
  }

  /** `step`: composition-only. The calls a scene run makes are part of that run and take its place on the line. */
  homeActionClient(step = false): HostActionClient {
    const contextFor = (caller: ActionCallContext) => {
      this.assertRunning();
      if (caller.project_id) throw new ActionError("actions.scope_mismatch", "系统入口不能伪造项目上下文");
      return verifiedCaller(snapshotCaller(caller));
    };
    return {
      discover: async caller => this.availability.discover(contextFor(caller)),
      discoverMatching: async (caller, select) => this.availability.discover(contextFor(caller), select),
      discoverOne: async (caller, reference) => this.availability.discoverOne(contextFor(caller), reference),
      invoke: async (caller, capability, input) => {
        let context: ActionCallContext;
        try { context = contextFor(caller); }
        catch (error) { return refuseCall(this.reports, caller, capability, error); }
        const descriptor = this.capabilities.descriptor(capability);
        return this.homeLine.run(() => this.actionService.invoke(context, capability, input), descriptor?.action?.scheduling === "concurrent" ? "concurrent" : step ? "step" : "serial");
      },
    };
  }

  sceneClient(reference?: LocalHostProjectReference): ActionSceneClient {
    return createSceneClient(this.sceneHost, reference);
  }

  /** Transaction-bound Plugin SDK calls only; public actions retain queued asynchronous dispatch. */
  syncActionClient(reference: LocalHostProjectReference): SyncActionClient {
    return createSyncActionClient(this.syncHost, reference);
  }

  /** A transport passes its authenticated caller on each request; arguments carry no authority. `step` as for `homeActionClient`. */
  actionClient(reference: LocalHostProjectReference, step = false, routing?: "project-catalog"): ProjectActionClient {
    const project = normalizeReference(reference);
    const callerFor = (caller: ActionCallContext) => {
      this.line.assertCompatibleReference(project);
      caller.signal?.throwIfAborted();
      if (caller.project_id !== project.project_id) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      return verifiedCaller(snapshotCaller(caller));
    };
    const ready = async (caller: ActionCallContext, checkRouting = true) => {
      if (checkRouting && routing) throw new ActionError("actions.forbidden", "此入口只接受精确目录动作调用");
      const bound = callerFor(caller);
      await this.withRuntime(project, () => undefined);
      caller.signal?.throwIfAborted();
      return bound;
    };
    const discover = async (caller: ActionCallContext, select?: ActionSelection) => this.availability.discover(await ready(caller), select);
    return {
      discover: caller => discover(caller),
      discoverMatching: discover,
      discoverOne: async (caller, ref) => this.availability.discoverOne(await ready(caller), ref),
      discoverRetained: async caller => {
        if (!caller.retainAuthority) throw new ActionError("actions.host_context_missing", "组合需要原调用的授权");
        return this.availability.discoverRetained(await ready(caller, false), caller.retainAuthority);
      },
      invoke: async (caller, capability, input) => {
        let bound = caller, dispatched = false;
        try {
          bound = callerFor(caller);
          const catalog = this.projectCatalogActionDescriptor(capability);
          if (routing && (!catalog || capability.provider_id !== catalog.action_provider?.provider_id)) {
            throw new ActionError("actions.forbidden", "此入口只接受精确目录动作调用");
          }
          if (catalog) {
            const signal = callSignal(catalog, () => this.line.existingObservation(project), bound.signal);
            const context = hostAuthorityContext({ ...bound, ...signal }, () => {
              if (this.capabilities.descriptor(capability) !== catalog) throw new ActionError("actions.provider_changed", "能力已重新加载，不能继续原副作用");
              return this.state === "running" && !this.line.isClosing(project.storage_key);
            });
            return this.homeLine.run(() => this.actionService.invoke(context, capability, input), catalog.action?.scheduling === "concurrent" ? "concurrent" : step ? "step" : "serial");
          }
          await this.withRuntime(project, () => undefined);
          caller.signal?.throwIfAborted();
          this.assertRunning();
        } catch (error) { return refuseCall(this.reports, bound, capability, error); }
        const descriptor = this.capabilities.descriptor(capability, bound.project_id);
        if (!descriptor) return refuseCall(this.reports, bound, capability, new ActionError("actions.missing", "能力未注册或版本已失效"));
        return this.line.enqueue(project, descriptor, () => {
          bound = { ...bound, ...callSignal(descriptor, () => this.line.currentScope()?.entry, bound.signal) };
          dispatched = true;
          return this.actionService.invoke(bound, capability, input);
        }, step)
          .catch(error => { if (dispatched) throw error; return refuseCall(this.reports, bound, capability, error); });
      },
    };
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    const project = normalizeReference(reference);
    this.line.assertCompatibleReference(project);
    const client: LocalHostProjectClient = {
      host_instance_id: this.instanceId,
      project,
      availability: (capability, options) => {
        if (this.state !== "running" || this.line.isClosing(project.storage_key)) return { available: false, code: "actions.host_closed", reason: "能力所在运行环境已关闭" };
        const definition = this.capabilities.descriptor(capability, project.project_id);
        if (!definition) return { available: false, code: "actions.dependency_missing", reason: `所需宿主能力未注册：${capability.capability_id}@${capability.version}` };
        if (capability.provider_id && capability.provider_id !== (definition.action_provider?.provider_id ?? HOST_PROVIDER_ID)) return { available: false, code: "actions.provider_changed", reason: "所需能力的提供方已变化" };
        return this.capabilities.availability(dependencyCaller(project.project_id, definition, options?.consumer), definition);
      },
      withScope: <Result>(operation: (client: LocalHostProjectClient) => Result | Promise<Result>) =>
        this.withRuntime(project, () => operation(client)),
      invoke: <Input, Output>(
        capability: ActionDefinition<Input, Output>,
        input: Input,
        options?: HostCapabilityCallOptions,
      ) => this.invoke(project, capability, input, options),
    };
    return client;
  }

  async invoke<Input, Output>(
    reference: LocalHostProjectReference,
    capability: ActionDefinition<Input, Output>,
    input: Input,
    options?: HostCapabilityCallOptions,
  ): Promise<Output> {
    const sleeping = this.line.awake(reference);
    if (sleeping) await sleeping;
    const registered = this.capabilities.descriptor(capability, reference.project_id);
    const caller = projectCallCaller(reference.project_id, () => callSignal(registered ?? {}, () => this.line.ensureEntry(reference), options?.signal), options);
    // The definition may omit the activation scope; only the bound Host supplies it. The call is the action service's (host
    // policy, authority, contract, one settlement), which also refuses an identity no longer registered.
    const key = { capability_id: capability.capability_id, version: capability.version, action_provider: registered?.action_provider };
    return this.line.enqueue(reference, key, () => this.actionService.invoke(caller, { capability_id: capability.capability_id, version: capability.version }, input) as Promise<Output>);
  }

  /** Direct composition port for Host code that works inside one project's runtime. */
  withRuntime<Result>(reference: LocalHostProjectReference, operation: (runtime: Runtime) => Result | Promise<Result>): Promise<Result> {
    return this.line.withRuntime(reference, operation);
  }

  /** Whether the Host still takes work, without copying every registered capability as status() does. */
  lifecycle(): LocalHostStatus["state"] {
    return this.state;
  }

  /** Current project states, owned by the caller; listing projects never copies the capability directory. */
  projects(): LocalHostStatus["projects"] {
    return this.line.projects();
  }

  status(): LocalHostStatus {
    return snapshotStatus(this);
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.line.closeProject(referenceOrStorageKey);
  }

  withExistingRuntime<Result>(reference: LocalHostProjectReference, operation: (runtime: Runtime) => Result | Promise<Result>): Promise<Result | null> {
    return this.line.withExistingRuntime(reference, operation);
  }

  isProjectBusy(storageKey: string): boolean {
    return this.line.isBusy(storageKey);
  }

  /** Synchronously lists currently opened project runtimes without opening asleep or closed projects. */
  openRuntimes(): Runtime[] {
    return this.line.openRuntimes();
  }

  /** Runs `work` without it counting as use of the projects it reads (`ProjectLine.quietly`). */
  quietly<T>(work: () => T): T {
    return this.line.quietly(work);
  }

  /** Whether the project is open, asleep, closed on purpose or not opened yet, and when it was last used (`ProjectLine.rest`). */
  projectRest(storageKey: string): ReturnType<ProjectLine<Runtime>["rest"]> {
    return this.line.rest(storageKey);
  }

  /** Closes the project if it has been idle for `idleMs` and nothing of it is running (`ProjectLine.sleepIfIdle`). */
  sleepIfIdle(storageKey: string, idleMs: number, hasLiveWork: () => Promise<boolean>): Promise<boolean> {
    return this.line.sleepIfIdle(storageKey, idleMs, hasLiveWork);
  }

  async close(): Promise<void> {
    if (this.state === "closed") return;
    this.state = "closing";
    await Promise.all([this.homeLine.settled(), this.line.closeAll(), this.line.quietSettled()]);
    for (const dispose of this.globalActionDisposers) dispose();
    this.state = "closed";
  }

  private assertRunning(): void {
    if (this.state !== "running") throw hostErrors.closed("Local Host 已关闭");
  }
}

/** Full diagnostic snapshot; project-only readers use projects() so they do not pay for this copy. */
function snapshotStatus<Runtime>(host: LocalHost<Runtime>): LocalHostStatus {
  return {
    instance_id: host.instanceId,
    state: host.lifecycle(),
    projects: host.projects(),
    capabilities: structuredClone(host.capabilities.descriptors()), // the registry's are frozen and shared; a status is the caller's own
  };
}
