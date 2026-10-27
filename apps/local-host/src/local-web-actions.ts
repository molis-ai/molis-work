import { ActionError, bindActionClient, type ActionCallContext, type ActionProvider, type ActionReference, type ActionView, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkLocalHost } from "./project-host.js";
import { pageLocale } from "./web-locale.js";
import { localOwnerPermissionsOver } from "./local-owner-permissions.js";

/** What the Host's own entry adds to the person's call: the file the person handed it (an import), never any authority. */
export type LocalWebEntry = Pick<ActionCallContext, "original_file"> & { readonly user_action?: () => ActionUserAction };

/** Only the authenticated local-user transport uses this adapter; it is not an Agent/MCP grant resolver. */
export async function localWebActionContext(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[], signal?: AbortSignal, entry: LocalWebEntry = {}): Promise<ActionCallContext> {
  signal?.throwIfAborted();
  // What a handler sends back to be shown follows the page the call came from; a call no page made keeps the handler's default.
  const locale = pageLocale();
  const base: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: reference?.project_id ?? null, audience: "user", permissions: builtinPermissions, signal,
    ...(locale ? { locale } : {}), ...(entry.original_file ? { original_file: entry.original_file } : {}) };
  // Inspection activates the actual project providers. Metadata alone never supplies a grant.
  const catalog = await host.inspectActions(base, reference);
  signal?.throwIfAborted();
  const installed = reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()) : [];
  signal?.throwIfAborted();
  // A plugin that runs as the Home's instance and as a project's has one install_id in both databases (a hash of its id and publisher),
  // each record with its own generation and grants. The two tables are never merged: an instance reads the record of its own database.
  const projectRecords = new Map(installed.filter(row => row.state === "running").map(row => [row.install_id, row]));
  const homeRecords = new Map((host.homePlugins?.installations() ?? []).filter(record => record.state === "running").map(record => [record.install_id, record]));
  // The installation a provider's grants come from is the one its registration names, not whatever its provider id looks like:
  // a plugin that ships with the Host registers under its plugin_id, and its Host-assembled providers share that id. A project's
  // Plugin Runtime registers with its project_id, the Home's without, and that decides which database's record is the provider's.
  const inProject = (provider: ActionProvider) => Boolean(provider.project_id);
  const installOf = (provider: ActionProvider) => provider.plugin_install_id === undefined ? undefined
    : (inProject(provider) ? projectRecords : homeRecords).get(provider.plugin_install_id);
  // The person's own permissions reach only what the Host registers itself, and over each such provider only what the person holds
  // over that provider (PG-007): a permission held over Characters is not held over another Host action that asks for it. A
  // provider the Plugin Runtime registered, built in or not, names its installation, and is reached through its grants alone.
  const ownerReaches = (view: ActionView) => {
    if (view.provider.plugin_install_id !== undefined) return false;
    const held = localOwnerPermissionsOver(view.provider.provider_id, view.action.permissions);
    return view.action.permissions.every(permission => builtinPermissions.includes(permission) && held.includes(permission));
  };
  const scopeMatches = (provider: ActionProvider, scope: "home" | "project") =>
    (!provider.project_id || provider.project_id === reference?.project_id) && (scope === "home" || !!reference);
  const accepted = catalog.filter(view => {
    if (!scopeMatches(view.provider, view.action.scope)) return false;
    if (ownerReaches(view)) return true;
    const install = installOf(view.provider);
    return view.provider.kind === "plugin"
      && !!install && install.plugin_id === view.provider.plugin_id
      && view.action.permissions.every(permission => install.grants.includes(permission));
  });
  // Scene-only plugins have no action from which to infer their local-user permissions.
  // Inspect actual registrations using installed grants, then accept only the matching running owner.
  const candidates = [...new Set([...builtinPermissions, ...[...projectRecords.values(), ...homeRecords.values()].flatMap(row => row.grants)])];
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
      if (original && ownerReaches(original)) return;
      // Re-read the original grant owner directly, rather than rediscovering every provider on each nested call.
      // The common dispatcher separately checks current definitions, source lifetime and action availability.
      // The record comes from the database `installOf` reads, by the same test, so its generation is only ever compared with that database's record.
      const installId = original?.provider.plugin_install_id;
      const install = !installId || !original ? null : !inProject(original.provider) ? host.homePlugins?.installations().find(record => record.install_id === installId)
        : reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).get(installId)) : null;
      if (!original || !install || install.state !== "running" || install.plugin_id !== original.provider.plugin_id
        || install.installation_generation !== installOf(original.provider)?.installation_generation
        || !original.action.permissions.every(permission => install.grants.includes(permission))) {
        throw new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态");
      }
    },
  };
}

/**
 * The person's own action client, for one request. Its calls share one authority snapshot, so a caller must not keep the client
 * across requests (in a cached handler, or a follow-up that runs later): a grant given later would stay out of its snapshot until
 * the process restarts. Someone acting for the person later (the Assistant's scheduled follow-up) binds a new client when it acts.
 */
export function bindLocalWebActions(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[], entry: LocalWebEntry & { readonly signal?: AbortSignal } = {}): BoundActionClient {
  const client = reference ? host.actionClient(reference) : host.homeActionClient();
  // A bound client serves one request: its calls share one authority snapshot instead of inspecting the whole directory per call.
  // A grant revoked meanwhile is still refused, because every call re-reads its owner (validate_authority) and the dispatcher re-checks availability.
  let context: Promise<ActionCallContext> | undefined;
  // Provenance belongs to this authenticated entry; it grants no permissions and never comes from an action input.
  const asEntry = (caller: ActionCallContext): ActionCallContext => entry.user_action ? { ...caller, actor_kind: "user", user_action: entry.user_action() } : caller;
  const current = () => context ??= localWebActionContext(host, reference, builtinPermissions, entry.signal, entry).catch(error => { context = undefined; throw error; });
  return {
    // What is available can depend on where the act came from (a tree decision needs the page's own provenance), so a discovery carries it too.
    discover: async () => client.discover(asEntry(await current())),
    // A control (whose call this is still counting, say) joins this caller's checks the way every bound client joins it: at the
    // dispatcher's validation, its last synchronous check and each `beforeEffect` of the handler, up to the effect itself.
    invoke: async (definition, input, control, transport) => {
      const caller = await current();
      const call = asEntry(caller);
      return await bindActionClient(client, () => call).invoke(definition, input, control, transport);
    },
  };
}
