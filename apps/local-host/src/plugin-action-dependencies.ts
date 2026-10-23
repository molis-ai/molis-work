import { AsyncResource } from "node:async_hooks";
import { ActionError, requireSynchronous, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginActionDirectory, PluginExecutionControl, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { checkedReference } from "./plugin-action-query.js";
import { pluginActionView } from "./plugin-action-provider.js";
import { routedPluginCaller } from "./plugin-callers.js";

/** Dynamic discovery never borrows the user's permissions or widens the plugin audience. */
export function pluginActionDependencies(context: PluginStartContext, manifest: PluginManifest,
  options: { client: ActionClient; project_id?: string; assertActive(): void; pluginCaller: HostPluginCaller }): PluginActionDirectory | undefined {
  const permission = "actions:invoke";
  if (!manifest.permissions.some(item => item.permission === permission)) return undefined;
  const invocation = (control?: PluginExecutionControl) => {
    const scope = currentPluginInvocation();
    // A nested target runs under its own installation. The originating plugin's checks still use its own services.
    const check = AsyncResource.bind((_reference?: ActionReference, permissions?: readonly string[]) => {
      options.assertActive(); context.requireGrant(permission);
      if (!scope || "scene" in scope || !inPluginInstance(scope, context) || options.project_id !== undefined && scope.caller.project_id !== options.project_id) {
        throw new ActionError("actions.forbidden", "动态动作只能由当前安装的动作或后台作业调用");
      }
      for (const required of permissions ?? []) context.requireGrant(required);
      assertCapturedPluginActionCurrent(scope, context);
      control?.signal?.throwIfAborted(); requireSynchronous(control?.assert_authority_current?.());
    });
    check();
    const caller: ActionCallContext = { actor_id: options.pluginCaller.actor_id, project_id: scope!.caller.project_id,
      audience: "plugin", permissions: context.grants, plugin_install_id: context.install_id,
      host_plugin: routedPluginCaller(options.pluginCaller, scope!.caller.project_id),
      signal: scope!.caller.signal && control?.signal ? AbortSignal.any([scope!.caller.signal, control.signal]) : control?.signal ?? scope!.caller.signal,
      query_only: pluginInvocationReadOnly(scope) || control?.query_only,
      validate_authority: AsyncResource.bind(async (reference) => { check(reference); await control?.beforeEffect(); check(reference); }),
      validate_permissions: async permissions => { check(undefined, permissions); }, assert_authority_current: check };
    return { caller, check };
  };
  return Object.freeze({
    discover: async () => {
      const { caller, check } = invocation();
      // Reading an installation's callable contracts does not execute them. A query may show a future
      // command in a schedule; invoke below still preserves the original read-only restriction.
      const views = await options.client.discover({ ...caller, query_only: undefined }); check(); return views;
    },
    invoke: async <Output>(reference: ActionReference, input: unknown, control?: PluginExecutionControl) => {
      const { caller, check } = invocation(control), referenceValue = checkedReference(reference);
      const view = await pluginActionView(options.client, caller, referenceValue); check(referenceValue, view.action.permissions);
      const result = await options.client.invoke(caller, { ...referenceValue, provider_id: view.provider.provider_id }, input);
      check(referenceValue, view.action.permissions); return result as Output;
    },
    check: async (reference: ActionReference, input: unknown) => {
      const { caller, check } = invocation(), ref = checkedReference(reference);
      const view = await pluginActionView(options.client, caller, ref); check(ref, view.action.permissions);
      assertActionInput(view.action.input_schema, input);
    },
  });
}
