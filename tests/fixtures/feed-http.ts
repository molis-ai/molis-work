import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedRouteHandlers, feedManifest, type FeedPluginHttpMethod, type FeedPluginRouteResponse } from "@molis-ai/molis-work-plugin-feed";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import { readLocalWebBody, sendLocalWebJson, sendUnhandledWebError } from "@molis-ai/molis-work-app-local-host";

/** Where Feed's page routes live: its Manifest's routes, under the plugin prefix. */
export const FEED_API = "/api/plugins/io.molis.work.feed";

const match = pluginRouteMatcher(feedManifest);

export interface FeedTestRequest {
  readonly method: FeedPluginHttpMethod;
  readonly pathname: string;
  readonly query?: URLSearchParams;
  readonly body?: Readonly<Record<string, unknown>>;
}

/** Feed's route adapter the way the Runtime reaches it: the Manifest's route matched by its path under `/api/plugins/<plugin_id>/`, its handler run with the caller's actions. */
export function feedTestRoutes(actions: Pick<BoundActionClient, "invoke">) {
  const handlers = createFeedRouteHandlers({ actions });
  return {
    async handle(request: FeedTestRequest): Promise<FeedPluginRouteResponse | undefined> {
      const routed = match(request.method, request.pathname);
      if (!routed) return undefined;
      return handlers[routed.route_id]!({ params: routed.params,
        request: { method: request.method, pathname: request.pathname, query: request.query ?? new URLSearchParams(), body: request.body ?? {} } });
    },
  };
}

/** The same over HTTP, with the Runtime HTTP reader and the outer error boundary. */
export async function handleFeedTestHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: Pick<BoundActionClient, "invoke">) {
  try {
    if (!match(request.method ?? "GET", url.pathname)) return false;
    const body = request.method === "GET" ? {} : await readLocalWebBody(request);
    const result = await feedTestRoutes(actions).handle({ method: request.method as FeedPluginHttpMethod, pathname: url.pathname, query: url.searchParams,
      body: body as Record<string, unknown> });
    sendLocalWebJson(response, result!.status, result!.body);
  } catch (error) { sendUnhandledWebError(response, error); }
  return true;
}
