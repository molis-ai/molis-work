import { ActionError, defineErrorCodes, isSearchEntriesSource, isSubjectReader, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { McpActionGrant, McpToolPreference } from "./mcp-settings-store.js";
import { actionGrantKey } from "./mcp-settings-store.js";

type GrantFacts = { readonly action_grants: readonly McpActionGrant[] };
/** A client calling what it holds no grant for (any more) is refused: a refusal, which every reader can tell by its kind. */
const grantErrors = defineErrorCodes("mcp", { action_revoked: "forbidden" });

/** Internal runtimes cannot be impersonated by external MCP runtime: identities. */
export const actionClientAudience = (clientId: string) => clientId.startsWith("agent:") ? "agent" as const : "mcp" as const;

/**
 * An external Runtime (a Codex or Claude Code session) reaches the Host as `runtime:<id>`; it is the client that has a Session to name or lack.
 * A cross-device member (`runtime:cross-device:<member>`, named by the continuity server) is not a Runtime session: the member id is its stable author.
 */
export const isExternalRuntimeClient = (clientId: string) => clientId.startsWith("runtime:") && !clientId.startsWith("runtime:cross-device:");

/** Only the local management owner calls this with a definition from Host inspection. */
export function createMcpActionGrant(clientId: string, projectId: string | null, action: ActionView, enabled: boolean): McpActionGrant {
  if (!clientId.trim() || !action.action.audiences.includes(actionClientAudience(clientId))) throw new ActionError("mcp.grant_invalid", "缺少客户端身份或此能力不支持 MCP");
  if (action.action.scope === "project" && !projectId) throw new ActionError("actions.project_required", "请为此能力选择具体项目");
  if (action.action.scope === "home" && projectId) throw new ActionError("mcp.grant_scope", "全局能力必须在全局范围单独授权");
  if (action.provider.project_id && action.provider.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "能力属于其他项目");
  return { client_id: clientId, project_id: projectId, capability_id: action.capability_id, version: action.version,
    provider_id: action.provider.provider_id, permissions: [...new Set(action.action.permissions)].sort(), enabled };
}

function matches(grant: McpActionGrant, view: ActionView, caller: ActionCallContext): boolean {
  return grant.enabled && grant.client_id === caller.actor_id
    && grant.project_id === (view.action.scope === "home" ? null : caller.project_id)
    && (view.action.scope !== "project" || caller.project_id !== null)
    && grant.capability_id === view.capability_id && grant.version === view.version && grant.provider_id === view.provider.provider_id
    && grant.permissions.length === new Set(view.action.permissions).size
    && view.action.permissions.every(permission => grant.permissions.includes(permission));
}

/**
 * What a client holds without a grant record: a system action that needs no permission; and, for the built-in Agent in a
 * project, project knowledge (specs/project-knowledge, the person's 2026-10-19 decision "默认开、可关") — the knowledge actions
 * and the project's own read-only listings and object readers they read through. A record for the action, enabled or revoked,
 * always decides instead, so the person turns any of these off in 对外接入.
 */
export function openByDefault(view: ActionView, caller: Pick<ActionCallContext, "actor_id" | "project_id">): boolean {
  if (view.provider.kind === "system" && view.action.permissions.length === 0) return true;
  if (actionClientAudience(caller.actor_id) !== "agent" || !caller.project_id) return false;
  if (view.operation !== "query" || view.action.kind !== "query") return false;
  if (view.provider.provider_id === KNOWLEDGE_PROVIDER_ID && view.provider.kind === "system") return true;
  return view.provider.project_id === caller.project_id && (isSubjectReader(view.action) || isSearchEntriesSource(view.action));
}

/** Declarations are not authority. Only explicit, unchanged grants produce permissions. */
export function resolveMcpActionContext(caller: ActionCallContext, catalog: readonly ActionView[], preference: GrantFacts): ActionCallContext {
  const accepted = catalog.filter(view => {
    if (!view.action.audiences.includes(caller.audience === "agent" ? "agent" : "mcp") || (view.provider.project_id && view.provider.project_id !== caller.project_id)) return false;
    const records = preference.action_grants.filter(grant => grant.client_id === caller.actor_id
      && grant.project_id === (view.action.scope === "home" ? null : caller.project_id)
      && grant.capability_id === view.capability_id && grant.version === view.version && grant.provider_id === view.provider.provider_id);
    const granted = records.length === 1 && matches(records[0], view, caller);
    return (openByDefault(view, caller) && !records.length) || granted;
  });
  return { ...caller, permissions: [...new Set(accepted.flatMap(view => view.action.permissions))],
    allowed_actions: accepted.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
  };
}

export function assertMcpActionAuthority(caller: ActionCallContext, catalog: readonly ActionView[], preference: GrantFacts, reference: ActionReference): void {
  const allowed = resolveMcpActionContext(caller, catalog, preference).allowed_actions ?? [];
  if (!allowed.some(item => item.capability_id === reference.capability_id && item.version === reference.version
    && item.provider_id === reference.provider_id)) {
    throw grantErrors.action_revoked("此客户端的能力授权已撤销或发生变化，请重新检查对外接入设置");
  }
}

/** Keep this acceptance's exact grant instances (or an actual default's absence), across every later check. */
export function pinMcpActionGrants(caller: ActionCallContext, catalog: readonly ActionView[], preference: McpToolPreference) {
  const allowed = resolveMcpActionContext(caller, catalog, preference).allowed_actions ?? [];
  const original = catalog.filter(view => allowed.some(ref => ref.capability_id === view.capability_id && ref.version === view.version
    && ref.provider_id === view.provider.provider_id)).map(view => {
    const key = actionGrantKey({ client_id: caller.actor_id, project_id: view.action.scope === "home" ? null : caller.project_id,
      capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
    return { key, capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
      scope: view.action.scope, permissions: [...new Set(view.action.permissions)],
      generation: preference.action_grants.find(grant => actionGrantKey(grant) === key)?.generation ?? null };
  });
  return (currentCatalog: readonly ActionView[], current: McpToolPreference): readonly ActionView[] => currentCatalog.filter(view => {
    const candidates = original.filter(ref => ref.capability_id === view.capability_id && ref.version === view.version
      && ref.provider_id === view.provider.provider_id && ref.scope === view.action.scope);
    if (candidates.length !== 1) return false;
    const origin = candidates[0], records = current.action_grants.filter(grant => actionGrantKey(grant) === origin.key);
    return (origin.generation === null ? records.length === 0 : records.length === 1 && records[0].generation === origin.generation)
      && origin.permissions.length === new Set(view.action.permissions).size && view.action.permissions.every(permission => origin.permissions.includes(permission));
  });
}
