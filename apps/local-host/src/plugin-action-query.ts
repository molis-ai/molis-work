import { ActionError, requireSynchronous, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginAction } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActionProvider } from "./plugin-action-provider.js";

/** Delegate a query under the active caller, with the source installation's additional restrictions. */
export async function invokePluginQuery<Output>(context: PluginStartContext, manifest: PluginManifest,
  options: { client: ActionClient; project_id?: string; assertActive(): void }, reference: ActionReference, input: unknown): Promise<Output> {
  const ref = { capability_id: reference?.capability_id, version: reference?.version, ...(reference?.provider_id !== undefined ? { provider_id: reference.provider_id } : {}) };
  if (typeof ref.capability_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(ref.capability_id)
    || !Number.isSafeInteger(ref.version) || ref.version < 1
    || ref.provider_id !== undefined && (typeof ref.provider_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(ref.provider_id))) {
    throw new ActionError("actions.reference_invalid", "查询引用需要有效的动作、版本和提供方");
  }
  const scope = currentPluginAction();
  if (!scope || scope.install_id !== context.install_id || !scope.caller.retainAuthority) throw new ActionError("actions.forbidden", "查询委托只能由本插件正在执行的动作发起");
  if (options.project_id !== undefined && scope.caller.project_id !== options.project_id) throw new ActionError("actions.scope_mismatch", "查询所在的项目与插件实例不一致");
  if (!manifest.capabilities.consumes.includes(ref.capability_id)) throw new ActionError("actions.forbidden", "插件没有声明消费这项动作");
  const original = scope.caller, declared = new Set(manifest.permissions.map(item => item.permission));
  // Include permissions of every dispatched child in the final source-grant check, even when that query never calls beforeEffect.
  const used = new Set<string>();
  const source = (permissions: readonly string[] = []) => {
    options.assertActive();
    for (const permission of permissions) used.add(permission);
    for (const permission of used) {
      if (!declared.has(permission)) throw new ActionError("actions.forbidden", "插件没有声明查询所需权限");
      context.requireGrant(permission);
    }
    requireSynchronous(original.assert_authority_current?.());
  };
  const check = async () => { source(); await original.beforeEffect(); source(); };
  const caller: ActionCallContext = { ...original, query_only: true,
    permissions: original.permissions.filter(permission => declared.has(permission) && context.grants.includes(permission)),
    validate_authority: async target => { await check(); await original.validate_authority?.(target); source(); },
    validate_permissions: async permissions => { source(permissions); await original.validate_permissions?.(permissions); source(); },
    assert_authority_current: (target, permissions) => { source(permissions); requireSynchronous(original.assert_authority_current?.(target, permissions)); },
  };
  await check();
  const pinned = { ...ref, provider_id: await pluginActionProvider(options.client, caller, ref) };
  await check();
  const retained = original.retainAuthority!([pinned]);
  await retained(); source();
  const result = await options.client.invoke(caller, pinned, input);
  await retained(); await check(); retained.assertCurrent(); source();
  return result as Output;
}
