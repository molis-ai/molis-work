import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";
import { completeMcpAuthorization, inspectMcpConnection, McpConnectionError, startMcpConnection } from "./connector-mcp.js";
import { handleConnectorApiMethodsHttp } from "./web-connector-api-methods.js";
import { connectorAuthorizationFailed } from "./connector-authorization-return.js";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorMcpCapabilityId, connectorMcpResourceCapabilityId, type ConnectorMcpDirectory, type ConnectorMcpTool } from "./connector-mcp-actions.js";
import { EXTERNAL_MCP_PERMISSION } from "./mcp-tool-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const PREFIX = "/api/settings/connectors/methods/mcp";
const CONNECTION = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/mcp$/u;

/** The person at this computer, running a tool or reading a resource of their own connection from its settings page. */
const LOCAL_USER: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [EXTERNAL_MCP_PERMISSION] };

export async function handleConnectorMethodsHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string | undefined, localHost: MolisWorkLocalHost): Promise<boolean> {
  const directory = localHost.connectorMcp;
  if (!home || !directory) return false;
  // Whenever the person lists a connection's tools, the shared directory follows what the server offers now.
  const remember = directory.remember;
  if (await handleConnectorApiMethodsHttp(request, response, url, home, remember)) return true;
  const item = CONNECTION.exec(url.pathname);
  if (url.pathname !== `${PREFIX}/start` && url.pathname !== `${PREFIX}/complete` && url.pathname !== `${PREFIX}/callback` && !item) return false;
  try {
    const host = requestHost(request);
    if (!host) throw new McpConnectionError("configuration", "授权回调必须来自本机地址");
    const origin = `http://${host}`;
    if (url.pathname === `${PREFIX}/callback` && request.method === "GET") {
      const result = await completeMcpAuthorization(home, { state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code") ?? "", error: url.searchParams.get("error") ?? undefined, origin });
      response.writeHead(302, { location: `/settings/connectors?connected=${encodeURIComponent(result.serviceId)}&connection=${encodeURIComponent(result.connectionId)}`, "cache-control": "no-store" });
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
      sendLocalWebJson(response, 200, { connection_id: result.connectionId, authorization_id: result.authorizationId, authorization_url: result.authorizationUrl,
        ...("tools" in result ? { tools: result.tools, resources: result.resources } : {}) });
      return true;
    }
    if (item && body.action === "inspect") {
      const inspected = await inspectMcpConnection(home, item[1]!);
      remember(item[1]!, inspected.tools as ConnectorMcpTool[], inspected.resources);
      sendLocalWebJson(response, 200, inspected);
      return true;
    }
    // Reading and calling run the same registered actions workflows, Agents and granted MCP clients use; connecting never calls tools.
    if (item && body.action === "read" && typeof body.uri === "string") {
      sendLocalWebJson(response, 200, await runThroughDirectory(localHost, directory, home, item[1]!, connectorMcpResourceCapabilityId(item[1]!), { uri: body.uri },
        "此连接没有提供资源，请重新检查连接"));
      return true;
    }
    if (item && body.action === "call" && typeof body.name === "string" && body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)) {
      sendLocalWebJson(response, 200, await runThroughDirectory(localHost, directory, home, item[1]!, connectorMcpCapabilityId(item[1]!, body.name), body.arguments as Record<string, unknown>,
        "此连接没有所选工具，请重新发现工具"));
      return true;
    }
    throw new McpConnectionError("configuration", "请选择检查连接，或填写要调用的 MCP 工具和参数");
  } catch (error) {
    if (request.method === "GET" && url.pathname === `${PREFIX}/callback`) {
      connectorAuthorizationFailed(response, undefined, url.searchParams.get("error") === "access_denied");
      return true;
    }
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

/** A connection never listed before is listed once, then used through the directory like any other. */
async function runThroughDirectory(localHost: MolisWorkLocalHost, directory: ConnectorMcpDirectory, home: string, connectionId: string, capabilityId: string,
  input: Record<string, unknown>, missing: string): Promise<unknown> {
  let reference = directory.reference(connectionId, capabilityId);
  if (!reference) {
    const inspected = await inspectMcpConnection(home, connectionId);
    directory.remember(connectionId, inspected.tools as ConnectorMcpTool[], inspected.resources);
    reference = directory.reference(connectionId, capabilityId);
  }
  if (!reference) throw new McpConnectionError("configuration", missing);
  return localHost.homeActionClient().invoke(LOCAL_USER, reference, input);
}
