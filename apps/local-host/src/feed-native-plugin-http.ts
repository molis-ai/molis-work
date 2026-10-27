import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { optionalPluginQuery } from "./web-view.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { feedRuleActions, FeedPluginRouteTable, createFeedRouteHandlers, type FeedPluginRouteResponse } from "@molis-ai/molis-work-plugin-feed";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import { listFeedSourceCatalog } from "./source-vocabulary.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { writeNativePluginJsonResponse } from "./native-plugin-http.js";

export interface FeedNativePluginHttpOptions {
  readonly actions: BoundActionClient;
  readonly renderer: Pick<WorkbenchRenderer, "renderFeedWorkbenchFragment" | "renderPersistedFeedItemDetail">;
  readonly projectId: string;
  readonly routePrefix: string;
  readonly store: LocalProjectDatabase;
  readonly readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>;
  readonly invalidateWebView: () => void;
  readonly homeDirectory?: string;
}

export async function handleFeedNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: FeedNativePluginHttpOptions,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/feed")) {
    return false;
  }
  const method = request.method;
  if (!method || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  const routes = new FeedPluginRouteTable(createHandlers(options));
  // The body is read inside the try: a body that is too large or not JSON is a coded failure like any other, not an error that escapes the edge.
  try {
    const body = await readNativePluginJsonBody(request, 256_000);
    const result = await routes.handle({
      method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    writeResponse(response, result);
    return true;
  } catch (error) {
    writeResponse(response, actionErrorResponse(error));
    return true;
  }
}

function createHandlers(options: FeedNativePluginHttpOptions): ReturnType<typeof createFeedRouteHandlers> {
  return createFeedRouteHandlers({
    actions: options.actions,
    routePrefix: options.routePrefix,
    inboxEntries: async () => (await optionalPluginQuery(options.actions, inboxActions.list, {}))?.entries ?? [],
    changed: () => options.invalidateWebView(),
    hydrateItem: async item => {
      const { recommendations } = await options.actions.invoke(feedRuleActions.recommendations, {});
      return { ...item, suggested_behavior_ids: recommendations.find(result => result.item_id === item.item_id)?.suggested_behavior_ids ?? [] };
    },
    hydrateSnapshot: async snapshot => {
      const current = (await options.readWebView()).feed;
      const items = new Map(current.feed_items.map(item => [item.item_id, item]));
      return { ...snapshot, out_rules: current.out_rules, inbox_entries: current.inbox_entries,
        feed_items: snapshot.feed_items.map(item => ({ ...item,
          suggested_behavior_ids: items.get(item.item_id)?.suggested_behavior_ids ?? [] })),
      };
    },
    sourceCatalog: listFeedSourceCatalog,
    renderWorkbench: async () => options.renderer.renderFeedWorkbenchFragment(await options.readWebView()),
    renderDetail: (item, detail) => options.renderer.renderPersistedFeedItemDetail(item, options.routePrefix, detail),
  });
}

function writeResponse(response: ServerResponse, result: FeedPluginRouteResponse): void {
  if (result.redirect) {
    response.writeHead(result.status, { location: result.redirect, "cache-control": "no-store", ...result.headers });
    response.end();
    return;
  }
  if (result.html != null) {
    response.writeHead(result.status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...result.headers });
    response.end(result.html);
    return;
  }
  writeNativePluginJsonResponse(response, result);
}
