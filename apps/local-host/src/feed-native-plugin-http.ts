import type { IncomingMessage, ServerResponse } from "node:http";
import { feedRuleActions, FeedPluginRouteTable, createFeedRouteHandlers, feedRouteErrorResponse, type FeedApplication, type FeedPluginRouteResponse } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import type { GoalProjectApplication } from "./goal-project-application.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { createLocalFeedSourceService, listFeedSourceCatalog } from "./feed-source-service.js";
import { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";
import { hydrateFeedItemContent, hydrateFeedSnapshotContent } from "./feed-content.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

export interface FeedNativePluginHttpOptions {
  readonly actions: BoundActionClient;
  readonly renderer: Pick<WorkbenchRenderer, "renderFeedWorkbenchFragment" | "renderPersistedFeedItemDetail">;
  readonly boardId: string;
  readonly routePrefix: string;
  readonly databasePath: string;
  readonly store: LocalProjectDatabase;
  readonly coordinator: GoalProjectApplication;
  readonly readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>;
  readonly invalidateWebView: () => void;
  readonly homeDirectory?: string;
  readonly feedOptions?: LocalFeedApplicationOptions;
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
  const body = method === "GET" || method === "DELETE" ? await readOptionalBody(request) : await readBody(request);
  const session = createHandlers(options);
  const routes = new FeedPluginRouteTable(session.handlers);
  try {
    const result = await routes.handle({
      method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    await session.feed.flushPendingJudgments();
    writeResponse(response, result);
    return true;
  } catch (error) {
    writeResponse(response, feedRouteErrorResponse(error));
    return true;
  }
}

function createHandlers(options: FeedNativePluginHttpOptions): { handlers: ReturnType<typeof createFeedRouteHandlers>; feed: FeedApplication } {
  const feed = createLocalFeedApplication(options.store.db, options.feedOptions);
  return {
    feed,
    handlers: createFeedRouteHandlers({
      actions: options.actions,
      boardId: options.boardId, routePrefix: options.routePrefix,
      feed: () => feed,
      sources: () => createLocalFeedSourceService(options.store.db, options.boardId, undefined, undefined, options.homeDirectory, options.feedOptions),
      connectors: () => createLocalFeedConnectorService(options.store.db, options.boardId, undefined, options.homeDirectory, options.feedOptions),
      changed: () => options.invalidateWebView(),
      hydrateItem: async item => {
        const { recommendations } = await options.actions.invoke(feedRuleActions.recommendations, {});
        return { ...hydrateFeedItemContent(item), suggested_behavior_ids: recommendations.find(result => result.item_id === item.item_id)?.suggested_behavior_ids ?? [] };
      },
      hydrateSnapshot: async snapshot => {
        const current = (await options.readWebView()).feed;
        const inbox = new Map(current.inbox_entries.map(entry => [entry.entry_id, entry]));
        const items = new Map(current.feed_items.map(item => [item.item_id, item]));
        const hydrated = hydrateFeedSnapshotContent(snapshot);
        return { ...hydrated, out_rules: current.out_rules,
          inbox_entries: snapshot.inbox_entries.map(entry => ({ ...entry, next_judgment: inbox.get(entry.entry_id)?.next_judgment ?? null,
            suggested_behavior_ids: inbox.get(entry.entry_id)?.suggested_behavior_ids ?? [] })),
          feed_items: hydrated.feed_items.map(item => ({ ...item,
            suggested_behavior_ids: items.get(item.item_id)?.suggested_behavior_ids ?? [] })),
        };
      },
      sourceCatalog: listFeedSourceCatalog,
      renderWorkbench: async () => options.renderer.renderFeedWorkbenchFragment(await options.readWebView()),
      renderDetail: (item, detail) => options.renderer.renderPersistedFeedItemDetail(item, options.routePrefix, detail),
      promote: (feedApp, input) => createLocalFeedGoalPromotion(options.store.db, options.coordinator.goalEvents.createIntent.bind(options.coordinator.goalEvents), options.coordinator.goalInputs, feedApp)(input),
    }),
  };
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
  response.writeHead(result.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...result.headers });
  response.end(JSON.stringify(result.body ?? {}));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 256_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

function readOptionalBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  return contentLength > 0 ? readBody(request) : Promise.resolve({});
}
