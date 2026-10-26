import { hostErrors } from "./host-errors.js";
import { snapshotHostUserAction } from "./plugin-consent-settings-entry.js";
import { hostActionRegistry, type HostActionRegistryPort } from "./local-host-action-registry.js";
import { HomeLine } from "./home-line.js";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  HostCapabilityCallOptions,
  HostCapabilityDescriptor,
  HostCapabilityInvocation,
  LocalHostProjectClient,
  LocalHostProjectReference,
  LocalHostStatus,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionService, CapabilityRegistry, judgmentRecommendationKeys, refuseCall, registeredActionMetadata, subjectOfferChoices, subjectOfferCompatibilityReason,
  type CallContext, type CallDescription, type CallOutcome, type CallSettled } from "@molis-ai/molis-work-kernel";
import { projectCallCaller } from "./project-call-caller.js";
import { sceneConfigurationActions, ActionError, requireSynchronous, type SyncActionClient, type ActionCallContext, type ActionClient, type ActionDefinition,
  type ActionAvailability, type ActionView, type ActionSceneClient, type ActionSceneView } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostLog } from "./host-log.js";
import { admitPluginCall, dependencyCaller, verifiedCaller } from "./plugin-callers.js";

export interface LocalHostRuntimeFactory<Runtime> {
  open(reference: LocalHostProjectReference): Runtime | Promise<Runtime>;
  close(runtime: Runtime, reference: LocalHostProjectReference): void | Promise<void>;
}

type ActionAvailabilityCheck = (context: ActionCallContext, action: ActionView) => ActionAvailability | Promise<ActionAvailability>;
/** What an action the Host registers runs: its project's runtime, the input, and the call's own fences. */
export type HostCapabilityHandler<Runtime, Input, Output> = (runtime: Runtime, input: Input, invocation: HostCapabilityInvocation) => Output | Promise<Output>;
/** What one discovery reads once and shares across its actions' dependency checks. */
interface DiscoveryPass { actions(): readonly ActionView[]; scenes(): readonly ActionSceneView[]; usages(): ReturnType<ActionService["usages"]> }
export type ActionAvailabilityPolicy = ActionAvailabilityCheck & {
  /** One directory read may share a snapshot; invocation and effect checks always use the live function. */
  snapshotForDiscovery?(context: ActionCallContext): ActionAvailabilityCheck | Promise<ActionAvailabilityCheck>;
};

export interface LocalHostOptions<Runtime> {
  runtimeFactory: LocalHostRuntimeFactory<Runtime>;
  instanceId?: string;
  sceneAvailability?(context: ActionCallContext, scene: ActionSceneView): ActionAvailability | Promise<ActionAvailability>;
  actionAvailability?: ActionAvailabilityPolicy;
  /** Throws to refuse a provider before it is registered: nothing is registered or written for a refused one. */
  admitActionProvider?(provider: import("@molis-ai/molis-work-contracts/platform/actions").ActionProvider, scenes?: readonly import("@molis-ai/molis-work-contracts/platform/actions").ActionSceneDefinition[]): void;
  /** A provider was registered or withdrawn, with the project it was bound to; on registration, also the consumption scenes it registered. Observers must not throw. */
  actionProvidersChanged?(provider: import("@molis-ai/molis-work-contracts/platform/actions").ActionProvider, scenes?: readonly import("@molis-ai/molis-work-contracts/platform/actions").ActionSceneDefinition[]): void;
  /** Every call, once, as it ended (a handler's result or failure, or a refusal before any handler), with its caller and the operation's call id; never its input or result. */
  actionSettled?(caller: CallContext, action: CallDescription, outcome: CallOutcome): void;
}

/** How long one queued project operation may hold everything else of the project before the log names it. */
const HELD_IN_LINE_WARN_MS = 20_000;



interface RuntimeEntry<Runtime> {
  reference: LocalHostProjectReference;
  runtime: Promise<Runtime>;
  state: "opening" | "ready" | "closing";
  operationTail: Promise<void>;
  activeUses: number;
  idleWaiters: Array<() => void>;
  /** Aborted when the project starts closing: a wait only observes, so it ends then instead of holding close until it times out. */
  observing: AbortController;
  actionDisposers: Set<() => void>;
}

function normalizeReference(reference: LocalHostProjectReference): LocalHostProjectReference {
  const normalized = {
    project_id: reference.project_id.trim(),
    storage_key: reference.storage_key.trim(),
  };
  if (!normalized.project_id || !normalized.storage_key) {
    throw hostErrors.project_invalid("Local Host Project reference 不能为空");
  }
  return normalized;
}

/**
 * One process-local composition owner. Each storage key is opened exactly
 * once, including concurrent discovery, and all of its queued action calls are
 * serialized through that Project runtime.
 */
function snapshotCaller(caller: ActionCallContext): ActionCallContext {
  return { ...caller, permissions: [...caller.permissions],
    ...(caller.page_context ? { page_context: { ...caller.page_context } } : {}),
    ...(caller.user_action ? { user_action: snapshotHostUserAction(caller.user_action) } : {}),
    ...(caller.allowed_capability_ids ? { allowed_capability_ids: [...caller.allowed_capability_ids] } : {}),
    ...(caller.allowed_actions ? { allowed_actions: caller.allowed_actions.map(ref => ({ ...ref })) } : {}),
  };
}

/** Long calls outside the project queue are cancelled before close waits for their cleanup. */
function callSignal(definition: { action?: { scheduling?: string } }, entry: () => Pick<RuntimeEntry<unknown>, "observing">, signal: AbortSignal | undefined): { signal?: AbortSignal } {
  if (definition.action?.scheduling !== "concurrent") return signal ? { signal } : {};
  const closing = entry().observing.signal;
  return { signal: signal ? AbortSignal.any([signal, closing]) : closing };
}

/** A scene keeps the Host's real closing fence across its asynchronous owner checks. */
function hostAuthorityContext(caller: ActionCallContext, current: () => boolean): ActionCallContext {
  const assertActive = () => {
    if (!current()) throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
    caller.signal?.throwIfAborted();
  };
  return { ...caller, assert_authority_current: (reference, requiredPermissions) => {
    assertActive();
    requireSynchronous(caller.assert_authority_current?.(reference, requiredPermissions), "最终授权检查必须同步完成");
    assertActive();
  } };
}

/** The provider of the Host's own actions: a capability registered with an `action` and no provider of its own (the workspace reads, for one). */
export const HOST_PROVIDER_ID = "platform";

function assertSameIdentity(current: LocalHostProjectReference, next: LocalHostProjectReference): void {
  if (current.project_id !== next.project_id || current.project_id !== next.project_id) {
    throw hostErrors.project_identity_conflict(`同一 storage_key 不能映射到不同 Project: ${current.project_id} / ${next.project_id}`);
  }
}

/**
 * Closes a project's runtime once it has opened. An open that failed (the Host closing under it, say) has already told
 * its own caller why; there is nothing to close, and the Host's close goes on (HOST-CLOSE-01).
 */
async function closeOpened<Runtime>(runtime: Promise<Runtime>, close: (runtime: Runtime) => void | Promise<void>): Promise<boolean> {
  const opened = await runtime.then(value => ({ value }), () => null);
  if (!opened) return false;
  await close(opened.value);
  return true;
}

export class LocalHost<Runtime> {
  readonly instanceId: string;
  readonly capabilities = new CapabilityRegistry<ActionCallContext>();
  private readonly settled: CallSettled = (caller, action, outcome) => this.options.actionSettled?.(caller, action, outcome);
  private readonly actionService = new ActionService(this.capabilities, { assertCurrent: () => {
    if (this.state !== "running" || this.executionScope.getStore()?.entry.state === "closing") throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
  }, beforeEffect: (caller, reference) => this.checkActionAvailability(caller, reference),
    admit: (caller, reference) => this.checkActionAvailability(caller, reference), settled: this.settled });
  /** `holdsQueue`: the call sits on the project's line (or inside one that does); a concurrent call runs beside the line and holds nothing. */
  private readonly executionScope = new AsyncLocalStorage<{ entry: RuntimeEntry<Runtime>; runtime: Runtime; active: boolean; holdsQueue: boolean }>();
  private readonly entries = new Map<string, RuntimeEntry<Runtime>>();
  private readonly closingKeys = new Set<string>();
  private readonly homeLine = new HomeLine();
  private readonly globalActionDisposers = new Set<() => void>();
  private state: "running" | "closing" | "closed" = "running";

  constructor(private readonly options: LocalHostOptions<Runtime>) {
    this.instanceId = options.instanceId?.trim() || `local-host-${randomUUID()}`;
  }

  /** An action of the Host's own (the workspace reads, a model draft), called as every action is; its runtime is the Host's active project scope, never the caller's. */
  registerAction<Input, Output>(definition: ActionDefinition<Input, Output>, handler: HostCapabilityHandler<Runtime, Input, Output>): () => void {
    this.assertRunning(); return this.actionService.registerProvider({
      provider: definition.action_provider ?? { provider_id: HOST_PROVIDER_ID, title: "Molis Work", kind: "system" }, definitions: [definition],
      handlers: [{ ...definition, handle: (caller, input) => {
        const scope = this.executionScope.getStore();
        if (!scope?.active || scope.entry.reference.project_id !== caller.project_id) throw new ActionError("actions.host_context_missing", "此能力需要 Host 的项目运行环境");
        return handler(scope.runtime, input as Input, { ...(caller.signal ? { signal: caller.signal } : {}), ...(caller.host_plugin ? { plugin: caller.host_plugin, consumer: "plugin" as const } : {}), call_id: caller.call_id, beforeEffect: caller.beforeEffect,
          assertAuthorityCurrent: () => { requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成"); } });
      } }],
    });
  }

  /** Composition-only registration. Project authority comes from the owner, never the Plugin. */
  actionRegistry(reference?: LocalHostProjectReference): HostActionRegistryPort {
    const project = reference ? normalizeReference(reference) : undefined;
    const entry = project ? this.ensureEntry(project) : undefined;
    return hostActionRegistry({ register: registration => this.actionService.registerProvider(registration),
      sceneProvider: (scene, projectId) => this.actionService.sceneProvider(scene, projectId),
    }, { project, scenes: () => this.sceneClient(project),
      assertCurrent: () => {
        this.assertRunning();
        if (entry && (entry.state === "closing" || this.entries.get(entry.reference.storage_key) !== entry)) throw hostErrors.project_closing("能力来源所属项目已关闭");
      },
      available: () => this.state === "running" && entry?.state !== "closing",
      disposers: entry?.actionDisposers ?? this.globalActionDisposers,
      admitActionProvider: (provider, scenes) => this.options.admitActionProvider?.(provider, scenes),
      actionProvidersChanged: (provider, scenes) => this.options.actionProvidersChanged?.(provider, scenes),
    });
  }

  /** System capabilities share the registry but do not create a fictitious project Runtime. */
  inspectActionMetadata(caller: ActionCallContext, reference?: LocalHostProjectReference) {
    this.assertRunning(); caller.signal?.throwIfAborted();
    const project = reference ? normalizeReference(reference) : undefined;
    if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "目录上下文与项目不一致");
    if (project) this.assertCompatibleReference(project);
    return registeredActionMetadata(this.capabilities, snapshotCaller(caller));
  }

  async inspectActions(caller: ActionCallContext, reference?: LocalHostProjectReference): Promise<ActionView[]> {
    this.assertRunning();
    caller.signal?.throwIfAborted();
    const project = reference ? normalizeReference(reference) : undefined;
    if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "目录上下文与项目不一致");
    const bound = snapshotCaller(caller);
    if (project) await this.withRuntime(project, () => undefined);
    caller.signal?.throwIfAborted();
    return this.projectActionViews(bound, this.actionService.inspect(bound));
  }

  /** `step`: composition-only. The calls a scene run makes are part of that run and take its place on the line. */
  homeActionClient(step = false): ActionClient {
    const contextFor = (caller: ActionCallContext) => {
      this.assertRunning();
      if (caller.project_id) throw new ActionError("actions.scope_mismatch", "系统入口不能伪造项目上下文");
      return verifiedCaller(snapshotCaller(caller));
    };
    return {
      discover: async caller => this.discoverActions(contextFor(caller)),
      invoke: async (caller, capability, input) => {
        let context: ActionCallContext;
        try { context = contextFor(caller); }
        catch (error) { return refuseCall(this.settled, caller, capability, error); }
        const descriptor = this.capabilities.descriptor(capability);
        return this.homeLine.run(() => this.actionService.invoke(context, capability, input), descriptor?.action?.scheduling === "concurrent" ? "concurrent" : step ? "step" : "serial");
      },
    };
  }

  sceneClient(reference?: LocalHostProjectReference): ActionSceneClient {
    const project = reference ? normalizeReference(reference) : undefined;
    const prepare = async (caller: ActionCallContext): Promise<ActionCallContext> => {
      this.assertRunning();
      caller.signal?.throwIfAborted();
      if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "场景上下文与项目不一致");
      const bound = hostAuthorityContext(verifiedCaller(snapshotCaller(caller)), () => this.state === "running"
        && (!project || !this.closingKeys.has(project.storage_key)) && this.executionScope.getStore()?.entry.state !== "closing");
      if (project) await this.withRuntime(project, () => undefined);
      caller.signal?.throwIfAborted();
      return bound;
    };
    const scenes = async (caller: ActionCallContext, judgment?: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference) => {
      const rows = this.actionService.discoverScenes(caller, judgment);
      const directory = judgment && rows.some(scene => scene.compatible && scene.definition.recommendation_source === "subject-offers")
        ? await this.discoverActions(caller) : [];
      const fn = judgment ? directory.find(action => action.capability_id === judgment.capability_id && action.version === judgment.version) : undefined;
      return Promise.all(rows.map(async scene => {
        const reason = scene.compatible && fn && scene.definition.recommendation_source === "subject-offers"
          ? subjectOfferCompatibilityReason(fn, directory) : undefined;
        const policy = await this.options.sceneAvailability?.(caller, scene);
        return { ...scene, ...(reason ? { compatible: false, reason } : {}),
          configuration_availability: scene.configuration_availability.available ? policy ?? scene.configuration_availability : scene.configuration_availability,
          availability: scene.availability.available ? policy ?? scene.availability : scene.availability };
      }));
    };
    const check = async (caller: ActionCallContext, sceneId: string, version: number, judgment?: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference, configuration = false) => {
      const scene = (await scenes(caller, judgment)).find(item => item.definition.scene_id === sceneId && item.definition.version === version);
      if (!scene) throw new ActionError("actions.scene_missing", "场景不存在或不可访问");
      const availability = configuration ? scene.configuration_availability : scene.availability;
      if (!availability.available) throw new ActionError(availability.code, availability.reason);
      if (!scene.compatible) throw new ActionError("actions.scene_incompatible", scene.reason ?? "判断能力与场景不兼容");
    };
    const queue = <Result>(id: string, version: number, operation: () => Promise<Result>) => project
      ? this.enqueue(project, { capability_id: `scene.${id}`, version }, operation, true)
      : this.homeLine.run(operation, "step");
    return {
      discoverScenes: async (caller, judgment) => scenes(await prepare(caller), judgment),
      usages: async (caller, judgment) => {
        const bound = await prepare(caller);
        const [uses, availableScenes, actions] = await Promise.all([this.actionService.usages(bound, judgment), scenes(bound), this.discoverActions(bound)]);
        return uses.map(use => {
          const source = availableScenes.find(scene => scene.definition.scene_id === use.scene_id && scene.definition.version === use.scene_version);
          const fn = actions.find(action => action.capability_id === use.function.capability_id && action.version === use.function.version);
          const reason = fn && source?.definition.recommendation_source === "subject-offers" ? subjectOfferCompatibilityReason(fn, actions) : undefined;
          return { ...use, availability: !use.availability.available ? use.availability
            : source && !source.availability.available ? source.availability
              : reason ? { available: false as const, code: "actions.binding_invalid", reason } : fn?.availability ?? use.availability };
        });
      },
      targets: async (caller, judgment, selection) => {
        const bound = await prepare(caller);
        const [targets, availableScenes, actions] = await Promise.all([this.actionService.targets(bound, judgment, selection), scenes(bound, judgment), this.discoverActions(bound)]);
        const fn = judgment ? actions.find(action => action.capability_id === judgment.capability_id && action.version === judgment.version && (!judgment.provider_id || judgment.provider_id === action.provider.provider_id)) : undefined;
        return targets.map(target => {
          const source = availableScenes.find(scene => scene.definition.scene_id === target.scene_id && scene.definition.version === target.scene_version && scene.provider.provider_id === target.provider_id);
          const management = source ? sceneConfigurationActions(source.definition) : undefined;
          const managed = (definition: ActionDefinition | undefined) => actions.find(action => action.capability_id === definition?.capability_id
            && action.version === definition.version && action.provider.provider_id === target.provider_id)?.availability
            ?? { available: false as const, code: "actions.forbidden", reason: "当前调用者未获此场景操作的授权" };
          const disable = managed(management?.disable), enable = managed(management?.enable);
          const configurationAvailability = !target.configuration_availability.available ? target.configuration_availability
            : !source ? { available: false as const, code: "actions.scene_missing", reason: "消费场景已不存在" } : !source.configuration_availability.available ? source.configuration_availability : disable;
          return { ...target, configuration_availability: configurationAvailability, availability: !target.availability.available ? target.availability
            : !source ? { available: false as const, code: "actions.scene_missing", reason: "消费场景已不存在" }
              : !source.availability.available ? source.availability : !source.compatible ? { available: false as const, code: "actions.scene_incompatible", reason: source.reason ?? "判断与场景不兼容" }
                : !enable.available ? enable : judgment ? fn?.availability ?? { available: false as const, code: "actions.forbidden", reason: "判断能力不可访问" } : target.availability };
        });
      },
      bind: async (caller, binding, options) => {
        const bound = await prepare(caller);
        await queue(binding.scene_id, binding.scene_version, async () => {
          await check(bound, binding.scene_id, binding.scene_version, binding.enabled ? binding.function : undefined, Boolean(options && !binding.enabled));
          if (binding.enabled) await this.checkActionAvailability(bound, binding.function);
          await this.actionService.bind(bound, binding, options ? { ...options, before_write: async () => {
            await check(bound, binding.scene_id, binding.scene_version, binding.enabled ? binding.function : undefined, Boolean(options && !binding.enabled));
            if (binding.enabled) await this.checkActionAvailability(bound, binding.function);
            await options.before_write?.();
          } } : undefined);
        });
      },
      runScene: async (caller, scene, bindingId, event) => {
        const bound = await prepare(caller);
        return queue(scene.scene_id, scene.version, async () => {
          const binding = (await this.actionService.usages(bound)).find(use => use.binding_id === bindingId && use.scene_id === scene.scene_id && use.scene_version === scene.version);
          await check(bound, scene.scene_id, scene.version, binding?.function);
          const client = project ? this.actionClient(project, true) : this.homeActionClient(true);
          return this.actionService.runScene(bound, scene, bindingId, event, {
            invoke: (context, fn, input) => client.invoke(context, fn, input),
            beforeConsume: async judgment => {
              await check(bound, scene.scene_id, scene.version, judgment);
              await this.checkActionAvailability(bound, judgment);
            },
          });
        });
      },
    };
  }

  /** Transaction-bound Plugin SDK calls only; public actions retain queued asynchronous dispatch. */
  syncActionClient(reference: LocalHostProjectReference): SyncActionClient {
    const project = normalizeReference(reference), entry = this.ensureEntry(project);
    return { invokeSync: (caller, capability, input) => {
      this.assertRunning();
      if (entry.state !== "ready" || this.entries.get(project.storage_key) !== entry) {
        throw hostErrors.project_closing("同步能力需要已打开且仍有效的项目运行环境");
      }
      if (caller.project_id !== project.project_id) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      if (caller.audience !== "plugin") throw new ActionError("actions.forbidden", "同步入口只接受可信插件 SDK 上下文");
      const bound = verifiedCaller(snapshotCaller(caller));
      const actions = this.actionService.discover(bound);
      const check = (reference: Pick<ActionDefinition, "capability_id" | "version" | "provider_id">, ancestors = new Set<string>()): void => {
        const action = actions.find(item => item.capability_id === reference.capability_id && item.version === reference.version);
        if (!action) throw new ActionError("actions.missing", "能力未注册或不可访问");
        if (action.action.audiences.length !== 1 || action.action.audiences[0] !== "plugin") {
          throw new ActionError("actions.async_required", "公共能力必须通过 Host 的异步调度入口执行");
        }
        if (reference.provider_id && reference.provider_id !== action.provider.provider_id) throw new ActionError("actions.provider_changed", "能力提供方已变化");
        if (!action.availability.available) throw new ActionError(action.availability.code, action.availability.reason);
        const key = `${action.capability_id}@${action.version}`;
        if (ancestors.has(key)) throw new ActionError("actions.dependency_cycle", "能力存在循环依赖");
        const state = requireSynchronous(this.options.actionAvailability?.(bound, action), "Host 可用性检查需要异步调用");
        if (state && !state.available) throw new ActionError(state.code, state.reason);
        if (action.action.required_scene) throw new ActionError("actions.async_required", "消费场景绑定需要异步检查");
        for (const dependency of action.action.required_actions ?? []) check(dependency, new Set(ancestors).add(key));
      };
      return this.actionService.invokeSync(bound, capability, input, () => check(capability));
    } };
  }

  /** A transport passes its authenticated caller on each request; arguments carry no authority. `step` as for `homeActionClient`. */
  actionClient(reference: LocalHostProjectReference, step = false): ActionClient {
    const project = normalizeReference(reference);
    const callerFor = (caller: ActionCallContext) => {
      this.assertCompatibleReference(project);
      caller.signal?.throwIfAborted();
      if (caller.project_id !== project.project_id) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      return verifiedCaller(snapshotCaller(caller));
    };
    return {
      discover: async caller => {
        const bound = callerFor(caller);
        await this.withRuntime(project, () => undefined);
        caller.signal?.throwIfAborted();
        return this.discoverActions(bound);
      },
      invoke: async (caller, capability, input) => {
        let bound = caller, dispatched = false;
        try { bound = callerFor(caller); await this.withRuntime(project, () => undefined); caller.signal?.throwIfAborted(); this.assertRunning(); }
        catch (error) { return refuseCall(this.settled, bound, capability, error); }
        const descriptor = this.capabilities.descriptor(capability, bound.project_id);
        if (!descriptor) return refuseCall(this.settled, bound, capability, new ActionError("actions.missing", "能力未注册或版本已失效"));
        bound = { ...bound, ...callSignal(descriptor, () => this.ensureEntry(project), bound.signal) };
        return this.enqueue(project, descriptor, () => { dispatched = true; return this.actionService.invoke(bound, capability, input); }, step)
          .catch(error => { if (dispatched) throw error; return refuseCall(this.settled, bound, capability, error); });
      },
    };
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    const project = normalizeReference(reference);
    this.assertCompatibleReference(project);
    const client: LocalHostProjectClient = {
      host_instance_id: this.instanceId,
      project,
      availability: (capability, options) => {
        if (this.state !== "running" || this.closingKeys.has(project.storage_key)) return { available: false, code: "actions.host_closed", reason: "能力所在运行环境已关闭" };
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
    const registered = this.capabilities.descriptor(capability, reference.project_id);
    const caller = projectCallCaller(reference.project_id, () => callSignal(registered ?? {}, () => this.ensureEntry(reference), options?.signal), options);
    // The definition may omit the activation scope; only the bound Host supplies it. The call is the action service's (host
    // policy, authority, contract, one settlement), which also refuses an identity no longer registered.
    const key = { capability_id: capability.capability_id, version: capability.version, action_provider: registered?.action_provider };
    return this.enqueue(reference, key, () => this.actionService.invoke(caller, { capability_id: capability.capability_id, version: capability.version }, input) as Promise<Output>);
  }

  private async discoverActions(caller: ActionCallContext): Promise<ActionView[]> {
    const views = this.actionService.discover(caller);
    return this.projectActionViews(caller, views, views);
  }

  private async projectActionViews(caller: ActionCallContext, views: ActionView[], dependencySnapshot?: readonly ActionView[]): Promise<ActionView[]> {
    const policy = await this.options.actionAvailability?.snapshotForDiscovery?.(caller) ?? this.options.actionAvailability;
    // One dependency directory, scene list and binding list per discovery, including metadata inspection. Invocation uses live reads.
    let dependencies = dependencySnapshot, scenes: ActionSceneView[] | undefined, usages: ReturnType<ActionService["usages"]> | undefined;
    const pass: DiscoveryPass = { actions: () => dependencies ??= this.actionService.discover(caller), scenes: () => scenes ??= this.actionService.discoverScenes(caller), usages: () => usages ??= this.actionService.usages(caller) };
    return Promise.all(views.map(async view => ({ ...view,
      availability: await this.resolveActionAvailability(caller, view, new Set(), policy, pass),
    })));
  }

  private async resolveActionAvailability(caller: ActionCallContext, view: ActionView, ancestors: ReadonlySet<string> = new Set(), policy = this.options.actionAvailability, pass?: DiscoveryPass): Promise<ActionAvailability> {
    if (!view.availability.available) return view.availability;
    const key = JSON.stringify([view.capability_id, view.version, view.provider.provider_id]);
    if (ancestors.has(key)) return { available: false, code: "actions.dependency_cycle", reason: "能力或消费场景存在循环依赖，请修正配置" };
    const path = new Set(ancestors).add(key);
    const state = await policy?.(caller, view) ?? view.availability;
    if (!state.available) return state;
    if (!view.action.required_actions?.length && !view.action.required_scene) return state;
    const actions = pass?.actions() ?? this.actionService.discover(caller);
    for (const reference of view.action.required_actions ?? []) {
      const dependency = actions.find(action => action.capability_id === reference.capability_id && action.version === reference.version);
      if (!dependency) return { available: false, code: "actions.dependency_missing", reason: "所需能力不存在或不可访问" };
      if (reference.provider_id && dependency.provider.provider_id !== reference.provider_id) {
        return { available: false, code: "actions.provider_changed", reason: "所需能力的提供方已变化，原引用不能自动替换" };
      }
      const dependencyState = await this.resolveActionAvailability(caller, dependency, path, policy, pass);
      if (!dependencyState.available) return dependencyState;
    }
    if (!view.action.required_scene) return state;
    const required = view.action.required_scene;
    const scene = (pass?.scenes() ?? this.actionService.discoverScenes(caller)).find(item => item.definition.scene_id === required.scene_id && item.definition.version === required.version);
    if (!scene) return { available: false, code: "actions.scene_missing", reason: "消费场景不存在或不可访问" };
    const sceneState = scene.availability.available ? await this.options.sceneAvailability?.(caller, scene) ?? scene.availability : scene.availability;
    if (!sceneState.available) return sceneState;
    const bindings = (await (pass?.usages() ?? this.actionService.usages(caller))).filter(binding => binding.scene_id === required.scene_id && binding.scene_version === required.version && binding.enabled);
    if (!bindings.length) return { available: false, code: "actions.binding_required", reason: "请先为此场景选择并启用判断规则" };
    const states = await Promise.all(bindings.map(async binding => {
      if (!binding.availability.available) return binding.availability;
      const fn = actions.find(action => action.capability_id === binding.function.capability_id && action.version === binding.function.version);
      if (!fn) return { available: false as const, code: "actions.binding_invalid", reason: "已绑定的判断能力不可访问" };
      const fnState = await this.resolveActionAvailability(caller, fn, path, policy, pass);
      if (!fnState.available || scene.definition.recommendation_source !== "subject-offers") return fnState;
      const keys = judgmentRecommendationKeys(fn) ?? [];
      const choices = subjectOfferChoices(actions).filter(choice => keys.includes(choice.key));
      for (const choice of choices) for (const reference of [choice.source, choice.action]) {
        const dependency = actions.find(action => action.capability_id === reference.capability_id && action.version === reference.version && action.provider.provider_id === reference.provider_id);
        if (!dependency) return { available: false as const, code: "actions.binding_invalid", reason: "推荐动作已不可访问" };
        const available = await this.resolveActionAvailability(caller, dependency, path, policy, pass);
        if (!available.available) return available;
      }
      return fnState;
    }));
    return states.find(state => state.available) ?? states[0]!;
  }

  private async checkActionAvailability(caller: ActionCallContext, capability: Pick<HostCapabilityDescriptor, "capability_id" | "version">): Promise<void> {
    const definition = this.capabilities.descriptor(capability, caller.project_id);
    if (!definition?.action || !definition.action_provider) return;
    admitPluginCall(caller, definition.capability_id, definition.action);
    const availability = this.capabilities.availability(caller, definition);
    if (!availability.available) return;
    const state = await this.resolveActionAvailability(caller, { ...definition, operation: definition.operation, action: definition.action, provider: definition.action_provider, availability });
    if (!state.available) throw new ActionError(state.code, state.reason);
  }

  private async enqueue<Output>(
    reference: LocalHostProjectReference,
    capability: Pick<HostCapabilityDescriptor, "capability_id" | "version" | "action_provider">,
    execute: () => Promise<Output>,
    step = false,
  ): Promise<Output> {
    const entry = this.ensureEntry(reference);
    const run = async (holdsQueue: boolean) => {
      const runtime = await entry.runtime;
      const scope = { entry, runtime, active: true, holdsQueue };
      return this.executionScope.run(scope, async () => {
        try { return await execute(); }
        finally { scope.active = false; }
      });
    };
    // Everything else of the project waits while a queued operation runs, so one that holds the line for long is named
    // in the log (only its capability, never its input): a page that stops answering is otherwise a mystery.
    const heldInLine = async () => {
      const started = Date.now();
      const watch = setInterval(() => hostLog.warn("actions", "project_queue_held", undefined, { capability: `${capability.capability_id}@${capability.version}`, project_id: reference.project_id, seconds: Math.round((Date.now() - started) / 1000) }), HELD_IN_LINE_WARN_MS);
      watch.unref?.();
      try { return await run(true); } finally { clearInterval(watch); }
    };
    // A Plugin action may await another declared Host capability. Queueing it behind itself deadlocks, so a call nested in
    // one that holds the line runs on it. A concurrent call holds nothing: what it calls waits its turn like anything else,
    // except a scene run (`step`), which is part of the call that triggered it and takes that call's place.
    const parent = this.executionScope.getStore();
    if (parent?.active && parent.entry === entry && (parent.holdsQueue || step)) return run(parent.holdsQueue);
    // Registered concurrent actions own their short transactions, only observe (following a live round) or touch no project
    // state (a model draft): held in line, each would keep every later operation of the project waiting until it answers. They run beside the queue; withRuntime keeps close
    // waiting; callSignal cancels these executions as closing starts, before waiting for their cleanup.
    // Concurrency is read from the registered descriptor, never from the caller.
    const registered = this.capabilities.descriptor(capability, capability.action_provider?.project_id);
    if (registered?.action?.scheduling === "concurrent") return this.withRuntime(reference, () => run(false));
    const operation = entry.operationTail.then(heldInLine);
    entry.operationTail = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  /** Direct composition port for Host code that works inside one project's runtime. */
  async withRuntime<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: Runtime) => Result | Promise<Result>,
  ): Promise<Result> {
    const entry = this.ensureEntry(reference);
    entry.activeUses += 1;
    try {
      return await operation(await entry.runtime);
    } finally {
      entry.activeUses -= 1;
      if (entry.activeUses === 0) {
        for (const resolve of entry.idleWaiters.splice(0)) resolve();
      }
    }
  }

  /** Whether the Host still takes work, without copying every registered capability as status() does. */
  lifecycle(): LocalHostStatus["state"] {
    return this.state;
  }

  /** Current project states, owned by the caller; listing projects never copies the capability directory. */
  projects(): LocalHostStatus["projects"] {
    return [...this.entries.values()]
      .map((entry) => ({ ...entry.reference, state: entry.state }))
      .sort((left, right) => left.storage_key.localeCompare(right.storage_key));
  }

  status(): LocalHostStatus {
    return snapshotStatus(this);
  }

  async closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    const storageKey = typeof referenceOrStorageKey === "string"
      ? referenceOrStorageKey.trim()
      : normalizeReference(referenceOrStorageKey).storage_key;
    const entry = this.entries.get(storageKey);
    if (!entry) return false;
    entry.state = "closing"; entry.observing.abort(this.state === "running" ? hostErrors.project_closing("这个 Project 的 Local Host runtime 正在关闭") : new ActionError("actions.host_closed", "能力所在运行环境已关闭"));
    this.closingKeys.add(storageKey);
    try {
      await entry.operationTail;
      if (entry.activeUses > 0) {
        await new Promise<void>((resolve) => { entry.idleWaiters.push(resolve); });
      }
      return await closeOpened(entry.runtime, runtime => this.options.runtimeFactory.close(runtime, entry.reference));
    } finally {
      for (const dispose of entry.actionDisposers) dispose();
      if (this.entries.get(storageKey) === entry) this.entries.delete(storageKey);
      this.closingKeys.delete(storageKey);
    }
  }

  async close(): Promise<void> {
    if (this.state === "closed") return;
    this.state = "closing";
    const keys = [...this.entries.keys()];
    await Promise.all([this.homeLine.settled(), ...keys.map((key) => this.closeProject(key))]);
    for (const dispose of this.globalActionDisposers) dispose();
    this.state = "closed";
  }

  private ensureEntry(reference: LocalHostProjectReference): RuntimeEntry<Runtime> {
    this.assertRunning();
    const normalized = normalizeReference(reference);
    this.assertCompatibleReference(normalized);
    if (this.closingKeys.has(normalized.storage_key)) {
      throw hostErrors.project_closing("这个 Project 的 Local Host runtime 正在关闭");
    }
    const existing = this.entries.get(normalized.storage_key);
    if (existing) {
      assertSameIdentity(existing.reference, normalized);
      return existing;
    }
    const entry: RuntimeEntry<Runtime> = {
      reference: normalized,
      runtime: Promise.resolve().then(() => this.options.runtimeFactory.open(normalized)),
      state: "opening",
      operationTail: Promise.resolve(),
      activeUses: 0,
      idleWaiters: [], observing: new AbortController(),
      actionDisposers: new Set(),
    };
    this.entries.set(normalized.storage_key, entry);
    entry.runtime.then(
      () => { if (entry.state === "opening") entry.state = "ready"; },
      () => {
        for (const dispose of entry.actionDisposers) dispose();
        if (this.entries.get(normalized.storage_key) === entry) this.entries.delete(normalized.storage_key);
      },
    );
    return entry;
  }

  private assertCompatibleReference(reference: LocalHostProjectReference): void {
    this.assertRunning();
    const sameProject = [...this.entries.values()].find(entry => entry.reference.project_id === reference.project_id);
    if (sameProject && sameProject.reference.storage_key !== reference.storage_key) {
      throw hostErrors.project_identity_conflict("同一 Project 不能同时使用两个存储位置");
    }
    const existing = this.entries.get(reference.storage_key);
    if (existing) assertSameIdentity(existing.reference, reference);
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
