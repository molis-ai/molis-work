import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { FeedStoreError } from "./application-errors.js";
import { parseFeedOutRulePatch, parseFeedOutRuleWrite } from "./out-rules.js";

function requireRuleId(value: string | undefined): string {
  if (!value) throw new FeedStoreError("feed_out_rule_not_found", "找不到这条捕捉规则");
  return value;
}

export function createFeedOutRuleRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const feed = () => options.feed();
  const changed = () => options.changed();
  return {
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
