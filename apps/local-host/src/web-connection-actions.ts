import type { IncomingMessage, ServerResponse } from "node:http";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorManagementActions } from "./connector-management-actions.js";
import { readLocalWebBody, sendLocalWebJson as json } from "./web-http.js";

/** Settings checks use the common owner action for both Home and project connections. */
export async function handleConnectionActionsHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: BoundActionClient): Promise<boolean> {
  const match = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)(?:\/(verify|preview|manage))?$/.exec(url.pathname);
  if (!match || !match[1]!.startsWith("mcp-") && match[2] !== "verify" && match[2] !== "manage") return false;
  const connection_id = match[1]!;
  try {
    if (request.method === "POST" && match[2] === "verify") json(response, 200, await actions.invoke(connectorManagementActions.check, { connection_id }));
    else if (request.method === "POST" && match[2] === "manage") {
      const body = await readLocalWebBody(request);
      json(response, 200, body.action === "remove"
        ? await actions.invoke(connectorManagementActions.remove, { connection_id, expected_revision: body.expected_revision })
        : await actions.invoke(connectorManagementActions.control, { connection_id, action: body.action, expected_revision: body.expected_revision }));
    } else if (request.method === "GET" && !match[2] || request.method === "POST" && match[2] === "preview") {
      const connection = (await actions.invoke(connectorManagementActions.list, {})).connections.find(row => row.connection_id === connection_id);
      json(response, connection ? 200 : 404, connection ? { connection, ...(connection.source === "project_mcp" ? { tools: connection.tools } : {}) } : { error: "没有这条项目 MCP 连接" });
    } else json(response, 405, { error: "不支持的连接操作" });
  } catch (error) { const failure = actionErrorResponse(error); json(response, failure.status, failure.body); }
  return true;
}
