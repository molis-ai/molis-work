import { randomUUID } from "node:crypto";
import { ActionError, bindActionClient, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginActionClient, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { checkedReference } from "./plugin-action-query.js";
import { pluginActionView } from "./plugin-action-provider.js";
import { projectRouteControl } from "./plugin-actions-client.js";
import { routedPluginCaller } from "./plugin-callers.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { withPluginPermissionChecks } from "@molis-ai/molis-work-plugin-runtime";
import type { installedComponentSubmit } from "./installed-action-registration.js";
import { activeLocale } from "./web-locale.js";

export type PageActionRequest = ({
  reference: ActionReference;
  input: unknown;
  mode?: "availability";
} | {
  mode: "component_submit";
  component_id: string;
  payload: unknown;
}) & {
  project_id: string | null;
  signal: AbortSignal;
  assertCurrent(): void;
  beforeEffect(): Promise<void>;
  beforeBackgroundEffect(): Promise<void>;
};

type PageActionOptions = {
  client: ActionClient;
  actions: PluginActionClient | undefined;
  caller: HostPluginCaller;
  provider: string;
  submit?: ReturnType<typeof installedComponentSubmit>;
};

function submitComponent(request: Extract<PageActionRequest, { mode: "component_submit" }>, context: PluginStartContext, options: PageActionOptions) {
  const submit = options.submit;
  if (!submit) throw new ActionError("actions.forbidden", "此页面没有已安装的组件提交入口");
  return withPluginPermissionChecks(context, async () => {
    await request.beforeEffect();
    const { reference, operationId, input, ownPermissions, permissions, assertCurrent } = submit(request.component_id, request.payload);
    const check = (_reference?: ActionReference, needed: readonly string[] = []) => {
      request.assertCurrent();
      for (const permission of ownPermissions) context.requireGrant(permission);
      assertCurrent();
      if (!needed.every(permission => permissions.includes(permission))) throw new ActionError("actions.provider_changed", "原组件动作的权限已变化");
    };
    check();
    // The installation's own grants and exact capability approvals have both been proved. Only this action can use its exposure policy.
    const caller: ActionCallContext = { actor_id: options.caller.actor_id, project_id: request.project_id,
      audience: "user", permissions, allowed_actions: [reference], signal: request.signal, locale: activeLocale() ?? undefined, assert_authority_current: check };
    const view = await pluginActionView(options.client, caller, reference);
    const scope = options.caller.project_id;
    if (view.provider.kind !== "plugin" || view.provider.plugin_id !== context.plugin_id || view.provider.plugin_install_id !== context.install_id
      || (view.provider.project_id ?? null) !== scope || view.action.scope !== (scope === null ? "home" : "project") || view.action.local_id !== operationId)
      throw new ActionError("actions.provider_changed", "这项提交不属于原页面的安装");
    if (!view.availability.available)
      throw new ActionError(view.availability.code ?? "actions.unavailable", view.availability.reason ?? "组件提交当前不可用", { kind: view.availability.kind });
    check(reference, view.action.permissions);
    // The Kernel checks the current registration after its async policy checks and carries this exact page into sandbox effects.
    return bindActionClient(options.client, () => caller).invoke({ ...reference, operation: view.operation, action: view.action }, input,
      { beforeEffect: request.beforeEffect, assert_authority_current: request.assertCurrent });
  });
}

/** Resolve public metadata under the installation's grants, then use its existing Runtime action client. */
export function pluginPageActions(manifest: PluginManifest, context: PluginStartContext, options: PageActionOptions) {
  return async (request: PageActionRequest): Promise<unknown> => {
    if (request.mode === "component_submit") return submitComponent(request, context, options);
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
      audience: own ? "user" : "plugin", signal: request.signal, locale: activeLocale() ?? undefined,
      ...(!own ? { host_plugin: routedPluginCaller(options.caller, request.project_id), plugin_install_id: context.install_id } : {}),
      ...(own ? { allowed_actions: [{ ...reference, provider_id: options.provider }, ...(own.action.required_actions ?? [])] }
        : { allowed_capability_ids: manifest.capabilities.consumes }),
      validate_authority: async () => { await request.beforeEffect(); check(); }, assert_authority_current: check };
    await request.beforeEffect();
    const view = await pluginActionView(options.client, caller, { ...reference, ...(own ? { provider_id: options.provider } : {}) });
    await request.beforeEffect();
    check(undefined, view.action.permissions);
    if (request.mode === "availability") return view.availability;
    const route = projectRouteControl(pluginRouteControl(request.signal, options.caller.assertActive, request.assertCurrent),
      request.project_id, options.client, request.beforeBackgroundEffect, undefined, { id: randomUUID() });
    try {
      const result = await options.actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
        operation: view.operation, action: view.action }, request.input, route.control);
      await request.beforeEffect(); return result;
    } finally { route.end(); }
  };
}
