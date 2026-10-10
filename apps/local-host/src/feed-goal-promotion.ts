import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { bindActionClient, retainActionAuthority, type ActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { FEED_PLUGIN_ID, feedItemActions, promoteFeedItemToGoal, type FeedApplication, type FeedGoalPromotionGoals, type FeedGoalPromotionInput } from "@molis-ai/molis-work-plugin-feed";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { createLocalFeedApplication } from "./feed-application.js";
import { hydrateFeedItemContent } from "./feed-content.js";

/**
 * Feed's promotion asks Goals through Goals' own actions, called as the promoting caller: the Goal and its input belong to that
 * caller's identity, and a project without Goals refuses the calls like any other. The creation channel is a fact about who asked
 * (`goals.create` lets only the person name one), so the item names `feed` only when the person promoted it; a Runtime's
 * promotion is recorded as the Runtime's. Likewise the input is taken as confirmed only when the person promoted; Goals records every
 * other caller's as a proposal, and the receipt's reason does not say the user confirmed it.
 */
export function feedGoalsThroughActions(actions: ActionClient, caller: ActionExecutionContext): FeedGoalPromotionGoals {
  const nested = bindActionClient(actions, () => retainActionAuthority(caller, { ...feedItemActions.promote, provider_id: FEED_PLUGIN_ID }));
  return {
    active: async goalId => {
      const item = await nested.invoke(goalsActions.directoryItem, { goal_id: goalId });
      return item ? { goal_id: item.goal_id } : null;
    },
    create: async input => {
      const { goal, replayed } = await nested.invoke(goalsActions.create, { ...input, ...(caller.audience === "user" ? { source_kind: "feed" as const } : {}) });
      return { goal_id: goal.goal_id, replayed };
    },
    confirmInput: async ({ goal_id, item_id, name, snapshot_digest, reason }) => {
      await nested.invoke(goalsActions.inputsConfirm, { goal_id, source: { kind: "feed_item", id: item_id }, name, snapshot_digest, reason });
    },
  };
}

export function createLocalFeedGoalPromotion(db: SqliteDatabase, actions: ActionClient,
  feed: FeedApplication = createLocalFeedApplication(db),
) {
  return (input: FeedGoalPromotionInput, caller: ActionExecutionContext) => promoteFeedItemToGoal({
    feed, goals: feedGoalsThroughActions(actions, caller), hydrateItem: hydrateFeedItemContent,
    transaction: <T>(operation: () => T): T => db.transaction(operation).immediate(),
    beforeEffect: () => caller.beforeEffect(),
    by_person: caller.audience === "user",
  }, input);
}
