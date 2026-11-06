import { submitConnectorActivation } from "./connector-authorization-commit.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorAuthorizationPending } from "./connector-authorization-status.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProtocolSecrets } from "./connector-protocol-store.js";
import type { McpConfiguration } from "./connector-mcp.js";
import type { McpSourceCheck, McpSourceSnapshot } from "./connector-mcp-configuration.js";

export function assertMcpAuthorizationPending(home: string, state: string, now: number): void {
  if (!connectorAuthorizationPending(home, state, now)) throw connectorErrors["connector.mcp.authorization"]("MCP 授权已取消、过期或结束，请重新连接");
}

/** Synchronous owner commit: cancellation cannot interleave after the final authority check. */
export function commitMcpConnection(home: string, config: McpConfiguration, state: string, now: number, check: McpSourceCheck, declaration?: McpSourceSnapshot) {
  assertMcpAuthorizationPending(home, state, now);
  check(config, declaration);
  const previous = withConnectorConnections(home, store => store.get(config.connectionId));
  if (previous && (previous.updated_at !== config.previousRevision || previous.disconnected_at !== config.previousDisconnectedAt)) throw connectorErrors["connector.mcp.configuration"]("连接已改变，请重新开始授权");
  const staged = connectorProtocolSecrets(home, config.sessionId);
  const final = connectorProtocolSecrets(home, config.connectionId);
  const credentials = Object.fromEntries(["oauth", "access", "expires", "client"].map(name => [final.reference(name), staged.get(name)]));
  const saved = { ...config, sessionId: config.connectionId };
  delete saved.previousRevision;
  delete saved.previousDisconnectedAt;
  delete saved.sourceGeneration;
  const result = submitConnectorActivation(home, state, { kind: "mcp", declaration, target: { connectionId: config.connectionId, expectedRevision: config.previousRevision },
    credentials, protocol: saved, input: { connectionId: config.connectionId, serviceId: config.serviceId, displayName: config.displayName,
      endpoint: config.endpoint, credentialRef: config.mode === "none" ? null : final.reference("access"),
      refreshRef: config.mode === "oauth" ? final.reference("oauth") : null, expiresRef: config.mode === "oauth" ? final.reference("expires") : null } }, check);
  staged.clear();
  return result;
}
