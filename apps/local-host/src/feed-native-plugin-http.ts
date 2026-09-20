import type { IncomingMessage, ServerResponse } from "node:http";
import { FeedPluginRouteTable, createFeedRouteHandlers, feedRouteErrorResponse, type FeedPluginRouteResponse } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import type { GoalProjectApplication } from "./goal-project-application.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { createLocalFeedApplication, withLocalFeedJudgments } from "./feed-application.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { createLocalFeedSourceService, listFeedSourceCatalog } from "./feed-source-service.js";
import { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";
import { hydrateFeedItemContent, hydrateFeedSnapshotContent } from "./feed-content.js";
import type { FeedApplication } from "@molis-ai/molis-work-plugin-feed";

export interface FeedNativePluginHttpOptions {
  readonly renderer: Pick<WorkbenchRenderer, "renderFeedWorkbenchFragment" | "renderPersistedFeedItemDetail">;
  readonly boardId: string;
  readonly routePrefix: string;
  readonly databasePath: string;
  readonly store: LocalProjectDatabase;
  readonly coordinator: GoalProjectApplication;
  readonly readWebView: () => MolisWorkWebView;
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
  const feed = createLocalFeedApplication(options.store.db, withLocalFeedJudgments(options.homeDirectory));
  return {
    feed,
    handlers: createFeedRouteHandlers({
      boardId: options.boardId, routePrefix: options.routePrefix,
      feed: () => feed,
      sources: () => createLocalFeedSourceService(options.store.db, options.boardId, undefined, undefined, options.homeDirectory),
      connectors: () => createLocalFeedConnectorService(options.store.db, options.boardId, undefined, options.homeDirectory),
      changed: () => options.invalidateWebView(),
      hydrateItem: hydrateFeedItemContent, hydrateSnapshot: hydrateFeedSnapshotContent,
      sourceCatalog: listFeedSourceCatalog,
      renderWorkbench: () => options.renderer.renderFeedWorkbenchFragment(options.readWebView()),
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
