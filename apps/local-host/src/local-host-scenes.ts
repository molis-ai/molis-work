import type { HostCapabilityDescriptor, LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { subjectOfferCompatibilityReason, type ActionService } from "@molis-ai/molis-work-kernel";
import { sceneConfigurationActions, ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionReference, type ActionSceneClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostOptions } from "./local-host-types.js";
import { hostAuthorityContext, snapshotCaller } from "./local-host-caller.js";
import { normalizeReference } from "./local-host-project-line.js";
import { verifiedCaller } from "./plugin-callers.js";

/** What the scene client asks of the Host that hands it out. */
export interface SceneHost {
  readonly actionService: ActionService;
  readonly options: Pick<LocalHostOptions<unknown>, "sceneAvailability">;
  assertRunning(): void;
  /** The Host runs, the project (when there is one) is not closing, and neither is the project the running call belongs to. */
  authorityCurrent(project: LocalHostProjectReference | undefined): boolean;
  withRuntime(project: LocalHostProjectReference, operation: () => undefined): Promise<undefined>;
  discoverActions(caller: ActionCallContext): Promise<ActionView[]>;
  checkActionAvailability(caller: ActionCallContext, capability: Pick<HostCapabilityDescriptor, "capability_id" | "version">): Promise<void>;
  /** A scene's work takes its place on the project's line (the Home's, with no project), as part of the call that triggered it. */
  queueScene<Result>(project: LocalHostProjectReference | undefined, id: string, version: number, operation: () => Promise<Result>): Promise<Result>;
  /** The client a scene run makes its calls through: part of that run, so it takes the run's place on the line. */
  stepClient(project: LocalHostProjectReference | undefined): ActionClient;
}

export function createSceneClient(host: SceneHost, reference?: LocalHostProjectReference): ActionSceneClient {
  const project = reference ? normalizeReference(reference) : undefined;
  const prepare = async (caller: ActionCallContext): Promise<ActionCallContext> => {
    host.assertRunning();
    caller.signal?.throwIfAborted();
    if (caller.project_id !== (project?.project_id ?? null)) throw new ActionError("actions.scope_mismatch", "场景上下文与项目不一致");
    const bound = hostAuthorityContext(verifiedCaller(snapshotCaller(caller)), () => host.authorityCurrent(project));
    if (project) await host.withRuntime(project, () => undefined);
    caller.signal?.throwIfAborted();
    return bound;
  };
  const scenes = async (caller: ActionCallContext, judgment?: ActionReference) => {
    const rows = host.actionService.discoverScenes(caller, judgment);
    const directory = judgment && rows.some(scene => scene.compatible && scene.definition.recommendation_source === "subject-offers")
      ? await host.discoverActions(caller) : [];
    const fn = judgment ? directory.find(action => action.capability_id === judgment.capability_id && action.version === judgment.version) : undefined;
    return Promise.all(rows.map(async scene => {
      const reason = scene.compatible && fn && scene.definition.recommendation_source === "subject-offers"
        ? subjectOfferCompatibilityReason(fn, directory) : undefined;
      const policy = await host.options.sceneAvailability?.(caller, scene);
      return { ...scene, ...(reason ? { compatible: false, reason } : {}),
        configuration_availability: scene.configuration_availability.available ? policy ?? scene.configuration_availability : scene.configuration_availability,
        availability: scene.availability.available ? policy ?? scene.availability : scene.availability };
    }));
  };
  const check = async (caller: ActionCallContext, sceneId: string, version: number, judgment?: ActionReference, configuration = false) => {
    const scene = (await scenes(caller, judgment)).find(item => item.definition.scene_id === sceneId && item.definition.version === version);
    if (!scene) throw new ActionError("actions.scene_missing", "场景不存在或不可访问");
    const availability = configuration ? scene.configuration_availability : scene.availability;
    if (!availability.available) throw new ActionError(availability.code, availability.reason);
    if (!scene.compatible) throw new ActionError("actions.scene_incompatible", scene.reason ?? "判断能力与场景不兼容");
  };
  const queue = <Result>(id: string, version: number, operation: () => Promise<Result>) => host.queueScene(project, id, version, operation);
  return {
    discoverScenes: async (caller, judgment) => scenes(await prepare(caller), judgment),
    usages: async (caller, judgment) => {
      const bound = await prepare(caller);
      const [uses, availableScenes, actions] = await Promise.all([host.actionService.usages(bound, judgment), scenes(bound), host.discoverActions(bound)]);
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
      const [targets, availableScenes, actions] = await Promise.all([host.actionService.targets(bound, judgment, selection), scenes(bound, judgment), host.discoverActions(bound)]);
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
        if (binding.enabled) await host.checkActionAvailability(bound, binding.function);
        await host.actionService.bind(bound, binding, options ? { ...options, before_write: async () => {
          await check(bound, binding.scene_id, binding.scene_version, binding.enabled ? binding.function : undefined, Boolean(options && !binding.enabled));
          if (binding.enabled) await host.checkActionAvailability(bound, binding.function);
          await options.before_write?.();
        } } : undefined);
      });
    },
    runScene: async (caller, scene, bindingId, event) => {
      const bound = await prepare(caller);
      return queue(scene.scene_id, scene.version, async () => {
        const binding = (await host.actionService.usages(bound)).find(use => use.binding_id === bindingId && use.scene_id === scene.scene_id && use.scene_version === scene.version);
        await check(bound, scene.scene_id, scene.version, binding?.function);
        const client = host.stepClient(project);
        return host.actionService.runScene(bound, scene, bindingId, event, {
          invoke: (context, fn, input) => client.invoke(context, fn, input),
          beforeConsume: async judgment => {
            await check(bound, scene.scene_id, scene.version, judgment);
            await host.checkActionAvailability(bound, judgment);
          },
        });
      });
    },
  };
}
