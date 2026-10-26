import type { ActionAvailability, ActionCallContext, ActionProvider, ActionSceneDefinition, ActionSceneHandlerBinding, ActionSceneView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionValidator } from "./action-schema.js";

export interface RegisteredScene {
  definition: ActionSceneDefinition;
  provider: ActionProvider;
  handler: ActionSceneHandlerBinding;
  availability(context: ActionCallContext): ActionAvailability;
  configurationAvailability(context: ActionCallContext): ActionAvailability;
  validateEvent?: ActionValidator;
  validateInput: ActionValidator;
  validateResult: ActionValidator;
}

export function scopedSceneKey(scene: Pick<ActionSceneDefinition, "scene_id" | "version">, projectId?: string | null): string {
  return JSON.stringify([scene.scene_id, scene.version, projectId ?? null]);
}

/** Execution and composition inspect the same current registration, without another directory. */
export function registeredScene(scenes: ReadonlyMap<string, RegisteredScene>, scene: Pick<ActionSceneDefinition, "scene_id" | "version">, projectId?: string | null): RegisteredScene | undefined {
  return scenes.get(scopedSceneKey(scene, projectId)) ?? scenes.get(scopedSceneKey(scene));
}

export function sceneVisible(scene: RegisteredScene, caller: ActionCallContext): boolean {
  return !!caller.actor_id && (!scene.provider.project_id || scene.provider.project_id === caller.project_id)
    && (scene.definition.permissions.every(permission => caller.permissions.includes(permission))
      || Boolean(scene.handler.targets && scene.definition.configuration_permissions?.every(permission => caller.permissions.includes(permission))));
}

export function sceneViews(scenes: ReadonlyMap<string, RegisteredScene>, caller: ActionCallContext, reasonFor: (scene: RegisteredScene) => string | undefined): ActionSceneView[] {
  return [...scenes.values()].filter(scene => sceneVisible(scene, caller)).map(scene => {
    const reason = reasonFor(scene);
    return { definition: structuredClone(scene.definition), provider: structuredClone(scene.provider),
      configuration_availability: scene.configurationAvailability(caller), availability: scene.availability(caller), compatible: !reason, ...(reason ? { reason } : {}) };
  });
}
