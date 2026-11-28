import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionSelection, ActionService, CapabilityRegistry, RetainedActionDirectory } from "@molis-ai/molis-work-kernel";
import { actionDirectoryLookup, judgmentRecommendationKeys, sampleRetainedActionDirectory, subjectOfferChoices, type SubjectOfferChoiceView } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionExecutionContext, type ActionReference, type ActionSceneUsage, type ActionSceneView, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentReadCheckGeneration } from "@molis-ai/molis-work-plugin-runtime";
import { admitPluginCall } from "./plugin-callers.js";
import type { ActionAvailabilityPolicy, DiscoveryPass, LocalHostOptions } from "./local-host-types.js";

interface VerifiedActionNode {
  readonly descriptor: HostCapabilityDescriptor;
  readonly token: unknown;
  readonly view: ActionView;
}

interface VerifiedSceneNode {
  readonly reference: { readonly scene_id: string; readonly version: number };
  readonly bindingId: string;
  readonly revision: string | undefined;
  readonly fn: ExactActionReference;
}

interface VerifiedCheckCollector {
  untrackable?: boolean;
  readonly actions: Map<HostCapabilityDescriptor, VerifiedActionNode>;
  readonly scenes: VerifiedSceneNode[];
}

interface VerifiedCheckPlan {
  readonly directoryGen: number;
  readonly readCheckGen: number;
  readonly actions: readonly VerifiedActionNode[];
  readonly scenes: readonly VerifiedSceneNode[];
}

/**
 * Whether an action can be called by this caller now: the registry's own answer, the Host's policy, and what the action needs
 * (the actions it requires, the consumption scene and the judgment rules bound to it), followed through cycles.
 */
export class HostAvailability {
  private readonly verifiedChecks = new WeakMap<ActionCallContext, Map<string, VerifiedCheckPlan>>();

  constructor(
    private readonly actionService: ActionService,
    private readonly capabilities: CapabilityRegistry<ActionCallContext>,
    private readonly options: Pick<LocalHostOptions<unknown>, "actionAvailability" | "sceneAvailability" | "assertProjectAvailable">,
  ) {}

  async discover(caller: ActionCallContext, select?: ActionSelection): Promise<ActionView[]> {
    const views = this.actionService.discover(caller, undefined, select);
    return this.views(caller, views, select ? undefined : views);
  }

  async discoverOne(caller: ActionCallContext, reference: ActionReference): Promise<ActionView | undefined> {
    const view = this.actionService.discoverOne(caller, reference);
    if (!view || (reference.provider_id && view.provider.provider_id !== reference.provider_id)) return undefined;
    const [resolved] = await this.views(caller, [view]);
    return resolved;
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

  async resolve(
    caller: ActionCallContext,
    view: ActionView,
    ancestors: ReadonlySet<string> = new Set(),
    policy: ActionAvailabilityPolicy | undefined = this.options.actionAvailability,
    pass?: DiscoveryPass,
    collector?: VerifiedCheckCollector,
  ): Promise<ActionAvailability> {
    if (!view.availability.available) return view.availability;
    const key = JSON.stringify([view.capability_id, view.version, view.provider.provider_id]);
    if (ancestors.has(key)) return { available: false, code: "actions.dependency_cycle", reason: "能力或用途存在循环依赖，请修正配置" };
    const path = new Set(ancestors).add(key);
    const state = await policy?.(caller, view) ?? view.availability;
    if (!state.available) return state;
    if (collector) {
      const descriptor = this.capabilities.descriptor(
        { capability_id: view.capability_id, version: view.version },
        caller.project_id,
      );
      const token = descriptor && descriptor.action_provider?.provider_id === view.provider.provider_id
        ? this.capabilities.registrationToken(descriptor)
        : undefined;
      if (!descriptor || !token) collector.untrackable = true;
      else if (!collector.actions.has(descriptor)) collector.actions.set(descriptor, { descriptor, token, view });
    }
    if (!view.action.required_actions?.length && !view.action.required_roles?.length && !view.action.required_scene) return state;
    const dependencies = pass ?? dependencyDirectory(this.actionService, caller);
    const firstAction = dependencies.actions();
    for (const reference of view.action.required_actions ?? []) {
      const dependency = firstAction(reference);
      if (!dependency) return { available: false, code: "actions.dependency_missing", reason: "所需能力不存在或不可访问" };
      if (reference.provider_id && dependency.provider.provider_id !== reference.provider_id) {
        return { available: false, code: "actions.provider_changed", reason: "所需能力的提供方已变化，原引用不能自动替换" };
      }
      const dependencyState = await this.resolve(caller, dependency, path, policy, dependencies, collector);
      if (!dependencyState.available) return dependencyState;
    }
    if (view.action.required_roles?.length) {
      const roles = view.action.required_roles;
      const byProvider = new Map<string, Map<number, ActionView>>();
      for (const candidate of dependencies.all()) {
        roles.forEach((role, index) => {
          if (candidate.action.input_type === role.input_type && candidate.action.output_type === role.output_type) {
            const group = byProvider.get(candidate.provider.provider_id) ?? new Map();
            if (!group.has(index)) group.set(index, candidate);
            byProvider.set(candidate.provider.provider_id, group);
          }
        });
      }
      let firstFailure: ActionAvailability | null = null;
      let satisfied = false;
      for (const group of byProvider.values()) {
        if (group.size < roles.length) continue;
        let providerFailure: ActionAvailability | null = null;
        const roleCollector = collector ? { actions: new Map<HostCapabilityDescriptor, VerifiedActionNode>(), scenes: [] as VerifiedSceneNode[] } : undefined;
        for (const dep of group.values()) {
          const depState = await this.resolve(caller, dep, path, policy, dependencies, roleCollector);
          if (!depState.available) { providerFailure = depState; break; }
        }
        if (!providerFailure) {
          if (collector && roleCollector) mergeCollector(collector, roleCollector);
          satisfied = true;
          break;
        }
        firstFailure ??= providerFailure;
      }
      if (!satisfied) return firstFailure ?? { available: false, code: "actions.dependency_missing", reason: "所需能力协议不存在或不可访问" };
    }
    if (!view.action.required_scene) return state;
    const required = view.action.required_scene;
    const scene = dependencies.scene(required);
    if (!scene) return { available: false, code: "actions.scene_missing", reason: "所选用途不存在或不可访问" };
    const sceneState = scene.availability.available ? await this.options.sceneAvailability?.(caller, scene) ?? scene.availability : scene.availability;
    if (!sceneState.available) return sceneState;
    const bindings = await dependencies.bindings(required);
    if (!bindings.length) return { available: false, code: "actions.binding_required", reason: "请先为此场景选择并启用判断规则" };
    const bindingCollectors = collector
      ? bindings.map(() => ({ actions: new Map<HostCapabilityDescriptor, VerifiedActionNode>(), scenes: [] as VerifiedSceneNode[] }))
      : undefined;
    const states = await Promise.all(bindings.map(async (binding, index) => {
      const subCollector = bindingCollectors?.[index];
      if (!binding.availability.available) return binding.availability;
      const fn = firstAction(binding.function);
      if (!fn) return { available: false as const, code: "actions.binding_invalid", reason: "已绑定的判断能力不可访问" };
      const fnState = await this.resolve(caller, fn, path, policy, dependencies, subCollector);
      if (!fnState.available) return fnState;
      if (scene.definition.recommendation_source === "subject-offers") {
        const keys = judgmentRecommendationKeys(fn) ?? [];
        const choices = dependencies.choices().filter(choice => keys.includes(choice.key));
        for (const choice of choices) for (const reference of [choice.source, choice.action]) {
          // This caller's directory has at most one row for this id/version. The offer still pins its exact provider.
          const dependency = firstAction(reference);
          if (!dependency || dependency.provider.provider_id !== reference.provider_id) return { available: false as const, code: "actions.binding_invalid", reason: "推荐动作已不可访问" };
          const available = await this.resolve(caller, dependency, path, policy, dependencies, subCollector);
          if (!available.available) return available;
        }
      }
      subCollector?.scenes.push({
        reference: { scene_id: required.scene_id, version: required.version },
        bindingId: binding.binding_id,
        revision: binding.revision,
        fn: { capability_id: fn.capability_id, version: fn.version, provider_id: fn.provider.provider_id },
      });
      return fnState;
    }));
    const winningIndex = states.findIndex(item => item.available);
    if (winningIndex >= 0) {
      if (collector && bindingCollectors?.[winningIndex]) mergeCollector(collector, bindingCollectors[winningIndex]!);
      return states[winningIndex]!;
    }
    return states[0]!;
  }

  /** Throws the reason when the Host's policy, or what the action needs, says the call cannot go ahead now. */
  async check(caller: ActionCallContext, capability: Pick<HostCapabilityDescriptor, "capability_id" | "version">): Promise<void> {
    if (caller.project_id) this.options.assertProjectAvailable?.(caller.project_id);
    const definition = this.capabilities.descriptor(capability, caller.project_id);
    if (!definition?.action || !definition.action_provider) return;
    admitPluginCall(caller, definition.capability_id, definition.action);
    const availability = this.capabilities.availability(caller, definition);
    if (!availability.available) {
      // Off in this project is the Host's own answer about the project, given before authority as the project's list gives it below
      // (BL-088): a per-partition plugin's stand-in in a project that does not enable it says so itself. Any other refusal is the
      // dispatcher's, after authority.
      if (availability.code === "actions.plugin_disabled") throw new ActionError(availability.code, availability.reason);
      return;
    }
    const cacheKey = actionKey(definition);
    const callerPlans = this.verifiedChecks.get(caller);
    const existing = callerPlans?.get(cacheKey);
    if (existing && await this.verifyPlan(caller, definition, existing)) return;
    callerPlans?.delete(cacheKey);

    const directoryGen = this.actionService.directoryGeneration();
    const readCheckGen = currentReadCheckGeneration();
    const collector: VerifiedCheckCollector | undefined = caller.stage_scene_metadata
      ? undefined
      : { actions: new Map(), scenes: [] };
    const state = await this.resolve(
      caller,
      { ...definition, operation: definition.operation, action: definition.action, provider: definition.action_provider, availability },
      new Set(),
      this.options.actionAvailability,
      undefined,
      collector,
    );
    if (!state.available) throw new ActionError(state.code, state.reason);
    if (collector && !collector.untrackable
      && directoryGen === this.actionService.directoryGeneration()
      && readCheckGen === currentReadCheckGeneration()) {
      let map = this.verifiedChecks.get(caller);
      if (!map) {
        map = new Map();
        this.verifiedChecks.set(caller, map);
      }
      map.set(cacheKey, {
        directoryGen,
        readCheckGen,
        actions: [...collector.actions.values()],
        scenes: collector.scenes,
      });
    }
  }

  private async verifyPlan(caller: ActionCallContext, rootDefinition: HostCapabilityDescriptor, plan: VerifiedCheckPlan): Promise<boolean> {
    if (plan.directoryGen !== this.actionService.directoryGeneration()
      || plan.readCheckGen !== currentReadCheckGeneration()) return false;
    const root = plan.actions[0];
    if (!root || root.descriptor !== rootDefinition || this.capabilities.registrationToken(rootDefinition) !== root.token) return false;
    const rootPolicy = await this.options.actionAvailability?.(caller, root.view);
    if (rootPolicy && !rootPolicy.available) return false;
    for (let i = 1; i < plan.actions.length; i++) {
      const node = plan.actions[i]!;
      if (this.capabilities.descriptor(node.descriptor, caller.project_id) !== node.descriptor
        || this.capabilities.registrationToken(node.descriptor) !== node.token) return false;
      if (!this.capabilities.availability(caller, node.descriptor).available) return false;
      const policyState = await this.options.actionAvailability?.(caller, node.view);
      if (policyState && !policyState.available) return false;
    }
    for (const sceneNode of plan.scenes) {
      const sceneView = this.actionService.sceneViewOne(caller, sceneNode.reference);
      if (!sceneView?.availability.available) return false;
      const sceneState = await this.options.sceneAvailability?.(caller, sceneView) ?? sceneView.availability;
      if (!sceneState.available) return false;
      if (!await this.actionService.sceneBindingMatches(caller, sceneNode.reference, sceneNode.bindingId, sceneNode.revision, sceneNode.fn)) {
        return false;
      }
    }
    return plan.directoryGen === this.actionService.directoryGeneration()
      && plan.readCheckGen === currentReadCheckGeneration();
  }
}

function mergeCollector(target: VerifiedCheckCollector, source: VerifiedCheckCollector): void {
  if (source.untrackable) target.untrackable = true;
  for (const [descriptor, node] of source.actions) {
    if (!target.actions.has(descriptor)) target.actions.set(descriptor, node);
  }
  target.scenes.push(...source.scenes);
}

/** The identity a dependency names: the first row with it in the caller's directory answers it (as `actionDirectoryLookup`). */
const actionKey = (reference: ActionReference) => `${reference.capability_id}@${reference.version}`;

/** Share reference lookups only while projecting one caller's views, including the narrower dependency read for inspection. */
function dependencyDirectory(service: ActionService, caller: ActionCallContext, snapshot?: readonly ActionView[],
  projected?: () => ReadonlyMap<string, ActionView> | undefined): DiscoveryPass {
  let actions = snapshot, first: ReturnType<typeof actionDirectoryLookup> | undefined;
  let choices: SubjectOfferChoiceView[] | undefined;
  const actionMatches = new Map<string, ActionView | undefined>();
  const bindings = new Map<string, Promise<ActionSceneUsage[]>>();
  const sceneMatches = new Map<string, ActionSceneView | undefined>();
  const directory = () => actions ??= service.discover(caller);
  return {
    actions: () => first ??= ((index = projected?.()) => index ? (reference: ActionReference) => index.get(actionKey(reference))
      : snapshot ? actionDirectoryLookup(snapshot) : (reference: ActionReference) => {
        const key = actionKey(reference);
        if (!actionMatches.has(key)) actionMatches.set(key, service.discoverOne(caller, reference));
        return actionMatches.get(key);
      })(),
    all: () => directory(),
    scene: reference => {
      const key = sceneKey(reference.scene_id, reference.version);
      if (!sceneMatches.has(key)) {
        sceneMatches.set(key, service.discoverScenes(caller, undefined, reference)[0]);
      }
      return sceneMatches.get(key);
    },
    bindings: reference => {
      const key = sceneKey(reference.scene_id, reference.version);
      let rows = bindings.get(key);
      if (!rows) { rows = service.usages(caller, undefined, reference).then(usages => usages.filter(binding => binding.enabled)); bindings.set(key, rows); }
      return rows;
    },
    choices: () => choices ??= subjectOfferChoices(directory()),
  };
}

function sceneKey(id: string, version: number): string { return `${id}@${version}`; }
