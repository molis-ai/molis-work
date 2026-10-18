import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpServerView, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorObservations } from "./connector-observations.js";
import { projectConnectorStatus } from "./connector-status-projection.js";

export const projectMcpProviderId = (owner: AgentSkillOwner, id: string) => `${owner.plugin_id}#mcp:${id}`;

/** A linked credential change invalidates observations even when the SDK configuration version stays the same. */
export function projectMcpRevision(home: string, server: AgentMcpServerView): string | undefined {
  if (!server.enabled) return undefined;
  if (!server.auth_connection_id) return String(server.version);
  return withConnectorConnections(home, store => {
    const row = store.get(server.auth_connection_id!);
    return row?.enabled && !row.disconnected_at ? `${server.version}:${row.updated_at}` : undefined;
  });
}

export function describeProjectMcpStatus(home: string, owner: AgentSkillOwner, server: AgentMcpServerView, actions: readonly ActionView[], caller: ActionCallContext) {
  const revision = projectMcpRevision(home, server);
  const status = projectConnectorStatus({ revision: revision ?? String(server.version), configured: true, enabled: server.enabled, active: !!revision,
    source: "project-mcp-owner", noAuthentication: server.credential === "none", live: server.health === "connected",
    observations: withConnectorObservations(home, store => store.read(server.id)), caller,
    actions: actions.filter(view => view.provider.provider_id === projectMcpProviderId(owner, server.id)),
  });
  if (caller.project_id !== owner.project_id) {
    status.authorization.work = { state: "blocked", missing_permissions: [], source: "current-project", note: "请在连接所属项目中核对当前调用权限" };
    if (server.tools.length) status.capabilities.state = "blocked";
  }
  return status;
}
