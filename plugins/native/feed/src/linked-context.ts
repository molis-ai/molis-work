import type { FeedApplication } from "./application.js";
import type { FeedHydrate } from "./item-hydration.js";
import { feedItemContext } from "./projection.js";

/**
 * The text of the Feed item linked to a Goal (the one named, or the most recently changed), for the Goal's context. Product selection
 * stays here; the caller has already checked that it may read the Goal, and the link is Feed's own record of it (`feed.goal`).
 */
export async function readLinkedFeedContext(feed: FeedApplication, projectId: string, input: { goal_id: string; item_id?: string }, hydrate: FeedHydrate): Promise<{ source_context: string } | null> {
  const item = feed.findLinkedGoalItem(projectId, input.goal_id, input.item_id);
  return item ? { source_context: feedItemContext(await hydrate(item)) } : null;
}
