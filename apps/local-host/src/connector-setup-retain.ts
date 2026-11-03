import { connectorAuthorizationStatus, pendingConnectorAuthorizationsForSession, releaseConnectorAuthorizationIntent } from "./connector-authorization-status.js";
import { commitRetainedConnectorAuthorization } from "./connector-authorization-commit.js";
import { verifyEnabledConnection } from "./connector-check-service.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

/** Explicit local-person control, after the business work has stopped. It cannot wake a work or select another session. */
export async function retainConnectorSetupsForSession(home: string, sessionId: string, actorId: string, remember: ConnectorMcpDirectory["remember"]) {
  const connected: string[] = [];
  for (const { id } of pendingConnectorAuthorizationsForSession(home, sessionId, actorId)) {
    const request = connectorAuthorizationStatus(home, id)!;
    if (request.commit_held && request.intent_revision) releaseConnectorAuthorizationIntent(home, id, request.intent_revision);
    const retained = await commitRetainedConnectorAuthorization(home, id);
    if (retained?.status === "connected") connected.push(retained.connection_id);
  }
  for (const id of connected) await verifyEnabledConnection(home, id, remember);
}
