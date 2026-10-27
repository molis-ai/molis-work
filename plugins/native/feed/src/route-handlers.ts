import { feedQueryActions } from "./query-actions.js";
import { feedRuleActions } from "./rule-actions.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { createFeedSourceRouteHandlers } from "./source-route-handlers.js";
import { createFeedItemRouteHandlers } from "./item-route-handlers.js";
import { createFeedOutRuleRouteHandlers } from "./out-rule-route-handlers.js";

/**
 * The page's requests, each bound to a route of Feed's Manifest (served under /api/plugins/<plugin_id>/): HTTP adapts presentation and path
 * parameters to Feed's own actions; validation and business work belong to the actions. The Inbox's entries are the Inbox's to give.
 */
export function createFeedRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  return {
    "feed.snapshot": async () => {
      const [snapshot, { rules }, { recommendations }, connectorAuth] = await Promise.all([
        options.actions.invoke(feedQueryActions.snapshot, { include_contents: true }), options.actions.invoke(feedRuleActions.list, {}),
        options.actions.invoke(feedRuleActions.recommendations, {}), options.actions.invoke(feedQueryActions.connections, {})]);
      const suggested = new Map(recommendations.map(result => [result.item_id, result.suggested_behavior_ids]));
      return { status: 200, body: { ...snapshot, out_rules: rules,
        feed_items: snapshot.feed_items.map(item => ({ ...item, suggested_behavior_ids: suggested.get(item.item_id) ?? [] })),
        connector_auth: connectorAuth } };
    },
    ...createFeedOutRuleRouteHandlers(options),
    ...createFeedSourceRouteHandlers(options),
    ...createFeedItemRouteHandlers(options),
  };
}
