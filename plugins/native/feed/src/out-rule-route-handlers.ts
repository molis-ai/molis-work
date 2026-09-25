import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { FeedStoreError } from "./application-errors.js";
import { feedOutRuleMatches, parseFeedOutRulePatch, parseFeedOutRuleWrite } from "./out-rules.js";

function requireRuleId(value: string | undefined): string {
  if (!value) throw new FeedStoreError("feed_out_rule_not_found", "找不到这条捕捉规则");
  return value;
}

export function createFeedOutRuleRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const feed = () => options.feed();
  const changed = () => options.changed();
  return {
    "feed.out-rules.preview": ({ request }) => {
      const sourceId = typeof request.body.source_id === "string" ? request.body.source_id : "";
      const contains = typeof request.body.contains === "string" ? request.body.contains.trim() : "";
      const snapshot = feed().snapshot(options.boardId);
      if (!snapshot.sources.some(source => source.source_id === sourceId)) throw new FeedStoreError("feed_invalid_transition", "请选择当前项目的来源");
      if (contains.length > 200) throw new FeedStoreError("feed_invalid_transition", "包含关键字不能超过 200 个字");
      const rule = { board_id: options.boardId, rule_id: "preview", name: "preview", enabled: true, match: { source_id: sourceId, contains }, function_key: null, admission: "suggest" as const, created_at: "", updated_at: "" };
      const items = snapshot.feed_items.filter(item => item.source_id === sourceId)
        .sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at)).slice(0, 5);
      return { status: 200, body: { samples: items.map(item => ({ item_id: item.item_id, title: item.title, matched: feedOutRuleMatches(rule, item), input: [item.title, item.summary, item.body ?? ""].filter(Boolean).join("\n") })) } };
    },
    "feed.out-rules.evaluate": async ({ request }) => {
      const ids = request.body.item_ids;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new FeedStoreError("feed_invalid_transition", "请选择消息试跑规则");
      const result = await feed().evaluateItems(options.boardId, ids);
      changed();
      return { status: 200, body: result };
    },
    "feed.out-rules.list": () => ({
      status: 200,
      body: { rules: feed().listOutRules(options.boardId) },
    }),
    "feed.out-rules.create": ({ request }) => {
      const rule = feed().createOutRule(options.boardId, parseFeedOutRuleWrite(request.body));
      changed();
      return { status: 201, body: { rule } };
    },
    "feed.out-rules.update": ({ params, request }) => {
      const rule = feed().updateOutRule(
        options.boardId,
        requireRuleId(params.rule_id),
        parseFeedOutRulePatch(request.body),
      );
      changed();
      return { status: 200, body: { rule } };
    },
    "feed.out-rules.delete": ({ params }) => {
      const rule = feed().deleteOutRule(
        options.boardId,
        requireRuleId(params.rule_id),
      );
      changed();
      return { status: 200, body: { rule } };
    },
  };
}
