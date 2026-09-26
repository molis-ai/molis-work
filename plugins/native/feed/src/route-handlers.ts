import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { createFeedSourceRouteHandlers } from "./source-route-handlers.js";
import { createFeedItemRouteHandlers } from "./item-route-handlers.js";
import { createFeedOutRuleRouteHandlers } from "./out-rule-route-handlers.js";

export function createFeedRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const feed = () => options.feed();
  const connectors = () => options.connectors();
  return {
    "feed.snapshot": async () => ({
      status: 200,
      body: {
        ...await options.hydrateSnapshot(feed().snapshot(options.boardId)),
        source_catalog: options.sourceCatalog(),
        connector_auth: connectors().authStatus(),
      },
    }),
    "feed.workbench": async ({ request }) => {
      const preset = request.query.get("preset") ?? "feed";
      if (preset !== "feed") {
        return { status: 400, body: { error: "Feed 工作区类型无效" } };
      }
      return { status: 200, html: await options.renderWorkbench() };
    },
    ...createFeedOutRuleRouteHandlers(options),
    ...createFeedSourceRouteHandlers(options),
    ...createFeedItemRouteHandlers(options),
  };
}
