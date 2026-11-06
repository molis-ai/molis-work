import type { IncomingMessage, ServerResponse } from "node:http";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorManagementActions } from "./connector-management-actions.js";
import { connectorUsagesAction } from "./connector-usage-actions.js";
import { connectorUsagesSwitchAction } from "./connector-usage-switch.js";
import { readLocalWebBody, sendLocalWebJson as json } from "./web-http.js";

/**
 * Settings checks use the common owner action for both Home and project connections. Where a connection is used, and moving those uses
 * to another account of the service (ASC-59), are the same registered actions Agents and MCP see; the page adds no check of its own.
 */
export async function handleConnectionActionsHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: BoundActionClient): Promise<boolean> {
  const match = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)(?:\/(verify|preview|manage|usages|switch))?$/.exec(url.pathname);
  if (!match || !match[1]!.startsWith("mcp-") && !["verify", "manage", "usages", "switch"].includes(match[2] ?? "")) return false;
  const connection_id = match[1]!;
  try {
    if (request.method === "POST" && match[2] === "verify") json(response, 200, await actions.invoke(connectorManagementActions.check, { connection_id }));
    else if (request.method === "POST" && match[2] === "manage") {
      const body = await readLocalWebBody(request);
      json(response, 200, body.action === "remove"
        ? await actions.invoke(connectorManagementActions.remove, { connection_id, expected_revision: body.expected_revision })
        : await actions.invoke(connectorManagementActions.control, { connection_id, action: body.action, expected_revision: body.expected_revision }));
    } else if (request.method === "GET" && match[2] === "usages") json(response, 200, await actions.invoke(connectorUsagesAction, { connection_id }));
    // The connection in the address is the one switched to; the body names only the one switched from. Anything else in the body is
    // refused by the action's own input schema (S-108), never read as who is asking.
    else if (request.method === "POST" && match[2] === "switch") {
      const input = { ...await readLocalWebBody(request), to_connection_id: connection_id } as { from_connection_id: string; to_connection_id: string };
      json(response, 200, await actions.invoke(connectorUsagesSwitchAction, input));
    }
    else if (request.method === "GET" && !match[2] || request.method === "POST" && match[2] === "preview") {
      const connection = (await actions.invoke(connectorManagementActions.list, {})).connections.find(row => row.connection_id === connection_id);
      json(response, connection ? 200 : 404, connection ? { connection, ...(connection.source === "project_mcp" ? { tools: connection.tools } : {}) } : { error: "没有这条项目 MCP 连接" });
    } else json(response, 405, { error: "不支持的连接操作" });
  } catch (error) { const failure = actionErrorResponse(error); json(response, failure.status, failure.body); }
  return true;
}
