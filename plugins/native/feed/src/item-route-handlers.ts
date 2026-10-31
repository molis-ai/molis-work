import { feedErrors } from "./contract/feed.js";
import { integerRevision, requireParam } from "./route-input.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { feedItemActions } from "./item-actions.js";

const ITEM_ACTIONS = new Set(["read", "inbox", "save", "archive", "restore", "promote"]);

export function createFeedItemRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  return {
    // The route only translates the URL; every caller runs the same registered Feed item actions.
    "feed.item.action": async ({ params, request }) => {
      const itemId = requireParam(params.item_id, "Feed Item 不存在");
      const action = params.action ?? "";
      if (!ITEM_ACTIONS.has(action)) throw feedErrors.request_invalid("Feed 动作不存在");
      if (action === "read") return { status: 200, body: await options.actions.invoke(feedItemActions.read, { item_id: itemId }) };
      const revision = integerRevision(request.body.expected_revision);
      if (revision == null) throw feedErrors.request_invalid("请刷新 Item 后再操作");
      const at = { item_id: itemId, expected_revision: revision };
      if (action === "promote") {
        return { status: 200, body: await options.actions.invoke(feedItemActions.promote, at) };
      }
      const result = action === "restore" ? await options.actions.invoke(feedItemActions.restore, at)
        : action === "inbox" ? await options.actions.invoke(feedItemActions.inbox, at)
        : await options.actions.invoke(feedItemActions.disposition, { ...at, disposition: action === "save" ? "saved" : "archived" });
      return { status: 200, body: result };
    },
  };
}
