import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { sourceDeletedAt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedSourceRecord, SourceHistoryDecision } from "./projection.js";
import type { FeedSourceHistoryRelease } from "./source-history.js";
import type { FeedSourceService } from "./source-service.js";

/**
 * Deleting a source whose history may leave the Home. A Feed that releases through the platform does it before the rows go (the Home's
 * ledger and the search records are other services' writes, which cannot join the commit): a cut-off deletion leaves a source with some
 * bodies gone, and deleting it again finishes. `retire` runs the commit and is given what the release found, so the event that records it
 * lands in the same commit as the deletion. Without a `releaseHistory` port this is `delete`.
 */
export async function removeFeedSource(service: FeedSourceService, sourceId: string, historyDecision: SourceHistoryDecision,
  retire: (released: FeedSourceHistoryRelease | null, run: () => FeedSourceRecord) => FeedSourceRecord = (_released, run) => run()): Promise<FeedSourceRecord> {
  const { releaseHistory, commit } = service.ports;
  if (!releaseHistory || !commit) return service.delete(sourceId, historyDecision);
  if (sourceDeletedAt(service.feed.getSource(service.projectId, sourceId))) throw feedErrors.source_not_found("找不到这个来源");
  const released = historyDecision === "delete_local_history" ? await releaseHistory({ project_id: service.projectId, source_id: sourceId }) : null;
  return await commit(() => retire(released, () => service.delete(sourceId, historyDecision)));
}
