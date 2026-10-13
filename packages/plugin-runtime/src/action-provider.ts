import { ActionError, type ActionAvailability, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginContribution, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { runInPluginAction } from "./action-scope.js";

/**
 * What a running Plugin offers the action service: the actions and scenes its Manifest declares, each available only while
 * the install runs and holds the grants that action needs. `state` reads the install as it is at the moment of each call.
 * `providerId` is the id the registration carries: the installation id unless the Host says otherwise (a plugin that ships
 * with the Host registers under its plugin_id); `plugin_install_id` always names the installation whose grants it reads.
 */
export function pluginActionProvider(manifest: PluginManifest, contribution: PluginContribution, installId: string, providerId: string, projectId: string | undefined,
  state: { record(): PluginInstanceRecord | null; live(): boolean }): ActionProviderRegistration {
  const grantAvailability = (permissions: readonly string[], own?: (context: ActionCallContext) => ActionAvailability) =>
    (context: ActionCallContext): ActionAvailability => {
      const grants = state.record()?.grants ?? [];
      if (permissions.some(p => !grants.includes(p))) return { available: false, code: "actions.plugin_permission", reason: "插件缺少能力所需授权" };
      return own?.(context) ?? { available: true };
    };
  return {
    provider: { provider_id: providerId, plugin_install_id: installId, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin",
      ...(projectId ? { project_id: projectId } : {}) },
    definitions: manifest.actions ?? [], handlers: (contribution.actions ?? []).map(h => {
      const definition = manifest.actions!.find(d => d.capability_id === h.capability_id && d.version === h.version)!;
      // The Plugin's services ask which action is running; the Host answers, the Plugin does not say.
      return { ...h, handle: (context, input) => runInPluginAction({ install_id: installId, definition, caller: context }, () => h.handle(context, input)),
        availability: grantAvailability(definition.action.permissions, h.availability) };
    }),
    scenes: manifest.action_scenes ?? [], scene_handlers: (contribution.action_scenes ?? []).map(h => {
      const declaration = manifest.action_scenes!.find(d => d.scene_id === h.scene_id && d.version === h.version)!;
      const configuration = grantAvailability(declaration.configuration_permissions ?? []);
      return { ...h, availability: grantAvailability(declaration.permissions, h.availability),
        configuration_availability: grantAvailability(declaration.configuration_permissions ?? [], h.configuration_availability),
        ...(h.targets ? { targets: async (caller: ActionCallContext) => {
          const targets = await h.targets!(caller);
          const state = configuration(caller);
          return targets.map(target => {
            const activation = grantAvailability(target.activation_permissions ?? [])(caller);
            return { ...target, ...(!state.available ? { availability: state } : {}),
              ...(!activation.available ? { activation_availability: activation } : {}) };
          });
        } } : {}),
        bind: (caller, binding, options) => {
          const state = grantAvailability(options?.required_permissions ?? declaration.configuration_permissions ?? [])(caller);
          if (!state.available) throw new ActionError(state.code, state.reason);
          return h.bind(caller, binding, options);
        },
      };
    }),
    availability: () => {
      const current = state.record();
      if (!current || current.state !== "running" || !state.live()) {
        return { available: false, code: "actions.plugin_unavailable", reason: "插件未运行或已停用" };
      }
      if (manifest.permissions.some(p => p.required && !current.grants.includes(p.permission))) {
        return { available: false, code: "actions.plugin_permission", reason: "插件所需授权已撤销" };
      }
      return { available: true };
    },
  };
}
