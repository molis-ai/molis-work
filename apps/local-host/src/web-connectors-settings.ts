import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHost } from "./web-http.js";
import { L } from "./web-locale.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { feishuCliStatus, startFeishuCliLogin, startFeishuCliSetup } from "./feishu-cli.js";
import { storeGithubClientId } from "./github-oauth.js";
import { startGithubConnection, pollGithubConnection } from "./connector-github-device.js";

export async function handleLocalConnectorsSettingsHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string | undefined,
): Promise<boolean> {
  if (!homeDirectory) return false;
  const method = request.method ?? "";
  if (method === "GET" && url.pathname === "/api/settings/connectors") {
    sendJson(response, 200, { connectors: await listConnectorSettingsCards(homeDirectory) });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/settings/connectors/feishu/cli/status") {
    sendJson(response, 200, feishuCliStatus({ fresh: true }));
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/feishu/cli/setup") {
    try { sendJson(response, 200, { authorizationUrl: await startFeishuCliSetup() }); }
    catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : L("无法配置飞书 CLI") }); }
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/feishu/cli/login") {
    try { sendJson(response, 200, { authorizationUrl: await startFeishuCliLogin() }); }
    catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : L("无法开始飞书授权") }); }
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/github/client") {
    const body = await readBody(request);
    const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    if (!clientId) {
      sendJson(response, 400, { error: L("GitHub Client ID 不能为空") });
      return true;
    }
    storeGithubClientId(clientId);
    sendJson(response, 200, { connectors: await listConnectorSettingsCards(homeDirectory) });
    return true;
  }
  if (method === "POST" && ["/api/settings/connectors/github/device/start", "/api/settings/connectors/github/device/poll"].includes(url.pathname)) {
    try {
      const body = await readBody(request), origin = `http://${requestHost(request)}`;
      const result = url.pathname.endsWith("/start") ? await startGithubConnection(homeDirectory, { origin,
        clientId: typeof body.client_id === "string" ? body.client_id : undefined,
        connectionId: typeof body.connection_id === "string" ? body.connection_id : undefined,
        displayName: typeof body.display_name === "string" ? body.display_name : undefined,
        setupId: typeof body.setup_id === "string" ? body.setup_id : undefined,
      }) : await pollGithubConnection(homeDirectory, { origin, state: typeof body.state === "string" ? body.state : "" });
      sendJson(response, 200, result);
    } catch (error) { sendJson(response, 400, { error: error instanceof ActionError && error.code === "connector.connection.invalid" ? error.message : L("设备授权未完成，请重新准备接入") }); }
    return true;
  }
  return false;
}
