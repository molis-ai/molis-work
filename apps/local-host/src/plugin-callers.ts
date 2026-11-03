import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, actionReachesAudience, type ActionCallContext, type ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_REVIEW_PERMISSION_PREFIX, type PluginReviewKind } from "@molis-ai/molis-work-contracts/services/agent-host";
import { hostErrors } from "./host-errors.js";

/**
 * The plugin callers the Host has issued and not yet withdrawn (S-15): a started session's (project or Home), the copy a Home
 * session gets for a project its call is routed into, and the sandbox broker's for one call. Membership is process-local and
 * comes only from the Host building the caller, never from a plugin id or a serialized caller, so a copied, forged or
 * withdrawn object (a stopped, disabled, uninstalled or revoked installation, a closed project, a Host restart) is not one.
 */
const issued = new WeakMap<HostPluginCaller, { readonly held: ReadonlySet<string>; readonly routes: Map<string, HostPluginCaller> }>();

/** Registers a caller the Host built, with the permissions it holds; the returned release withdraws it and its routed copies. */
export function issuePluginCaller(caller: HostPluginCaller, held: Iterable<string>): () => void {
  const entry = { held: new Set(held), routes: new Map<string, HostPluginCaller>() };
  issued.set(caller, entry);
  return () => { for (const route of entry.routes.values()) issued.delete(route); issued.delete(caller); };
}

/** What a started plugin holds: the permissions its Manifest declares that its installation was also granted. */
export function heldPermissions(manifest: Pick<PluginManifest, "permissions">, grants: readonly string[]): string[] {
  return manifest.permissions.map(item => item.permission).filter(permission => grants.includes(permission));
}

/**
 * A Home session's caller for the project its call was routed into: the same plugin, installation, person and permissions,
 * withdrawn together with the session. Any other caller is returned as it is, and the gateway checks it as it is.
 */
export function routedPluginCaller(caller: HostPluginCaller, projectId: string | null): HostPluginCaller {
  const entry = issued.get(caller);
  if (!entry || caller.project_id !== null || projectId === null) return caller;
  const known = entry.routes.get(projectId);
  if (known) return known;
  const route: HostPluginCaller = Object.freeze({ ...caller, project_id: projectId });
  entry.routes.set(projectId, route); issued.set(route, { held: entry.held, routes: new Map() });
  return route;
}

/**
 * The installation starting a person-reviewed Host operation (PG-009): the plugin whose issued caller made this call. It holds
 * the operation while its caller is still issued and active and holds `review:<kind>`, asked when the review is created, when a
 * person approves and right before the operation runs. Revoking, disabling, stopping or upgrading the installation withdraws
 * the caller, so an operation it asked for is refused from then on, never run. A call no plugin made cannot start one.
 */
export function reviewAuthority(caller: HostPluginCaller | undefined, kind: PluginReviewKind) {
  if (!caller) throw hostErrors.plugin_caller_invalid("需要人审查的宿主操作只能由插件发起");
  const permission = PLUGIN_REVIEW_PERMISSION_PREFIX + kind;
  return { plugin_id: caller.plugin_id, install_id: caller.install_id, holds(): boolean {
    if (!issued.get(caller)?.held.has(permission)) return false;
    try { caller.assertActive(); return true; } catch { return false; }
  } };
}

/**
 * Who a dependency check asks as (PG-035). A plugin asks whether a Host action it consumes is registered and ready, not whether it
 * may call it: who calls and what it holds are checked on the call (S-15). So an action offered to plugins is asked as the plugin
 * audience holding what the action needs; an action not offered to plugins is asked as the person.
 */
export function dependencyCaller(projectId: string, definition: { readonly capability_id: string; readonly action?: ActionMetadata }, consumer: "plugin" | undefined): ActionCallContext {
  const action = consumer === "plugin" && definition.action && actionReachesAudience(definition.action, definition.capability_id, "plugin") ? definition.action : undefined;
  return { actor_id: "local-host", project_id: projectId, audience: action ? "plugin" : "user", permissions: action ? [...action.permissions] : [] };
}

/**
 * The action gateway's check of who is calling (S-15). A plugin-audience call, or any call that names a plugin, must carry a
 * caller the Host issued and has not withdrawn, still active, issued to this call's person, project and installation, and only
 * a plugin-audience call carries one. A plugin's permissions are narrowed to what it holds, whatever the call claims.
 */
export function verifiedCaller(caller: ActionCallContext): ActionCallContext {
  if (caller.audience !== "plugin" && !caller.host_plugin) return caller;
  const held = issuedTo(caller);
  return { ...caller, permissions: caller.permissions.filter(permission => held.has(permission)) };
}

/**
 * Before admission and again before each effect: the caller is still issued and active, and holds every permission an action
 * offered to plugins needs. An action not offered to plugins is left to the availability check, which refuses it as unseen.
 * The availability check calls this first: a plugin's permissions were narrowed to what it holds, so what it lacks is refused
 * as such, not as unseen.
 */
export function admitPluginCall(caller: ActionCallContext, capabilityId: string, action: Pick<ActionMetadata, "kind" | "effect" | "plugin" | "audiences" | "permissions">): void {
  if (caller.audience !== "plugin" && !caller.host_plugin) return;
  const held = issuedTo(caller);
  if (!actionReachesAudience(action, capabilityId, "plugin")) return;
  if (action.permissions.some(permission => !held.has(permission))) throw new ActionError("actions.plugin_permission", "插件没有声明或没有获得这项动作所需的授权");
}

function issuedTo(caller: ActionCallContext): ReadonlySet<string> {
  const plugin = caller.host_plugin, entry = plugin ? issued.get(plugin) : undefined;
  if (!plugin || !entry) throw hostErrors.plugin_caller_invalid("插件调用没有宿主发出的有效身份");
  plugin.assertActive();
  if (plugin.actor_id !== caller.actor_id || plugin.project_id !== caller.project_id || plugin.install_id !== caller.plugin_install_id) {
    throw hostErrors.plugin_caller_mismatch("插件调用的用户、项目或安装与宿主发出的身份不一致");
  }
  // A plugin's issued caller speaks only for a plugin-audience call: carried by a person's, an Agent's or a workflow's call,
  // it would let that call answer as the plugin, or the plugin's identity ride on an audience it was never checked for.
  if (caller.audience !== "plugin") throw hostErrors.plugin_caller_mismatch("宿主发出的插件身份只能用于插件调用");
  return entry.held;
}
