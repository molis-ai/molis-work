import { connectorAuthorizationStatus, pendingConnectorAuthorizationsForSession } from "./connector-authorization-status.js";
import { commitRetainedConnectorAuthorization } from "./connector-authorization-commit.js";
import { verifyEnabledConnection } from "./connector-check-service.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import type { AgentActionReviewControl } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Explicit local-person control, after the business work has stopped. It cannot wake a work or select another session. */
export async function retainConnectorSetupsForSession(home: string, sessionId: string, actorId: string, remember: ConnectorMcpDirectory["remember"], control?: AgentActionReviewControl) {
  const connected: string[] = [];
  const beforeEffect = async () => { await control?.beforeEffect(); control?.assertCurrent(); };
  for (const { id } of pendingConnectorAuthorizationsForSession(home, sessionId, actorId)) {
    const request = connectorAuthorizationStatus(home, id);
    if (!request || !["prepared", "pending"].includes(request.status)) continue;
    const retained = await commitRetainedConnectorAuthorization(home, id, request.intent_revision, control);
    if (retained?.status === "connected") connected.push(retained.connection_id);
  }
  for (const id of connected) await verifyEnabledConnection(home, id, remember, { beforeEffect, assertCurrent: control?.assertCurrent });
}
