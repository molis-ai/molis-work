import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createInboxRouteHandlers, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import { readLocalWebBody, sendLocalWebJson, sendUnhandledWebError } from "@molis-ai/molis-work-app-local-host";

const match = pluginRouteMatcher(inboxManifest);

/** Exercise Inbox's route adapter the way the Runtime reaches it: the Manifest's route matched, the Runtime HTTP reader, the outer error boundary. */
export async function handleInboxTestHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: BoundActionClient) {
  try {
    const routed = match(request.method ?? "GET", url.pathname);
    if (!routed) return false;
    const body = request.method === "GET" ? {} : await readLocalWebBody(request);
    const result = await createInboxRouteHandlers({ actions, changed() {} })[routed.route_id]!({
      params: routed.params, request: { method: request.method as "GET" | "POST", pathname: url.pathname, query: url.searchParams, body: body as Record<string, unknown> },
    });
    sendLocalWebJson(response, result.status, result.body);
  } catch (error) { sendUnhandledWebError(response, error); }
  return true;
}
