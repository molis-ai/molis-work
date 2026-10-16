import { randomBytes } from "node:crypto";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { assertConnectorAuthorizationPending, assertConnectorSetup, beginConnectorAuthorization, finishConnectorAuthorization, type ConnectorSetupPlan } from "./connector-authorization-status.js";
import { withConnectorConnections } from "./connector-connection-store.js";

/** Shared by protected HTTP forms and protocol owners; never takes identity or permissions from a form. */
export function checkConnectorSetupSubmission(home: string, requestId: string | undefined, actual: Pick<ConnectorSetupPlan, "service_id" | "method"> & Partial<ConnectorSetupPlan>) {
  if (!requestId) return;
  const plan = assertConnectorSetup(home, requestId, actual);
  if (plan.connection_id && withConnectorConnections(home, store => store.require(plan.connection_id!).updated_at) !== plan.expected_revision) {
    throw connectorErrors["connector.connection.invalid"]("原连接在准备后已变化，请重新准备接入");
  }
}

/** Token and CLI submissions use the same cancellation gate, even though they have no OAuth state. */
export function startConnectorSetupSubmission(home: string, requestId: string | undefined, actual: Pick<ConnectorSetupPlan, "service_id" | "method"> & Partial<ConnectorSetupPlan>) {
  checkConnectorSetupSubmission(home, requestId, actual);
  if (!requestId) return undefined;
  const state = randomBytes(32).toString("base64url");
  beginConnectorAuthorization(home, state, actual.connection_id ?? "", actual.service_id, Date.now(), requestId);
  return { assertCurrent: () => assertConnectorAuthorizationPending(home, state),
    finish: (connectionId: string) => finishConnectorAuthorization(home, state, "connected", connectionId),
    fail: () => finishConnectorAuthorization(home, state, "failed") };
}
