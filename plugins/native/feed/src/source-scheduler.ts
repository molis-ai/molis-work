import { toFeedPublicError } from "./application-errors.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceService } from "./source-service.js";

export interface FeedSourceSchedulerResult {
  due: number;
  completed: number;
  failed: number;
  skipped: number;
}

export type FeedSourceSchedulerDispatch = (
  source: FeedSourceRecord,
  idempotencyKey: string,
) => Promise<unknown>;

export class FeedSourceScheduler {
  private readonly inFlight = new Set<string>();

  constructor(
    readonly boardId: string,
    private readonly createService: () => Pick<FeedSourceService, "dueSources" | "advanceSchedule" | "feed">,
    private readonly dispatch: FeedSourceSchedulerDispatch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async tick(at: Date = this.now()): Promise<FeedSourceSchedulerResult> {
    const service = this.createService();
    const due = service.dueSources(at);
    const result: FeedSourceSchedulerResult = {
      due: due.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
    await Promise.all(due.map(async (source) => {
      const schedule = source.schedule;
      if (schedule.mode !== "interval" || !schedule.next_pull_at) return;
      if (this.inFlight.has(source.source_id)) {
        result.skipped += 1;
        return;
      }
      this.inFlight.add(source.source_id);
      const plannedAt = schedule.next_pull_at;
      const key = `scheduled:${source.source_id}:${plannedAt}`;
      try {
        await this.dispatch(source, key);
        result.completed += 1;
      } catch (error) {
        result.failed += 1;
        await this.recordActionableFault(source, error, at);
      } finally {
        this.inFlight.delete(source.source_id);
        service.advanceSchedule(source.source_id, plannedAt, at);
      }
    }));
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
      boardId: this.boardId,
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
      feed.setInboxEntryStatus(this.boardId, stored.entry.entry_id, "open", stored.entry.revision);
    }
    await feed.flushPendingJudgments();
  }
}
