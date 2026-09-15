import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { createFeedSourceRouteHandlers } from "./source-route-handlers.js";
import { createFeedItemRouteHandlers } from "./item-route-handlers.js";
import { createFeedOutRuleRouteHandlers } from "./out-rule-route-handlers.js";

export function createFeedRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const feed = () => options.feed();
  const connectors = () => options.connectors();
  const changed = () => options.changed();
  return {
    "feed.snapshot": () => ({
      status: 200,
      body: {
        ...options.hydrateSnapshot(feed().snapshot(options.boardId)),
        relay_import: options.detectRelayImport(),
        source_catalog: options.sourceCatalog(),
        connector_auth: connectors().authStatus(),
      },
    }),
    "feed.workbench": ({ request }) => {
      const preset = request.query.get("preset") ?? "feed";
      if (preset !== "feed") {
        return { status: 400, body: { error: "Feed 工作区类型无效" } };
      }
      return { status: 200, html: options.renderWorkbench() };
    },
    ...createFeedOutRuleRouteHandlers(options),
    ...createFeedSourceRouteHandlers(options),
    "feed.relay.import": ({ request }) => {
      if (request.body.user_confirmed !== true) {
        return { status: 400, body: { error: "请先确认把本机 Relay Feed 所有权迁入 Molis Work" } };
      }
      const result = options.importRelay(feed());
      changed();
      return { status: 200, body: result };
    },
    ...createFeedItemRouteHandlers(options),
  };
}
