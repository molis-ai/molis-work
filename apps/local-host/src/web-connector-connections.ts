import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorManagementActions } from "./connector-management-actions.js";
import { handleConnectionActionsHttp } from "./web-connection-actions.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { cancelConnectorAuthorization, connectorAuthorizationStatus } from "./connector-authorization-status.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { controlConnectorConnection } from "./connector-management-service.js";
import { connectorDirectory } from "./connector-directory.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { startConnectorSetupSubmission } from "./connector-setup-submission.js";
import { activateConnectorConnection, type ConnectorActivation } from "./connector-activation.js";
import { verifyEnabledConnection } from "./connector-check-service.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

const ITEM_PATH = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)$/u;


export async function handleConnectorConnectionsHttp(
  request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory?: string,
  remember?: ConnectorMcpDirectory["remember"],
  actions?: BoundActionClient,
): Promise<boolean> {
  if (!homeDirectory) return false;
  if (actions && await handleConnectionActionsHttp(request, response, url, actions)) return true;
  const authorization = /^\/api\/settings\/connectors\/authorizations\/([0-9a-f-]{36})$/u.exec(url.pathname);
  if (authorization && ["GET", "DELETE"].includes(request.method ?? "")) {
    const result = request.method === "DELETE" ? cancelConnectorAuthorization(homeDirectory, authorization[1]!) : connectorAuthorizationStatus(homeDirectory, authorization[1]!);
    sendJson(response, result ? 200 : 404, result ?? { error: "授权记录已失效，请重新登录" });
    return true;
  }
  const collection = url.pathname === "/api/settings/connectors/connections";
  const item = url.pathname.match(ITEM_PATH);
  if (!collection && !item) return false;
  try {
    if (request.method === "GET" && collection) {
      const serviceId = url.searchParams.get("service_id") || undefined;
      const connections = actions ? (await actions.invoke(connectorManagementActions.list, { service_id: serviceId })).connections : listConnectorConnectionViews(homeDirectory, serviceId);
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
      // The card and the package behind it are read from one registry with nothing awaited between them: a package detached in between
      // would leave a card with no declarer, and a connection made unpinned that another publisher's package could then use (T-134).
      const registry = await homeIntegrationRegistry(homeDirectory);
      const service = connectorDirectory(registry).find(entry => entry.connector_id === body.service_id);
      if (!service?.method_options?.some(method => method.kind === "token" && method.support === "paste")) throw connectorErrors["connector.connection.invalid"]("此服务不提供可粘贴的 API 凭据，请使用列出的连接方式");
      // A signed package's service: the new connection is pinned to the package that declares it now, read from the Home's registry, never from the body (T-134).
      const declarer = registry.connectionDeclarer(service.connector_id);
      const setup = startConnectorSetupSubmission(homeDirectory, typeof body.setup_id === "string" ? body.setup_id : undefined, { service_id: body.service_id as string, method: "token" });
      try {
        setup?.assertCurrent();
        const completion: ConnectorActivation = { kind: "token", input: {
          serviceId: body.service_id as string, displayName: body.display_name as string,
          token: body.token as string, accountLabel: typeof body.account_label === "string" ? body.account_label : null,
        }, ...(declarer ? { declarer } : {}) };
        const result = setup ? setup.submit(completion) : { connection: activateConnectorConnection(homeDirectory, completion) };
        sendJson(response, "status" in result && result.status === "pending" ? 202 : 201, result);
      } catch (error) { setup?.fail(); throw error; }
      return true;
    }
    if (item && request.method === "PATCH") {
      const body = await readLocalWebBody(request);
      const completion: ConnectorActivation | undefined = typeof body.token === "string" ? withConnectorConnections(homeDirectory, store => {
        const current = store.require(item[1]!);
        return { kind: "token", input: { serviceId: current.service_id, displayName: typeof body.display_name === "string" ? body.display_name : current.display_name, token: body.token as string },
          target: { connectionId: current.connection_id, expectedRevision: current.updated_at } };
      }) : undefined;
      const setup = completion ? startConnectorSetupSubmission(homeDirectory, typeof body.setup_id === "string" ? body.setup_id : undefined,
        { service_id: completion.input.serviceId, method: "token", connection_id: item[1]! }) : undefined;
      if (setup && completion) {
        try {
          const result = setup.submit(completion);
          sendJson(response, result.status === "pending" ? 202 : 200, result); return true;
        } catch (error) { setup.fail(); throw error; }
      }
      const connection = completion ? activateConnectorConnection(homeDirectory, completion) : withConnectorConnections(homeDirectory, (store) => {
        let updated = store.require(item[1]!);
        if (typeof body.display_name === "string") updated = store.rename(updated.connection_id, body.display_name);
        return store.view(updated);
      });
      if (typeof body.enabled === "boolean") {
        const result = controlConnectorConnection(homeDirectory, item[1]!, body.enabled ? "enable" : "disable");
        const verification = body.enabled && remember ? await verifyEnabledConnection(homeDirectory, item[1]!, remember) : undefined;
        sendJson(response, 200, { ...result, ...(verification ? { verification } : {}) }); return true;
      }
      sendJson(response, 200, { connection });
      return true;
    }
    if (item && request.method === "DELETE") {
      sendJson(response, 200, controlConnectorConnection(homeDirectory, item[1]!, "disconnect"));
      return true;
    }
    sendJson(response, 405, { error: "不支持的连接操作" });
  } catch (error) {
    const known = (error instanceof ActionError && ["connector.connection.invalid","connector.connection.not_found","connector.connection.service_mismatch","connector.connection.disconnected"].includes(error.code));
    sendJson(response, known && error.code === "connector.connection.not_found" ? 404 : 400, {
      error: known ? error.message : "连接操作失败，请检查本机凭据存储和输入",
      ...(known ? { code: error.code } : {}),
    });
  }
  return true;
}
