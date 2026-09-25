import { ActionError, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionMcpToolName } from "@molis-ai/molis-work-app-mcp";
import { isMcpToolEnabled, type McpActionGrant, type McpToolPreference } from "./mcp-settings-store.js";

export const hostActionToolName = (reference: ActionReference) => actionMcpToolName({ ...reference, capability_id: `molis_work_v1_action_${reference.capability_id}` });

/** Only the local management owner calls this with a definition from Host inspection. */
export function createMcpActionGrant(clientId: string, projectId: string | null, action: ActionView, enabled: boolean): McpActionGrant {
  if (!clientId.trim() || !action.action.audiences.includes("mcp")) throw new ActionError("mcp.grant_invalid", "缺少客户端身份或此能力不支持 MCP");
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

/** Declarations are not authority. Only explicit, unchanged grants produce permissions. */
export function resolveMcpActionContext(caller: ActionCallContext, catalog: readonly ActionView[], preference: McpToolPreference): ActionCallContext {
  const accepted = catalog.filter(view => {
    if (!view.action.audiences.includes("mcp") || (view.provider.project_id && view.provider.project_id !== caller.project_id)) return false;
    const publicSystem = view.provider.kind === "system" && view.action.permissions.length === 0;
    const records = (preference.action_grants ?? []).filter(grant => grant.client_id === caller.actor_id
      && grant.project_id === (view.action.scope === "home" ? null : caller.project_id)
      && grant.capability_id === view.capability_id && grant.version === view.version && grant.provider_id === view.provider.provider_id);
    const granted = records.some(grant => matches(grant, view, caller));
    return ((publicSystem && !records.length) || granted) && isMcpToolEnabled(hostActionToolName(view), true, preference.overrides);
  });
  return { ...caller, permissions: [...new Set(accepted.flatMap(view => view.action.permissions))],
    allowed_actions: accepted.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
  };
}

export function assertMcpActionAuthority(caller: ActionCallContext, catalog: readonly ActionView[], preference: McpToolPreference, reference: ActionReference): void {
  const allowed = resolveMcpActionContext(caller, catalog, preference).allowed_actions ?? [];
  if (!allowed.some(item => item.capability_id === reference.capability_id && item.version === reference.version
    && item.provider_id === reference.provider_id)) {
    throw new ActionError("mcp.action_revoked", "此客户端的能力授权已撤销或发生变化，请重新检查对外接入设置");
  }
}
