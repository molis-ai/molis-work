import type { FeedApplication } from "./application.js";
import { isFeedBodyRef } from "./content-ledger.js";
import { type FeedHistoryReleasePorts, type FeedSourceHistoryRelease } from "./source-history.js";

/** One stable-key page, with duplicates across materials and receipts removed by the owner database. */
export function* keptBodyPages(feed: FeedApplication, projectId: string, sourceId: string): Generator<string[]> {
  for (const page of feed.reads.history(projectId, sourceId, "refs")) {
    const refs = page.filter(isFeedBodyRef);
    if (refs.length) yield refs;
  }
}

/** Rows stay until all batches finish. The final release is never issued for an incomplete traversal. */
export async function releaseHistoryPages(feed: FeedApplication, projectId: string, sourceId: string, ports: FeedHistoryReleasePorts): Promise<FeedSourceHistoryRelease> {
  let deleted = 0, kept = 0, records = 0;
  for (const batch of keptBodyPages(feed, projectId, sourceId)) {
    const outcome = await ports.reclaim(batch);
    deleted += outcome.bodies_deleted; kept += outcome.bodies_kept;
  }
  const last = await ports.release([]);
  deleted += last.bodies_deleted; kept += last.bodies_kept;
  if (ports.forget) {
    for (const batch of feed.reads.history(projectId, sourceId, "operations")) records += (await ports.forget(batch)).records_deleted;
  }
  return { bodies_deleted: deleted, bodies_kept: kept, records_deleted: records, complete: ports.forget !== null };
}
