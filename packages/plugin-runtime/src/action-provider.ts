import { type ActionAvailability, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionProviderRegistration, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginContribution, PluginDefinition, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginActionAvailability } from "./action-availability.js";
import { currentPluginInvocation, pluginActionBeforeEffect, reservePluginInvocationPlace, runInPluginAction, type PluginInstance } from "./action-scope.js";
import { pluginSceneHandler } from "./scene-provider.js";
import { pluginCallbackContext, withoutIssuedIdentity } from "./callback-context.js";

/** The permission that lets a Home-level plugin's action be given the projects the person may reach (PG-014); the Manifest declares it, the person grants it. */
export const PROJECT_REACH_PERMISSION = "projects:reach";

/**
 * The Host's answer to "which projects may the person reach through this plugin", asked right before an action that declares `project_reach`
 * runs for the installation (PG-014). It reads the catalog each time. `undefined` means the Host does not give a list to this caller.
 */
export type PluginProjectReach = (manifest: PluginManifest, context: ActionCallContext) => Promise<readonly string[] | undefined>;

/** Host policy for fully redeemed actions; Runtime owns registration withdrawal on every lifecycle path. */
export interface PluginRuntimeActions {
  registry: ActionRegistryPort;
  project_id?: string;
  providerId?(record: PluginInstanceRecord, definition: PluginDefinition): string;
  projectReach?: PluginProjectReach;
  register?(definition: PluginDefinition, contribution: PluginContribution, record: PluginInstanceRecord, registration: ActionProviderRegistration): (() => void) | undefined;
}

/**
 * What a running Plugin offers the action service: the actions and scenes its Manifest declares, each available only while
 * the install runs and holds the grants that action needs. `state` reads the install as it is at the moment of each call.
 * `providerId` is the id the registration carries: the installation id unless the Host says otherwise (a plugin that ships
 * with the Host registers under its plugin_id); `plugin_install_id` always names the installation whose grants it reads.
 * `instance` is the activation's record as it started: its calls run as that instance, and only its services serve them.
 */
export function pluginActionProvider(manifest: PluginManifest, contribution: PluginContribution, instance: PluginInstance, providerId: string, projectId: string | undefined,
  state: { record(): PluginInstanceRecord | null; live(): boolean; bounded: boolean; checkGrant(permission: string): void; capturePermissions(permissions: readonly string[]): void }, projectReach?: PluginProjectReach): ActionProviderRegistration {
  const installId = instance.install_id, { installation_generation } = instance;
  const grantAvailability = (permissions: readonly string[], own?: (context: ActionCallContext) => ActionAvailability) =>
    (context: ActionCallContext): ActionAvailability => {
      try { for (const permission of permissions) state.checkGrant(permission); }
      catch { return { available: false, code: "actions.plugin_permission", reason: "插件缺少能力所需授权" }; }
      return own?.(withoutIssuedIdentity(context)) ?? { available: true };
    };
  return {
    provider: { provider_id: providerId, plugin_install_id: installId, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin",
      ...(projectId ? { project_id: projectId } : {}) },
    definitions: manifest.actions ?? [], handlers: (contribution.actions ?? []).map(h => {
      const definition = manifest.actions!.find(d => d.capability_id === h.capability_id && d.version === h.version)!;
      // The Plugin's services ask which action is running; the Host answers, the Plugin does not say. The call's own `beforeEffect`
      // returning is one way it passes its last authority check (`PluginActionScope.checked`).
      return { ...h, handle: (context, input) => {
        const begun = reservePluginInvocationPlace();
        const checked = { passed: false }, source = entrySource(context, definition, providerId);
        const run = (readable?: readonly string[]) => {
          state.capturePermissions(definition.action.permissions);
          const view = { ...pluginCallbackContext(context), ...(readable ? { readable_project_ids: readable } : {}), ...(context.audience === "plugin" && context.host_plugin ? { calling_plugin_id: context.host_plugin.plugin_id } : {}),
            ...(source?.direct_person_entry ? { direct_person_entry: true as const } : {}) }, before = view.beforeEffect;
          return h.handle(before ? { ...view, beforeEffect: pluginActionBeforeEffect(before, checked) } : view, input);
        };
        // The list is the Host's, read now, for the person only, and only for an action that declares it and an installation that holds the grant (S-74).
        const reaches = projectReach && definition.action.project_reach === "person" && context.audience === "user"
          && state.record()?.grants.includes(PROJECT_REACH_PERMISSION) === true;
        return runInPluginAction({ install_id: installId, installation_generation, activation: instance, definition, caller: context, checked, begun, ...(source ? { source } : {}) }, () => {
          state.capturePermissions(definition.action.permissions);
          return reaches ? projectReach(manifest, context).then(run) : run();
        });
      }, availability: grantAvailability(definition.action.permissions, h.availability ? caller => pluginActionAvailability(instance, definition, caller, h.availability!) : undefined) };
    }),
    scenes: manifest.action_scenes ?? [], scene_handlers: (contribution.action_scenes ?? []).map(h => {
      const declaration = manifest.action_scenes!.find(d => d.scene_id === h.scene_id && d.version === h.version)!;
      return pluginSceneHandler(declaration, h, instance, grantAvailability, state.capturePermissions, state.bounded);
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

/**
 * What this handler runs, from the dispatcher's own record of the call (`current_action`) and only when it names this very registration
 * (BL-803); and whether the call entered here as the person's own: the person's audience, not handed in through another plugin's
 * directory, not a scene's run, and no plugin action, job or scene running around it (asked of the Runtime's scope, never of the call).
 * The person's request a plugin's route forwards to its own action has none around it; a plugin action calling its own other action has.
 */
function entrySource(context: ActionExecutionContext, definition: ActionDefinition, providerId: string) {
  const ran = context.current_action;
  if (!ran || ran.capability_id !== definition.capability_id || ran.version !== definition.version || ran.provider_id !== providerId) return undefined;
  const person = context.audience === "user" && context.delegated_by === undefined && context.scene_binding === undefined && currentPluginInvocation() === undefined;
  return Object.freeze({ capability_id: ran.capability_id, version: ran.version, provider_id: ran.provider_id, ...(person ? { direct_person_entry: true as const } : {}) });
}
