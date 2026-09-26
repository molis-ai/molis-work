import { ActionError, retainActionAuthority, sceneConfigurationActions, type ActionProviderRegistration, type ActionSceneClient,
  type SceneConfigurationInput, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

/** These adapters share the original provider registration and the Host's scene execution path. */
export function withSceneConfigurationActions(registration: ActionProviderRegistration, scenes: ActionSceneClient): ActionProviderRegistration {
  const definitions = [...registration.definitions], handlers = [...registration.handlers];
  for (const scene of registration.scenes ?? []) {
    const owner = registration.scene_handlers?.find(handler => handler.scene_id === scene.scene_id && handler.version === scene.version);
    if (!owner?.targets || !scene.configuration_permissions) continue;
    const actions = sceneConfigurationActions(scene);
    const reference = { scene_id: scene.scene_id, scene_version: scene.version, provider_id: registration.provider.provider_id };
    definitions.push(...Object.values(actions));
    handlers.push({ ...actions.targets, availability: owner.configuration_availability, handle: async (caller, input) => {
      const targets = await scenes.targets(caller, (input as { judgment?: ActionReference }).judgment, reference);
      await caller.validate_authority?.({ ...actions.targets, provider_id: reference.provider_id });
      return { targets };
    } });
    for (const [definition, enabled] of [[actions.enable, true], [actions.disable, false]] as const) {
      handlers.push({ ...definition, availability: caller => {
        const configuration = owner.configuration_availability?.(caller) ?? { available: true };
        return configuration.available && enabled ? owner.availability?.(caller) ?? configuration : configuration;
      }, handle: async (caller, input) => {
        const args = input as SceneConfigurationInput;
        const origin = { ...definition, provider_id: reference.provider_id };
        const nested = retainActionAuthority(caller, origin);
        const target = (await scenes.targets(nested, undefined, reference)).find(row => row.binding_id === args.binding_id);
        if (!target) throw new ActionError("actions.binding_missing", "原配置位置已不存在或不可访问");
        await scenes.bind(nested, { ...reference, binding_id: args.binding_id, project_id: target.project_id, function: args.judgment,
          title: target.title, href: target.href, enabled }, { provider_id: reference.provider_id, expected_revision: args.expected_revision,
          before_write: () => caller.validate_authority?.(origin) });
        return { ok: true };
      } });
    }
  }
  return { ...registration, definitions, handlers };
}
