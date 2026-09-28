import { feedQueryActions } from "./query-actions.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { createFeedSourceRouteHandlers } from "./source-route-handlers.js";
import { createFeedItemRouteHandlers } from "./item-route-handlers.js";
import { createFeedOutRuleRouteHandlers } from "./out-rule-route-handlers.js";

export function createFeedRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  return {
    "feed.snapshot": async () => ({
      status: 200,
      body: {
        ...await options.hydrateSnapshot({ ...await options.actions.invoke(feedQueryActions.snapshot, { include_contents: true }), inbox_entries: [] }),
        source_catalog: options.sourceCatalog(),
        connector_auth: await options.actions.invoke(feedQueryActions.connections, {}),
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
