import { integerRevision, requireParam } from "./route-input.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";

export function createFeedItemRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const feed = () => options.feed();
  const changed = () => options.changed();
  return {
    "feed.item.detail": async ({ params, request }) => {
      const itemId = requireParam(params.item_id, "Feed Item 不存在");
      const store = feed();
      const item = await options.hydrateItem(store.getFeedItem(options.boardId, itemId));
      const inboxActive = store.listInboxEntries(options.boardId).some((entry) =>
        entry.subject_type === "feed_item"
        && entry.subject_id === itemId
        && (entry.status === "open" || entry.status === "in_progress"),
      );
      return {
        status: 200,
        html: options.renderDetail(item, {
          entryId: itemId,
          inboxActive,
          inboxEntry: null,
          surface: request.query.get("surface") === "frame-block" ? "frame-block" : undefined,
        }),
      };
    },
    "feed.item.action": ({ params, request }) => {
      const itemId = requireParam(params.item_id, "Feed Item 不存在");
      const action = requireParam(params.action, "Feed 动作不存在");
      const store = feed();
      if (action === "read") {
        const item = store.markRead(options.boardId, itemId);
        changed();
        return { status: 200, body: { item } };
      }
      const revision = integerRevision(request.body.expected_revision);
      if (revision == null) return { status: 400, body: { error: "请刷新 Item 后再操作" } };
      if (action === "restore") {
        const item = store.restoreToFeed(options.boardId, itemId, revision);
        changed();
        return { status: 200, body: { item } };
      }
      if (action === "inbox") {
        const item = store.addToInbox(options.boardId, itemId, revision);
        changed();
        return { status: 200, body: { item } };
      }
      if (action === "save" || action === "archive") {
        const item = store.setDisposition(options.boardId, itemId, action === "save" ? "saved" : "archived", revision);
        changed();
        return { status: 200, body: { item } };
      }
      const result = options.promote(store, { boardId: options.boardId, routePrefix: options.routePrefix,
        itemId, startProcessing: action === "start", expectedRevision: revision });
      changed();
      return { status: 200, body: result };
    },
  };
}
