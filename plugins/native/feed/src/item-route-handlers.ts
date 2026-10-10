import { feedQueryActions } from "./query-actions.js";
import { integerRevision, requireParam } from "./route-input.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { feedItemActions } from "./item-actions.js";

export function createFeedItemRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const changed = () => options.changed();
  return {
    "feed.item.detail": async ({ params, request }) => {
      const itemId = requireParam(params.item_id, "Feed Item 不存在");
      const item = await options.hydrateItem((await options.actions.invoke(feedQueryActions.item, { item_id: itemId })).item);
      const inboxActive = (await options.inboxEntries()).some((entry) =>
        entry.subject_type === "feed_item"
        && entry.subject_id === itemId
        && (entry.status === "open" || entry.status === "in_progress"),
      );
      // The button follows the action behind it, as the offers do: where Goals cannot be written through, the reader does not show it.
      const promoteAvailable = (await options.actions.discover()).some((view) => view.capability_id === feedItemActions.promote.capability_id
        && view.version === feedItemActions.promote.version && view.availability.available);
      return {
        status: 200,
        html: options.renderDetail(item, {
          entryId: itemId,
          inboxActive,
          promoteAvailable,
          inboxEntry: null,
          surface: request.query.get("surface") === "frame-block" ? "frame-block" : undefined,
        }),
      };
    },
    // The route only translates the old URL; every caller runs the same registered Feed item actions.
    "feed.item.action": async ({ params, request }) => {
      const itemId = requireParam(params.item_id, "Feed Item 不存在");
      const action = requireParam(params.action, "Feed 动作不存在");
      if (action === "read") {
        const result = await options.actions.invoke(feedItemActions.read, { item_id: itemId });
        changed();
        return { status: 200, body: result };
      }
      const revision = integerRevision(request.body.expected_revision);
      if (revision == null) return { status: 400, body: { error: "请刷新 Item 后再操作" } };
      const at = { item_id: itemId, expected_revision: revision };
      if (action === "promote" || action === "start") {
        const result = await options.actions.invoke(feedItemActions.promote, { ...at, ...(action === "start" ? { start_processing: true } : {}) });
        changed();
        return { status: 200, body: { ...result, goal_path: `${options.routePrefix}/goals/${encodeURIComponent(result.goal_id)}` } };
      }
      const result = action === "restore" ? await options.actions.invoke(feedItemActions.restore, at)
        : action === "inbox" ? await options.actions.invoke(feedItemActions.inbox, at)
        : await options.actions.invoke(feedItemActions.disposition, { ...at, disposition: action === "save" ? "saved" : "archived" });
      changed();
      return { status: 200, body: result };
    },
  };
}
