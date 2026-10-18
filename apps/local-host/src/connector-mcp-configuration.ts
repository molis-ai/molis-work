import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import type { McpConfiguration } from "./connector-mcp.js";
import type { LocalMcpConfiguration } from "./connector-local-mcp.js";

export type StoredMcpConfiguration = McpConfiguration | LocalMcpConfiguration;

/** Protocol owner validates remote addresses and local launch configurations on their separate paths. */
export function activeMcpConfiguration(home: string, id: string, endpointFor: (service: string, endpoint: string) => string): StoredMcpConfiguration {
  const connection = withConnectorConnections(home, store => store.require(id));
  if (connection.auth_method !== "mcp" || !connection.enabled || connection.disconnected_at) throw connectorErrors["connector.mcp.disconnected"]("MCP 连接已断开，请重新连接");
  const config = withConnectorProtocols(home, store => store.get<StoredMcpConfiguration>(id));
  if (!config || config.protocol !== "mcp" || config.serviceId !== connection.service_id) throw connectorErrors["connector.mcp.configuration"]("MCP 连接配置缺失，请重新连接");
  if (config.transport !== "stdio") endpointFor(config.serviceId, config.endpoint);
  return config;
}
