import type { LocalFeedApplicationOptions } from "./feed-application.js";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { isAccountConnectorSyncKind } from "@molis-ai/molis-work-contracts/modules/sources";
import { FeedSourceScheduler, type FeedSourceSchedulerDispatch } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedSourceService } from "./feed-source-service.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";

export function createLocalFeedSourceScheduler(
  db: SqliteDatabase, boardId: string,
  dispatch?: FeedSourceSchedulerDispatch,
  now: () => Date = () => new Date(),
  homeDirectory?: string,
  feedOptions?: LocalFeedApplicationOptions,
): FeedSourceScheduler {
  return new FeedSourceScheduler(
    boardId,
    () => createLocalFeedSourceService(db, boardId, undefined, now, homeDirectory, feedOptions),
    dispatch ?? defaultDispatch(db, boardId, homeDirectory, feedOptions),
    now,
  );
}

function defaultDispatch(
  db: SqliteDatabase,
  boardId: string,
  homeDirectory?: string,
  feedOptions?: LocalFeedApplicationOptions,
): FeedSourceSchedulerDispatch {
  return async (source, idempotencyKey) => {
    if (source.sync_kind === "public_source") {
      return createLocalFeedSourceService(db, boardId, undefined, undefined, homeDirectory, feedOptions)
        .sync(source.source_id, { idempotencyKey });
    }
    if (isAccountConnectorSyncKind(source.sync_kind)) {
      return createLocalFeedConnectorService(db, boardId, undefined, homeDirectory, feedOptions)
        .sync(source.source_id, { idempotencyKey, mode: "normal" });
    }
    throw Object.assign(new Error("这个来源没有可用的 Provider 适配器"), { code: "feed_source_invalid_configuration" });
  };
}
