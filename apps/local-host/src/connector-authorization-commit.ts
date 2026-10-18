import { normalizeConnectorTokenInput } from "@molis-ai/molis-work-service-connector-host";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { activateConnectorConnection, type ConnectorActivation } from "./connector-activation.js";
import { assertConnectorAuthorizationPending, connectorAuthorizationForState, connectorAuthorizationStatus, finishConnectorAuthorization } from "./connector-authorization-status.js";
import { readConnectorAuthorizationCompletion, saveConnectorAuthorizationCompletion } from "./connector-authorization-presentation.js";

/** Every protocol finishes here. Pending human intent preserves the result without activating a connection. */
export function submitConnectorActivation(home: string, state: string, completion: ConnectorActivation) {
  if (completion.kind === "token") completion = { ...completion, input: normalizeConnectorTokenInput(completion.input) };
  assertConnectorAuthorizationPending(home, state);
  const request = connectorAuthorizationForState(home, state)!;
  if (request.commit_held) {
    saveConnectorAuthorizationCompletion(home, request.id, completion);
    return { status: "pending" as const, authorization_id: request.id, awaiting_intent: true as const };
  }
  const connection = activateConnectorConnection(home, completion);
  finishConnectorAuthorization(home, state, "connected", connection.connection_id);
  return { status: "connected" as const, connection };
}

/** Reopening the page never calls this. Only the same session's current intent decision can release its result. */
export function commitRetainedConnectorAuthorization(home: string, id: string) {
  const request = connectorAuthorizationStatus(home, id);
  const stored = readConnectorAuthorizationCompletion(home, id);
  if (!stored) return request;
  if (request?.status !== "pending" || request.commit_held) throw connectorErrors["connector.connection.invalid"]("接入尚未获准继续或请求已结束");
  try {
    submitConnectorActivation(home, stored.state, stored.completion);
    return connectorAuthorizationStatus(home, id);
  } catch (error) {
    finishConnectorAuthorization(home, stored.state, "failed");
    throw error;
  }
}
