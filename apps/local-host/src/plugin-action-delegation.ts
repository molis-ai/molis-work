import { ActionError, requireSynchronous, withControlChecks, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory, PluginExecutionControl, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { currentPluginAction, inPluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActionProvider, pluginActionView } from "./plugin-action-provider.js";
import { checkedReference } from "./plugin-action-query.js";

/** The Manifest permission that gives a plugin `services.actions.directory`. Declared and granted like any other; never implied by who published the plugin. */
export const ACTIONS_DELEGATE_PERMISSION = "actions:delegate";

export const declaresActionDelegation = (manifest: PluginManifest): boolean => manifest.permissions.some(item => item.permission === ACTIONS_DELEGATE_PERMISSION);

/**
 * `services.actions.directory` (S-43): the Host's action directory, reached from inside this plugin's own running action as the action's
 * original caller under the workflow audience, with that caller's permissions as they are (user decision 2026-10-20: not narrowed to the
 * plugin's own grants). The kernel then applies the target's audience, permissions, availability and input schema as it does for a workflow.
 * What this adds on top: the installation's `actions:delegate` grant on every call and again after every await, a caller that is not a plugin
 * (a plugin's own-grant call must not be widened to the workflow audience), the action's own cancellation and lifetime, and the plugin's
 * `plugin_id` in `delegated_by` so the call log shows both parties. Nothing here works outside a running action.
 */
export function pluginActionDirectory(context: PluginStartContext, manifest: PluginManifest,
  options: { client: ActionClient; project_id?: string; assertActive(): void }): PluginActionDirectory {
  const grant = () => { options.assertActive(); context.requireGrant(ACTIONS_DELEGATE_PERMISSION); };
  /** The running action of this installation whose caller the call is made for; the grant first, so a revoked grant is said as one. */
  const originOf = (): ActionExecutionContext => {
    grant();
    const scope = currentPluginAction();
    if (!scope || !inPluginInstance(scope, context) || !scope.caller.retainAuthority) throw new ActionError("actions.forbidden", "动作目录只能由本插件正在执行的动作使用");
    if (options.project_id !== undefined && scope.caller.project_id !== options.project_id) throw new ActionError("actions.scope_mismatch", "调用所在的项目与插件实例不一致");
    if (scope.caller.audience === "plugin") throw new ActionError("actions.forbidden", "插件自己的授权发起的调用不能放宽成工作流受众");
    return scope.caller;
  };
  const delegate = (original: ActionExecutionContext, control?: PluginExecutionControl) => {
    // The original's identity and authority stay; what only a plugin calling carries (its installation and Host caller) and what only the
    // original dispatch owns (its own effect fence and retained authority) do not travel to the nested caller.
    const { plugin_install_id, host_plugin, beforeEffect, retainAuthority, retainBackgroundAuthority, ...inherited } = original;
    const source = () => { grant(); requireSynchronous(original.assert_authority_current?.()); };
    const check = async () => { source(); await original.beforeEffect(); source(); };
    const signal = control?.signal && inherited.signal ? AbortSignal.any([inherited.signal, control.signal]) : control?.signal ?? inherited.signal;
    // The grant and the original's own fence go first, then the plugin's control, then the original's checks of the target: joined
    // by the same `withControlChecks` every client that forwards a control uses.
    const fence = { beforeEffect: async () => { await check(); await control?.beforeEffect(); },
      assert_authority_current: () => { source(); requireSynchronous(control?.assert_authority_current?.()); } };
    const own: ActionCallContext = { ...inherited, validate_authority: async target => { await original.validate_authority?.(target); source(); },
      assert_authority_current: original.assert_authority_current };
    const caller: ActionCallContext = { ...inherited, audience: "workflow", delegated_by: manifest.plugin_id, delegated_audience: original.audience,
      ...(signal ? { signal } : {}), ...(control?.query_only ? { query_only: true as const } : {}), ...withControlChecks(own, fence),
      validate_permissions: async permissions => { source(); await original.validate_permissions?.(permissions); source(); } };
    return { caller, check, source };
  };
  return {
    discover: async () => {
      const { caller, source } = delegate(originOf());
      source();
      const views = await options.client.discover(caller);
      source();
      return views;
    },
    invoke: async <Output>(reference: ActionReference, input: unknown, control?: PluginExecutionControl) => {
      const ref = checkedReference(reference), original = originOf(), { caller, check, source } = delegate(original, control);
      await check();
      const pinned = { ...ref, provider_id: await pluginActionProvider(options.client, caller, ref) };
      await check();
      // The guard admits the target as workflow sees it, the audience it is called under: not narrowed to the original caller's own audience
      // (user decision 2026-10-20), while a target reloaded or made unavailable during the call still keeps its result from the plugin.
      const retained = original.retainAuthority!([pinned], { audience: "workflow" });
      await retained(); source();
      const result = await options.client.invoke(caller, pinned, input);
      await retained(); await check(); retained.assertCurrent(); source();
      return result as Output;
    },
    // The target `invoke` would pin, reached the same way, the original caller's own checks of that target that dispatch asks (a client's
    // withdrawn grant, an action switched off for an assistant), and the input schema check dispatch makes; nothing runs, nothing is logged
    // and no guard is kept, so a plugin can refuse a bad input before it records an attempt.
    check: async (reference: ActionReference, input: unknown) => {
      const ref = checkedReference(reference), original = originOf(), { caller, source } = delegate(original);
      source();
      const view = await pluginActionView(options.client, caller, ref), pinned = { ...ref, provider_id: view.provider.provider_id };
      source();
      await original.validate_authority?.(pinned);
      requireSynchronous(caller.assert_authority_current?.(pinned, view.action.permissions));
      assertActionInput(view.action.input_schema, input);
    },
  };
}
