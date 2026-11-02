import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition, type ActionProvider, type ActionReference, type ActionView, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkLocalHost } from "./project-host.js";
import { pageLocale } from "./web-locale.js";
import { LOCAL_OWNER_PERMISSIONS, localOwnerPermissionsOver } from "./local-owner-permissions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Host-issued request-local owner fence; never populated from page input. */
export interface LocalWebStageRead {
  readonly manifest: PluginManifest;
  readonly install_id: string;
  readonly installation_generation: string;
  readonly scope: "home" | "project";
  assertCurrent(): void;
}

/** What the Host's own entry adds to the person's call: the file the person handed it (an import), never any authority. */
export type LocalWebEntry = Pick<ActionCallContext, "original_file"> & { readonly user_action?: () => ActionUserAction; readonly stage_read?: LocalWebStageRead };

/** Only the authenticated local-user transport uses this adapter; it is not an Agent/MCP grant resolver. */
export async function localWebActionContext(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[], signal?: AbortSignal, entry: LocalWebEntry = {}, stageAction?: ActionDefinition): Promise<ActionCallContext> {
  signal?.throwIfAborted();
  // What a handler sends back to be shown follows the page the call came from; a call no page made keeps the handler's default.
  const locale = pageLocale();
  const base: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: reference?.project_id ?? null, audience: "user", permissions: builtinPermissions, signal,
    ...(locale ? { locale } : {}), ...(entry.original_file ? { original_file: entry.original_file } : {}) };
  // Inspection activates the actual project providers. Metadata alone never supplies a grant.
  const catalog = await host.inspectActions(base, reference);
  signal?.throwIfAborted();
  const projectRepository = reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db)) : undefined;
  const installed = projectRepository?.list() ?? [];
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
  const ownerReaches = (view: ActionView, ownerCap: readonly string[]) => {
    if (view.provider.plugin_install_id !== undefined) return false;
    const held = localOwnerPermissionsOver(view.provider.provider_id, view.action.permissions);
    return view.action.permissions.every(permission => ownerCap.includes(permission) && held.includes(permission));
  };
  const scopeMatches = (provider: ActionProvider, scope: "home" | "project") =>
    (!provider.project_id || provider.project_id === reference?.project_id) && (scope === "home" || !!reference);
  const accept = (view: ActionView, ownerCap: readonly string[]) => {
    if (!scopeMatches(view.provider, view.action.scope)) return false;
    if (ownerReaches(view, ownerCap)) return true;
    const install = installOf(view.provider);
    return view.provider.kind === "plugin"
      && !!install && install.plugin_id === view.provider.plugin_id
      && view.action.permissions.every(permission => install.grants.includes(permission));
  };
  const accepted = catalog.filter(view => accept(view, builtinPermissions));
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
  const owner = entry.stage_read, ownActions = new Set(owner?.manifest.actions?.map(action => `${action.capability_id}@${action.version}`));
  owner?.assertCurrent();
  const authority = owner ? accepted.filter(view => ownActions.has(`${view.capability_id}@${view.version}`)
    ? view.provider.plugin_id === owner.manifest.plugin_id && view.provider.plugin_install_id === owner.install_id
      && (owner.scope === "home" ? !view.provider.project_id : view.provider.project_id === reference?.project_id)
    : owner.manifest.capabilities.consumes.includes(view.capability_id)) : accepted;
  const permissions = [...new Set([...builtinPermissions, ...accepted.flatMap(view => view.action.permissions), ...scenePermissions])];
  const stage = owner && stageAction && owner.manifest.ui.views?.some(view => view.stage_data?.action === stageAction.capability_id)
    ? authority.find(view => view.capability_id === stageAction.capability_id && view.version === stageAction.version
      && view.provider.plugin_id === owner.manifest.plugin_id && view.provider.plugin_install_id === owner.install_id
      && (owner.scope === "home" ? !view.provider.project_id : view.provider.project_id === reference?.project_id)) : undefined;
  // Only the authenticated stage can inspect the person's wider metadata; execution keeps the original cap and refs.
  const metadata = stage ? catalog.filter(view => accepted.includes(view) || accept(view, LOCAL_OWNER_PERMISSIONS)) : [];
  const assertAuthority = (action?: ActionReference, required: readonly string[] = []) => {
    signal?.throwIfAborted();
    if (!required.every(permission => permissions.includes(permission))) throw new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态");
    if (!action) return;
    const matches = accepted.filter(view => view.capability_id === action.capability_id && view.version === action.version
      && (!action.provider_id || view.provider.provider_id === action.provider_id));
    let original = matches.length === 1 ? matches[0] : undefined;
    let ownerCap = builtinPermissions;
    if (!matches.length && action.provider_id) {
      original = metadata.find(view => view.capability_id === action.capability_id && view.version === action.version && view.provider.provider_id === action.provider_id);
      ownerCap = LOCAL_OWNER_PERMISSIONS;
    }
    if (original && original.provider.plugin_install_id === undefined && accept(original, ownerCap)) return;
    const installId = original?.provider.plugin_install_id;
    const install = !installId || !original ? undefined : inProject(original.provider) ? projectRepository?.get(installId)
      : host.homePlugins?.installations().find(record => record.install_id === installId);
    if (!original || !install || install.state !== "running" || install.plugin_id !== original.provider.plugin_id
      || install.installation_generation !== installOf(original.provider)?.installation_generation
      || !original.action.permissions.every(permission => install.grants.includes(permission))) {
      throw new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态");
    }
  };
  return { ...base, permissions,
    allowed_actions: authority.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
    ...(stage && owner ? { stage_scene_metadata: Object.freeze({ actor_id: base.actor_id, audience: base.audience, project_id: base.project_id,
      entry: Object.freeze({ capability_id: stage.capability_id, version: stage.version, provider_id: stage.provider.provider_id }),
      owner: Object.freeze({ plugin_id: owner.manifest.plugin_id, install_id: owner.install_id, installation_generation: owner.installation_generation, scope: owner.scope }),
      scenes: Object.freeze((owner.manifest.action_scenes ?? []).map(scene => Object.freeze({ scene_id: scene.scene_id, version: scene.version }))),
      actions: Object.freeze(metadata.map(view => Object.freeze({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }))) }) } : {}),
    validate_authority: async action => { assertAuthority(action); },
    assert_authority_current: assertAuthority,
  };
}

/**
 * The person's own action client, for one request. Its calls share one authority snapshot, so a caller must not keep the client
 * across requests (in a cached handler, or a follow-up that runs later): a grant given later would stay out of its snapshot until
 * the process restarts. Someone acting for the person later (the Assistant's scheduled follow-up) binds a new client when it acts.
 */
export function bindLocalWebActions(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[], entry: LocalWebEntry & { readonly signal?: AbortSignal } = {}): BoundActionClient {
  return boundLocalWebClient(host, reference, builtinPermissions, entry, caller => caller);
}

/**
 * The person's client for one action a page reads by itself (a plugin's declared stage data, T-133): the same snapshot as
 * `bindLocalWebActions`, narrowed to that action. Its call carries only the permissions the action declares, of those the person's
 * local authority reaches, and reaches no other action; the installation's grants, its generation and its running state are checked
 * as for any local call (`validate_authority`, and the dispatcher's own checks).
 */
export function bindLocalWebAction(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  definition: ActionDefinition, entry: LocalWebEntry & { readonly signal?: AbortSignal } = {}): BoundActionClient {
  const declared = definition.action.permissions;
  const same = (action: ActionReference) => action.capability_id === definition.capability_id && action.version === definition.version;
  return boundLocalWebClient(host, reference, declared, entry, caller => {
    const owner = entry.stage_read;
    if (!owner) return { ...caller, permissions: caller.permissions.filter(permission => declared.includes(permission)), allowed_actions: (caller.allowed_actions ?? []).filter(same) };
    owner.assertCurrent();
    return { ...caller, read_only_effects: true,
      validate_authority: async target => { owner.assertCurrent(); await caller.validate_authority?.(target); owner.assertCurrent(); },
      assert_authority_current: (target, permissions) => { owner.assertCurrent(); caller.assert_authority_current?.(target, permissions); owner.assertCurrent(); } };
  }, definition);
}

function boundLocalWebClient(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined, builtinPermissions: readonly string[],
  entry: LocalWebEntry & { readonly signal?: AbortSignal }, narrow: (caller: ActionCallContext) => ActionCallContext, single?: ActionDefinition): BoundActionClient {
  const client = reference ? host.actionClient(reference) : host.homeActionClient();
  // A bound client serves one request: its calls share one authority snapshot instead of inspecting the whole directory per call.
  // A grant revoked meanwhile is still refused, because every call re-reads its owner (validate_authority) and the dispatcher re-checks availability.
  let context: Promise<ActionCallContext> | undefined;
  // Provenance belongs to this authenticated entry; it grants no permissions and never comes from an action input.
  const asEntry = (caller: ActionCallContext): ActionCallContext => entry.user_action ? { ...caller, actor_kind: "user", user_action: entry.user_action() } : caller;
  const current = () => context ??= localWebActionContext(host, reference, builtinPermissions, entry.signal, entry, single).then(narrow).catch(error => { context = undefined; throw error; });
  const entrance = (caller: ActionCallContext, action: ActionReference) => {
    const matches = (caller.allowed_actions ?? []).filter(ref => ref.capability_id === single?.capability_id && ref.version === single.version);
    return action.capability_id === single?.capability_id && action.version === single.version && matches.length === 1
      && (!action.provider_id || action.provider_id === matches[0]!.provider_id);
  };
  return {
    // What is available can depend on where the act came from (a tree decision needs the page's own provenance), so a discovery carries it too.
    discover: async () => {
      entry.stage_read?.assertCurrent();
      const caller = await current(), views = await client.discover(asEntry(caller));
      entry.stage_read?.assertCurrent();
      return entry.stage_read ? views.filter(view => entrance(caller, { ...view, provider_id: view.provider.provider_id })) : views;
    },
    // A control (whose call this is still counting, say) joins this caller's checks the way every bound client joins it: at the
    // dispatcher's validation, its last synchronous check and each `beforeEffect` of the handler, up to the effect itself.
    invoke: async (definition, input, control, transport) => {
      const caller = await current();
      entry.stage_read?.assertCurrent();
      if (entry.stage_read && !entrance(caller, definition)) throw new ActionError("actions.forbidden", "页面只能调用此次绑定的舞台入口及原提供方");
      const call = asEntry(caller);
      const result = await bindActionClient(client, () => call).invoke(definition, input, control, transport);
      entry.stage_read?.assertCurrent();
      return result;
    },
  };
}
