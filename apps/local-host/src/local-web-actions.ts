import { ActionError, type ActionCallContext, type ActionDefinition, type ActionProvider, type ActionReference, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkLocalHost } from "./project-host.js";

/** Only the authenticated local-user transport uses this adapter; it is not an Agent/MCP grant resolver. */
export async function localWebActionContext(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[], signal?: AbortSignal): Promise<ActionCallContext> {
  signal?.throwIfAborted();
  const base: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: reference?.project_id ?? null, audience: "user", permissions: builtinPermissions, signal };
  // Inspection activates the actual project providers. Metadata alone never supplies a grant.
  const catalog = await host.inspectActions(base, reference);
  signal?.throwIfAborted();
  const installed = reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()) : [];
  signal?.throwIfAborted();
  const grants = new Map(installed.filter(row => row.state === "running").map(row => [row.install_id, row]));
  for (const record of host.homePlugins?.installations() ?? []) if (record.state === "running") grants.set(record.install_id, record);
  // The installation a provider's grants come from is the one its registration names, not whatever its provider id looks like:
  // a plugin that ships with the Host registers under its plugin_id, and its Host-assembled providers share that id.
  const installOf = (provider: ActionProvider) => provider.plugin_install_id === undefined ? undefined : grants.get(provider.plugin_install_id);
  const builtin = (permissions: readonly string[]) => permissions.every(permission => builtinPermissions.includes(permission));
  const scopeMatches = (provider: ActionProvider, scope: "home" | "project") =>
    (!provider.project_id || provider.project_id === reference?.project_id) && (scope === "home" || !!reference);
  const accepted = catalog.filter(view => {
    if (!scopeMatches(view.provider, view.action.scope)) return false;
    if (builtin(view.action.permissions)) return true;
    const install = installOf(view.provider);
    return view.provider.kind === "plugin"
      && !!install && install.plugin_id === view.provider.plugin_id
      && view.action.permissions.every(permission => install.grants.includes(permission));
  });
  // Scene-only plugins have no action from which to infer their local-user permissions.
  // Inspect actual registrations using installed grants, then accept only the matching running owner.
  const candidates = [...new Set([...builtinPermissions, ...[...grants.values()].flatMap(row => row.grants)])];
  const scenes = await host.sceneClient(reference).discoverScenes({ ...base, permissions: candidates });
  signal?.throwIfAborted();
  const scenePermissions = scenes.flatMap(view => {
    const install = installOf(view.provider);
    if (!scopeMatches(view.provider, view.definition.scope) || view.provider.kind !== "plugin"
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
      const installId = original?.provider.plugin_install_id;
      const install = installId && original?.provider.project_id && reference
        ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).get(installId))
        : installId ? host.homePlugins?.installations().find(record => record.install_id === installId) : null;
      if (!original || !install || install.state !== "running" || install.plugin_id !== original.provider.plugin_id
        || install.installation_generation !== installOf(original.provider)?.installation_generation
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
