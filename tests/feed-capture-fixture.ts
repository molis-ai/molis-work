import { ActionService } from "@molis-ai/molis-work-kernel";
import { createFeedCaptureSceneHandler, createFeedCaptureTrigger, feedCaptureScene, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";

export function feedCaptureFixture(evaluate: (content: string) => { status: "ok" | "needs_review"; suggested_behavior_ids: string[] }) {
  const service = new ActionService();
  const reference = { capability_id: "fixture.feed-judgment", version: 1, provider_id: "fixture.judgment" };
  const definition: ActionDefinition = { ...reference, operation: "command", action: { title: "Fixture judgment", description: "Fixture model response", kind: "judgment",
    scope: "project", audiences: ["user", "workflow"], permissions: [], subject_kinds: ["feed_item"], input_schema: feedCaptureScene.input_schema,
    output_schema: feedCaptureScene.result_schema, output_type: feedCaptureScene.result_type } };
  const history: JudgmentRecord[] = [];
  let trigger: ReturnType<typeof createFeedCaptureTrigger> | undefined;
  return { reference, history, options: { captureJudgment: (item: { board_id: string; item_id: string; rule_ids: string[] }, caller?: ActionCallContext) => trigger!(item, caller) },
    attach(feed: FeedApplication, boardId: string) {
      const caller: ActionCallContext = { actor_id: "fixture", project_id: boardId, audience: "user", permissions: ["feed:read", "feed:write", "inbox:write", "model:invoke"] };
      service.registerProvider({ provider: { provider_id: reference.provider_id, title: "Fixture", kind: "plugin", project_id: boardId },
        definitions: [definition], handlers: [{ ...definition, handle: (_caller, input) => evaluate((input as { content: string }).content) }] });
      service.registerProvider({ provider: { provider_id: "fixture.feed", kind: "plugin", title: "Feed", project_id: boardId }, definitions: [], handlers: [], scenes: [feedCaptureScene], scene_handlers: [createFeedCaptureSceneHandler({ projectId: boardId,
        rules: () => feed.listOutRules(boardId), resolve: id => feed.getFeedItem(boardId, id),
        save: (rule, binding) => { feed.updateOutRule(boardId, rule.rule_id, { judgment: binding.function, enabled: binding.enabled }); },
        record: (item, rule, binding, result) => {
          const judgment: JudgmentRecord = { judgment_id: `fixture-${history.length}`, function_key: binding.function.capability_id,
            function_version: binding.function.version, subject: { kind: "feed_item", id: item.item_id, board_id: boardId }, scene_id: feedCaptureScene.scene_id,
            outcome: result.status, suggested_behavior_ids: result.suggested_behavior_ids, error_code: result.error_code ?? null, created_at: new Date().toISOString() };
          history.push(judgment); feed.recordCaptureJudgment(item, rule, judgment); return judgment;
        },
      })] });
      trigger = createFeedCaptureTrigger({ scenes: service, context: () => caller, boardId });
    },
  };
}
