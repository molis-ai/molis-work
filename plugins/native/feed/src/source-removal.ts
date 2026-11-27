import { feedErrors } from "./contract/feed.js";
import { sourceDeletedAt } from "./contract/sources.js";
import { collectSourceHistoryHolding } from "./history-pages.js";
import type { FeedSourceRecord, SourceHistoryDecision } from "./projection.js";
import type { FeedSourceHistoryRelease } from "./source-history.js";
import type { FeedSourceService } from "./source-service.js";

/**
 * Deleting a source whose history may leave the Home. Holds the source's sync lease so no pull races the deletion, collects the
 * body references and search operation ids before the rows go, commits the project deletion first (so a failed or revoked commit
 * never removes live evidence bodies from disk), and only then releases the Home ledger holds, unreferenced bodies and search records.
 * A release failure after commit leaves extra holds (never dangling references) and is recorded as `complete: false`.
 */
export async function removeFeedSource(service: FeedSourceService, sourceId: string, historyDecision: SourceHistoryDecision,
  retire: (released: FeedSourceHistoryRelease | null, run: () => FeedSourceRecord) => FeedSourceRecord = (_released, run) => run()): Promise<FeedSourceRecord> {
  const { acquireSync, releaseHistory, commit } = service.ports;
  if (!releaseHistory || !commit) return service.delete(sourceId, historyDecision);
  if (historyDecision !== "delete_local_history") {
    if (sourceDeletedAt(service.feed.sources.get(service.projectId, sourceId))) throw feedErrors.source_not_found("找不到这个来源");
    return await commit(() => retire(null, () => service.delete(sourceId, historyDecision)));
  }
  const releaseLease = acquireSync?.(service.projectId, sourceId);
  try {
    if (sourceDeletedAt(service.feed.sources.get(service.projectId, sourceId))) throw feedErrors.source_not_found("找不到这个来源");
    const holding = collectSourceHistoryHolding(service.feed, service.projectId, sourceId);
    const deleted = await commit(() => retire(null, () => service.delete(sourceId, historyDecision)));
    let outcome: FeedSourceHistoryRelease;
    try {
      outcome = await releaseHistory({ project_id: service.projectId, source_id: sourceId, holding });
    } catch {
      outcome = { bodies_deleted: 0, bodies_kept: holding.content_refs.length, records_deleted: 0, complete: false };
    }
    await commit(() => {
      service.ports.appendEvent(
        service.projectId,
        sourceId,
        "feed_source.history_released",
        outcome.complete ? "来源的本地正文与检索记录已清理" : "来源的本地历史未能全部清理",
        { ...outcome },
      );
    }).catch(() => undefined);
    return deleted;
  } finally {
    releaseLease?.();
  }
}
