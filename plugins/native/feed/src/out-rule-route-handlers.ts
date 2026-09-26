import { feedRuleActions } from "./rule-actions.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { FeedStoreError } from "./application-errors.js";
import { parseFeedOutRulePatch, parseFeedOutRuleWrite } from "./out-rules.js";

function requireRuleId(value: string | undefined): string {
  if (!value) throw new FeedStoreError("feed_out_rule_not_found", "找不到这条捕捉规则");
  return value;
}

export function createFeedOutRuleRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const changed = () => options.changed();
  return {
    "feed.out-rules.judgments": async () => ({ status: 200, body: await options.actions.invoke(feedRuleActions.judgments, {}) }),
    "feed.out-rules.preview-judgment": async ({ request }) => ({ status: 200, body: await options.actions.invoke(feedRuleActions.previewJudgment, request.body as unknown as { judgment: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference; item_id: string }) }),
    "feed.out-rules.preview": async ({ request }) => ({ status: 200, body: await options.actions.invoke(feedRuleActions.preview, {
      source_id: typeof request.body.source_id === "string" ? request.body.source_id : "",
      contains: typeof request.body.contains === "string" ? request.body.contains.trim() : "",
    }) }),
    "feed.out-rules.evaluate": async ({ request }) => {
      const ids = request.body.item_ids;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new FeedStoreError("feed_invalid_transition", "请选择消息试跑规则");
      const result = await options.actions.invoke(feedRuleActions.evaluate, { item_ids: ids });
      changed();
      return { status: 200, body: result };
    },
    "feed.out-rules.list": async () => ({ status: 200, body: await options.actions.invoke(feedRuleActions.list, {}) }),
    "feed.out-rules.create": async ({ request }) => {
      const body = await options.actions.invoke(feedRuleActions.create, parseFeedOutRuleWrite(request.body));
      changed();
      return { status: 201, body };
    },
    "feed.out-rules.update": async ({ params, request }) => {
      const body = await options.actions.invoke(feedRuleActions.update, { rule_id: requireRuleId(params.rule_id), patch: parseFeedOutRulePatch(request.body) });
      changed();
      return { status: 200, body };
    },
    "feed.out-rules.delete": async ({ params }) => {
      const body = await options.actions.invoke(feedRuleActions.delete, { rule_id: requireRuleId(params.rule_id) });
      changed();
      return { status: 200, body };
    },
  };
}
