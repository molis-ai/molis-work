import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorObservations } from "./connector-observations.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import type { StoredMcpConfiguration } from "./connector-mcp-configuration.js";
import { connectorRecordActions, supportsConnectorRecords } from "./connector-record-actions.js";
import { connectorMcpProviderId } from "./connector-mcp-actions.js";
import { projectConnectorStatus } from "./connector-status-projection.js";

export type ConnectorActionInspector = (caller: ActionCallContext) => Promise<ActionView[]>;

/** Four independent projections. Historical checks and calls are labelled with the revision they actually observed. */
export function describeConnectorStatus(home: string, id: string, actions: readonly ActionView[], caller: ActionCallContext) {
  const found = withConnectorConnections(home, store => {
    const row = store.require(id);
    return { row, configured: store.state({ ...row, enabled: true, disconnected_at: null }) === "connected" };
  }, true);
  if (!found) throw connectorErrors["connector.connection.not_found"]("连接不存在");
  const { row, configured } = found;
  const protocol = withConnectorProtocols(home, store => store.get<StoredMcpConfiguration>(id), true);
  return projectConnectorStatus({ revision: row.updated_at, enabled: row.enabled, active: row.enabled && !row.disconnected_at,
    configured: configured && (row.auth_method !== "mcp" && row.auth_method !== "cli" || Boolean(protocol)), source: "connection-owner",
    observations: withConnectorObservations(home, store => store.read(id), true) ?? {}, caller,
    noAuthentication: row.auth_method === "none" || protocol?.protocol === "mcp" && protocol.mode === "none",
    actions: actions.filter(view => view.provider.provider_id === connectorMcpProviderId(id)
      || supportsConnectorRecords(row) && view.capability_id === connectorRecordActions.read.capability_id && view.version === connectorRecordActions.read.version),
  });
}
