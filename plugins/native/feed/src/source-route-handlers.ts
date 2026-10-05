import type { SourceHistoryDecision } from "./projection.js";
import { requireParam } from "./route-input.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { feedSourceActions, type FeedSourceRegistration } from "./source-actions.js";

export function createFeedSourceRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const changed = () => options.changed();
  return {
    // Source routes translate the old URLs; every caller manages sources through the same registered Feed actions.
    "feed.sources.create": async ({ request }) => {
      const fields = ["kind", "name", "repository", "research_source", "definition_id", "query", "channel_id", "feed_url"];
      const result = await options.actions.invoke(feedSourceActions.register,
        Object.fromEntries(fields.flatMap(key => typeof request.body[key] === "string" ? [[key, request.body[key]]] : [])) as FeedSourceRegistration);
      changed();
      return { status: result.registered ? 201 : 200, body: result };
    },
    "feed.sources.update": async ({ params, request }) => {
      const result = await options.actions.invoke(feedSourceActions.update, { source_id: requireParam(params.source_id, "Feed 来源不存在"),
        ...Object.fromEntries(["name", "description", "scope", "feed_url", "connection_id"].flatMap(key => typeof request.body[key] === "string" ? [[key, request.body[key]]] : [])) });
      changed();
      return { status: 200, body: result };
    },
    "feed.sources.delete": async ({ params, request }) => {
      const historyDecision = request.body.history_decision as SourceHistoryDecision;
      if (historyDecision !== "retain_history" && historyDecision !== "delete_local_history") {
        return { status: 400, body: { error: "删除来源前必须选择保留或删除本地历史" } };
      }
      const result = await options.actions.invoke(feedSourceActions.delete, { source_id: requireParam(params.source_id, "Feed 来源不存在"), history_decision: historyDecision });
      changed();
      return { status: 200, body: result };
    },
    "feed.sources.schedule": async ({ params, request }) => {
      const valid = request.body.mode === "manual" || (request.body.mode === "interval" && typeof request.body.enabled === "boolean" && Number.isInteger(request.body.interval_minutes));
      if (!valid) return { status: 400, body: { error: "拉取计划参数无效" } };
      const result = await options.actions.invoke(feedSourceActions.schedule, request.body.mode === "manual"
        ? { source_id: requireParam(params.source_id, "Feed 来源不存在"), mode: "manual" }
        : { source_id: requireParam(params.source_id, "Feed 来源不存在"), mode: "interval", enabled: request.body.enabled as boolean, interval_minutes: Number(request.body.interval_minutes) });
      changed();
      return { status: 200, body: result };
    },
    "feed.sources.action": async ({ params, request }) => {
      const sourceId = requireParam(params.source_id, "Feed 来源不存在");
      const action = requireParam(params.action, "来源动作不存在");
      const result = action === "pause" || action === "resume" ? await options.actions.invoke(feedSourceActions.enabled, { source_id: sourceId, enabled: action === "resume" })
        : action === "disconnect" ? await options.actions.invoke(feedSourceActions.disconnect, { source_id: sourceId })
        : await options.actions.invoke(feedSourceActions.sync, { source_id: sourceId,
          ...(typeof request.body.idempotency_key === "string" ? { idempotency_key: request.body.idempotency_key } : {}),
          ...(request.body.mode === "rebuild_cursor" ? { mode: "rebuild_cursor" as const } : {}) });
      changed();
      return { status: 200, body: result };
    },
  };
}
