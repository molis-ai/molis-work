import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { readResearchRepository } from "./research-repository-read.js";
import { createFeedSourceSyncGuard, syncResearchLibrary, type FeedApplication, type FeedSourceRecord, type FeedSourceSyncResult, type FeedSourceSyncInput } from "@molis-ai/molis-work-plugin-feed";

const running = new Map<string, { idempotencyKey: string; promise: Promise<FeedSourceSyncResult> }>();

/** The Host's research library sync: Feed's own, over the Host's reader, one pull at a time per source. */
export function syncResearchLibrarySource(
  home: string, feed: FeedApplication, source: FeedSourceRecord,
  input: FeedSourceSyncInput,
): Promise<FeedSourceSyncResult> {
  const key = `${home}:${source.project_id}:${source.source_id}`;
  const active = running.get(key);
  if (active) {
    if (active.idempotencyKey !== input.idempotencyKey) throw feedErrors.source_sync_interrupted("该来源正在拉取，请稍后重试");
    const beforeEffect = createFeedSourceSyncGuard(feed, source, input);
    return active.promise.then(async result => { await beforeEffect(); return result; });
  }
  const promise = syncResearchLibrary({ feed, read: (request, options) => readResearchRepository(home, request, options), commit: async operation => operation() }, source, input);
  running.set(key, { idempotencyKey: input.idempotencyKey, promise });
  void promise.finally(() => running.delete(key)).catch(() => undefined);
  return promise;
}
