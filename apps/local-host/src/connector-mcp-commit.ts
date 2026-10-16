import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorAuthorizationPending } from "./connector-authorization-status.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProtocolSecrets, withConnectorProtocols } from "./connector-protocol-store.js";
import type { McpConfiguration } from "./connector-mcp.js";

export function assertMcpAuthorizationPending(home: string, state: string, now: number): void {
  if (!connectorAuthorizationPending(home, state, now)) throw connectorErrors["connector.mcp.authorization"]("MCP 授权已取消、过期或结束，请重新连接");
}

/** Synchronous owner commit: cancellation cannot interleave after the final authority check. */
export function commitMcpConnection(home: string, config: McpConfiguration, state: string, now: number): void {
  assertMcpAuthorizationPending(home, state, now);
  const previous = withConnectorConnections(home, store => store.get(config.connectionId));
  if (previous && (previous.updated_at !== config.previousRevision || previous.disconnected_at !== config.previousDisconnectedAt)) throw connectorErrors["connector.mcp.configuration"]("连接已改变，请重新开始授权");
  const staged = connectorProtocolSecrets(home, config.sessionId);
  const final = connectorProtocolSecrets(home, config.connectionId);
  for (const name of ["oauth", "access", "expires", "client"]) {
    const value = staged.get(name);
    if (value) final.put(name, value); else final.delete(name);
  }
  const saved = { ...config, sessionId: config.connectionId };
  delete saved.previousRevision;
  delete saved.previousDisconnectedAt;
  withConnectorProtocols(home, store => store.save(saved));
  withConnectorConnections(home, store => store.saveProtocol({ connectionId: config.connectionId, serviceId: config.serviceId, displayName: config.displayName,
    endpoint: config.endpoint, credentialRef: config.mode === "none" ? null : final.reference("access"),
    refreshRef: config.mode === "oauth" ? final.reference("oauth") : null, expiresRef: config.mode === "oauth" ? final.reference("expires") : null }));
  staged.clear();
}
