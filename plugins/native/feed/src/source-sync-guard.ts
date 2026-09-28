import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSyncExecution } from "./source-ports.js";

/** Source settings belong to the source owner; listener cursor progress is independent. */
const revision = (source: FeedSourceRecord) => JSON.stringify([source.updated_at, source.config, source.enabled,
  source.status, source.schedule, source.credential_ref]);
export function sourceSyncGuard(feed: FeedApplication, source: FeedSourceRecord, execution: FeedSyncExecution): () => Promise<void> {
  const expected = revision(source);
  return async () => {
    await execution.beforeEffect?.();
    execution.signal?.throwIfAborted();
    if (revision(feed.getSource(source.board_id, source.source_id)) !== expected) {
      throw new FeedDomainError("拉取期间来源已变化，请按当前设置重试", "feed_source_changed");
    }
  };
}
