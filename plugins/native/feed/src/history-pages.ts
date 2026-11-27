import type { FeedApplication } from "./application.js";
import { isFeedBodyRef } from "./content-ledger.js";
import { type FeedHistoryReleasePorts, type FeedSourceHistoryHolding, type FeedSourceHistoryRelease } from "./source-history.js";
import { FEED_UNASSIGNED_BODY_HOLDER } from "./store/history-reads.js";

const LEDGER_HOLDER_MAX_LENGTH = 200;
const PROJECT_BODY_BATCH_SIZE = 200;

/** One stable-key page, with duplicates across materials and receipts removed by the owner database. */
export function* keptBodyPages(feed: FeedApplication, projectId: string, sourceId: string): Generator<string[]> {
  for (const page of feed.reads.history(projectId, sourceId, "refs")) {
    const refs = page.filter(isFeedBodyRef);
    if (refs.length) yield refs;
  }
}

/**
 * Every kept body referenced anywhere in this project's Feed database (active sources, retain_history retired sources,
 * unassigned source_id IS NULL items, and signals/revisions), grouped by holder source_id in bounded ledger batches.
 */
export function* keptProjectBodyPages(
  feed: FeedApplication,
  projectId: string,
): Generator<{ source_id: string; refs: string[] }> {
  let currentSourceId: string | null = null;
  let batch: string[] = [];
  for (const page of feed.reads.projectBodyRefs(projectId)) {
    for (const row of page) {
      if (!isFeedBodyRef(row.ref)) continue;
      const trimmed = row.source_id.trim();
      const sourceId = trimmed.length > 0 && trimmed.length <= LEDGER_HOLDER_MAX_LENGTH
        ? trimmed
        : FEED_UNASSIGNED_BODY_HOLDER;
      if (currentSourceId !== null && (sourceId !== currentSourceId || batch.length >= PROJECT_BODY_BATCH_SIZE)) {
        yield { source_id: currentSourceId, refs: batch };
        batch = [];
      }
      currentSourceId = sourceId;
      batch.push(row.ref);
    }
  }
  if (currentSourceId !== null && batch.length > 0) {
    yield { source_id: currentSourceId, refs: batch };
  }
}

/** Collects every kept body reference and pull operation id of one source before its rows are deleted. */
export function collectSourceHistoryHolding(feed: FeedApplication, projectId: string, sourceId: string): FeedSourceHistoryHolding {
  const content_refs: string[] = [];
  for (const batch of keptBodyPages(feed, projectId, sourceId)) {
    content_refs.push(...batch);
  }
  const operation_ids: string[] = [];
  for (const batch of feed.reads.history(projectId, sourceId, "operations")) {
    operation_ids.push(...batch);
  }
  return { content_refs, operation_ids };
}

/** Rows stay until all batches finish. The final release is never issued for an incomplete traversal. */
export async function releaseHistoryPages(feed: FeedApplication, projectId: string, sourceId: string, ports: FeedHistoryReleasePorts): Promise<FeedSourceHistoryRelease> {
  let deleted = 0;
  let kept = 0;
  let records = 0;
  for (const batch of keptBodyPages(feed, projectId, sourceId)) {
    const outcome = await ports.reclaim(batch);
    deleted += outcome.bodies_deleted;
    kept += outcome.bodies_kept;
  }
  const last = await ports.release([]);
  deleted += last.bodies_deleted;
  kept += last.bodies_kept;
  if (ports.forget) {
    for (const batch of feed.reads.history(projectId, sourceId, "operations")) {
      records += (await ports.forget(batch)).records_deleted;
    }
  }
  return { bodies_deleted: deleted, bodies_kept: kept, records_deleted: records, complete: ports.forget !== null };
}
