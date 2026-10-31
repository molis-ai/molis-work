import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { feishuCliStatus, startFeishuCliLogin, startFeishuCliSetup } from "./feishu-cli.js";

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
  return false;
}
