import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedApplicationPorts } from "./application-ports.js";
import { FEED_CONTENT_LEDGER_BATCH, isFeedBodyRef, type FeedContentRelease } from "./content-ledger.js";
import type { FeedSnapshot, FeedSourceRecord, SourceHistoryDecision } from "./projection.js";

/**
 * A source's local history is more than rows in the project database: every pull left article bodies in the Home's
 * evidence store, and search (SEL) keeps a sealed record per pull that points at them. Both are content-addressed and
 * shared, so what a deletion may remove is decided by who else still refers to them.
 */
export interface FeedSourceHistory {
  /**
   * The source's rows are gone from the project database. Delete the evidence bodies and the search records of its
   * pulls that nothing else holds. Never throws: the deletion has already happened, so a failure is reported.
   */
  release(input: FeedSourceHistoryHolding & { project_id: string; source_id: string }): FeedSourceHistoryRelease;
}

/** Most search records one `forget` may name: the platform's bound (`services.sourcePull.forget`). */
export const FEED_FORGET_BATCH = 1_000;

/** The Home's ledger and the platform's search records, as a deletion asks them: each call is one bounded write of another service. */
export interface FeedHistoryReleasePorts {
  /** This source's hold on exactly these bodies goes, then each that nobody else holds (`feed.content.reclaim`): every batch but the last. */
  reclaim(contentRefs: string[]): Promise<FeedContentRelease>;
  /** Every hold this source has left goes, then each of these bodies nobody else holds (`feed.content.release`): the last batch. */
  release(contentRefs: string[]): Promise<FeedContentRelease>;
  /** The pulls' search records go; null when the Feed may not forget them, and they stay. */
  forget: ((operationIds: string[]) => Promise<{ records_deleted: number }>) | null;
}

/**
 * Gives a source's history back before its rows go, in bounded batches. Each batch but the last takes back only the holds it names, so the
 * bodies of a batch not reached yet stay held by this source while its rows still point at them; the last takes back whatever holds are left.
 * A call that fails throws: nothing of the deletion has been committed, the source and its rows (and with them the references and operation
 * ids) stay, and deleting it again repeats each step harmlessly. A ledger without the completeness mark is not a failure: it keeps every body
 * and says so (`complete: false`), and the deletion goes ahead with them kept. The ledger, the evidence store and the search records are
 * other services' writes: nothing here rolls one back when a later one fails.
 */
export async function releaseHeldHistory(held: FeedSourceHistoryHolding, ports: FeedHistoryReleasePorts): Promise<FeedSourceHistoryRelease> {
  const bodies = held.content_refs.filter(isFeedBodyRef);
  let deleted = 0, kept = 0, complete = true;
  for (let start = 0; ; start += FEED_CONTENT_LEDGER_BATCH) {
    const end = start + FEED_CONTENT_LEDGER_BATCH, batch = bodies.slice(start, end);
    const outcome = await (end >= bodies.length ? ports.release(batch) : ports.reclaim(batch));
    deleted += outcome.bodies_deleted; kept += outcome.bodies_kept;
    // Without the mark no batch can say "nobody", so the rest stay held as they are.
    if (!outcome.complete) { complete = false; kept += Math.max(0, bodies.length - end); break; }
    if (end >= bodies.length) break;
  }
  let records = 0;
  if (ports.forget) {
    for (let start = 0; start < held.operation_ids.length; start += FEED_FORGET_BATCH) {
      records += (await ports.forget(held.operation_ids.slice(start, start + FEED_FORGET_BATCH))).records_deleted;
    }
  }
  return { bodies_deleted: deleted, bodies_kept: kept, records_deleted: records, complete: complete && ports.forget !== null };
}

/** What one source's history held on to, read before its rows are deleted. */
export interface FeedSourceHistoryHolding {
  /** Evidence bodies its materials and its pulls pointed at. */
  content_refs: readonly string[];
  /** Pulls whose search records belong to it. */
  operation_ids: readonly string[];
}

export interface FeedSourceHistoryRelease {
  bodies_deleted: number;
  /** Still referenced by something else, or not provably unreferenced. */
  bodies_kept: number;
  records_deleted: number;
  /**
   * False when part of it could not be done: either references could not be counted everywhere (no body was deleted),
   * or the search records could not be forgotten.
   */
  complete: boolean;
}

/** The run receipt names the bodies a pull's search record holds; Feed writes the list, the Home-wide count reads it. */
export const FEED_RECEIPT_CONTENT_REFS = "content_refs";

export function receiptContentRefs(receipt: unknown): string[] {
  const refs = receipt !== null && typeof receipt === "object" ? (receipt as Record<string, unknown>)[FEED_RECEIPT_CONTENT_REFS] : undefined;
  return Array.isArray(refs) ? refs.filter((ref): ref is string => typeof ref === "string") : [];
}

export function withReceiptContentRefs(receipt: Record<string, unknown> | null, refs: Iterable<string>): Record<string, unknown> {
  const merged = [...new Set([...receiptContentRefs(receipt), ...refs])].sort();
  return { ...receipt, ...(merged.length > 0 ? { [FEED_RECEIPT_CONTENT_REFS]: merged } : {}) };
}

function collectHoldings(items: Iterable<{ source_id: string | null; materials: ReadonlyArray<{ content_ref?: string | null }> }>,
  runs: Iterable<{ source_id: string; operation_id: string; receipt: unknown }>, sourceId: string): FeedSourceHistoryHolding {
  const refs = new Set<string>();
  for (const item of items) {
    if (item.source_id !== sourceId) continue;
    for (const material of item.materials) if (material.content_ref) refs.add(material.content_ref);
  }
  const operations: string[] = [];
  for (const run of runs) {
    if (run.source_id !== sourceId) continue;
    operations.push(run.operation_id);
    for (const ref of receiptContentRefs(run.receipt)) refs.add(ref);
  }
  return { content_refs: [...refs].sort(), operation_ids: operations.sort() };
}

function holdingsOfSource(ports: FeedApplicationPorts, projectId: string, sourceId: string): FeedSourceHistoryHolding {
  return collectHoldings(ports.feed.query.list(projectId), ports.listener.listRuns(projectId).map(run => ({ ...run, receipt: run.connector_receipt })), sourceId);
}

/** What a source's history holds, read from the Feed's snapshot: for a Feed that releases it through other services before the rows go. */
export function holdingsOfSnapshot(snapshot: Pick<FeedSnapshot, "feed_items" | "runs">, sourceId: string): FeedSourceHistoryHolding {
  return collectHoldings(snapshot.feed_items, snapshot.runs, sourceId);
}

function releaseSourceHistory(
  ports: FeedApplicationPorts,
  projectId: string,
  sourceId: string,
  held: FeedSourceHistoryHolding,
): void {
  if (!ports.history) return;
  let outcome: FeedSourceHistoryRelease;
  try {
    outcome = ports.history.release({ project_id: projectId, source_id: sourceId, ...held });
  } catch {
    outcome = { bodies_deleted: 0, bodies_kept: held.content_refs.length, records_deleted: 0, complete: false };
  }
  ports.appendEvent(
    projectId,
    "feed_source",
    sourceId,
    "feed_source.history_released",
    outcome.complete ? "来源的本地正文与检索记录已清理" : "来源的本地正文未能确认无人引用，已保留",
    { ...outcome },
    new Date().toISOString(),
  );
}

/**
 * Retires a source in one transaction: with its local history, the Items, pulls and fault entries go; otherwise they stay
 * as the record they were. What the deleted history left outside the project database goes right after the commit.
 */
export function retireFeedSource(
  ports: FeedApplicationPorts,
  projectId: string,
  sourceId: string,
  historyDecision: SourceHistoryDecision,
  toRecord: (source: SourceRecord) => FeedSourceRecord,
): FeedSourceRecord {
  const held: { value?: FeedSourceHistoryHolding } = {};
  const retired = ports.transaction(() => {
    const now = new Date().toISOString();
    if (historyDecision === "delete_local_history") {
      held.value = holdingsOfSource(ports, projectId, sourceId);
      ports.feed.commands.deleteBySource(projectId, sourceId);
      ports.attention.commands.deleteSubject(projectId, "source_fault", sourceId);
      ports.listener.deleteSourceState(projectId, sourceId);
    } else {
      // Only a successful sync resolves a fault, and a retired source can no longer sync. The entry stays as a
      // closed reference, like the retained items' own entries, instead of asking for a fix that cannot happen.
      for (const entry of ports.attention.query.findForSubject(projectId, "source_fault", sourceId)) {
        if (entry.status === "open" || entry.status === "in_progress") {
          ports.attention.commands.setStatus(projectId, entry.entry_id, "dismissed", entry.revision);
        }
      }
    }
    const record = toRecord(ports.sources.commands.retire(projectId, sourceId, historyDecision, now));
    ports.appendEvent(
      projectId,
      "feed_source",
      sourceId,
      "feed_source.deleted",
      historyDecision === "delete_local_history" ? "来源及本地历史已删除" : "来源已删除，本地历史保留",
      { history_decision: historyDecision },
      now,
    );
    return record;
  });
  if (held.value) releaseSourceHistory(ports, projectId, sourceId, held.value);
  return retired;
}
