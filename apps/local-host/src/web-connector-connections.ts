import { agentMcpEndpoint } from "./agent-connector-ports.js";
import { connectorAuthorizationStatus } from "./connector-authorization-status.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { ConnectorConnectionError, withConnectorConnections } from "./connector-connection-store.js";
import { HOST_CONNECTOR_DIRECTORY } from "./connector-directory.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";

import { refreshFeedConnectionState } from "./connector-source-state.js";
export { refreshFeedConnectionState } from "./connector-source-state.js";

const ITEM_PATH = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)$/u;

export function listConnectorConnectionViews(homeDirectory: string, serviceId?: string) {
  return withConnectorConnections(homeDirectory, (store) => store.list(serviceId).map((row) => {
    const endpoint = row.auth_method === "mcp" ? agentMcpEndpoint(homeDirectory, row.connection_id) : null;
    const view = { ...store.view(row), ...(row.auth_method === "mcp" ? { agent_available: Boolean(endpoint), ...(endpoint ? { mcp_endpoint: endpoint } : {}) } : {}) };
    if (row.source !== "external" || row.disconnected_at) return view;
    // A CLI account stays usable while the CLI configuration that verified it is still there.
    const configuration = withConnectorProtocols(homeDirectory, protocols => protocols.get(row.connection_id));
    return configuration?.protocol === "cli" && configuration.serviceId === row.service_id ? view : { ...view, state: "reauth_required" as const };
  }));
}

export async function handleConnectorConnectionsHttp(
  request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory?: string,
): Promise<boolean> {
  if (!homeDirectory) return false;
  const authorization = /^\/api\/settings\/connectors\/authorizations\/([0-9a-f-]{36})$/u.exec(url.pathname);
  if (authorization && request.method === "GET") {
    const result = connectorAuthorizationStatus(homeDirectory, authorization[1]!);
    sendJson(response, result ? 200 : 404, result ?? { error: "授权记录已失效，请重新登录" });
    return true;
  }
  const collection = url.pathname === "/api/settings/connectors/connections";
  const item = url.pathname.match(ITEM_PATH);
  if (!collection && !item) return false;
  try {
    if (request.method === "GET" && collection) {
      const serviceId = url.searchParams.get("service_id") || undefined;
      const connections = listConnectorConnectionViews(homeDirectory, serviceId);
      sendJson(response, 200, { connections });
      return true;
    }
    if (request.method === "GET" && item) {
      const result = withConnectorConnections(homeDirectory, store => {
        const row = store.require(item[1]!);
        const protocol = withConnectorProtocols(homeDirectory, protocols => protocols.get(row.connection_id));
        return { connection: store.view(row), revision: row.updated_at,
          authorization_flow: protocol?.protocol === "oauth" ? "oauth" : "account" };
      });
      sendJson(response, 200, result);
      return true;
    }
    if (request.method === "POST" && collection) {
      const body = await readLocalWebBody(request);
      const service = HOST_CONNECTOR_DIRECTORY.find(entry => entry.connector_id === body.service_id);
      if (!service?.method_options?.some(method => method.kind === "token" && method.support === "paste")) throw new ConnectorConnectionError("invalid", "此服务不提供可粘贴的 API 凭据，请使用列出的连接方式");
      const connection = withConnectorConnections(homeDirectory, (store) => store.createToken({
        serviceId: body.service_id as string, displayName: body.display_name as string,
        token: body.token as string,
        accountLabel: typeof body.account_label === "string" ? body.account_label : null,
      }));
      const view = withConnectorConnections(homeDirectory, (store) => store.view(connection));
      sendJson(response, 201, { connection: view });
      return true;
    }
    if (item && request.method === "PATCH") {
      const body = await readLocalWebBody(request);
      const connection = withConnectorConnections(homeDirectory, (store) => {
        let updated = store.require(item[1]!);
        if (typeof body.display_name === "string") updated = store.rename(updated.connection_id, body.display_name);
        if (typeof body.token === "string") updated = store.replaceToken(updated.connection_id, body.token);
        return store.view(updated);
      });
      if (typeof body.token === "string") refreshFeedConnectionState(homeDirectory, item[1]!);
      sendJson(response, 200, { connection });
      return true;
    }
    if (item && request.method === "DELETE") {
      const connection = withConnectorConnections(homeDirectory, (store) => store.view(store.disconnect(item[1]!)));
      refreshFeedConnectionState(homeDirectory, item[1]!);
      sendJson(response, 200, { connection });
      return true;
    }
    sendJson(response, 405, { error: "不支持的连接操作" });
  } catch (error) {
    const known = error instanceof ConnectorConnectionError;
    sendJson(response, known && error.code === "not_found" ? 404 : 400, {
      error: known ? error.message : "连接操作失败，请检查本机凭据存储和输入",
      ...(known ? { code: error.code } : {}),
    });
  }
  return true;
}
