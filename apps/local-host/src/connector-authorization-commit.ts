import { normalizeConnectorTokenInput } from "@molis-ai/molis-work-service-connector-host";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { activateConnectorConnection, assertMcpActivationSource, type ConnectorActivation } from "./connector-activation.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { mcpSourceCheck, type McpSourceCheck } from "./connector-mcp-configuration.js";
import { assertHeldOAuthDeclared } from "./connector-api-oauth.js";
import { assertConnectorAuthorizationPending, connectorAuthorizationForState, connectorAuthorizationStatus, finishConnectorAuthorization, releaseConnectorAuthorizationIntent } from "./connector-authorization-status.js";
import { readConnectorAuthorizationCompletion, saveConnectorAuthorizationCompletion } from "./connector-authorization-presentation.js";
import type { AgentActionReviewControl } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Every protocol finishes here. Pending human intent preserves the result without activating a connection. */
export function submitConnectorActivation(home: string, state: string, completion: ConnectorActivation, mcpCheck?: McpSourceCheck) {
  if (completion.kind === "token") completion = { ...completion, input: normalizeConnectorTokenInput(completion.input) };
  assertConnectorAuthorizationPending(home, state);
  assertMcpActivationSource(completion, mcpCheck);
  const request = connectorAuthorizationForState(home, state)!;
  if (request.commit_held) {
    saveConnectorAuthorizationCompletion(home, request.id, completion);
    return { status: "pending" as const, authorization_id: request.id, awaiting_intent: true as const };
  }
  const connection = activateConnectorConnection(home, completion, mcpCheck);
  finishConnectorAuthorization(home, state, "connected", connection.connection_id);
  return { status: "connected" as const, connection };
}

/**
 * Reopening the page never calls this. Only the same session's current intent decision can release its result, and only after the
 * last check of what declared it (W5-11 §3.3 step 5): a refusal ends the request and clears the held result.
 */
export async function commitRetainedConnectorAuthorization(home: string, id: string, revision: string | undefined, control?: AgentActionReviewControl) {
  const held = readConnectorAuthorizationCompletion(home, id);
  let check: McpSourceCheck | undefined;
  const current = () => {
    control?.assertCurrent();
    const request = connectorAuthorizationStatus(home, id);
    const stored = readConnectorAuthorizationCompletion(home, id);
    if (!request || !["prepared", "pending"].includes(request.status) || request.intent_revision !== revision
      || JSON.stringify(stored) !== JSON.stringify(held)) throw connectorErrors["connector.connection.invalid"]("接入要求或结果已变化，请读取当前状态");
    return request;
  };
  if (held) {
    try {
      if (held.completion.kind === "mcp") check = mcpSourceCheck(await homeIntegrationRegistry(home));
      else await assertHeldOAuthDeclared(home, held.completion);
    } catch (error) {
      await control?.beforeEffect(); current();
      finishConnectorAuthorization(home, held.state, "failed");
      throw error;
    }
  }
  await control?.beforeEffect();
  const request = current();
  if (request.commit_held && revision) releaseConnectorAuthorizationIntent(home, id, revision);
  if (!held) return connectorAuthorizationStatus(home, id);
  try {
    submitConnectorActivation(home, held.state, held.completion, check);
    return connectorAuthorizationStatus(home, id);
  } catch (error) {
    finishConnectorAuthorization(home, held.state, "failed");
    throw error;
  }
}
