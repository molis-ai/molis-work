import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedApplicationPorts } from "./application-ports.js";
import type { FeedSourceRecord, SourceHistoryDecision } from "./projection.js";

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

export function holdingsOfSource(ports: FeedApplicationPorts, projectId: string, sourceId: string): FeedSourceHistoryHolding {
  const refs = new Set<string>();
  for (const item of ports.feed.query.list(projectId)) {
    if (item.source_id !== sourceId) continue;
    for (const material of item.materials) if (material.content_ref) refs.add(material.content_ref);
  }
  const operations: string[] = [];
  for (const run of ports.listener.listRuns(projectId)) {
    if (run.source_id !== sourceId) continue;
    operations.push(run.operation_id);
    for (const ref of receiptContentRefs(run.connector_receipt)) refs.add(ref);
  }
  return { content_refs: [...refs].sort(), operation_ids: operations.sort() };
}

export function releaseSourceHistory(
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
