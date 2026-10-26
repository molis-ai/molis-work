import { agentMcpEndpoint } from "./agent-connector-ports.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { shownState } from "./connector-refresh-refusals.js";

export function listConnectorConnectionViews(homeDirectory: string, serviceId?: string) {
  return withConnectorConnections(homeDirectory, (store) => store.list(serviceId).map((row) => {
    const endpoint = row.auth_method === "mcp" ? agentMcpEndpoint(homeDirectory, row.connection_id) : null;
    const view = { ...store.view(row), state: shownState(homeDirectory, row, store.state(row)), ...(row.auth_method === "mcp" ? { agent_available: Boolean(endpoint), ...(endpoint ? { mcp_endpoint: endpoint } : {}) } : {}) };
    if (row.source !== "external" || !row.enabled || row.disconnected_at) return view;
    // A CLI account stays usable while the CLI configuration that verified it is still there.
    const configuration = withConnectorProtocols(homeDirectory, protocols => protocols.get(row.connection_id));
    return configuration?.protocol === "cli" && configuration.serviceId === row.service_id ? view : { ...view, state: "reauth_required" as const };
  }));
}

