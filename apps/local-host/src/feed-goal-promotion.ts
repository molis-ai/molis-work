import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createGoalReadServices } from "@molis-ai/molis-work-module-goals";
import type { GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { promoteFeedItemToGoal, type FeedGoalPromotionInput, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import type { GoalEventApplication } from "@molis-ai/molis-work-plugin-goals";
import { createLocalFeedApplication } from "./feed-application.js";
import { hydrateFeedItemContent } from "./feed-content.js";

export function createLocalFeedGoalPromotion(db: SqliteDatabase,
  createIntent: GoalEventApplication["createIntent"],
  goalInputs: Pick<GoalInputBindingsApi, "register">,
  feed: FeedApplication = createLocalFeedApplication(db),
) {
  const ports = { feed, createIntent, goalInputs, goalQuery: createGoalReadServices(db).query,
    hydrateItem: hydrateFeedItemContent, transaction: <T>(operation: () => T): T => db.transaction(operation).immediate() };
  return (input: FeedGoalPromotionInput) => promoteFeedItemToGoal(ports, input);
}
