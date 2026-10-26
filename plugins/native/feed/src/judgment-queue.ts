import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionError, platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplicationPorts } from "./application-ports.js";
import type { FeedItemRecord, InboxEntryRecord } from "./projection.js";

interface QueuedEntry { project_id: string; entry_id: string }

/** What the queue reads when it judges: the records as they are now, and which out rules ask for a judgment of an item. */
interface JudgmentReads {
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
 *
 * When the caller goes away (a `cancelled` failure), judging stops: every judgment after it would spend a model call only
 * to be refused. A flush puts back what it had not started on, for the next flush. `judgeOwn` does not: under another
 * producer's flush the rest would be judged with that producer's identity. What it leaves is simply not judged, and as a
 * cancelled call writes nothing, no judgment or failure of it is recorded. The subject being judged when the caller went
 * away is not put back either way: some of its judgments may already have taken effect, and judging it again would repeat them.
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
    const items = this.items.splice(0);
    // Entries are taken only once the items are judged, so the entries those judgments created are judged in this flush too.
    await judgeEach([() => this.judgeItems(items, caller, rest => this.items.unshift(...rest)), () => this.judgeEntries(this.takeEntries(), caller, this.requeueEntries)], run => run());
  }

  /** Judge only the named queued entries, or all of them when none are named. Others' events stay for their producers. */
  async flushEntries(caller?: ActionCallContext, entryIds?: readonly string[]): Promise<void> {
    await this.judgeEntries(this.takeEntries(entryIds), caller, this.requeueEntries);
  }

  /**
   * Run a synchronous step that queues work, then judge as `caller` exactly what that step queued (and `also`, items the
   * step did not queue but the caller owns). Nothing queued by anyone else is touched, however long the model takes.
   */
  judgeOwn<T>(step: () => T, caller?: ActionCallContext, also: readonly FeedItemRecord[] = []): Promise<T> {
    const queuedItems = this.items.length, alreadyQueued = new Set(this.entries.keys());
    // Not an `async` method: the step's own failure is thrown to the caller, not returned as a rejection, so a Runtime that commits the
    // step as one write can roll all of it back.
    const result = step();
    // The step cannot be interleaved with another call, so what the queues gained since the marks above is the step's own.
    const ownItems = this.items.splice(queuedItems);
    const ownEntries = this.takeEntries([...this.entries].filter(([key]) => !alreadyQueued.has(key)).map(([, entry]) => entry.entry_id));
    return judgeEach([() => this.judgeItems([...ownItems, ...also], caller), () => this.judgeEntries(ownEntries, caller)], run => run()).then(() => result);
  }

  private takeEntries(entryIds?: readonly string[]): QueuedEntry[] {
    // A composed operation owns only its own entries; it cannot drain another producer's queued events with its identity.
    const selected = entryIds ? new Set(entryIds) : null;
    const taken = [...this.entries.values()].filter(entry => !selected || selected.has(entry.entry_id));
    for (const entry of taken) this.entries.delete(JSON.stringify([entry.project_id, entry.entry_id]));
    return taken;
  }

  private readonly requeueEntries = (entries: readonly QueuedEntry[]): void => { for (const entry of entries) this.queueEntry(entry); };

  private judgeItems(queued: readonly FeedItemRecord[], caller?: ActionCallContext, untried?: (rest: FeedItemRecord[]) => void): Promise<void> {
    return judgeEach(queued, async ({ project_id, item_id }) => {
      let item: FeedItemRecord;
      try { item = this.reads.feedItem(project_id, item_id); }
      catch (error) { if (error instanceof ActionError && error.code === "feed.item_not_found") return; throw error; }
      await judgeEach([
        () => this.ports.captureJudgment?.({ project_id: item.project_id, item_id: item.item_id, rule_ids: this.reads.judgedRuleIds(item) }, caller),
        () => this.ports.homeJudgment?.({ kind: "feed_item", id: item.item_id, project_id: item.project_id }, caller),
      ], run => run());
    }, untried);
  }

  private judgeEntries(queued: readonly QueuedEntry[], caller?: ActionCallContext, untried?: (rest: QueuedEntry[]) => void): Promise<void> {
    return judgeEach(queued, async event => {
      // Module events can occur inside a transaction that is later rolled back.
      let entry: InboxEntryRecord;
      try { entry = this.reads.inboxEntry(event.project_id, event.entry_id); }
      catch (error) { if (error instanceof ActionError && error.code === "inbox.entry_not_found") return; throw error; }
      if (entry.status !== "open" && entry.status !== "in_progress") return;
      await judgeEach([
        () => this.ports.inboxJudgment?.(entry, caller),
        () => this.ports.homeJudgment?.({ kind: "inbox_entry", id: entry.entry_id, project_id: entry.project_id }, caller),
      ], run => run());
    }, untried);
  }
}

/**
 * Judge every subject taken off the queue, in order, even when one before it fails: the queue no longer holds them, so
 * stopping at the first failure would drop the rest unjudged. The first failure is thrown once all have been tried.
 * A cancelled caller is the exception: it stops at once, and the subjects after the one it stopped on go to `untried`.
 */
async function judgeEach<T>(subjects: readonly T[], judge: (subject: T) => unknown, untried?: (rest: T[]) => void): Promise<void> {
  let failed: { error: unknown } | undefined;
  for (const [index, subject] of subjects.entries()) {
    try { await judge(subject); }
    catch (error) {
      if (cancelled(error)) { untried?.(subjects.slice(index + 1)); throw error; }
      failed ??= { error };
    }
  }
  if (failed) throw failed.error;
}

function cancelled(error: unknown): boolean {
  return error instanceof ActionError && (error.kind ?? platformErrorKind(error.code)) === "cancelled";
}
