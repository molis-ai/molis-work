import { inDirectoryPass } from "@molis-ai/molis-work-kernel";
import { captureWebSessionAuthority } from "./web-sessions.js";
import { ActionError, bindActionClient, type ActionClient, type ActionCallContext, type ActionDefinition, type ActionProvider, type ActionReference, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionSceneView, ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkLocalHost } from "./project-host.js";
import { activeLocale, inLanguagePreview } from "./web-locale.js";
import { LOCAL_OWNER_PERMISSIONS, localOwnerPermissionsOver } from "./local-owner-permissions.js";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentProjectPlatform, runningProjectPlatform } from "./project-plugins.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { sameInstalledRelease } from "./installed-stage-identity.js";

type LocalActionMetadata = ReturnType<MolisWorkLocalHost["inspectActionMetadata"]>[number];

/** Host-issued request-local owner fence; never populated from page input. */
export interface LocalWebStageRead {
  readonly manifest: PluginManifest;
  readonly install_id: string;
  readonly installation_generation: string;
  readonly scope: "home" | "project";
  assertCurrent(): void;
  capturePermission(permission: string): () => void;
}

/** What the Host's own entry adds to the person's call: the file the person handed it (an import), never any authority. */
export type LocalWebEntry = Pick<ActionCallContext, "original_file"> & { readonly user_action?: () => ActionUserAction; readonly stage_read?: LocalWebStageRead; readonly assertCurrent?: () => void };

/** One scene run keeps its actual plugin owner's checks, including while a different provider judges its input. */
export async function capturePluginSceneAuthority(host: MolisWorkLocalHost, view: ActionSceneView, reference?: LocalHostProjectReference): Promise<() => void> {
  const provider = view.provider, installId = provider.plugin_install_id;
  if (!installId || !provider.project_id || !reference) return () => {};
  const platform = await host.withProject(reference, runtime => runningProjectPlatform(runtime.store, runtime.project_id));
  const checks = provider.plugin_id && platform?.dualInstance(provider.plugin_id)
    ? view.definition.permissions.map(permission => platform.runtime.capturePermission(installId, permission)) : [];
  return () => { for (const check of checks) check(); };
}

function localPersonCaller(reference: LocalHostProjectReference | undefined, permissions: readonly string[], signal?: AbortSignal,
  originalFile?: ActionCallContext["original_file"]): ActionCallContext {
  const locale = activeLocale();
  return { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: reference?.project_id ?? null, audience: "user", permissions, signal,
    ...(locale ? { locale } : {}), ...(originalFile ? { original_file: originalFile } : {}),
    ...(inLanguagePreview() ? { read_only_effects: true } : {}) };
}

/** A Runtime provider's authority always comes from its installation, never from the person's Host grants. */
function ownerReaches(provider: ActionProvider, permissions: readonly string[], ownerCap: readonly string[]): boolean {
  if (provider.plugin_install_id !== undefined) return false;
  const held = localOwnerPermissionsOver(provider.provider_id, permissions);
  return permissions.every(permission => ownerCap.includes(permission) && held.includes(permission));
}

const localAuthorityRefused = () => new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态");

function localWebCaller(reference: LocalHostProjectReference | undefined, builtinPermissions: readonly string[], signal?: AbortSignal, entry: LocalWebEntry = {}) {
  const sessionCurrent = captureWebSessionAuthority();
  sessionCurrent();
  entry.assertCurrent?.();
  signal?.throwIfAborted();
  // What a handler sends back to be shown follows the page the call came from; a call no page made keeps the handler's default.
  const caller = localPersonCaller(reference, builtinPermissions, signal, entry.original_file);
  return { caller, sessionCurrent };
}

/** Only the authenticated local-user transport uses this adapter; it is not an Agent/MCP grant resolver. */
export async function localWebActionContext(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined,
  builtinPermissions: readonly string[], signal?: AbortSignal, entry: LocalWebEntry = {}, stageAction?: ActionDefinition): Promise<ActionCallContext> {
  const { caller, sessionCurrent } = localWebCaller(reference, builtinPermissions, signal, entry);
  // Inspection activates the actual project providers. Metadata alone never supplies a grant.
  const catalog = await host.inspectPreparedActionMetadata(caller, reference);
  signal?.throwIfAborted();
  const repository = reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db)) : undefined;
  const platform = reference ? await host.withProject(reference, runtime => runningProjectPlatform(runtime.store, runtime.project_id)) : null;
  return localWebAuthority(host, reference, caller, sessionCurrent, catalog, repository, platform, host.homePlugins?.installations() ?? [], entry, stageAction);
}

/** The homepage may use only registrations and installations that are already here: a Home owner not yet started adds none. */
export function openProjectPersonContext(host: MolisWorkLocalHost, reference: LocalHostProjectReference, store: LocalProjectDatabase, signal: AbortSignal) {
  const { caller, sessionCurrent } = localWebCaller(reference, LOCAL_OWNER_PERMISSIONS, signal);
  const metadata = host.inspectActionMetadata(caller, reference);
  return { metadata, inspect: () => host.inspectActionMetadata(caller, reference), caller: localWebAuthority(host, reference, caller, sessionCurrent, metadata,
    new SqlitePluginRuntimeRepository(store.db), currentProjectPlatform(store, reference.project_id), host.homePlugins?.installations(false, true) ?? []) };
}

/**
 * Building the authority is synchronous and checks every listed action's grants, so it is one directory pass: each installation record is read once
 * for it (not once per action and permission). The checks it hands out run later, each reading afresh.
 */
function localWebAuthority(...args: Parameters<typeof buildLocalWebAuthority>): ActionCallContext {
  return inDirectoryPass(() => buildLocalWebAuthority(...args));
}

function buildLocalWebAuthority(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined, base: ActionCallContext, sessionCurrent: () => void,
  catalog: readonly LocalActionMetadata[], projectRepository: SqlitePluginRuntimeRepository | undefined,
  platform: Awaited<ReturnType<typeof runningProjectPlatform>>, homeInstalled: readonly PluginInstanceRecord[], entry: LocalWebEntry = {},
  stageAction?: ActionDefinition): ActionCallContext {
  const { permissions: builtinPermissions, signal } = base;
  sessionCurrent();
  signal?.throwIfAborted();
  const installed = projectRepository?.list() ?? [];
  // A plugin that runs as the Home's instance and as a project's has one install_id in both databases (a hash of its id and publisher),
  // each record with its own generation and grants. The two tables are never merged: an instance reads the record of its own database.
  const projectRecords = new Map(installed.filter(row => row.state === "running").map(row => [row.install_id, row]));
  const homeRecords = new Map(homeInstalled.filter(record => record.state === "running").map(record => [record.install_id, record]));
  // The installation a provider's grants come from is the one its registration names, not whatever its provider id looks like:
  // a plugin that ships with the Host registers under its plugin_id, and its Host-assembled providers share that id. A project's
  // Plugin Runtime registers with its project_id, the Home's without, and that decides which database's record is the provider's.
  const inProject = (provider: ActionProvider) => Boolean(provider.project_id);
  const installOf = (provider: ActionProvider) => provider.plugin_install_id === undefined ? undefined
    : (inProject(provider) ? projectRecords : homeRecords).get(provider.plugin_install_id);
  const capturePermission = (provider: ActionProvider, permission: string): (() => void) | undefined => {
    const install = installOf(provider);
    if (!install) return undefined;
    if (!inProject(provider)) return undefined;
    return platform?.dualInstance(install.plugin_id) ? platform.runtime.capturePermission(install.install_id, permission) : undefined;
  };
  const checks = new Map<LocalActionMetadata, Array<() => void>>();
  // The person's own permissions reach only what the Host registers itself, and over each such provider only what the person holds
  // over that provider (PG-007): a permission held over Characters is not held over another Host action that asks for it. A
  // provider the Plugin Runtime registered, built in or not, names its installation, and is reached through its grants alone.
  const scopeMatches = (provider: ActionProvider, scope: "home" | "project") =>
    (!provider.project_id || provider.project_id === reference?.project_id) && (scope === "home" || !!reference);
  const accept = (view: LocalActionMetadata, ownerCap: readonly string[]) => {
    if (!scopeMatches(view.provider, view.action.scope)) return false;
    if (ownerReaches(view.provider, view.action.permissions, ownerCap)) return true;
    const install = installOf(view.provider);
    const own = view.provider.kind === "plugin"
      && !!install && install.plugin_id === view.provider.plugin_id
      && view.action.permissions.every(permission => install.grants.includes(permission));
    if (!own) return false;
    try { checks.set(view, view.action.permissions.flatMap(permission => capturePermission(view.provider, permission) ?? [])); return true; }
    catch { return false; }
  };
  const accepted = catalog.filter(view => accept(view, builtinPermissions));
  // Scene-only plugins have no action from which to infer their local-user permissions.
  // Inspect actual registrations using installed grants, then accept only the matching running owner.
  const candidates = [...new Set([...builtinPermissions, ...[...projectRecords.values(), ...homeRecords.values()].flatMap(row => row.grants)])];
  const scenes = host.inspectSceneMetadata({ ...base, permissions: candidates }, reference);
  signal?.throwIfAborted();
  const scenePermissions = scenes.flatMap(view => {
    const install = installOf(view.provider);
    if (!scopeMatches(view.provider, view.definition.scope) || view.provider.kind !== "plugin"
      || !install || install.plugin_id !== view.provider.plugin_id) return [];
    return [...view.definition.permissions, ...view.definition.configuration_permissions ?? []].filter(permission => {
      if (!install.grants.includes(permission)) return false;
      try { capturePermission(view.provider, permission)?.(); return true; } catch { return false; }
    });
  });
  const owner = entry.stage_read, ownActions = new Set(owner?.manifest.actions?.map(action => `${action.capability_id}@${action.version}`));
  owner?.assertCurrent();
  const sourceChecks = new Map<LocalActionMetadata, Array<() => void>>();
  const authority = owner ? accepted.filter(view => ownActions.has(`${view.capability_id}@${view.version}`)
    ? view.provider.plugin_id === owner.manifest.plugin_id && view.provider.plugin_install_id === owner.install_id
      && (owner.scope === "home" ? !view.provider.project_id : view.provider.project_id === reference?.project_id)
    : owner.manifest.capabilities.consumes.includes(view.capability_id) && (() => {
      try { sourceChecks.set(view, view.action.permissions.map(permission => owner.capturePermission(permission))); return true; } catch { return false; }
    })()) : accepted;
  const permissions = [...new Set([...builtinPermissions, ...accepted.flatMap(view => view.action.permissions), ...scenePermissions])];
  const stage = owner && stageAction && owner.manifest.ui.views?.some(view => view.stage_data?.action === stageAction.capability_id)
    ? authority.find(view => view.capability_id === stageAction.capability_id && view.version === stageAction.version
      && view.provider.plugin_id === owner.manifest.plugin_id && view.provider.plugin_install_id === owner.install_id
      && (owner.scope === "home" ? !view.provider.project_id : view.provider.project_id === reference?.project_id)) : undefined;
  // Only the authenticated stage can inspect the person's wider metadata; execution keeps the original cap and refs.
  const metadata = stage ? catalog.filter(view => accepted.includes(view) || accept(view, LOCAL_OWNER_PERMISSIONS)) : [];
  const assertAuthority = (action?: ActionReference, required: readonly string[] = []) => {
    sessionCurrent();
    entry.assertCurrent?.();
    signal?.throwIfAborted();
    owner?.assertCurrent();
    if (!required.every(permission => permissions.includes(permission))) throw localAuthorityRefused();
    if (!action) return;
    const matches = accepted.filter(view => view.capability_id === action.capability_id && view.version === action.version
      && (!action.provider_id || view.provider.provider_id === action.provider_id));
    let original = matches.length === 1 ? matches[0] : undefined;
    let ownerCap = builtinPermissions;
    if (!matches.length && action.provider_id) {
      original = metadata.find(view => view.capability_id === action.capability_id && view.version === action.version && view.provider.provider_id === action.provider_id);
      ownerCap = LOCAL_OWNER_PERMISSIONS;
    }
    if (original) {
      try { for (const check of [...checks.get(original) ?? [], ...sourceChecks.get(original) ?? []]) check(); }
      catch { throw localAuthorityRefused(); }
    }
    if (original && original.provider.plugin_install_id === undefined && accept(original, ownerCap)) return;
    const installId = original?.provider.plugin_install_id;
    const install = !installId || !original ? undefined : inProject(original.provider) ? projectRepository?.get(installId)
      : host.homePlugins?.installations().find(record => record.install_id === installId);
    const held = original && installOf(original.provider);
    if (!original || !install || !held || install.state !== "running" || install.plugin_id !== original.provider.plugin_id
      || !sameInstalledRelease(held, install)
      || !original.action.permissions.every(permission => install.grants.includes(permission))) {
      throw localAuthorityRefused();
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
    // The caller's synchronous check (`assertAuthority` above, made for this same `stage_read`) opens with this owner's fence and
    // runs only Host reads after it, so the fence is not run a second time here: every nested read of the stage passes this check,
    // and each fence re-serializes the whole Manifest. The asynchronous check keeps its own fence after the await.
    return { ...caller, read_only_effects: true,
      validate_authority: async target => { await caller.validate_authority?.(target); owner.assertCurrent(); } };
  }, definition);
}

/** Invoke one exact, Home-registered Catalog action as the person, without preparing a project runtime. */
export async function invokeLocalWebCatalogAction<Input, Output>(host: MolisWorkLocalHost, resolveProject: () => Promise<LocalHostProjectReference>,
  action: ActionDefinition<Input, Output> & { provider_id: string }, input: Input,
  authority: { signal: AbortSignal; sessionCurrent(): void; accountCurrent?(): void }): Promise<Output> {
  const assertSession = () => { authority.sessionCurrent(); authority.signal.throwIfAborted(); authority.accountCurrent?.(); };
  assertSession();
  const definition = { ...action }, ownerCap = [...definition.action.permissions];
  const catalog = host.projectCatalogActions;
  const registration = catalog.descriptor(definition), provider = registration?.action_provider;
  const metadata = registration?.action;
  if (!provider || provider.provider_id !== definition.provider_id || !metadata?.audiences.includes("user")
    || !ownerReaches(provider, metadata.permissions, ownerCap)) throw localAuthorityRefused();
  const permissions = metadata.permissions;
  const assertAuthority = (target: ActionReference = definition, required: readonly string[] = permissions) => {
    assertSession();
    if (catalog.descriptor(definition) !== registration) throw new ActionError("actions.provider_changed", "能力已重新加载，不能继续原副作用");
    if (target.capability_id !== definition.capability_id || target.version !== definition.version || target.provider_id !== definition.provider_id
      || !required.every(permission => permissions.includes(permission))) {
      throw localAuthorityRefused();
    }
  };
  const reference = await resolveProject();
  assertAuthority();
  return invokeWithLocalWebAuthority(catalog.client(reference), {
    ...localPersonCaller(reference, permissions, authority.signal), allowed_actions: [definition],
    validate_authority: async target => { assertAuthority(target); }, assert_authority_current: assertAuthority,
  }, definition, input);
}

async function invokeWithLocalWebAuthority<Input, Output>(client: ActionClient, caller: ActionCallContext,
  definition: ActionDefinition<Input, Output>, input: Input, control?: Parameters<BoundActionClient["invoke"]>[2],
  transport?: Parameters<BoundActionClient["invoke"]>[3]): Promise<Output> {
  const result = await bindActionClient(client, () => caller).invoke(definition, input, control, transport);
  // A stage read's assertAuthority already opens with the same owner fence.
  caller.assert_authority_current?.(definition);
  return result;
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
      return invokeWithLocalWebAuthority(client, asEntry(caller), definition, input, control, transport);
    },
  };
}
