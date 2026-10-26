import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionService, CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import { judgmentRecommendationKeys, subjectOfferChoices } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionSceneView, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { admitPluginCall } from "./plugin-callers.js";
import type { ActionAvailabilityPolicy, DiscoveryPass, LocalHostOptions } from "./local-host-types.js";

/**
 * Whether an action can be called by this caller now: the registry's own answer, the Host's policy, and what the action needs
 * (the actions it requires, the consumption scene and the judgment rules bound to it), followed through cycles.
 */
export class HostAvailability {
  constructor(
    private readonly actionService: ActionService,
    private readonly capabilities: CapabilityRegistry<ActionCallContext>,
    private readonly options: Pick<LocalHostOptions<unknown>, "actionAvailability" | "sceneAvailability">,
  ) {}

  async discover(caller: ActionCallContext): Promise<ActionView[]> {
    const views = this.actionService.discover(caller);
    return this.views(caller, views, views);
  }

  async views(caller: ActionCallContext, views: ActionView[], dependencySnapshot?: readonly ActionView[]): Promise<ActionView[]> {
    const policy = await this.options.actionAvailability?.snapshotForDiscovery?.(caller) ?? this.options.actionAvailability;
    // One dependency directory, scene list and binding list per discovery, including metadata inspection. Invocation uses live reads.
    let dependencies = dependencySnapshot, scenes: ActionSceneView[] | undefined, usages: ReturnType<ActionService["usages"]> | undefined;
    const pass: DiscoveryPass = { actions: () => dependencies ??= this.actionService.discover(caller), scenes: () => scenes ??= this.actionService.discoverScenes(caller), usages: () => usages ??= this.actionService.usages(caller) };
    return Promise.all(views.map(async view => ({ ...view,
      availability: await this.resolve(caller, view, new Set(), policy, pass),
    })));
  }

  async resolve(caller: ActionCallContext, view: ActionView, ancestors: ReadonlySet<string> = new Set(), policy: ActionAvailabilityPolicy | undefined = this.options.actionAvailability, pass?: DiscoveryPass): Promise<ActionAvailability> {
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
      const dependencyState = await this.resolve(caller, dependency, path, policy, pass);
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
      const fnState = await this.resolve(caller, fn, path, policy, pass);
      if (!fnState.available || scene.definition.recommendation_source !== "subject-offers") return fnState;
      const keys = judgmentRecommendationKeys(fn) ?? [];
      const choices = subjectOfferChoices(actions).filter(choice => keys.includes(choice.key));
      for (const choice of choices) for (const reference of [choice.source, choice.action]) {
        const dependency = actions.find(action => action.capability_id === reference.capability_id && action.version === reference.version && action.provider.provider_id === reference.provider_id);
        if (!dependency) return { available: false as const, code: "actions.binding_invalid", reason: "推荐动作已不可访问" };
        const available = await this.resolve(caller, dependency, path, policy, pass);
        if (!available.available) return available;
      }
      return fnState;
    }));
    return states.find(state => state.available) ?? states[0]!;
  }

  /** Throws the reason when the Host's policy, or what the action needs, says the call cannot go ahead now. */
  async check(caller: ActionCallContext, capability: Pick<HostCapabilityDescriptor, "capability_id" | "version">): Promise<void> {
    const definition = this.capabilities.descriptor(capability, caller.project_id);
    if (!definition?.action || !definition.action_provider) return;
    admitPluginCall(caller, definition.capability_id, definition.action);
    const availability = this.capabilities.availability(caller, definition);
    if (!availability.available) return;
    const state = await this.resolve(caller, { ...definition, operation: definition.operation, action: definition.action, provider: definition.action_provider, availability });
    if (!state.available) throw new ActionError(state.code, state.reason);
  }
}
