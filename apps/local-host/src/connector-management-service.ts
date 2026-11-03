import { cleanupConnectorInstallation } from "./connector-tool-cleanup.js";
import type { LocalMcpConfiguration } from "./connector-local-mcp.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { cancelConnectorAuthorizationsForConnection } from "./connector-authorization-status.js";
import { connectionChanged } from "./connection-change-events.js";

/** Shared by the protected settings routes and authorized management actions. No service-side logout is implied. */
export function controlConnectorConnection(home: string, id: string, action: "enable" | "disable" | "remove" | "disconnect") {
  withConnectorConnections(home, store => store.require(id));
  const installation = action === "remove" ? withConnectorProtocols(home, store => store.get<LocalMcpConfiguration>(id))?.installation_id : undefined;
  if (action !== "enable") {
    cancelConnectorAuthorizationsForConnection(home, id);
    withConnectorProtocols(home, store => store.discardConnectionSessions(id));
  }
  const connection = withConnectorConnections(home, store => {
    if (action === "remove") { store.remove(id); return null; }
    return store.view(action === "disconnect" ? store.disconnect(id) : store.setEnabled(id, action === "enable"));
  });
  if (action === "remove") withConnectorProtocols(home, store => store.remove(id));
  const cleanup = cleanupConnectorInstallation(home, installation);
  connectionChanged(home, id);
  return { connection_id: id, connection, removed: action === "remove", service_authorization_revoked: false, ...(cleanup ? { cleanup } : {}) };
}
