import {
  ActionError, inspectActionDeclarations, requireSynchronous,
  type ActionAvailability, type ActionCallContext, type ActionExecutionContext, type ActionClient, type ActionDefinition,
  type ActionProvider, type ActionProviderRegistration, type ActionReference, type ActionRegistryPort,
  type ActionSceneTarget, type ActionSceneConfigureOptions, type ActionSceneBinding, type ActionSceneDefinition, type ActionSceneHandlerBinding, type ActionView, type ActionSceneView,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { CapabilityRegistry } from "./index.js";
import { actionSchemaAccepts, compileActionSchema, createActionSchemaCompiler, validateActionValue } from "./action-schema.js";
import { subjectOfferCompatibilityReason } from "./subject-offer-choices.js";

interface RegisteredScene {
  definition: ActionSceneDefinition;
  provider: ActionProvider;
  handler: ActionSceneHandlerBinding;
  availability(context: ActionCallContext): ActionAvailability;
  configurationAvailability(context: ActionCallContext): ActionAvailability;
  validateEvent?: ReturnType<typeof compileActionSchema>;
  validateInput: ReturnType<typeof compileActionSchema>;
  validateResult: ReturnType<typeof compileActionSchema>;
}

export type { ActionSceneView } from "@molis-ai/molis-work-contracts/platform/actions";

/** One execution registry, shared by UI, workflows, SDK and protocol adapters. */
export class ActionService implements ActionClient, ActionRegistryPort {
  private readonly scenes = new Map<string, RegisteredScene>();
  /** Availability is synchronous; this stack exists only during a directory/execution check. */
  private readonly checkingDependencies = new Set<string>();

  constructor(readonly registry = new CapabilityRegistry<ActionCallContext>(),
    private readonly effects: { beforeEffect?(context: ActionCallContext, reference: ActionReference): void | Promise<void> } = {}) {}

  registerProvider(registration: ActionProviderRegistration): () => void {
    const problems = inspectActionDeclarations(registration.definitions, registration.scenes);
    if (problems.length) throw new ActionError("actions.definition_invalid", problems.join("；"));
    const provider = structuredClone(registration.provider);
    if (!provider.provider_id || !provider.title) throw new ActionError("actions.provider_invalid", "能力来源缺少身份或名称");
    const handlers = exactBindings(registration.definitions, registration.handlers, actionKey, "能力");
    const sceneHandlers = exactBindings(registration.scenes ?? [], registration.scene_handlers ?? [], sceneKey, "消费场景");
    // A provider commonly shares its full workspace schema across many commands.
    // Compile that immutable registration snapshot once; never retain a global
    // cache that could carry a mutated contract into a later installation.
    const compileSchema = createActionSchemaCompiler();
    const validators = new WeakMap<object, ReturnType<typeof compileActionSchema>>();
    const compile = (original: import("@molis-ai/molis-work-contracts/platform/actions").ActionSchema,
      snapshot: import("@molis-ai/molis-work-contracts/platform/actions").ActionSchema) => {
      let validator = validators.get(original);
      if (!validator) { validator = compileSchema(snapshot); validators.set(original, validator); }
      return validator;
    };
    const disposers: Array<() => void> = [];
    let active = true;
    const sourceAvailability = (context: ActionCallContext): ActionAvailability => {
      if (!active) return unavailable("actions.stopped", "能力来源已停止");
      if (!context.actor_id) return unavailable("actions.unauthenticated", "缺少可信调用身份");
      if (provider.project_id && context.project_id !== provider.project_id) return unavailable("actions.scope_mismatch", "能力属于其他项目");
      return registration.availability?.(context) ?? { available: true };
    };
    const dispose = () => {
      if (!active) return;
      active = false;
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!();
    };
    try {
      for (const original of registration.definitions) {
        const definition = structuredClone(original);
        const handler = handlers.get(actionKey(definition))!;
        if (typeof handler.handle !== "function") throw new ActionError("actions.unredeemed", `能力 ${actionKey(definition)} 缺少执行处理器`);
        const validateInput = compile(original.action.input_schema, definition.action.input_schema);
        const validateOutput = definition.action.output_schema ? compile(original.action.output_schema!, definition.action.output_schema) : undefined;
        const availability = (context: ActionCallContext): ActionAvailability => {
          const source = sourceAvailability(context);
          if (!source.available) return source;
          if (!visible(definition, provider, context)) return unavailable("actions.forbidden", "当前调用者不可使用此能力");
          if (definition.action.scope === "project" && !context.project_id) return unavailable("actions.project_required", "请选择项目");
          const own = handler.availability?.(context) ?? { available: true };
          return own.available ? this.dependencyAvailability(context, definition) : own;
        };
        const registeredDefinition = { ...definition, action_provider: provider };
        const execute = (context: ActionCallContext, input: unknown) => {
          context.signal?.throwIfAborted();
          validateActionValue(validateInput, input, "input");
          const registration = this.registry.registrationToken(registeredDefinition);
          const reference = { capability_id: definition.capability_id, version: definition.version, provider_id: provider.provider_id };
          let executing = true;
          const assertCurrent = () => {
            if (!executing) throw new ActionError("actions.expired", "原调用已经结束，不能继续产生副作用");
            context.signal?.throwIfAborted();
            if (this.registry.registrationToken(registeredDefinition) !== registration) throw new ActionError("actions.provider_changed", "能力已重新加载，不能继续原副作用");
            assertAvailable(availability(context));
          };
          // Copy the context so a concurrent/nested invocation cannot replace this call's check.
          const execution: ActionExecutionContext = { ...context, beforeEffect: async () => {
            assertCurrent();
            await context.validate_authority?.(reference);
            await context.validate_permissions?.(definition.action.permissions);
            await this.effects.beforeEffect?.(context, reference);
            assertCurrent();
          } };
          const checked = (value: unknown) => {
            if (validateOutput) validateActionValue(validateOutput, value, "output");
            return value;
          };
          try {
            const result = handler.handle(execution, input);
            if (handler.execution === "sync") {
              try { return checked(requireSynchronous(result)); } finally { executing = false; }
            }
            return Promise.resolve(result).then(checked).finally(() => { executing = false; });
          } catch (error) { executing = false; throw error; }
        };
        disposers.push(this.registry.register(registeredDefinition, execute,
          { availability, synchronous: handler.execution === "sync" }));
      }
      for (const original of registration.scenes ?? []) {
        const definition = structuredClone(original);
        const key = scopedSceneKey(definition, provider.project_id), handler = sceneHandlers.get(sceneKey(definition))!;
        if ([...this.scenes.values()].some(s => sceneKey(s.definition) === sceneKey(definition)
          && (!s.provider.project_id || !provider.project_id || s.provider.project_id === provider.project_id))) {
          throw new ActionError("actions.scene_duplicate", `消费场景重复：${sceneKey(definition)}`);
        }
        if ([handler.bind, handler.bindings, handler.consume].some(v => typeof v !== "function")) {
          throw new ActionError("actions.unredeemed", `场景 ${key} 必须兑现绑定查询、保存及结果消费`);
        }
        if (handler.targets !== undefined && (!definition.configuration_permissions || typeof handler.targets !== "function")) throw new ActionError("actions.definition_invalid", `场景 ${key} 缺少配置权限合同`);
        if (handler.prepare !== undefined && typeof handler.prepare !== "function") throw new ActionError("actions.unredeemed", `场景 ${key} 的 prepare 不是函数`);
        if (handler.failed !== undefined && typeof handler.failed !== "function") throw new ActionError("actions.unredeemed", `场景 ${key} 的 failed 不是函数`);
        if (handler.prepare && !definition.event_schema) throw new ActionError("actions.definition_invalid", `场景 ${key} 的 prepare 缺少事件合同`);
        const scene: RegisteredScene = { definition, provider, handler,
          ...(definition.event_schema ? { validateEvent: compile(original.event_schema!, definition.event_schema) } : {}),
          validateInput: compile(original.input_schema, definition.input_schema), validateResult: compile(original.result_schema, definition.result_schema),
          configurationAvailability: context => {
            const source = sourceAvailability(context);
            if (!source.available) return source;
            if (!handler.targets || !definition.configuration_permissions) return unavailable("actions.configuration_unavailable", "此场景未提供配置入口");
            if (!definition.configuration_permissions.every(permission => context.permissions.includes(permission))) return unavailable("actions.forbidden", "缺少场景配置权限");
            if (definition.scope === "project" && !context.project_id) return unavailable("actions.project_required", "请选择项目");
            return handler.configuration_availability?.(context) ?? { available: true };
          },
          availability: (context) => {
            const source = sourceAvailability(context);
            if (!source.available) return source;
            if (!definition.permissions.every(p => context.permissions.includes(p))) return unavailable("actions.forbidden", "缺少场景权限");
            if (definition.scope === "project" && !context.project_id) return unavailable("actions.project_required", "请选择项目");
            return handler.availability?.(context) ?? { available: true };
          },
        };
        this.scenes.set(key, scene);
        disposers.push(() => { if (this.scenes.get(key) === scene) this.scenes.delete(key); });
      }
    } catch (error) { dispose(); throw error; }
    return dispose;
  }

  discover(context: ActionCallContext): ActionView[] {
    return this.directory(context, false);
  }

  /** Composition-only metadata inspection. Never grants execution or exposes handlers. */
  inspect(context: ActionCallContext): ActionView[] {
    return this.directory(context, true);
  }

  private directory(context: ActionCallContext, inspection: boolean): ActionView[] {
    // Other projects' actions are dropped before anything is copied.
    return this.registry.descriptors(d => !d.action_provider?.project_id || d.action_provider.project_id === context.project_id).flatMap(definition => {
      const provider = definition.action_provider;
      // A wait (following a live round) observes and is never an action; actions are queries or commands.
      if (definition.operation === "wait") return [];
      if (!definition.action || !provider || !context.actor_id
        || (provider.project_id && provider.project_id !== context.project_id)
        || !definition.action.audiences.includes(context.audience)) return [];
      if (!inspection && !visible(definition as ActionDefinition, provider, context)) return [];
      return [{ capability_id: definition.capability_id, version: definition.version, operation: definition.operation,
        action: definition.action, provider, availability: this.registry.availability(context, definition) }];
    });
  }

  async invoke(context: ActionCallContext, reference: ActionReference, input: unknown): Promise<unknown> {
    const definition = this.actionDefinition(context, reference);
    if (!definition) throw new ActionError("actions.missing", "能力未注册或版本已失效");
    if (reference.provider_id && definition.action_provider?.provider_id !== reference.provider_id) {
      throw new ActionError("actions.provider_changed", "能力提供方已变化，原引用不能自动替换");
    }
    if (context.validate_authority) {
      const registration = this.registry.registrationToken(definition);
      await context.validate_authority({ ...reference, provider_id: definition.action_provider?.provider_id });
      if (registration !== this.registry.registrationToken(definition)) throw new ActionError("actions.provider_changed", "授权检查期间能力已重新加载，请重新执行");
    }
    return this.registry.invoke(context, definition, input);
  }

  invokeSync(context: ActionCallContext, reference: ActionReference, input: unknown): unknown {
    const definition = this.actionDefinition(context, reference);
    if (!definition) throw new ActionError("actions.missing", "能力未注册或版本已失效");
    if (reference.provider_id && definition.action_provider?.provider_id !== reference.provider_id) {
      throw new ActionError("actions.provider_changed", "能力提供方已变化，原引用不能自动替换");
    }
    const registration = this.registry.registrationToken(definition);
    requireSynchronous(context.validate_authority?.({ ...reference, provider_id: definition.action_provider?.provider_id }), "授权检查需要异步调用");
    if (registration !== this.registry.registrationToken(definition)) throw new ActionError("actions.provider_changed", "授权检查期间能力已重新加载，请重新执行");
    return this.registry.invokeSync(context, definition, input);
  }

  discoverScenes(context: ActionCallContext, judgment?: ActionReference): ActionSceneView[] {
    const directory = judgment ? this.discover(context) : [];
    const fn = judgment ? directory.find(d => actionKey(d) === actionKey(judgment)) : undefined;
    return [...this.scenes.values()].filter(s => sceneVisible(s, context)).map(scene => {
      const reason = judgment ? actionSceneCompatibilityReason(scene.definition, fn, judgment, directory, scene.provider) : undefined;
      return { definition: structuredClone(scene.definition), provider: structuredClone(scene.provider),
        configuration_availability: scene.configurationAvailability(context), availability: scene.availability(context), compatible: !reason, ...(reason ? { reason } : {}) };
    });
  }

  async usages(context: ActionCallContext, judgment?: ActionReference): Promise<Array<ActionSceneBinding & { availability: ActionAvailability }>> {
    const result: Array<ActionSceneBinding & { availability: ActionAvailability }> = [];
    for (const scene of this.scenes.values()) {
      if (!sceneVisible(scene, context)) continue;
      for (const binding of await scene.handler.bindings(context)) {
        if (!bindingBelongsTo(binding, scene.definition, context)) continue;
        if (judgment && actionKey(binding.function) !== actionKey(judgment)) continue;
        const directory = this.discover(context);
        const fn = directory.find(d => actionKey(d) === actionKey(binding.function));
        const reason = !binding.function.provider_id ? "旧绑定缺少原提供方身份，请重新选择判断规则" : actionSceneCompatibilityReason(scene.definition, fn, binding.function, directory, scene.provider);
        const state = scene.availability(context);
        const availability = !binding.enabled ? unavailable("actions.binding_disabled", "此使用位置已停用")
          : !state.available ? state : reason ? unavailable("actions.binding_invalid", reason) : fn!.availability;
        result.push({ ...structuredClone(binding), availability });
      }
    }
    return result;
  }

  async targets(context: ActionCallContext, judgment?: ActionReference, selection?: Pick<ActionSceneTarget, "scene_id" | "scene_version" | "provider_id">): Promise<ActionSceneTarget[]> {
    const result: ActionSceneTarget[] = [];
    for (const view of this.discoverScenes(context, judgment)) {
      if (selection && (view.definition.scene_id !== selection.scene_id || view.definition.version !== selection.scene_version || view.provider.provider_id !== selection.provider_id)) continue;
      const scene = this.scenes.get(scopedSceneKey(view.definition, view.provider.project_id))!;
      if (!scene.handler.targets) continue;
      const targets = await scene.handler.targets(context);
      const bindings = await scene.handler.bindings(context);
      if (this.scenes.get(scopedSceneKey(view.definition, view.provider.project_id)) !== scene) throw new ActionError("actions.provider_changed", "读取配置位置时场景已重新加载");
      const fn = judgment ? this.discover(context).find(action => actionKey(action) === actionKey(judgment)) : undefined;
      const ids = new Set<string>();
      for (const target of targets) {
        if (!target.binding_id || !target.title || (target.revision !== null && (typeof target.revision !== "string" || !target.revision)) || ids.has(target.binding_id)) {
          throw new ActionError("actions.target_invalid", "消费场景返回了不完整或重复的配置位置");
        }
        ids.add(target.binding_id);
        const configurationAvailability = !view.configuration_availability.available ? view.configuration_availability
          : target.availability && !target.availability.available ? target.availability
            : !view.definition.configuration_permissions!.every(permission => context.permissions.includes(permission))
              ? unavailable("actions.forbidden", "缺少场景配置权限") : { available: true as const };
        result.push({ ...structuredClone(target), configuration_availability: configurationAvailability, scene_id: view.definition.scene_id, scene_version: view.definition.version,
          provider_id: view.provider.provider_id, project_id: view.definition.scope === "home" ? null : context.project_id,
          binding: structuredClone(bindings.find(b => b.binding_id === target.binding_id && bindingBelongsTo(b, scene.definition, context)) ?? null),
          availability: !configurationAvailability.available ? configurationAvailability : !view.availability.available ? view.availability
            : target.activation_availability && !target.activation_availability.available ? target.activation_availability
              : !(target.activation_permissions ?? []).every(permission => context.permissions.includes(permission)) ? unavailable("actions.forbidden", "缺少启用此位置所需的权限") : !view.compatible ? unavailable("actions.scene_incompatible", view.reason ?? "判断与场景不兼容")
              : fn && !fn.availability.available ? fn.availability : { available: true },
        });
      }
    }
    return result;
  }

  async bind(context: ActionCallContext, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): Promise<void> {
    const purpose = options && !binding.enabled ? "configure" : "execute";
    const scene = this.requireScene(context, binding, purpose);
    if (!bindingBelongsTo(binding, scene.definition, context)) throw new ActionError("actions.scope_mismatch", "绑定作用域与当前场景不符");
    const requiredPermissions = [...(purpose === "execute" ? scene.definition.permissions : []), ...(options ? scene.definition.configuration_permissions ?? [] : [])];
    if (options) {
      assertAvailable(scene.configurationAvailability(context));
      if (scene.provider.provider_id !== options.provider_id) throw new ActionError("actions.provider_changed", "消费场景的提供方已变化");
      if (!scene.handler.targets) throw new ActionError("actions.configuration_unavailable", "此场景尚未提供配置位置");
      if (!scene.definition.configuration_permissions!.every(permission => context.permissions.includes(permission))) throw new ActionError("actions.forbidden", "缺少场景配置权限");
      const target = (await scene.handler.targets(context)).find(target => target.binding_id === binding.binding_id);
      if (!target) throw new ActionError("actions.binding_missing", "原配置位置已不存在");
      if (target.availability) assertAvailable(target.availability);
      if (binding.enabled && target.activation_availability) assertAvailable(target.activation_availability);
      if (binding.enabled) {
        requiredPermissions.push(...target.activation_permissions ?? []);
        if (!requiredPermissions.every(permission => context.permissions.includes(permission))) throw new ActionError("actions.forbidden", "缺少启用此位置所需的权限");
      }
      if (target.revision !== options.expected_revision) throw new ActionError("actions.binding_changed", "配置已变化，请刷新后再试");
      if (this.requireScene(context, binding, purpose) !== scene) throw new ActionError("actions.provider_changed", "消费场景已重新加载");
      binding = { ...binding, title: target.title, ...(target.href ? { href: target.href } : { href: undefined }) };
    }
    if (options && !binding.enabled) {
      const current = (await scene.handler.bindings(context)).find(value => value.binding_id === binding.binding_id && bindingBelongsTo(value, scene.definition, context));
      if (!current) throw new ActionError("actions.binding_missing", "此位置尚未绑定判断");
      if (actionKey(current.function) !== actionKey(binding.function) || current.function.provider_id !== binding.function.provider_id) throw new ActionError("actions.binding_changed", "原绑定已变化，不能停用其他判断");
      binding = { ...current, enabled: false };
    }
    const saved = binding.enabled ? { ...binding, function: { capability_id: binding.function.capability_id, version: binding.function.version,
      provider_id: this.requireCompatible(context, scene, binding.function).provider.provider_id } } : binding;
    if (options && binding.enabled) {
      const definition = this.actionDefinition(context, saved.function)!;
      const registration = this.registry.registrationToken(definition);
      await options.before_write?.();
      await context.validate_authority?.(saved.function);
      await context.validate_permissions?.(requiredPermissions);
      if (registration !== this.registry.registrationToken(definition) || this.requireScene(context, binding, purpose) !== scene) throw new ActionError("actions.provider_changed", "配置期间来源已变化");
      this.requireCompatible(context, scene, saved.function);
    }
    if (options && !binding.enabled) {
      await options.before_write?.();
      await context.validate_permissions?.(requiredPermissions);
    }
    if (this.requireScene(context, binding, purpose) !== scene) throw new ActionError("actions.provider_changed", "配置期间消费场景已重新加载");
    context.signal?.throwIfAborted();
    await scene.handler.bind(context, structuredClone(saved), options ? { provider_id: options.provider_id,
      expected_revision: options.expected_revision, required_permissions: [...new Set(requiredPermissions)] } : undefined);
  }

  /** Trigger owners supply events; prepared private state is never accepted from callers. */
  async runScene(context: ActionCallContext, reference: { scene_id: string; version: number }, bindingId: string, event: unknown,
    execution: { invoke?: ActionClient["invoke"]; beforeConsume?(judgment: ActionReference): Promise<void> } = {}): Promise<unknown> {
    const scene = this.requireScene(context, { scene_id: reference.scene_id, scene_version: reference.version });
    const storedBinding = (await scene.handler.bindings(context)).find(b => b.binding_id === bindingId && bindingBelongsTo(b, scene.definition, context));
    if (!storedBinding || !storedBinding.enabled) throw new ActionError("actions.binding_missing", "未找到启用的场景绑定");
    if (!storedBinding.function.provider_id) throw new ActionError("actions.binding_invalid", "旧绑定缺少原提供方身份，请重新选择判断规则");
    const binding = structuredClone(storedBinding);
    this.requireCompatible(context, scene, binding.function);
    const functionDefinition = this.actionDefinition(context, binding.function)!;
    const functionRegistration = this.registry.registrationToken(functionDefinition);
    if (scene.validateEvent) validateActionValue(scene.validateEvent, event, "input");
    const prepared = scene.handler.prepare ? await scene.handler.prepare(context, event) : { input: event };
    const recheck = async () => {
      await context.validate_permissions?.(scene.definition.permissions);
      if (this.requireScene(context, binding) !== scene || this.registry.registrationToken(functionDefinition) !== functionRegistration) {
        throw new ActionError("actions.provider_changed", "判断期间能力或消费场景已重新加载，请重新执行");
      }
      const current = (await scene.handler.bindings(context)).find(b => b.binding_id === bindingId && bindingBelongsTo(b, scene.definition, context));
      if (!current?.enabled || actionKey(current.function) !== actionKey(binding.function) || current.revision !== binding.revision) {
        throw new ActionError("actions.binding_changed", "判断期间场景绑定已变化");
      }
      this.requireCompatible(context, scene, current.function);
      context.signal?.throwIfAborted();
    };
    await recheck();
    let result: unknown;
    try {
      validateActionValue(scene.validateInput, prepared.input, "input");
      result = await (execution.invoke ?? this.invoke.bind(this))({ ...context, scene_binding: { scene_id: reference.scene_id, binding_id: bindingId } }, binding.function, prepared.input);
    } catch (error) {
      await execution.beforeConsume?.(binding.function);
      await context.validate_authority?.(binding.function);
      await recheck();
      if (!scene.handler.failed) throw error;
      return scene.handler.failed(context, prepared.input, error, { binding: structuredClone(binding), state: prepared.state });
    }
    await execution.beforeConsume?.(binding.function);
    await context.validate_authority?.(binding.function);
    await recheck();
    validateActionValue(scene.validateResult, result, "output");
    return scene.handler.consume(context, prepared.input, result, { binding: structuredClone(binding), state: prepared.state });
  }

  private requireScene(context: ActionCallContext, reference: { scene_id: string; scene_version: number }, purpose: "execute" | "configure" = "execute"): RegisteredScene {
    const identity = { scene_id: reference.scene_id, version: reference.scene_version };
    const scene = this.scenes.get(scopedSceneKey(identity, context.project_id ?? undefined))
      ?? this.scenes.get(scopedSceneKey(identity));
    if (!scene || !sceneVisible(scene, context)) throw new ActionError("actions.scene_missing", "场景不存在或不可访问");
    assertAvailable(purpose === "configure" ? scene.configurationAvailability(context) : scene.availability(context));
    return scene;
  }

  private actionDefinition(context: ActionCallContext, reference: ActionReference) {
    const selected = this.registry.descriptor(reference, context.project_id);
    if (selected?.action) return selected;
    // Preserve the existing foreign-project rejection when the identity exists only elsewhere.
    const matching = this.registry.descriptors(d => actionKey(d) === actionKey(reference) && !!d.action);
    return matching.find(d => !d.action_provider?.project_id || d.action_provider.project_id === context.project_id) ?? matching[0];
  }

  private dependencyAvailability(context: ActionCallContext, definition: ActionDefinition): ActionAvailability {
    const key = JSON.stringify([context.project_id, definition.capability_id, definition.version]);
    if (this.checkingDependencies.has(key)) return unavailable("actions.dependency_cycle", "能力之间存在循环依赖，请修正插件声明");
    this.checkingDependencies.add(key);
    try {
      for (const reference of definition.action.required_actions ?? []) {
        const dependency = this.actionDefinition(context, reference);
        if (!dependency) return unavailable("actions.dependency_missing", "所需能力未注册或版本已失效");
        const state = this.registry.availability(context, dependency);
        if (!state.available) return state;
        if (reference.provider_id && reference.provider_id !== dependency.action_provider?.provider_id) {
          return unavailable("actions.provider_changed", "所需能力的提供方已变化，原引用不能自动替换");
        }
      }
      return { available: true };
    } finally { this.checkingDependencies.delete(key); }
  }

  private requireCompatible(context: ActionCallContext, scene: RegisteredScene, ref: ActionReference): ActionView {
    const directory = this.discover(context);
    const fn = directory.find(d => actionKey(d) === actionKey(ref));
    const reason = actionSceneCompatibilityReason(scene.definition, fn, ref, directory, scene.provider);
    if (reason) throw new ActionError("actions.scene_incompatible", reason);
    assertAvailable(fn!.availability);
    return fn!;
  }
}

function visible(d: ActionDefinition, provider: ActionProvider, c: ActionCallContext): boolean {
  return !!c.actor_id && (!provider.project_id || provider.project_id === c.project_id)
    && d.action.audiences.includes(c.audience) && d.action.permissions.every(p => c.permissions.includes(p))
    && (!c.allowed_capability_ids || c.allowed_capability_ids.includes(d.capability_id))
    && (!c.allowed_actions || c.allowed_actions.some(ref => ref.capability_id === d.capability_id && ref.version === d.version
      && (!ref.provider_id || ref.provider_id === provider.provider_id)));
}
function sceneVisible(s: RegisteredScene, c: ActionCallContext): boolean {
  return !!c.actor_id && (!s.provider.project_id || s.provider.project_id === c.project_id)
    && (s.definition.permissions.every(p => c.permissions.includes(p))
      || Boolean(s.handler.targets && s.definition.configuration_permissions?.every(p => c.permissions.includes(p))));
}
function bindingBelongsTo(b: ActionSceneBinding, s: ActionSceneDefinition, c: ActionCallContext): boolean {
  return b.scene_id === s.scene_id && b.scene_version === s.version && b.project_id === (s.scope === "home" ? null : c.project_id);
}
export function actionSceneCompatibilityReason(scene: ActionSceneDefinition, fn?: ActionView, reference?: ActionReference, directory: readonly ActionView[] = [], provider?: Pick<ActionProvider, "provider_id">): string | undefined {
  if (!fn) return "判断能力不存在或不可访问";
  if (reference?.provider_id && reference.provider_id !== fn.provider.provider_id) return "判断能力的提供方已变化，原引用不能自动替换";
  if (fn.action.kind !== "judgment") return "此场景需要判断能力";
  const intent = fn.action.result_scene;
  if (intent && (intent.scene_id !== scene.scene_id || intent.version !== scene.version || intent.provider_id !== provider?.provider_id)) return "此规则仅适用于选定的场景版本和提供方";
  if (scene.subject_kinds.some(kind => !fn.action.subject_kinds.includes(kind))) return "判断能力未覆盖此场景的所有对象类型";
  if (fn.action.input_type && fn.action.input_type !== scene.input_type) return "输入对象类型不匹配";
  if (scene.result_type && scene.result_type !== fn.action.output_type) return "判断结果类型不匹配";
  if (!actionSchemaAccepts(fn.action.input_schema, scene.input_schema)) return "场景上下文不能满足函数输入";
  if (!fn.action.output_schema || !actionSchemaAccepts(scene.result_schema, fn.action.output_schema)) return "函数结果不能满足场景合同";
  if (scene.recommendation_source === "subject-offers") return subjectOfferCompatibilityReason(fn, directory);
  return undefined;
}
function assertAvailable(value: ActionAvailability): void { if (!value.available) throw new ActionError(value.code, value.reason); }
function unavailable(code: string, reason: string): ActionAvailability { return { available: false, code, reason }; }
function actionKey(v: ActionReference): string { return `${v.capability_id}@${v.version}`; }
function sceneKey(v: { scene_id: string; version: number }): string { return `${v.scene_id}@${v.version}`; }
function scopedSceneKey(v: { scene_id: string; version: number }, projectId?: string): string { return JSON.stringify([v.scene_id, v.version, projectId ?? null]); }
function exactBindings<D, H>(definitions: readonly D[], handlers: readonly H[], key: (v: D | H) => string, label: string): Map<string, H> {
  const expected = new Set(definitions.map(key)), result = new Map<string, H>();
  for (const handler of handlers) {
    const id = key(handler);
    if (!expected.has(id) || result.has(id)) throw new ActionError("actions.unredeemed", `${label}处理器未声明或重复：${id}`);
    result.set(id, handler);
  }
  for (const id of expected) if (!result.has(id)) throw new ActionError("actions.unredeemed", `${label}未兑现：${id}`);
  return result;
}
