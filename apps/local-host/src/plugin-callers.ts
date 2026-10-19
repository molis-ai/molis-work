import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, actionReachesAudience, type ActionCallContext, type ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
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

/** A typed Host call made for a plugin: the caller must be one the Host issued, still active, and of this project. */
export function requireIssuedPluginCaller(caller: HostPluginCaller, projectId: string): void {
  if (!issued.has(caller)) throw hostErrors.plugin_caller_invalid("插件调用没有宿主发出的有效身份");
  if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "插件调用不属于当前项目");
  caller.assertActive();
}

/**
 * The action gateway's check of who is calling (S-15). A plugin-audience call, or any call that names a plugin, must carry a
 * caller the Host issued and has not withdrawn, still active, issued to this call's person, project and installation. A plugin's
 * permissions are narrowed to what it holds, whatever the call claims.
 */
export function verifiedCaller(caller: ActionCallContext): ActionCallContext {
  if (caller.audience !== "plugin" && !caller.host_plugin) return caller;
  const held = issuedTo(caller);
  return caller.audience === "plugin" ? { ...caller, permissions: caller.permissions.filter(permission => held.has(permission)) } : caller;
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
  if (caller.audience !== "plugin" || !actionReachesAudience(action, capabilityId, "plugin")) return;
  if (action.permissions.some(permission => !held.has(permission))) throw new ActionError("actions.plugin_permission", "插件没有声明或没有获得这项动作所需的授权");
}

function issuedTo(caller: ActionCallContext): ReadonlySet<string> {
  const plugin = caller.host_plugin, entry = plugin ? issued.get(plugin) : undefined;
  if (!plugin || !entry) throw hostErrors.plugin_caller_invalid("插件调用没有宿主发出的有效身份");
  plugin.assertActive();
  if (plugin.actor_id !== caller.actor_id || plugin.project_id !== caller.project_id || plugin.install_id !== caller.plugin_install_id) {
    throw hostErrors.plugin_caller_mismatch("插件调用的用户、项目或安装与宿主发出的身份不一致");
  }
  return entry.held;
}
