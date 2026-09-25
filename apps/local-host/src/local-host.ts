import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  HostCapabilityDefinition,
  HostCapabilityCallOptions,
  HostCapabilityInvocation,
  LocalHostProjectClient,
  LocalHostProjectReference,
  LocalHostStatus,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionService, CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import { ActionError, requireSynchronous, type SyncActionClient, type ActionCallContext, type ActionClient, type ActionDefinition,
  type ActionRegistryPort, type ActionProviderRegistration, type ActionAvailability, type ActionView, type ActionSceneClient, type ActionSceneView } from "@molis-ai/molis-work-contracts/platform/actions";

export interface LocalHostRuntimeFactory<Runtime> {
  open(reference: LocalHostProjectReference): Runtime | Promise<Runtime>;
  close(runtime: Runtime, reference: LocalHostProjectReference): void | Promise<void>;
}

export interface LocalHostOptions<Runtime> {
  runtimeFactory: LocalHostRuntimeFactory<Runtime>;
  instanceId?: string;
  sceneAvailability?(context: ActionCallContext, scene: ActionSceneView): ActionAvailability | Promise<ActionAvailability>;
  actionAvailability?(context: ActionCallContext, action: ActionView): ActionAvailability | Promise<ActionAvailability>;
  observation?: {
    before(runtime: Runtime, reference: LocalHostProjectReference, capability: HostCapabilityDefinition, input: unknown, caller: ActionCallContext): unknown;
    after(runtime: Runtime, ticket: unknown, result: unknown, threw: boolean): void;
  };
}

export class LocalHostError extends Error {
  constructor(
    readonly code:
      | "host.closed"
      | "host.project_invalid"
      | "host.project_identity_conflict"
      | "host.project_closing",
    message: string,
  ) {
    super(message);
  }
}

interface RuntimeEntry<Runtime> {
  reference: LocalHostProjectReference;
  runtime: Promise<Runtime>;
  state: "opening" | "ready" | "closing";
  operationTail: Promise<void>;
  activeUses: number;
  idleWaiters: Array<() => void>;
  actionDisposers: Set<() => void>;
}

function normalizeReference(reference: LocalHostProjectReference): LocalHostProjectReference {
  const normalized = {
    project_id: reference.project_id.trim(),
    board_id: reference.board_id.trim(),
    storage_key: reference.storage_key.trim(),
  };
  if (!normalized.project_id || !normalized.board_id || !normalized.storage_key) {
    throw new LocalHostError("host.project_invalid", "Local Host Project reference 不能为空");
  }
  return normalized;
}

/**
 * One process-local composition owner. Each storage key is opened exactly
 * once, including concurrent discovery, and all typed Capability calls are
 * serialized through that Project runtime.
 */
function snapshotCaller(caller: ActionCallContext): ActionCallContext {
  return { ...caller, permissions: [...caller.permissions],
    ...(caller.user_action ? { user_action: { ...caller.user_action } } : {}),
    ...(caller.allowed_capability_ids ? { allowed_capability_ids: [...caller.allowed_capability_ids] } : {}),
    ...(caller.allowed_actions ? { allowed_actions: caller.allowed_actions.map(ref => ({ ...ref })) } : {}),
  };
}

export class LocalHost<Runtime> {
  readonly instanceId: string;
  readonly capabilities = new CapabilityRegistry<ActionCallContext>();
  private readonly actionService = new ActionService(this.capabilities);
  private readonly invocationRuntimes = new WeakMap<ActionCallContext, Runtime>();
  /** A restriction on legacy SDK adapters, independent of their existing action audience. */
  private readonly pluginCapabilityCallers = new WeakSet<ActionCallContext>();
  private readonly executionScope = new AsyncLocalStorage<{ entry: RuntimeEntry<Runtime>; active: boolean }>();
  private readonly entries = new Map<string, RuntimeEntry<Runtime>>();
  private readonly closingKeys = new Set<string>();
  private readonly homeScope = new AsyncLocalStorage<{ active: boolean }>();
  private homeTail: Promise<void> = Promise.resolve();
  private readonly concurrentHomeCalls = new Set<Promise<unknown>>();
  private readonly globalActionDisposers = new Set<() => void>();
  private state: "running" | "closing" | "closed" = "running";

  constructor(private readonly options: LocalHostOptions<Runtime>) {
    this.instanceId = options.instanceId?.trim() || `local-host-${randomUUID()}`;
  }

  register<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: (runtime: Runtime, input: Input, invocation: HostCapabilityInvocation) => Output | Promise<Output>,
  ): () => void {
    this.assertRunning();
    const invoke = (caller: ActionCallContext, input: Input) => {
      if (!this.invocationRuntimes.has(caller)) throw new ActionError("actions.host_context_missing", "此能力需要 Host 的项目运行环境");
      const token = this.capabilities.registrationToken(definition);
      return handler(this.invocationRuntimes.get(caller)!, input, { beforeEffect: async () => {
        caller.signal?.throwIfAborted();
        if (!this.invocationRuntimes.has(caller)) throw new ActionError("actions.expired", "原调用已经结束，不能继续产生副作用");
        await caller.validate_authority?.({ ...definition, provider_id: definition.action_provider?.provider_id ?? "platform" });
        const available = this.capabilities.availability(caller, definition);
        if (!available.available) throw new ActionError(available.code, available.reason);
        await this.checkActionAvailability(caller, definition);
        if (this.capabilities.registrationToken(definition) !== token) throw new ActionError("actions.provider_replaced", "能力提供方已重启，不能继续原副作用");
        if (!this.invocationRuntimes.has(caller)) throw new ActionError("actions.expired", "原调用已经结束，不能继续产生副作用");
        caller.signal?.throwIfAborted();
      } });
    };
    if (definition.action) return this.actionService.registerProvider({
      provider: definition.action_provider ?? { provider_id: "platform", title: "Molis Work", kind: "system" },
      definitions: [definition as ActionDefinition<Input, Output>],
      handlers: [{ ...definition, handle: (caller, input) => invoke(caller, input as Input) }],
    });
    const hostOnly = definition.host_only === true;
    return this.capabilities.register(definition, invoke, { availability: caller => hostOnly
      && (this.pluginCapabilityCallers.has(caller) || caller.audience !== "user" || caller.actor_id !== "local-host")
      ? { available: false, code: "actions.host_only", reason: "此适配入口仅供受保护的 Host 调用，插件声明不能授予用户权限" }
      : { available: true } });
  }

  /** Composition-only registration. Project authority comes from the owner, never the Plugin. */
  actionRegistry(reference?: LocalHostProjectReference): ActionRegistryPort {
    const project = reference ? normalizeReference(reference) : undefined;
    const entry = project ? this.ensureEntry(project) : undefined;
    return { registerProvider: (registration: ActionProviderRegistration) => {
      this.assertRunning();
      if (entry && (entry.state === "closing" || this.entries.get(entry.reference.storage_key) !== entry)) {
        throw new LocalHostError("host.project_closing", "能力来源所属项目已关闭");
      }
      if (registration.provider.project_id && registration.provider.project_id !== project?.project_id) {
        throw new ActionError("actions.scope_mismatch", "能力来源不能注册到其他项目");
      }
      const remove = this.actionService.registerProvider({ ...registration,
        provider: { ...registration.provider, ...(project ? { project_id: project.project_id } : {}) },
        availability: caller => this.state !== "running" || entry?.state === "closing"
          ? { available: false, code: "actions.host_closed", reason: "能力所在运行环境已关闭" }
          : registration.availability?.(caller) ?? { available: true },
      });
      const owner = entry?.actionDisposers ?? this.globalActionDisposers;
      const dispose = () => { remove(); owner.delete(dispose); };
      owner.add(dispose);
      return dispose;
    } };
  }

  /** System capabilities share the registry but do not create a fictitious project Runtime. */
  async inspectActions(caller: ActionCallContext, reference?: LocalHostProjectReference): Promise<ActionView[]> {
    this.assertRunning();
    const project = reference ? normalizeReference(reference) : undefined;
    if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "目录上下文与项目不一致");
    const bound = snapshotCaller(caller);
    if (project) await this.withRuntime(project, () => undefined);
    return Promise.all(this.actionService.inspect(bound).map(async view => ({ ...view,
      availability: await this.resolveActionAvailability(bound, view),
    })));
  }

  homeActionClient(): ActionClient {
    const contextFor = (caller: ActionCallContext) => {
      this.assertRunning();
      if (caller.project_id) throw new ActionError("actions.scope_mismatch", "系统入口不能伪造项目上下文");
      return snapshotCaller(caller);
    };
    return {
      discover: async caller => this.discoverActions(contextFor(caller)),
      invoke: async (caller, capability, input) => {
        const context = contextFor(caller);
        const descriptor = this.capabilities.descriptors().find(d => d.capability_id === capability.capability_id
          && d.version === capability.version && !d.action_provider?.project_id);
        return this.runHome(async () => {
          await this.checkActionAvailability(context, capability);
          return this.actionService.invoke(context, capability, input);
        }, descriptor?.action?.scheduling === "concurrent");
      },
    };
  }

  private runHome<Result>(operation: () => Promise<Result>, concurrent = false): Promise<Result> {
    const run = () => this.homeScope.run({ active: true }, async () => {
      const scope = this.homeScope.getStore()!;
      try { return await operation(); } finally { scope.active = false; }
    });
    if (this.homeScope.getStore()?.active) return run();
    if (concurrent) {
      const pending = run();
      this.concurrentHomeCalls.add(pending);
      void pending.then(() => this.concurrentHomeCalls.delete(pending), () => this.concurrentHomeCalls.delete(pending));
      return pending;
    }
    const pending = this.homeTail.then(run);
    this.homeTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  sceneClient(reference?: LocalHostProjectReference): ActionSceneClient {
    const project = reference ? normalizeReference(reference) : undefined;
    const prepare = async (caller: ActionCallContext): Promise<ActionCallContext> => {
      this.assertRunning();
      if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "场景上下文与项目不一致");
      const bound = snapshotCaller(caller);
      if (project) await this.withRuntime(project, () => undefined);
      return bound;
    };
    const scenes = async (caller: ActionCallContext, judgment?: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference) =>
      Promise.all(this.actionService.discoverScenes(caller, judgment).map(async scene => ({ ...scene,
        availability: scene.availability.available ? await this.options.sceneAvailability?.(caller, scene) ?? scene.availability : scene.availability,
      })));
    const check = async (caller: ActionCallContext, sceneId: string, version: number) => {
      const scene = (await scenes(caller)).find(item => item.definition.scene_id === sceneId && item.definition.version === version);
      if (!scene) throw new ActionError("actions.scene_missing", "场景不存在或不可访问");
      if (!scene.availability.available) throw new ActionError(scene.availability.code, scene.availability.reason);
    };
    const queue = <Result>(caller: ActionCallContext, id: string, version: number, event: unknown, operation: () => Promise<Result>) => project
      ? this.enqueue(project, { capability_id: `scene.${id}`, version, operation: "command" }, event, caller, operation)
      : this.runHome(operation);
    return {
      discoverScenes: async (caller, judgment) => scenes(await prepare(caller), judgment),
      usages: async (caller, judgment) => {
        const bound = await prepare(caller);
        const [uses, availableScenes, actions] = await Promise.all([this.actionService.usages(bound, judgment), scenes(bound), this.discoverActions(bound)]);
        return uses.map(use => {
          const source = availableScenes.find(scene => scene.definition.scene_id === use.scene_id && scene.definition.version === use.scene_version);
          const fn = actions.find(action => action.capability_id === use.function.capability_id && action.version === use.function.version);
          return { ...use, availability: !use.availability.available ? use.availability
            : source && !source.availability.available ? source.availability : fn?.availability ?? use.availability };
        });
      },
      bind: async (caller, binding) => {
        const bound = await prepare(caller);
        await queue(bound, binding.scene_id, binding.scene_version, binding, async () => {
          await check(bound, binding.scene_id, binding.scene_version);
          if (binding.enabled) await this.checkActionAvailability(bound, binding.function);
          await this.actionService.bind(bound, binding);
        });
      },
      runScene: async (caller, scene, bindingId, event) => {
        const bound = await prepare(caller);
        return queue(bound, scene.scene_id, scene.version, event, async () => {
          await check(bound, scene.scene_id, scene.version);
          const client = project ? this.actionClient(project) : this.homeActionClient();
          return this.actionService.runScene(bound, scene, bindingId, event, {
            invoke: (context, fn, input) => client.invoke(context, fn, input),
            beforeConsume: async judgment => {
              await check(bound, scene.scene_id, scene.version);
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
        throw new LocalHostError("host.project_closing", "同步能力需要已打开且仍有效的项目运行环境");
      }
      if (caller.project_id !== project.project_id) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      if (caller.audience !== "plugin") throw new ActionError("actions.forbidden", "同步入口只接受可信插件 SDK 上下文");
      const bound = snapshotCaller(caller);
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
      check(capability);
      return this.actionService.invokeSync(bound, capability, input);
    } };
  }

  /** A transport passes its authenticated caller on each request; arguments carry no authority. */
  actionClient(reference: LocalHostProjectReference): ActionClient {
    const project = normalizeReference(reference);
    const callerFor = (caller: ActionCallContext) => {
      this.assertCompatibleReference(project);
      if (caller.project_id !== project.project_id) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      return snapshotCaller(caller);
    };
    return {
      discover: async caller => {
        const bound = callerFor(caller);
        await this.withRuntime(project, () => undefined);
        return this.discoverActions(bound);
      },
      invoke: async (caller, capability, input) => {
        const bound = callerFor(caller);
        await this.withRuntime(project, () => undefined);
        const descriptor = this.capabilities.descriptors().find(d => d.capability_id === capability.capability_id
          && d.version === capability.version && (!d.action_provider?.project_id || d.action_provider.project_id === bound.project_id));
        if (!descriptor) return Promise.reject(new ActionError("actions.missing", "能力未注册或版本已失效"));
        return this.enqueue(project, descriptor, input, bound, () => this.actionService.invoke(bound, capability, input));
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
        const definition = this.capabilities.descriptors().find(d => d.capability_id === capability.capability_id && d.version === capability.version
          && (!d.action_provider?.project_id || d.action_provider.project_id === project.project_id));
        if (!definition) return { available: false, code: "actions.dependency_missing", reason: `所需宿主能力未注册：${capability.capability_id}@${capability.version}` };
        if (capability.provider_id && capability.provider_id !== (definition.action_provider?.provider_id ?? "platform")) return { available: false, code: "actions.provider_changed", reason: "所需能力的提供方已变化" };
        const caller: ActionCallContext = { actor_id: "local-host", project_id: project.project_id, audience: "user", permissions: [] };
        if (options?.consumer === "plugin") this.pluginCapabilityCallers.add(caller);
        return this.capabilities.availability(caller, definition);
      },
      withScope: <Result>(operation: (client: LocalHostProjectClient) => Result | Promise<Result>) =>
        this.withRuntime(project, () => operation(client)),
      invoke: <Input, Output>(
        capability: HostCapabilityDefinition<Input, Output>,
        input: Input,
        options?: HostCapabilityCallOptions,
      ) => this.invoke(project, capability, input, options),
    };
    return client;
  }

  async invoke<Input, Output>(
    reference: LocalHostProjectReference,
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
    options?: HostCapabilityCallOptions,
  ): Promise<Output> {
    const beforeEffect = options?.before_effect;
    const caller: ActionCallContext = { actor_id: "local-host", project_id: reference.project_id, audience: "user", permissions: [],
      ...(beforeEffect ? { validate_authority: () => beforeEffect() } : {}) };
    if (options?.consumer === "plugin") this.pluginCapabilityCallers.add(caller);
    // A typed identity may omit the activation scope; only the bound Host supplies it.
    const registered = this.capabilities.descriptors().find(d => d.capability_id === capability.capability_id && d.version === capability.version
      && (!d.action_provider?.project_id || d.action_provider.project_id === reference.project_id));
    const scoped = { ...capability, action_provider: registered?.action_provider };
    return this.enqueue(reference, scoped, input, caller, () => this.capabilities.invoke<Input, Output>(caller, scoped, input));
  }

  private async discoverActions(caller: ActionCallContext): Promise<ActionView[]> {
    return Promise.all(this.actionService.discover(caller).map(async view => ({ ...view,
      availability: await this.resolveActionAvailability(caller, view),
    })));
  }

  private async resolveActionAvailability(caller: ActionCallContext, view: ActionView, ancestors: ReadonlySet<string> = new Set()): Promise<ActionAvailability> {
    if (!view.availability.available) return view.availability;
    const key = JSON.stringify([view.capability_id, view.version, view.provider.provider_id]);
    if (ancestors.has(key)) return { available: false, code: "actions.dependency_cycle", reason: "能力或消费场景存在循环依赖，请修正配置" };
    const path = new Set(ancestors).add(key);
    const state = await this.options.actionAvailability?.(caller, view) ?? view.availability;
    if (!state.available) return state;
    if (!view.action.required_actions?.length && !view.action.required_scene) return state;
    const actions = this.actionService.discover(caller);
    for (const reference of view.action.required_actions ?? []) {
      const dependency = actions.find(action => action.capability_id === reference.capability_id && action.version === reference.version);
      if (!dependency) return { available: false, code: "actions.dependency_missing", reason: "所需能力不存在或不可访问" };
      if (reference.provider_id && dependency.provider.provider_id !== reference.provider_id) {
        return { available: false, code: "actions.provider_changed", reason: "所需能力的提供方已变化，原引用不能自动替换" };
      }
      const dependencyState = await this.resolveActionAvailability(caller, dependency, path);
      if (!dependencyState.available) return dependencyState;
    }
    if (!view.action.required_scene) return state;
    const required = view.action.required_scene;
    const scene = this.actionService.discoverScenes(caller).find(item => item.definition.scene_id === required.scene_id && item.definition.version === required.version);
    if (!scene) return { available: false, code: "actions.scene_missing", reason: "消费场景不存在或不可访问" };
    const sceneState = scene.availability.available ? await this.options.sceneAvailability?.(caller, scene) ?? scene.availability : scene.availability;
    if (!sceneState.available) return sceneState;
    const bindings = (await this.actionService.usages(caller)).filter(binding => binding.scene_id === required.scene_id && binding.scene_version === required.version && binding.enabled);
    if (!bindings.length) return { available: false, code: "actions.binding_required", reason: "请先为此场景选择并启用判断规则" };
    const states = await Promise.all(bindings.map(async binding => {
      if (!binding.availability.available) return binding.availability;
      const fn = actions.find(action => action.capability_id === binding.function.capability_id && action.version === binding.function.version);
      return fn ? await this.resolveActionAvailability(caller, fn, path)
        : { available: false as const, code: "actions.binding_invalid", reason: "已绑定的判断能力不可访问" };
    }));
    return states.find(state => state.available) ?? states[0]!;
  }

  private async checkActionAvailability(caller: ActionCallContext, capability: Pick<HostCapabilityDefinition, "capability_id" | "version">): Promise<void> {
    const definition = this.capabilities.descriptors().find(d => d.capability_id === capability.capability_id && d.version === capability.version
      && (!d.action_provider?.project_id || d.action_provider.project_id === caller.project_id));
    if (!definition?.action || !definition.action_provider || definition.operation === "wait") return;
    const availability = this.capabilities.availability(caller, definition);
    if (!availability.available) return;
    const state = await this.resolveActionAvailability(caller, { ...definition, operation: definition.operation, action: definition.action, provider: definition.action_provider, availability });
    if (!state.available) throw new ActionError(state.code, state.reason);
  }

  private async enqueue<Output>(
    reference: LocalHostProjectReference,
    capability: HostCapabilityDefinition,
    input: unknown,
    caller: ActionCallContext,
    execute: () => Promise<Output>,
  ): Promise<Output> {
    const entry = this.ensureEntry(reference);
    const run = async () => {
      const runtime = await entry.runtime;
      const scope = { entry, active: true };
      return this.executionScope.run(scope, async () => {
        this.invocationRuntimes.set(caller, runtime);
        let ticket: unknown;
        try { ticket = this.options.observation?.before(runtime, entry.reference, capability, input, caller); } catch { /* auxiliary observer only */ }
        let result: Output;
        try {
          await this.checkActionAvailability(caller, capability);
          result = await execute();
        }
        catch (error) {
          try { this.options.observation?.after(runtime, ticket, error, true); } catch { /* preserve business error */ }
          throw error;
        }
        finally { this.invocationRuntimes.delete(caller); scope.active = false; }
        try { this.options.observation?.after(runtime, ticket, result, false); } catch { /* preserve business result */ }
        return result;
      });
    };
    // A Plugin action may await another declared Host capability. Queueing it behind itself deadlocks.
    const parent = this.executionScope.getStore();
    if (parent?.active && parent.entry === entry) return run();
    // Registered concurrent actions own their short transactions, and a wait only observes (following a live round):
    // held in line it would keep every later operation of the project waiting until it answers. Both run beside the
    // queue; withRuntime keeps close waiting. The registry still refuses a caller claiming "wait" for another operation.
    const registered = this.capabilities.descriptors().find(d => d.capability_id === capability.capability_id
      && d.version === capability.version && d.action_provider?.project_id === capability.action_provider?.project_id);
    if (capability.operation === "wait" || registered?.action?.scheduling === "concurrent") return this.withRuntime(reference, run);
    const operation = entry.operationTail.then(run);
    entry.operationTail = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  /** Compatibility composition port while legacy callers move to capabilities. */
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

  status(): LocalHostStatus {
    return {
      instance_id: this.instanceId,
      state: this.state,
      projects: [...this.entries.values()]
        .map((entry) => ({ ...entry.reference, state: entry.state }))
        .sort((left, right) => left.storage_key.localeCompare(right.storage_key)),
      capabilities: this.capabilities.descriptors(),
    };
  }

  async closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    const storageKey = typeof referenceOrStorageKey === "string"
      ? referenceOrStorageKey.trim()
      : normalizeReference(referenceOrStorageKey).storage_key;
    const entry = this.entries.get(storageKey);
    if (!entry) return false;
    entry.state = "closing";
    this.closingKeys.add(storageKey);
    try {
      await entry.operationTail;
      if (entry.activeUses > 0) {
        await new Promise<void>((resolve) => { entry.idleWaiters.push(resolve); });
      }
      await this.options.runtimeFactory.close(await entry.runtime, entry.reference);
      return true;
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
    await Promise.all([this.homeTail, ...[...this.concurrentHomeCalls].map(call => call.then(() => undefined, () => undefined)), ...keys.map((key) => this.closeProject(key))]);
    for (const dispose of this.globalActionDisposers) dispose();
    this.state = "closed";
  }

  private ensureEntry(reference: LocalHostProjectReference): RuntimeEntry<Runtime> {
    this.assertRunning();
    const normalized = normalizeReference(reference);
    this.assertCompatibleReference(normalized);
    if (this.closingKeys.has(normalized.storage_key)) {
      throw new LocalHostError("host.project_closing", "这个 Project 的 Local Host runtime 正在关闭");
    }
    const existing = this.entries.get(normalized.storage_key);
    if (existing) {
      this.assertSameIdentity(existing.reference, normalized);
      return existing;
    }
    const entry: RuntimeEntry<Runtime> = {
      reference: normalized,
      runtime: Promise.resolve().then(() => this.options.runtimeFactory.open(normalized)),
      state: "opening",
      operationTail: Promise.resolve(),
      activeUses: 0,
      idleWaiters: [],
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
      throw new LocalHostError("host.project_identity_conflict", "同一 Project 不能同时使用两个存储位置");
    }
    const existing = this.entries.get(reference.storage_key);
    if (existing) this.assertSameIdentity(existing.reference, reference);
  }

  private assertSameIdentity(
    current: LocalHostProjectReference,
    next: LocalHostProjectReference,
  ): void {
    if (current.project_id !== next.project_id || current.board_id !== next.board_id) {
      throw new LocalHostError(
        "host.project_identity_conflict",
        `同一 storage_key 不能映射到不同 Project: ${current.project_id} / ${next.project_id}`,
      );
    }
  }

  private assertRunning(): void {
    if (this.state !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
  }
}
