import type { IncomingMessage, ServerResponse } from "node:http";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { submitLocalMcpSetup } from "./connector-local-submission.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

/** Values go straight from the authenticated local page to the secret owner, never through an action ledger. */
export async function handleConnectorLocalHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string, remember: ConnectorMcpDirectory["remember"], beforeEffect: () => void) {
  if (url.pathname !== "/api/settings/connectors/methods/local/connect") return false;
  try {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "请提交本地接入方案" }); return true; }
    const body = await readLocalWebBody(request);
    if (typeof body.setup_id !== "string" || !body.environment || typeof body.environment !== "object" || Array.isArray(body.environment) || Object.keys(body).some(key => !["setup_id", "environment"].includes(key))) throw connectorErrors["connector.mcp.configuration"]("请从本次接入页面提交凭据");
    sendLocalWebJson(response, 200, await submitLocalMcpSetup(home, body.setup_id, body.environment as Record<string, string>, remember, { beforeEffect }));
  } catch (error) { const result = actionErrorResponse(error); sendLocalWebJson(response, result.status, result.body); }
  return true;
}
