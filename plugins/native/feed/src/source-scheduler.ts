import { toFeedPublicError } from "./application-errors.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceService } from "./source-service.js";
import type { FeedSourceSyncResult } from "./source-ports.js";
import { createFeedSourceSyncGuard, type FeedSourceSyncAuthority } from "./source-sync-guard.js";
import { stableId } from "./source-input.js";

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
    private readonly createService: () => Pick<FeedSourceService, "dueSources" | "advanceSchedule" | "feed">,
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
      if (this.inFlight.has(source.source_id)) {
        result.skipped += 1;
        return;
      }
      this.inFlight.add(source.source_id);
      const plannedAt = schedule.next_pull_at;
      const key = stableId("scheduled", `${source.source_id}\u0000${plannedAt}`);
      let beforeEffect = createFeedSourceSyncGuard(service.feed, source, authority);
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
          await beforeEffect();
          await this.recordActionableFault(source, error, at);
        }
        await beforeEffect();
        service.advanceSchedule(source.source_id, plannedAt, at);
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

  private async recordActionableFault(source: FeedSourceRecord, error: unknown, at: Date): Promise<void> {
    const publicError = toFeedPublicError(error);
    if (publicError.retryable || !["auth", "configuration", "stale_cursor"].includes(publicError.category)) {
      return;
    }
    const feed = this.createService().feed;
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
    await feed.flushPendingJudgments();
  }
}
