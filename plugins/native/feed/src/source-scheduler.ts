import { toFeedPublicError } from "./application-errors.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceService } from "./source-service.js";
import type { FeedSourceSyncResult } from "./source-ports.js";
import { createFeedSourceSyncGuard, type FeedSourceSyncAuthority, type FeedSourceSyncGuard } from "./source-sync-guard.js";
import { stableId } from "./source-input.js";
import { runIsMissed } from "@molis-ai/molis-work-contracts/platform/actions";
import { missedPullRunId } from "./missed-pulls.js";

export interface FeedSourceSchedulerResult {
  due: number;
  completed: number;
  failed: number;
  skipped: number;
}

export type FeedSourceSchedulerDispatch = (
  source: FeedSourceRecord,
  idempotencyKey: string,
  authority: FeedSourceSyncAuthority & { beforeEffect(): Promise<void> },
) => Promise<FeedSourceSyncResult | void>;

export class FeedSourceScheduler {
  constructor(
    readonly projectId: string,
    private readonly createService: () => Pick<FeedSourceService, "dueSources" | "advanceSchedule" | "feed" | "ports">,
    private readonly dispatch: FeedSourceSchedulerDispatch,
    private readonly now: () => Date = () => new Date(),
    private readonly inFlight = new Set<string>(),
  ) {}

  async tick(at: Date = this.now(), authority: FeedSourceSyncAuthority = {}): Promise<FeedSourceSchedulerResult> {
    const service = this.createService();
    const due = service.dueSources(at);
    const result: FeedSourceSchedulerResult = {
      due: due.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
    const attempts = await Promise.allSettled(due.map(async (source) => {
      const schedule = source.schedule;
      if (schedule.mode !== "interval" || !schedule.next_pull_at) return;
      // Far past its time (Molis Work was not running, or the computer slept): written down for the person, not pulled now; the next
      // time comes as usual (resident runtime §2.1). 「现在做」 puts the source back at the time it missed with the decision kept on that
      // row, so that slot is pulled whenever the next tick comes, however late, and is never written down a second time.
      // The row keeps the time as an ISO instant (a connector may set the next pull with an offset), so its seven days compare as text.
      const due = Date.parse(schedule.next_pull_at), dueAt = Number.isFinite(due) ? new Date(due).toISOString() : schedule.next_pull_at;
      if (runIsMissed(dueAt, at.getTime())
        && service.feed.sources.missed.get(this.projectId, missedPullRunId(source.source_id, dueAt))?.decision !== "run_now") {
        const plannedAt = schedule.next_pull_at, guard = createFeedSourceSyncGuard(service.feed, source, authority);
        await guard();
        await this.write(service, () => {
          guard.check();
          service.feed.sources.missed.record(this.projectId, { run_id: missedPullRunId(source.source_id, dueAt), source_id: source.source_id,
            title: [...source.name].slice(0, 300).join("") || source.source_id, due_at: dueAt, missed_at: at.toISOString() });
          return service.advanceSchedule(source.source_id, plannedAt, at);
        });
        result.skipped += 1;
        return;
      }
      if (this.inFlight.has(source.source_id)) {
        result.skipped += 1;
        return;
      }
      this.inFlight.add(source.source_id);
      const plannedAt = schedule.next_pull_at;
      const key = stableId("scheduled", `${source.source_id}\u0000${plannedAt}`);
      let beforeEffect: FeedSourceSyncGuard = createFeedSourceSyncGuard(service.feed, source, authority);
      try {
        try {
          await beforeEffect();
          const pulled = await this.dispatch(source, key, { ...authority, beforeEffect });
          // A successful pull can legitimately refresh account metadata. Pin its committed source for schedule bookkeeping.
          beforeEffect = createFeedSourceSyncGuard(service.feed, pulled?.source ?? source, authority);
          await beforeEffect();
          result.completed += 1;
        } catch (error) {
          result.failed += 1;
          // The sync records its own interrupted run on the source after its last check, so the guard pinned to the
          // pre-pull revision would read that write as someone else's edit and the slot would never be spent.
          // A rate-limited connector pull also writes its own `retry_after_at` backoff onto `next_pull_at`; pin that
          // exact receipt timestamp while still refusing any concurrent user edit to the source or schedule cadence.
          // A guard that already refused stays refused: authority and the person's edits are never bookkept past.
          if (!beforeEffect.refused) {
            const expected = ownRateLimitBackoff(service.feed, this.projectId, source, key, error);
            beforeEffect = createFeedSourceSyncGuard(service.feed, expected, authority, { afterOwnFailure: true });
          }
          await beforeEffect();
          await this.recordActionableFault(service, source, error, at, beforeEffect);
        }
        await beforeEffect();
        // Checked again inside the transaction: a source changed while the commit waited keeps the schedule the person gave it (FI-C-05).
        const guard = beforeEffect;
        await this.write(service, () => { guard.check(); return service.advanceSchedule(source.source_id, plannedAt, at); });
      } finally {
        this.inFlight.delete(source.source_id);
      }
    }));
    // Keep the invocation alive until every dispatched source has stopped, including when one loses authority.
    const refused = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    if (refused) throw refused.reason;
    return result;
  }

  isRunning(sourceId: string): boolean {
    return this.inFlight.has(sourceId);
  }

  /** A write after the tick has waited: the Runtime's commit of the call's own, or just the operation where writes are not the caller's transactions. */
  private write<T>(service: Pick<FeedSourceService, "ports">, operation: () => T): Promise<T> {
    return service.ports.commit ? service.ports.commit(operation) : Promise.resolve(operation());
  }

  private async recordActionableFault(service: Pick<FeedSourceService, "feed" | "ports">, source: FeedSourceRecord, error: unknown, at: Date, guard: FeedSourceSyncGuard): Promise<void> {
    const publicError = toFeedPublicError(error);
    if (publicError.retryable || !["auth", "configuration", "stale_cursor"].includes(publicError.category)) {
      return;
    }
    const feed = service.feed;
    await this.write(service, () => {
      guard.check();
      const stored = feed.createInboxEntry({
        projectId: this.projectId,
        subjectType: "source_fault",
        subjectId: source.source_id,
        reason: "source_fault",
        detail: {
          error_code: publicError.code,
          category: publicError.category,
          retryable: publicError.retryable,
          user_action: publicError.user_action,
          detected_at: at.toISOString(),
        },
        at: at.toISOString(),
      });
      if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
        feed.setInboxEntryStatus(this.projectId, stored.entry.entry_id, "open", stored.entry.revision);
      }
    });
    await feed.flushPendingJudgments();
  }
}

/**
 * When this exact scheduled pull failed with `connector.rate_limited` and recorded a `retry_after_at` backoff on the
 * source's `next_pull_at`, reflect that receipt timestamp in the post-failure guard so the backoff sticks without
 * tripping `feed.source_changed` while still rejecting any concurrent edit to other source or schedule fields.
 */
function ownRateLimitBackoff(
  feed: FeedSourceService["feed"],
  projectId: string,
  source: FeedSourceRecord,
  key: string,
  error: unknown,
): FeedSourceRecord {
  if (source.schedule.mode !== "interval" || toFeedPublicError(error).code !== "connector.rate_limited") return source;
  const operationId = stableId("connector-operation", `${source.source_id}\u0000${key}\u0000normal`);
  const retryAfterAt = feed.sources.runByOperationId(projectId, operationId)?.receipt?.retry_after_at;
  if (typeof retryAfterAt !== "string" || !Number.isFinite(Date.parse(retryAfterAt))) return source;
  return { ...source, schedule: { ...source.schedule, next_pull_at: retryAfterAt } };
}
