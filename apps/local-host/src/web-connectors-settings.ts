import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { listConnectorSettingsCards } from "./connector-directory.js";

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
  return false;
}
