import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { resolveMcpConnectionToken } from "./connector-mcp.js";
import { captureMcpOperationSource, type StoredMcpConfiguration } from "./connector-mcp-configuration.js";
import { LOCAL_MCP_SERVERS, requiresMcpDeclaration } from "./connector-mcp-endpoint.js";
import { subscribeConnectorChanges } from "./connector-lifecycle.js";

export function agentMcpEndpoint(home: string, id: string): string | null {
  const config = withConnectorProtocols(home, store => store.get<StoredMcpConfiguration>(id));
  if (config?.protocol !== "mcp" || config.transport === "stdio" || !config.endpoint || config.transport === "sse" || (Object.hasOwn(LOCAL_MCP_SERVERS, config.serviceId) && LOCAL_MCP_SERVERS[config.serviceId]?.stdio) ||
    (config.mode === "bearer" && config.tokenScheme) || (requiresMcpDeclaration(config.serviceId, config.endpoint, config.transport) && !config.source)) return null;
  return config.endpoint;
}

/** Agent consumes Host references; the selected connection owns refresh and target validation. */
export function createAgentConnectorPorts(home: string, resolveToken = resolveMcpConnectionToken) {
  return {
    async saveMcpConnection(input: { label: string; endpoint: string; secret: string }) {
      const connection = withConnectorConnections(home, store => {
        const row = store.createToken({ serviceId: "mcp-bearer", displayName: input.label, token: input.secret });
        try { store.assertTarget(row.connection_id, "mcp-bearer", input.endpoint); return row; }
        catch (error) { store.remove(row.connection_id); throw error; }
      });
      return { connection_id: connection.connection_id, discard: () => { withConnectorConnections(home, store => store.remove(connection.connection_id)); } };
    },
    subscribeMcpConnections: (listener: (id: string) => void) => subscribeConnectorChanges(home, listener),
    async resolveMcpConnection(id: string, endpoint: string) {
      const row = withConnectorConnections(home, store => store.require(id));
      if (!row.enabled || row.disconnected_at) throw new Error("所选 MCP 账号已断开，请重新连接");
      if (row.auth_method === "mcp") {
        if (!agentMcpEndpoint(home, id)) throw new Error("此连接使用服务商的原生传输，请在连接设置中使用其工具操作");
        const { check, source } = await captureMcpOperationSource(home, id);
        const token = await resolveToken(home, id, endpoint);
        check();
        if (withConnectorConnections(home, store => store.require(id)).updated_at !== row.updated_at) throw new Error("MCP 账号在检查期间已改变，请重新连接");
        return { ...(token === null ? {} : { credentialRef: `connector-mcp:${id}` }), revision: source ? `${row.updated_at}:${source.installation_generation}` : row.updated_at,
          assertCurrent: check };
      }
      return withConnectorConnections(home, store => {
        const connection = store.require(id, "mcp-bearer");
        if (store.state(connection) !== "connected") return null;
        store.assertTarget(id, "mcp-bearer", endpoint);
        return { credentialRef: connection.credential_ref ?? undefined, revision: connection.updated_at };
      });
    },
    async resolveMcpCredential(ref: string): Promise<string | null> {
      const id = /^connector-mcp:([0-9a-f-]{36})$/u.exec(ref)?.[1];
      if (id) {
        const config = withConnectorProtocols(home, store => store.get(id)) as { protocol: string; endpoint?: string } | null;
        if (config?.protocol !== "mcp" || !config.endpoint) return null;
        if (!agentMcpEndpoint(home, id)) throw new Error("此连接使用服务商的原生传输，请在连接设置中使用其工具操作");
        const { check } = await captureMcpOperationSource(home, id);
        const token = await resolveToken(home, id, config.endpoint);
        check(); return token;
      }
      return withConnectorConnections(home, store => {
        const row = store.list("mcp-bearer").find(item => item.credential_ref === ref);
        return row ? store.resolveToken(row.connection_id, "mcp-bearer") : null;
      });
    },
  };
}
