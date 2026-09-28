import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { sourceDeletedAt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";

/** Trusted execution options, never source configuration or transport input. */
export interface FeedSourceSyncAuthority {
  signal?: AbortSignal;
  beforeEffect?(): void | Promise<void>;
}

/** Source state stays with Feed; caller authority stays with the original dispatcher. */
export function createFeedSourceSyncGuard(feed: FeedApplication, source: FeedSourceRecord, authority: FeedSourceSyncAuthority) {
  const configuration = (row: FeedSourceRecord) => JSON.stringify([row.kind, row.sync_kind, row.definition_id, row.config, row.credential_ref]);
  const original = configuration(source);
  const revision = (row: FeedSourceRecord) => JSON.stringify([row.updated_at, row.name, row.description, row.enabled, row.status, row.schedule]);
  const originalRevision = revision(source);
  let refused = false, refusal: unknown;
  return async () => {
    // Error bookkeeping must not turn a refused attempt back into an authorized write.
    if (refused) throw refusal;
    try {
      authority.signal?.throwIfAborted();
      await authority.beforeEffect?.();
      authority.signal?.throwIfAborted();
      const current = feed.getSource(source.board_id, source.source_id);
      if (sourceDeletedAt(current)) throw new FeedDomainError("来源已删除，本次拉取结果未提交", "feed_source_not_found");
      if (!current.enabled || current.status === "paused" || current.status === "disconnected") {
        throw new FeedDomainError("来源已暂停或断开，本次拉取结果未提交", "feed_source_paused");
      }
      if (configuration(current) !== original) throw new FeedDomainError("来源配置已变化，请按新配置重新拉取", "feed_source_configuration_changed");
      if (revision(current) !== originalRevision) throw new FeedDomainError("拉取期间来源已变化，请按当前设置重试", "feed_source_changed");
    } catch (error) { refused = true; refusal = error; throw error; }
  };
}
