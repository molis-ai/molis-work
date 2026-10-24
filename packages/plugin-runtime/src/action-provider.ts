import { type ActionAvailability, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginContribution, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginActionAvailability } from "./action-availability.js";
import { pluginActionBeforeEffect, runInPluginAction, type PluginInstance } from "./action-scope.js";
import { pluginSceneHandler } from "./scene-provider.js";
import { pluginCallbackContext } from "./callback-context.js";

/**
 * What a running Plugin offers the action service: the actions and scenes its Manifest declares, each available only while
 * the install runs and holds the grants that action needs. `state` reads the install as it is at the moment of each call.
 * `providerId` is the id the registration carries: the installation id unless the Host says otherwise (a plugin that ships
 * with the Host registers under its plugin_id); `plugin_install_id` always names the installation whose grants it reads.
 * `instance` is the activation's record as it started: its calls run as that instance, and only its services serve them.
 */
export function pluginActionProvider(manifest: PluginManifest, contribution: PluginContribution, instance: PluginInstance, providerId: string, projectId: string | undefined,
  state: { record(): PluginInstanceRecord | null; live(): boolean }): ActionProviderRegistration {
  const installId = instance.install_id, { installation_generation } = instance;
  const grantAvailability = (permissions: readonly string[], own?: (context: ActionCallContext) => ActionAvailability) =>
    (context: ActionCallContext): ActionAvailability => {
      const grants = state.record()?.grants ?? [];
      if (permissions.some(p => !grants.includes(p))) return { available: false, code: "actions.plugin_permission", reason: "插件缺少能力所需授权" };
      return own?.(pluginCallbackContext(context)) ?? { available: true };
    };
  return {
    provider: { provider_id: providerId, plugin_install_id: installId, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin",
      ...(projectId ? { project_id: projectId } : {}) },
    definitions: manifest.actions ?? [], handlers: (contribution.actions ?? []).map(h => {
      const definition = manifest.actions!.find(d => d.capability_id === h.capability_id && d.version === h.version)!;
      // The Plugin's services ask which action is running; the Host answers, the Plugin does not say. The call's own `beforeEffect`
      // returning is one way it passes its last authority check (`PluginActionScope.checked`).
      return { ...h, handle: (context, input) => {
        const checked = { passed: false }, view = pluginCallbackContext(context), before = view.beforeEffect;
        return runInPluginAction({ install_id: installId, installation_generation, definition, caller: context, checked },
          () => h.handle(before ? { ...view, beforeEffect: pluginActionBeforeEffect(before, checked) } : view, input));
      }, availability: grantAvailability(definition.action.permissions, h.availability ? caller => pluginActionAvailability(instance, definition, caller, h.availability!) : undefined) };
    }),
    scenes: manifest.action_scenes ?? [], scene_handlers: (contribution.action_scenes ?? []).map(h => {
      const declaration = manifest.action_scenes!.find(d => d.scene_id === h.scene_id && d.version === h.version)!;
      return pluginSceneHandler(declaration, h, instance, grantAvailability);
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
