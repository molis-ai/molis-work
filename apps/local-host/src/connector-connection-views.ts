import { agentMcpEndpoint } from "./agent-connector-ports.js";
import { withConnectorConnections, type ConnectorConnectionStore } from "./connector-connection-store.js";
import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { shownState } from "./connector-refresh-refusals.js";
import { withConnectorObservations } from "./connector-observations.js";
import { REPLACED_OAUTH_NOTE, replacedOAuthShape } from "./connector-oauth-shape.js";

function connectionViews(homeDirectory: string, rows: (store: ConnectorConnectionStore) => readonly ConnectorConnectionRecord[]) {
  // One read of the last checks for the whole list, not one per connection.
  return withConnectorConnections(homeDirectory, (store) => withConnectorObservations(homeDirectory, (observations) => rows(store).map((row) => {
    const endpoint = row.auth_method === "mcp" ? agentMcpEndpoint(homeDirectory, row.connection_id) : null;
    const view = { ...store.view(row), state: shownState(homeDirectory, row, store.state(row), observations.read(row.connection_id).check ?? null), ...(row.auth_method === "mcp" ? { agent_available: Boolean(endpoint), ...(endpoint ? { mcp_endpoint: endpoint } : {}) } : {}),
      ...(replacedOAuthShape(row) ? { reauth_note: REPLACED_OAUTH_NOTE } : {}) };
    if (row.source !== "external" || !row.enabled || row.disconnected_at) return view;
    // A CLI account stays usable while the CLI configuration that verified it is still there.
    const configuration = withConnectorProtocols(homeDirectory, protocols => protocols.get(row.connection_id), true);
    return configuration?.protocol === "cli" && configuration.serviceId === row.service_id ? view : { ...view, state: "reauth_required" as const };
  })), true) ?? [];
}

export function listConnectorConnectionViews(homeDirectory: string, serviceId?: string) {
  return connectionViews(homeDirectory, store => store.list(serviceId));
}

export function readConnectorConnectionView(homeDirectory: string, connectionId: string) {
  return connectionViews(homeDirectory, store => { const row = store.get(connectionId); return row ? [row] : []; })[0];
}
