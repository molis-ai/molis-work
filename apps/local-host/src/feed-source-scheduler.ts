import type { LocalFeedApplicationOptions } from "./feed-application.js";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { FeedSourceScheduler, type FeedSourceSchedulerDispatch } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedSourceService } from "./feed-source-service.js";

export function createLocalFeedSourceScheduler(
  db: SqliteDatabase, projectId: string,
  dispatch: FeedSourceSchedulerDispatch,
  now: () => Date = () => new Date(),
  homeDirectory?: string,
  feedOptions?: LocalFeedApplicationOptions,
): FeedSourceScheduler {
  return new FeedSourceScheduler(
    projectId,
    () => createLocalFeedSourceService(db, projectId, undefined, now, homeDirectory, feedOptions),
    dispatch,
    now,
  );
}
