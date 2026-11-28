import { handleConnectorLocalHttp } from "./web-connector-local.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, requestAbortSignal, requestHost, sendLocalWebJson } from "./web-http.js";
import { completeMcpAuthorization, inspectMcpConnection, startMcpConnection, type StartMcpConnectionInput } from "./connector-mcp.js";
import { handleConnectorApiMethodsHttp } from "./web-connector-api-methods.js";
import { connectorAuthorizationFailed } from "./connector-authorization-return.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorMcpCapabilityId, connectorMcpResourceCapabilityId, type ConnectorMcpDirectory, type ConnectorMcpTool } from "./connector-mcp-actions.js";
import { EXTERNAL_MCP_PERMISSION } from "./mcp-tool-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { captureWebSessionAuthority } from "./web-sessions.js";
import { bindLocalWebActions } from "./local-web-actions.js";

const PREFIX = "/api/settings/connectors/methods/mcp";
const CONNECTION = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/mcp$/u;

export async function handleConnectorMethodsHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string | undefined, localHost: MolisWorkLocalHost, assertAccountCurrent?: () => void): Promise<boolean> {
  const directory = localHost.connectorMcp;
  if (!home || !directory) return false;
  // Whenever the person lists a connection's tools, the shared directory follows what the server offers now.
  const remember = directory.remember;
  const sessionCurrent = captureWebSessionAuthority();
  const disconnected = requestAbortSignal(request, response, new ActionError("actions.cancelled", "连接操作已取消"));
  // An installation keeps going after the page that started it closes (ASC-07): it checks the person and the Host, not this connection.
  const assertAuthorized = () => {
    sessionCurrent();
    assertAccountCurrent?.();
    if (localHost.lifecycle() !== "running") throw connectorErrors["connector.connection.invalid"]("Host 已关闭，请重新打开接入请求");
  };
  const assertCurrent = () => {
    disconnected.signal.throwIfAborted();
    assertAuthorized();
  };
  const mcpControl = { signal: disconnected.signal, beforeDispatch: assertCurrent, assertCurrent };
  try {
    if (await handleConnectorLocalHttp(request, response, url, home, remember, assertAuthorized)) return true;
    if (await handleConnectorApiMethodsHttp(request, response, url, home, remember, assertCurrent, { signal: disconnected.signal, assertCurrent, installing: assertAuthorized })) return true;
    const item = CONNECTION.exec(url.pathname);
    if (url.pathname !== `${PREFIX}/start` && url.pathname !== `${PREFIX}/complete` && url.pathname !== `${PREFIX}/callback` && !item) return false;
    try {
      const host = requestHost(request);
      if (!host) throw connectorErrors["connector.mcp.configuration"]("授权回调必须来自本机地址");
      const origin = `http://${host}`;
      if (url.pathname === `${PREFIX}/callback` && request.method === "GET") {
        assertCurrent();
        const result = await completeMcpAuthorization(home, { state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code") ?? "", error: url.searchParams.get("error") ?? undefined, origin });
        if (!("awaiting_intent" in result)) remember(result.connectionId, result.tools, result.resources);
        response.writeHead(302, { location: "awaiting_intent" in result ? `/capabilities/connections?setup=${result.authorization_id}`
          : `/settings/connectors?connected=${encodeURIComponent(result.serviceId)}&connection=${encodeURIComponent(result.connectionId)}`, "cache-control": "no-store" });
        response.end();
        return true;
      }
      if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "不支持的 MCP 连接操作" }); return true; }
      const body = await readLocalWebBody(request);
      assertCurrent();
      if (url.pathname === `${PREFIX}/complete` && typeof body.returned_url === "string") {
        const result = await completeMcpAuthorization(home, { origin, returnedUrl: body.returned_url });
        if (!("awaiting_intent" in result)) remember(result.connectionId, result.tools, result.resources);
        sendLocalWebJson(response, 200, result);
        return true;
      }
      if (url.pathname === `${PREFIX}/start`) {
        const result = await startMcpConnection(home, {
          serviceId: typeof body.service_id === "string" ? body.service_id : "",
          displayName: typeof body.display_name === "string" ? body.display_name : "",
          endpoint: typeof body.endpoint === "string" ? body.endpoint : undefined,
          authentication: body.authentication as StartMcpConnectionInput["authentication"],
          transport: body.transport as StartMcpConnectionInput["transport"],
          clientId: typeof body.client_id === "string" ? body.client_id : undefined,
          clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
          token: typeof body.token === "string" ? body.token : undefined,
          connectionId: typeof body.connection_id === "string" ? body.connection_id : undefined,
          setupId: typeof body.setup_id === "string" ? body.setup_id : undefined,
          redirectUri: typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
          origin,
        }, mcpControl);
        assertCurrent();
        if ("tools" in result && result.tools) remember(result.connectionId, result.tools as ConnectorMcpTool[], result.resources);
        sendLocalWebJson(response, 200, { connection_id: result.connectionId, authorization_id: result.authorizationId, authorization_url: result.authorizationUrl,
          ...("awaiting_intent" in result ? { awaiting_intent: true } : {}),
          ...("tools" in result ? { tools: result.tools, resources: result.resources } : {}) });
        return true;
      }
      if (item && body.action === "inspect") {
        const inspected = await inspectMcpConnection(home, item[1]!, mcpControl);
        assertCurrent();
        remember(item[1]!, inspected.tools as ConnectorMcpTool[], inspected.resources);
        sendLocalWebJson(response, 200, inspected);
        return true;
      }
      // Reading and calling run the same registered actions workflows, Agents and granted MCP clients use; connecting never calls tools.
      if (item && body.action === "read" && typeof body.uri === "string") {
        sendLocalWebJson(response, 200, await runThroughDirectory(localHost, directory, home, item[1]!, connectorMcpResourceCapabilityId(item[1]!), { uri: body.uri },
          "此连接没有提供资源，请重新检查连接", mcpControl));
        return true;
      }
      if (item && body.action === "call" && typeof body.name === "string" && body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)) {
        sendLocalWebJson(response, 200, await runThroughDirectory(localHost, directory, home, item[1]!, connectorMcpCapabilityId(item[1]!, body.name), body.arguments as Record<string, unknown>,
          "此连接没有所选工具，请重新发现工具", mcpControl));
        return true;
      }
      throw connectorErrors["connector.mcp.configuration"]("请选择检查连接，或填写要调用的 MCP 工具和参数");
    } catch (error) {
      if (request.method === "GET" && url.pathname === `${PREFIX}/callback`) {
        connectorAuthorizationFailed(response, undefined, url.searchParams.get("error") === "access_denied");
        return true;
      }
      const mcpRefusal = error instanceof ActionError && error.code.startsWith("connector.mcp.") && Object.hasOwn(connectorErrors, error.code);
      if (mcpRefusal) {
        sendLocalWebJson(response, error.code === "connector.mcp.authorization" ? 401 : 400, { error: error.message, code: error.code });
        return true;
      }
      const serviceRefusal = error instanceof ActionError && Object.hasOwn(connectorErrors, error.code);
      if (error instanceof ActionError && !serviceRefusal) {
        sendLocalWebJson(response, error.code === "actions.reauthorize" ? 401 : 400, { error: error.message, code: error.code === "actions.reauthorize" ? "connector.mcp.authorization" : error.code });
        return true;
      }
      sendLocalWebJson(response, 400, { error: "MCP 操作失败，请检查连接配置后重试", code: "connector.mcp.provider" });
    }
    return true;
  } finally {
    disconnected.dispose();
  }
}

/** A connection never listed before is listed once, then used through the directory like any other. */
async function runThroughDirectory(localHost: MolisWorkLocalHost, directory: ConnectorMcpDirectory, home: string, connectionId: string, capabilityId: string,
  input: Record<string, unknown>, missing: string, control: { signal: AbortSignal; beforeDispatch: () => void; assertCurrent: () => void }): Promise<unknown> {
  const actions = bindLocalWebActions(localHost, undefined, [EXTERNAL_MCP_PERMISSION], { signal: control.signal, assertCurrent: control.assertCurrent });
  let reference = directory.reference(connectionId, capabilityId);
  if (!reference) {
    const inspected = await inspectMcpConnection(home, connectionId, control);
    control.assertCurrent();
    directory.remember(connectionId, inspected.tools as ConnectorMcpTool[], inspected.resources);
    reference = directory.reference(connectionId, capabilityId);
  }
  if (!reference) throw connectorErrors["connector.mcp.configuration"](missing);
  const view = await actions.discoverOne(reference);
  if (!view) throw connectorErrors["connector.mcp.configuration"](missing);
  return actions.invoke(view, input);
}
