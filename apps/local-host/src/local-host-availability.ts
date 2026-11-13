import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionService, CapabilityRegistry, RetainedActionDirectory } from "@molis-ai/molis-work-kernel";
import { actionDirectoryLookup, judgmentRecommendationKeys, sampleRetainedActionDirectory, subjectOfferChoices, type SubjectOfferChoiceView } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionExecutionContext, type ActionReference, type ActionSceneUsage, type ActionSceneView, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
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
    private readonly options: Pick<LocalHostOptions<unknown>, "actionAvailability" | "sceneAvailability" | "assertProjectAvailable">,
  ) {}

  async discover(caller: ActionCallContext): Promise<ActionView[]> {
    const views = this.actionService.discover(caller);
    return this.views(caller, views, views);
  }

  async discoverRetained(caller: ActionCallContext, retain: NonNullable<ActionExecutionContext["retainAuthority"]>): Promise<RetainedActionDirectory> {
    const sample = sampleRetainedActionDirectory(observe => this.actionService.discover(caller, observe), retain);
    const views = await this.views(caller, sample.views, sample.views);
    const original = new Map(views.map((view, index) => [view, sample.views[index]!]));
    const select = (selected: readonly ActionView[]) => selected.map(view => {
      const row = original.get(view);
      if (!row || !view.availability.available) throw new ActionError("actions.forbidden", "只能保留本次目录可用的能力");
      return row;
    });
    return { views, retain: selected => sample.retain(select(selected)), pin: selected => sample.pin(select(selected)) };
  }

  async views(caller: ActionCallContext, views: readonly ActionView[], dependencySnapshot?: readonly ActionView[]): Promise<ActionView[]> {
    const policy = await this.options.actionAvailability?.snapshotForDiscovery?.(caller) ?? this.options.actionAvailability;
    // Projecting the views reads every row once; when they are the dependency snapshot too, those same reads index it. Every
    // dependency is looked up after the policy's await, by when the projection has read them all, so the snapshot is not read again.
    const seen = dependencySnapshot === views ? new Map<string, ActionView>() : undefined;
    let read = 0;
    const pass = dependencyDirectory(this.actionService, caller, dependencySnapshot, seen && (() => seen.size > 0 && read === views.length ? seen : undefined));
    return Promise.all(views.map(async view => {
      if (seen) { read++; const key = actionKey(view); if (!seen.has(key)) seen.set(key, view); }
      return { ...view, availability: await this.resolve(caller, view, new Set(), policy, pass) };
    }));
  }

  /**
   * `pass` is the caller's directory for the whole resolution: a check that brings none gets one here, and every dependency, scene, binding and
   * offer it follows reads that same directory, once, instead of reading the whole directory again at each step.
   */
  async resolve(caller: ActionCallContext, view: ActionView, ancestors: ReadonlySet<string> = new Set(), policy: ActionAvailabilityPolicy | undefined = this.options.actionAvailability, given?: DiscoveryPass): Promise<ActionAvailability> {
    if (!view.availability.available) return view.availability;
    const key = JSON.stringify([view.capability_id, view.version, view.provider.provider_id]);
    if (ancestors.has(key)) return { available: false, code: "actions.dependency_cycle", reason: "能力或消费场景存在循环依赖，请修正配置" };
    const path = new Set(ancestors).add(key);
    const state = await policy?.(caller, view) ?? view.availability;
    if (!state.available) return state;
    if (!view.action.required_actions?.length && !view.action.required_scene) return state;
    const pass = given ?? dependencyDirectory(this.actionService, caller);
    const firstAction = pass.actions();
    for (const reference of view.action.required_actions ?? []) {
      const dependency = firstAction(reference);
      if (!dependency) return { available: false, code: "actions.dependency_missing", reason: "所需能力不存在或不可访问" };
      if (reference.provider_id && dependency.provider.provider_id !== reference.provider_id) {
        return { available: false, code: "actions.provider_changed", reason: "所需能力的提供方已变化，原引用不能自动替换" };
      }
      const dependencyState = await this.resolve(caller, dependency, path, policy, pass);
      if (!dependencyState.available) return dependencyState;
    }
    if (!view.action.required_scene) return state;
    const required = view.action.required_scene;
    const scene = pass.scene(required);
    if (!scene) return { available: false, code: "actions.scene_missing", reason: "消费场景不存在或不可访问" };
    const sceneState = scene.availability.available ? await this.options.sceneAvailability?.(caller, scene) ?? scene.availability : scene.availability;
    if (!sceneState.available) return sceneState;
    const bindings = await pass.bindings(required);
    if (!bindings.length) return { available: false, code: "actions.binding_required", reason: "请先为此场景选择并启用判断规则" };
    const states = await Promise.all(bindings.map(async binding => {
      if (!binding.availability.available) return binding.availability;
      const fn = firstAction(binding.function);
      if (!fn) return { available: false as const, code: "actions.binding_invalid", reason: "已绑定的判断能力不可访问" };
      const fnState = await this.resolve(caller, fn, path, policy, pass);
      if (!fnState.available || scene.definition.recommendation_source !== "subject-offers") return fnState;
      const keys = judgmentRecommendationKeys(fn) ?? [];
      const choices = pass.choices().filter(choice => keys.includes(choice.key));
      for (const choice of choices) for (const reference of [choice.source, choice.action]) {
        // This caller's directory has at most one row for this id/version. The offer still pins its exact provider.
        const dependency = firstAction(reference);
        if (!dependency || dependency.provider.provider_id !== reference.provider_id) return { available: false as const, code: "actions.binding_invalid", reason: "推荐动作已不可访问" };
        const available = await this.resolve(caller, dependency, path, policy, pass);
        if (!available.available) return available;
      }
      return fnState;
    }));
    return states.find(state => state.available) ?? states[0]!;
  }

  /** Throws the reason when the Host's policy, or what the action needs, says the call cannot go ahead now. */
  async check(caller: ActionCallContext, capability: Pick<HostCapabilityDescriptor, "capability_id" | "version">): Promise<void> {
    if (caller.project_id) this.options.assertProjectAvailable?.(caller.project_id);
    const definition = this.capabilities.descriptor(capability, caller.project_id);
    if (!definition?.action || !definition.action_provider) return;
    admitPluginCall(caller, definition.capability_id, definition.action);
    const availability = this.capabilities.availability(caller, definition);
    if (!availability.available) return;
    const state = await this.resolve(caller, { ...definition, operation: definition.operation, action: definition.action, provider: definition.action_provider, availability });
    if (!state.available) throw new ActionError(state.code, state.reason);
  }
}

/** The identity a dependency names: the first row with it in the caller's directory answers it (as `actionDirectoryLookup`). */
const actionKey = (reference: ActionReference) => `${reference.capability_id}@${reference.version}`;

/** Share reference lookups only while projecting one caller's views, including the narrower dependency read for inspection. */
function dependencyDirectory(service: ActionService, caller: ActionCallContext, snapshot?: readonly ActionView[],
  projected?: () => ReadonlyMap<string, ActionView> | undefined): DiscoveryPass {
  let actions = snapshot, first: ReturnType<typeof actionDirectoryLookup> | undefined;
  let scenes: ActionSceneView[] | undefined, choices: SubjectOfferChoiceView[] | undefined;
  let bindings: Promise<Map<string, ActionSceneUsage[]>> | undefined;
  const sceneMatches = new Map<string, ActionSceneView | undefined>();
  const directory = () => actions ??= service.discover(caller);
  return {
    actions: () => first ??= ((index = projected?.()) => index ? (reference: ActionReference) => index.get(actionKey(reference)) : actionDirectoryLookup(directory()))(),
    scene: reference => {
      const key = sceneKey(reference.scene_id, reference.version);
      if (!sceneMatches.has(key)) {
        sceneMatches.set(key, (scenes ??= service.discoverScenes(caller))
          .find(row => row.definition.scene_id === reference.scene_id && row.definition.version === reference.version));
      }
      return sceneMatches.get(key);
    },
    bindings: async reference => (await (bindings ??= service.usages(caller).then(enabledBindings)))
      .get(sceneKey(reference.scene_id, reference.version)) ?? [],
    choices: () => choices ??= subjectOfferChoices(directory()),
  };
}

function sceneKey(id: string, version: number): string { return `${id}@${version}`; }

function enabledBindings(usages: readonly ActionSceneUsage[]): Map<string, ActionSceneUsage[]> {
  const groups = new Map<string, ActionSceneUsage[]>();
  for (const binding of usages) {
    if (!binding.enabled) continue;
    const key = sceneKey(binding.scene_id, binding.scene_version);
    const group = groups.get(key);
    if (group) group.push(binding);
    else groups.set(key, [binding]);
  }
  return groups;
}
