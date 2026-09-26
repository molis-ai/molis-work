import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";
import { callMcpConnectionTool, completeMcpAuthorization, inspectMcpConnection, readMcpConnectionResource, McpConnectionError, startMcpConnection } from "./connector-mcp.js";
import { handleConnectorApiMethodsHttp } from "./web-connector-api-methods.js";

const PREFIX = "/api/settings/connectors/methods/mcp";
const CONNECTION = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/mcp$/u;

export async function handleConnectorMethodsHttp(request: IncomingMessage, response: ServerResponse, url: URL, home?: string): Promise<boolean> {
  if (!home) return false;
  if (await handleConnectorApiMethodsHttp(request, response, url, home)) return true;
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
      sendLocalWebJson(response, 200, { connection_id: result.connectionId, authorization_url: result.authorizationUrl,
        ...("tools" in result ? { tools: result.tools, resources: result.resources } : {}) });
      return true;
    }
    if (item && body.action === "inspect") {
      sendLocalWebJson(response, 200, await inspectMcpConnection(home, item[1]!));
      return true;
    }
    if (item && body.action === "read" && typeof body.uri === "string") {
      sendLocalWebJson(response, 200, await readMcpConnectionResource(home, item[1]!, body.uri));
      return true;
    }
    if (item && body.action === "call" && typeof body.name === "string" && body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)) {
      // This endpoint runs only an explicit user-requested tool call; connecting never calls tools.
      sendLocalWebJson(response, 200, await callMcpConnectionTool(home, item[1]!, body.name, body.arguments as Record<string, unknown>));
      return true;
    }
    throw new McpConnectionError("configuration", "请选择检查连接，或填写要调用的 MCP 工具和参数");
  } catch (error) {
    const known = error instanceof McpConnectionError;
    sendLocalWebJson(response, known && error.code === "authorization" ? 401 : 400, {
      error: known ? error.message : "MCP 操作失败，请检查连接配置后重试", code: known ? error.code : "provider",
    });
  }
  return true;
}
