import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { resolveMcpConnectionToken, MCP_SERVERS } from "./connector-mcp.js";
import { subscribeConnectorChanges } from "./connector-lifecycle.js";

export function agentMcpEndpoint(home: string, id: string): string | null {
  const config = withConnectorProtocols(home, store => store.get(id)) as { protocol: string; serviceId: string; endpoint?: string; transport?: string; mode?: string } | null;
  if (config?.protocol !== "mcp" || !config.endpoint || config.transport === "sse" || MCP_SERVERS[config.serviceId]?.stdio ||
    (config.mode === "bearer" && MCP_SERVERS[config.serviceId]?.tokenScheme)) return null;
  return config.endpoint;
}

/** Agent consumes Host references; the selected connection owns refresh and target validation. */
export function createAgentConnectorPorts(home: string, resolveToken = resolveMcpConnectionToken) {
  return {
    subscribeMcpConnections: (listener: (id: string) => void) => subscribeConnectorChanges(home, listener),
    async resolveMcpConnection(id: string, endpoint: string) {
      const row = withConnectorConnections(home, store => store.require(id));
      if (row.disconnected_at) throw new Error("所选 MCP 账号已断开，请重新连接");
      if (row.auth_method === "mcp") {
        if (!agentMcpEndpoint(home, id)) throw new Error("此连接使用服务商的原生传输，请在连接设置中使用其工具操作");
        const token = await resolveToken(home, id, endpoint);
        if (withConnectorConnections(home, store => store.require(id)).updated_at !== row.updated_at) throw new Error("MCP 账号在检查期间已改变，请重新连接");
        return { ...(token === null ? {} : { credentialRef: `connector-mcp:${id}` }), revision: row.updated_at };
      }
      return withConnectorConnections(home, store => {
        const connection = store.require(id, "mcp-bearer");
        if (store.state(connection) !== "connected") return null;
        store.assertTarget(id, "mcp-bearer", endpoint);
        return connection.credential_ref;
      });
    },
    async resolveMcpCredential(ref: string): Promise<string | null> {
      const id = /^connector-mcp:([0-9a-f-]{36})$/u.exec(ref)?.[1];
      if (id) {
        const config = withConnectorProtocols(home, store => store.get(id)) as { protocol: string; endpoint?: string } | null;
        if (config?.protocol !== "mcp" || !config.endpoint) return null;
        return resolveToken(home, id, config.endpoint);
      }
      return withConnectorConnections(home, store => {
        const row = store.list("mcp-bearer").find(item => item.credential_ref === ref);
        return row ? store.resolveToken(row.connection_id, "mcp-bearer") : null;
      });
    },
  };
}
