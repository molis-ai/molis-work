import type { IncomingMessage, ServerResponse } from "node:http";
import { FeedPluginRouteTable, createFeedRouteHandlers, feedRouteErrorResponse, type FeedPluginRouteResponse } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import type { GoalProjectApplication } from "./goal-project-application.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { createLocalFeedSourceService, listFeedSourceCatalog } from "./feed-source-service.js";
import { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";
import { hydrateFeedItemContent, hydrateFeedSnapshotContent } from "./feed-content.js";
import { detectRelayImport, importRelayData } from "./relay-import.js";

export interface FeedNativePluginHttpOptions {
  readonly renderer: Pick<WorkbenchRenderer, "renderFeedWorkbenchFragment" | "renderPersistedFeedItemDetail">;
  readonly boardId: string;
  readonly routePrefix: string;
  readonly databasePath: string;
  readonly store: LocalProjectDatabase;
  readonly coordinator: GoalProjectApplication;
  readonly readWebView: () => MolisWorkWebView;
  readonly invalidateWebView: () => void;
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
  const routes = new FeedPluginRouteTable(createHandlers(options));
  try {
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
    writeResponse(response, feedRouteErrorResponse(error));
    return true;
  }
}

function createHandlers(options: FeedNativePluginHttpOptions) {
  return createFeedRouteHandlers({
    boardId: options.boardId, routePrefix: options.routePrefix,
    feed: () => createLocalFeedApplication(options.store.db),
    sources: () => createLocalFeedSourceService(options.store.db, options.boardId),
    connectors: () => createLocalFeedConnectorService(options.store.db, options.boardId),
    changed: () => options.invalidateWebView(),
    hydrateItem: hydrateFeedItemContent, hydrateSnapshot: hydrateFeedSnapshotContent,
    sourceCatalog: listFeedSourceCatalog, detectRelayImport,
    importRelay: (feed) => importRelayData(feed, options.boardId, undefined, { migrateOwnership: true }),
    renderWorkbench: () => options.renderer.renderFeedWorkbenchFragment(options.readWebView()),
    renderDetail: (item, detail) => options.renderer.renderPersistedFeedItemDetail(item, options.routePrefix, detail),
    promote: (feed, input) => createLocalFeedGoalPromotion(options.store.db, options.coordinator.goalEvents.createIntent.bind(options.coordinator.goalEvents), options.coordinator.goalInputs, feed)(input),
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
