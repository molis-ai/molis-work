import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { placementActions, placementGoalActions, type PlacedObject, type PlacementConvertRequest, type PlacementCreateRequest } from "@molis-ai/molis-work-contracts/services/placement";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "./web-http.js";

/** Workbench transport for placement; the bound client carries the local person's own authority. */
export async function handlePlacementHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: () => BoundActionClient): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/placement\/(describe|spaces|related|goals|link|unlink|move|copy|convert|bind-goal|create)$/u);
  if (!match) return false;
  const route = match[1]!;
  const read = route === "spaces" || route === "related" || route === "goals";
  if (request.method !== (read ? "GET" : "POST")) { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  try {
    const client = actions();
    if (route === "spaces") sendJson(response, 200, await client.invoke(placementActions.spaces, {}));
    else if (route === "related") sendJson(response, 200, await client.invoke(placementActions.related, { project_id: url.searchParams.get("project_id") ?? "" }));
    else if (route === "goals") sendJson(response, 200, await client.invoke(placementGoalActions.goals, { project_id: url.searchParams.get("project_id") ?? "" }));
    else {
      const body = await readBody(request) as Record<string, unknown>;
      const result = route === "describe" ? await client.invoke(placementActions.describe, { object: body.object as PlacedObject })
        : route === "link" ? await client.invoke(placementActions.link, { object: body.object as PlacedObject, project_id: String(body.project_id ?? "") })
        : route === "unlink" ? await client.invoke(placementActions.unlink, { key: String(body.key ?? "") })
        : route === "move" ? await client.invoke(placementActions.move, { object: body.object as PlacedObject, to_project_id: String(body.to_project_id ?? "") })
        : route === "copy" ? await client.invoke(placementActions.copy, { object: body.object as PlacedObject, to_project_id: String(body.to_project_id ?? ""), request_id: String(body.request_id ?? "") })
        : route === "bind-goal" ? await client.invoke(placementGoalActions.bindGoal, { object: body.object as PlacedObject, project_id: String(body.project_id ?? ""), goal_id: String(body.goal_id ?? "") })
        : route === "create" ? await client.invoke(placementGoalActions.create, body as unknown as PlacementCreateRequest)
        : await client.invoke(placementActions.convert, body as unknown as PlacementConvertRequest);
      sendJson(response, 200, result);
    }
  } catch (error) {
    const code = error instanceof ActionError ? error.code : "placement.failed";
    sendJson(response, code === "actions.forbidden" ? 403 : code === "actions.input_invalid" ? 400 : error instanceof ActionError ? 409 : 500,
      { code, error: error instanceof ActionError ? error.message : error instanceof Error ? error.message : "暂时处理不了，请稍后重试" });
  }
  return true;
}
