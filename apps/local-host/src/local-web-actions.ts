import { ActionError, type ActionCallContext, type ActionDefinition, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkLocalHost } from "./project-host.js";

/** Only the authenticated local-user transport uses this adapter; it is not an Agent/MCP grant resolver. */
export async function localWebActionContext(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[]): Promise<ActionCallContext> {
  const base: ActionCallContext = { actor_id: "web-user", project_id: reference?.project_id ?? null, audience: "user", permissions: builtinPermissions };
  // Inspection activates the actual project providers. Metadata alone never supplies a grant.
  const catalog = await host.inspectActions(base, reference);
  const installed = reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()) : [];
  const grants = new Map(installed.filter(row => row.state === "running").map(row => [row.install_id, row]));
  const builtin = (permissions: readonly string[]) => permissions.every(permission => builtinPermissions.includes(permission));
  const accepted = catalog.filter(view => {
    if (builtin(view.action.permissions)) return true;
    const install = grants.get(view.provider.provider_id);
    return !!reference && view.provider.project_id === reference.project_id && view.provider.kind === "plugin"
      && !!install && install.plugin_id === view.provider.plugin_id
      && view.action.permissions.every(permission => install.grants.includes(permission));
  });
  // Scene-only plugins have no action from which to infer their local-user permissions.
  // Inspect actual registrations using installed grants, then accept only the matching running owner.
  const candidates = [...new Set([...builtinPermissions, ...[...grants.values()].flatMap(row => row.grants)])];
  const scenes = reference ? await host.sceneClient(reference).discoverScenes({ ...base, permissions: candidates }) : [];
  const scenePermissions = scenes.flatMap(view => {
    const install = grants.get(view.provider.provider_id);
    if (!reference || view.provider.kind !== "plugin" || view.provider.project_id !== reference.project_id
      || !install || install.plugin_id !== view.provider.plugin_id) return [];
    return [...view.definition.permissions, ...view.definition.configuration_permissions ?? []].filter(permission => install.grants.includes(permission));
  });
  return { ...base, permissions: [...new Set([...builtinPermissions, ...accepted.flatMap(view => view.action.permissions), ...scenePermissions])],
    allowed_actions: accepted.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
    validate_authority: async (action: ActionReference) => {
      const matches = accepted.filter(view => view.capability_id === action.capability_id && view.version === action.version
        && (!action.provider_id || view.provider.provider_id === action.provider_id));
      const original = matches.length === 1 ? matches[0] : undefined;
      if (original && builtin(original.action.permissions)) return;
      // Re-read the original grant owner directly, rather than rediscovering every provider on each nested call.
      // The common dispatcher separately checks current definitions, source lifetime and action availability.
      const install = original && reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).get(original.provider.provider_id)) : null;
      if (!original || !install || install.state !== "running" || install.plugin_id !== original.provider.plugin_id
        || !original.action.permissions.every(permission => install.grants.includes(permission))) {
        throw new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态");
      }
    },
  };
}

export function bindLocalWebActions(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[]): BoundActionClient {
  const client = reference ? host.actionClient(reference) : host.homeActionClient();
  return {
    discover: async () => client.discover(await localWebActionContext(host, reference, builtinPermissions)),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) =>
      await client.invoke(await localWebActionContext(host, reference, builtinPermissions), definition, input) as Output,
  };
}
