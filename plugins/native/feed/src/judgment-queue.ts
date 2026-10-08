import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { FeedStoreError } from "./application-errors.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import type { FeedItemRecord, InboxEntryRecord } from "./projection.js";

interface QueuedEntry { project_id: string; entry_id: string }

/** What the queue reads when it judges: the records as they are now, and which out rules ask for a judgment of an item. */
export interface JudgmentReads {
  feedItem(projectId: string, itemId: string): FeedItemRecord;
  inboxEntry(projectId: string, entryId: string): InboxEntryRecord;
  judgedRuleIds(item: FeedItemRecord): string[];
}

/**
 * The Feed items and Inbox entries that commits left to be judged, shared by every producer of one application.
 *
 * Whoever judges them does so with its own authority. A producer with no caller (a source sync, the scheduler) flushes
 * what is queued. A call that waits on a model beside the project's queue (a concurrent action) must not: while it waits,
 * other producers queue their own work, and judging that under this caller would lend them its identity. Such a call
 * judges only what its own synchronous step queued (`judgeOwn`), or the entries it names (`flushEntries`).
 */
export class JudgmentQueue {
  private items: FeedItemRecord[] = [];
  private readonly entries = new Map<string, QueuedEntry>();

  constructor(private readonly ports: Pick<FeedApplicationPorts, "captureJudgment" | "homeJudgment" | "inboxJudgment">, private readonly reads: JudgmentReads) {}

  queueItem(item: FeedItemRecord): void {
    if (this.ports.captureJudgment || this.ports.homeJudgment) this.items.push(item);
  }

  queueEntry(entry: QueuedEntry): void {
    this.entries.set(JSON.stringify([entry.project_id, entry.entry_id]), entry);
  }

  /** Judge everything queued, entries included, as `caller` (none for a background producer). */
  async flush(caller?: ActionCallContext): Promise<void> {
    await this.judgeItems(this.items.splice(0), caller);
    await this.judgeEntries(this.takeEntries(), caller);
  }

  /** Judge only the named queued entries, or all of them when none are named. Others' events stay for their producers. */
  async flushEntries(caller?: ActionCallContext, entryIds?: readonly string[]): Promise<void> {
    await this.judgeEntries(this.takeEntries(entryIds), caller);
  }

  /**
   * Run a synchronous step that queues work, then judge as `caller` exactly what that step queued (and `also`, items the
   * step did not queue but the caller owns). Nothing queued by anyone else is touched, however long the model takes.
   */
  async judgeOwn<T>(step: () => T, caller?: ActionCallContext, also: readonly FeedItemRecord[] = []): Promise<T> {
    const queuedItems = this.items.length, alreadyQueued = new Set(this.entries.keys());
    const result = step();
    // The step cannot be interleaved with another call, so what the queues gained since the marks above is the step's own.
    const ownItems = this.items.splice(queuedItems);
    const ownEntries = this.takeEntries([...this.entries].filter(([key]) => !alreadyQueued.has(key)).map(([, entry]) => entry.entry_id));
    await this.judgeItems([...ownItems, ...also], caller);
    await this.judgeEntries(ownEntries, caller);
    return result;
  }

  private takeEntries(entryIds?: readonly string[]): QueuedEntry[] {
    // A composed operation owns only its own entries; it cannot drain another producer's queued events with its identity.
    const selected = entryIds ? new Set(entryIds) : null;
    const taken = [...this.entries.values()].filter(entry => !selected || selected.has(entry.entry_id));
    for (const entry of taken) this.entries.delete(JSON.stringify([entry.project_id, entry.entry_id]));
    return taken;
  }

  private async judgeItems(queued: readonly FeedItemRecord[], caller?: ActionCallContext): Promise<void> {
    for (const { project_id, item_id } of queued) {
      let item: FeedItemRecord;
      try { item = this.reads.feedItem(project_id, item_id); }
      catch (error) { if (error instanceof FeedStoreError && error.code === "feed_item_not_found") continue; throw error; }
      await this.ports.captureJudgment?.({ project_id: item.project_id, item_id: item.item_id, rule_ids: this.reads.judgedRuleIds(item) }, caller);
      await this.ports.homeJudgment?.({ kind: "feed_item", id: item.item_id, project_id: item.project_id }, caller);
    }
  }

  private async judgeEntries(queued: readonly QueuedEntry[], caller?: ActionCallContext): Promise<void> {
    for (const event of queued) {
      // Module events can occur inside a transaction that is later rolled back.
      let entry: InboxEntryRecord;
      try { entry = this.reads.inboxEntry(event.project_id, event.entry_id); }
      catch (error) { if (error instanceof FeedStoreError && error.code === "inbox_entry_not_found") continue; throw error; }
      if (entry.status !== "open" && entry.status !== "in_progress") continue;
      await this.ports.inboxJudgment?.(entry, caller);
      await this.ports.homeJudgment?.({ kind: "inbox_entry", id: entry.entry_id, project_id: entry.project_id }, caller);
    }
  }
}
