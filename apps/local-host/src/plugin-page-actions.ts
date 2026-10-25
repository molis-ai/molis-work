import { ActionError, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginActionClient, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { checkedReference } from "./plugin-action-query.js";
import { pluginActionView } from "./plugin-action-provider.js";
import { projectRouteControl } from "./plugin-actions-client.js";
import { routedPluginCaller } from "./plugin-callers.js";
import { pluginRouteControl } from "./plugin-route-control.js";

export interface PageActionRequest {
  reference: ActionReference;
  input: unknown;
  project_id: string | null;
  signal: AbortSignal;
  assertCurrent(): void;
  beforeEffect(): Promise<void>;
  beforeBackgroundEffect(): Promise<void>;
}

/** Resolve public metadata under the installation's grants, then use its existing Runtime action client. */
export function pluginPageActions(manifest: PluginManifest, context: PluginStartContext, options: {
  client: ActionClient; actions: PluginActionClient | undefined; caller: HostPluginCaller; provider: string;
}) {
  return async (request: PageActionRequest): Promise<unknown> => {
    const reference = checkedReference(request.reference);
    const own = manifest.actions?.find(action => action.capability_id === reference.capability_id && action.version === reference.version);
    if ((!own && !manifest.capabilities.consumes.includes(reference.capability_id)) || own && reference.provider_id && reference.provider_id !== options.provider)
      throw new ActionError("actions.forbidden", "插件没有声明提供或消费这项动作");
    if (!options.actions) throw new ActionError("actions.unavailable", "插件没有动作服务");
    const check = (_reference?: ActionReference, permissions: readonly string[] = []) => {
      request.assertCurrent();
      for (const permission of permissions) context.requireGrant(permission);
    };
    const caller: ActionCallContext = { actor_id: options.caller.actor_id, project_id: request.project_id, permissions: context.grants,
      audience: own ? "user" : "plugin", signal: request.signal,
      ...(!own ? { host_plugin: routedPluginCaller(options.caller, request.project_id), plugin_install_id: context.install_id } : {}),
      ...(own ? { allowed_actions: [{ ...reference, provider_id: options.provider }, ...(own.action.required_actions ?? [])] }
        : { allowed_capability_ids: manifest.capabilities.consumes }),
      validate_authority: async () => { await request.beforeEffect(); check(); }, assert_authority_current: check };
    await request.beforeEffect();
    const view = await pluginActionView(options.client, caller, { ...reference, ...(own ? { provider_id: options.provider } : {}) });
    // The person's page asking for one of the plugin's own actions is the person's call (PG-028).
    const route = projectRouteControl(pluginRouteControl(request.signal, options.caller.assertActive, request.assertCurrent),
      request.project_id, options.client, request.beforeBackgroundEffect, undefined, own !== undefined);
    try {
      const result = await options.actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
        operation: view.operation, action: view.action }, request.input, route.control);
      await request.beforeEffect(); return result;
    } finally { route.end(); }
  };
}
