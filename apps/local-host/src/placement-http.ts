import { pluginRouteControl } from "./plugin-route-control.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { placementActions, placementAttachActions, type PlacedObject, type PlacementConvertRequest, type PlacementCreateRequest } from "@molis-ai/molis-work-contracts/services/placement";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "./web-http.js";

/** Workbench transport for placement; the bound client carries the local person's own authority. */
export async function handlePlacementHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: () => BoundActionClient): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/placement\/(describe|spaces|related|attach-targets|link|unlink|move|copy|convert|attach|create)$/u);
  if (!match) return false;
  const route = match[1]!;
  const read = route === "spaces" || route === "related";
  if (request.method !== (read ? "GET" : "POST")) { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  try {
    const client = actions();
    if (route === "spaces") sendJson(response, 200, await client.invoke(placementActions.spaces, {}));
    else if (route === "related") sendJson(response, 200, await client.invoke(placementActions.related, { project_id: url.searchParams.get("project_id") ?? "" }));
    else {
      const body = await readBody(request) as Record<string, unknown>;
      const page = pluginPageRequest(request);
      const control = page ? pluginRouteControl(page.signal, page.assertCurrent) : undefined;
      const result = route === "describe" ? await client.invoke(placementActions.describe, { object: page ? page.ownedObject(body.object as PlacedObject) : body.object as PlacedObject }, control)
        : route === "link" ? await client.invoke(placementActions.link, { object: body.object as PlacedObject, project_id: String(body.project_id ?? "") })
        : route === "unlink" ? await client.invoke(placementActions.unlink, { key: String(body.key ?? "") })
        : route === "attach-targets" ? await client.invoke(placementAttachActions.targets, { project_id: String(body.project_id ?? ""), object: body.object as PlacedObject })
        : route === "move" ? await client.invoke(placementActions.move, { object: body.object as PlacedObject, to_project_id: String(body.to_project_id ?? "") })
        : route === "copy" ? await client.invoke(placementActions.copy, { object: body.object as PlacedObject, to_project_id: String(body.to_project_id ?? ""), request_id: String(body.request_id ?? "") })
        : route === "attach" ? await client.invoke(placementAttachActions.attach, { object: body.object as PlacedObject, project_id: String(body.project_id ?? ""),
          target: body.target as { kind: string; id: string }, ...(typeof body.read_revision === "string" && body.read_revision ? { read_revision: body.read_revision } : {}),
          ...(body.mode === "live" || body.mode === "fixed" ? { mode: body.mode } : {}),
          ...(body.material_ref && typeof body.material_ref === "object" ? { material_ref: body.material_ref as MaterialRef } : {}) })
        : route === "create" ? await client.invoke(placementAttachActions.create, body as unknown as PlacementCreateRequest)
        : await client.invoke(placementActions.convert, { ...body as unknown as PlacementConvertRequest, ...(page ? { source: page.ownedObject(body.source as PlacedObject) } : {}) }, control);
      page?.assertCurrent(); sendJson(response, 200, result);
    }
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
  return true;
}
