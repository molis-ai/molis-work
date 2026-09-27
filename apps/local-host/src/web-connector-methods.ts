import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";
import { callMcpConnectionTool, completeMcpAuthorization, inspectMcpConnection, readMcpConnectionResource, McpConnectionError, startMcpConnection } from "./connector-mcp.js";
import { handleConnectorApiMethodsHttp } from "./web-connector-api-methods.js";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorMcpCapabilityId, connectorMcpResourceCapabilityId, type ConnectorMcpTool } from "./connector-mcp-actions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const PREFIX = "/api/settings/connectors/methods/mcp";
const CONNECTION = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/mcp$/u;

export async function handleConnectorMethodsHttp(request: IncomingMessage, response: ServerResponse, url: URL, home?: string, localHost?: MolisWorkLocalHost): Promise<boolean> {
  if (!home) return false;
  // Whenever the person lists a connection's tools, the shared directory follows what the server offers now.
  const remember = (connectionId: string, tools: readonly ConnectorMcpTool[], resources?: readonly unknown[]) => localHost?.connectorMcp?.remember(connectionId, tools, resources);
  if (await handleConnectorApiMethodsHttp(request, response, url, home, remember)) return true;
  const item = CONNECTION.exec(url.pathname);
  if (url.pathname !== `${PREFIX}/start` && url.pathname !== `${PREFIX}/complete` && url.pathname !== `${PREFIX}/callback` && !item) return false;
  try {
    const host = requestHost(request);
    if (!host) throw new McpConnectionError("configuration", "授权回调必须来自本机地址");
    const origin = `http://${host}`;
    if (url.pathname === `${PREFIX}/callback` && request.method === "GET") {
      const result = await completeMcpAuthorization(home, { state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code") ?? "", error: url.searchParams.get("error") ?? undefined, origin });
      response.writeHead(302, { location: `/settings/connectors?connector=${encodeURIComponent(result.serviceId)}`, "cache-control": "no-store" });
      response.end();
      return true;
    }
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "不支持的 MCP 连接操作" }); return true; }
    const body = await readLocalWebBody(request);
    if (url.pathname === `${PREFIX}/complete` && typeof body.returned_url === "string") {
      sendLocalWebJson(response, 200, await completeMcpAuthorization(home, { origin, returnedUrl: body.returned_url }));
      return true;
    }
    if (url.pathname === `${PREFIX}/start`) {
      const result = await startMcpConnection(home, {
        serviceId: typeof body.service_id === "string" ? body.service_id : "",
        displayName: typeof body.display_name === "string" ? body.display_name : "",
        endpoint: typeof body.endpoint === "string" ? body.endpoint : undefined,
        clientId: typeof body.client_id === "string" ? body.client_id : undefined,
        clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
        token: typeof body.token === "string" ? body.token : undefined,
        connectionId: typeof body.connection_id === "string" ? body.connection_id : undefined,
        redirectUri: typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
        origin,
      });
      if ("tools" in result && result.tools) remember(result.connectionId, result.tools as ConnectorMcpTool[], result.resources);
      sendLocalWebJson(response, 200, { connection_id: result.connectionId, authorization_url: result.authorizationUrl,
        ...("tools" in result ? { tools: result.tools, resources: result.resources } : {}) });
      return true;
    }
    if (item && body.action === "inspect") {
      const inspected = await inspectMcpConnection(home, item[1]!);
      remember(item[1]!, inspected.tools as ConnectorMcpTool[], inspected.resources);
      sendLocalWebJson(response, 200, inspected);
      return true;
    }
    if (item && body.action === "read" && typeof body.uri === "string") {
      sendLocalWebJson(response, 200, localHost?.connectorMcp
        ? await readThroughDirectory(localHost, home, item[1]!, body.uri, remember)
        : await readMcpConnectionResource(home, item[1]!, body.uri));
      return true;
    }
    if (item && body.action === "call" && typeof body.name === "string" && body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)) {
      // This endpoint runs only an explicit user-requested tool call; connecting never calls tools.
      // With a Host it is the same registered action workflows, Agents and granted MCP clients use.
      if (!localHost?.connectorMcp) sendLocalWebJson(response, 200, await callMcpConnectionTool(home, item[1]!, body.name, body.arguments as Record<string, unknown>));
      else sendLocalWebJson(response, 200, await callThroughDirectory(localHost, home, item[1]!, body.name, body.arguments as Record<string, unknown>, remember));
      return true;
    }
    throw new McpConnectionError("configuration", "请选择检查连接，或填写要调用的 MCP 工具和参数");
  } catch (error) {
    if (error instanceof ActionError) {
      sendLocalWebJson(response, error.code === "actions.reauthorize" ? 401 : 400, { error: error.message, code: error.code === "actions.reauthorize" ? "authorization" : error.code });
      return true;
    }
    const known = error instanceof McpConnectionError;
    sendLocalWebJson(response, known && error.code === "authorization" ? 401 : 400, {
      error: known ? error.message : "MCP 操作失败，请检查连接配置后重试", code: known ? error.code : "provider",
    });
  }
  return true;
}

type Remember = (connectionId: string, tools: readonly ConnectorMcpTool[], resources?: readonly unknown[]) => void;
async function throughDirectory(localHost: MolisWorkLocalHost, home: string, connectionId: string, capabilityId: string, input: Record<string, unknown>, remember: Remember, missing: string): Promise<unknown> {
  const actions = bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS);
  const providerId = `system.connectors#mcp:${connectionId}`;
  const find = async () => (await actions.discover()).find(view => view.capability_id === capabilityId && view.provider.provider_id === providerId);
  let view = await find();
  if (!view) {
    // A connection never listed before is listed once, then used through the directory like any other.
    const inspected = await inspectMcpConnection(home, connectionId);
    remember(connectionId, inspected.tools as ConnectorMcpTool[], inspected.resources);
    view = await find();
  }
  if (!view) throw new McpConnectionError("configuration", missing);
  const reference = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  return actions.invoke(reference as unknown as ActionDefinition<Record<string, unknown>, unknown>, input);
}
const callThroughDirectory = (localHost: MolisWorkLocalHost, home: string, connectionId: string, name: string, args: Record<string, unknown>, remember: Remember) =>
  throughDirectory(localHost, home, connectionId, connectorMcpCapabilityId(connectionId, name), args, remember, "此连接没有所选工具，请重新发现工具");
const readThroughDirectory = (localHost: MolisWorkLocalHost, home: string, connectionId: string, uri: string, remember: Remember) =>
  throughDirectory(localHost, home, connectionId, connectorMcpResourceCapabilityId(connectionId), { uri }, remember, "此连接没有提供资源，请重新检查连接");
