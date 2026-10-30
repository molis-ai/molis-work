import type {
  GoalIntentSourceKind,
  GoalEventHistoryPage,
  GoalEventHistoryQuery,
  GoalEventLatestReports,
  GoalEventLatestReportsQuery,
  GoalEventListPage,
  GoalEventListQuery,
  GoalEventTimelinePage,
  GoalWorkEventRecord,
} from "../contract/goals.js";
import { GoalsCommandContext } from "./command-support.js";
import { goalErrors } from "./errors.js";
import { mapReportEvent, mapStoredWorkEvent, mapTimelineItem } from "./event-facts-mapping.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_LATEST_REPORTS = 5;
const MAX_LATEST_REPORTS = 20;

/** Paged reads of a Goal's work events, timeline and latest reports, and the channel its intent came in on. */
export class GoalEventReads {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
  ) {}

  listEvents(projectId: string, goalId: string, query: GoalEventListQuery = {}): GoalEventListPage {
    this.context.requireGoal(projectId, goalId);
    const afterCursor = query.after_cursor ?? 0;
    if (!Number.isInteger(afterCursor) || afterCursor < 0) {
      throw goalErrors["goals.event_list.invalid_cursor"]("分页游标必须是非负整数");
    }
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw goalErrors["goals.event_list.invalid_limit"](`每页最多 ${MAX_PAGE_SIZE} 条`);
    }
    const rows = this.records.workEvents.listWorkEvents(projectId, goalId, afterCursor, limit);
    return {
      events: rows.map((row) => mapStoredWorkEvent(this.records, row)),
      next_cursor: rows.length === limit ? rows[rows.length - 1]!.journal_seq : null,
      observed_event_cursor: this.context.repository.eventCursor(projectId),
    };
  }

  listLatestEvents(projectId: string, goalId: string, query: GoalEventHistoryQuery = {}): GoalEventHistoryPage {
    const rows = this.latestWorkEventRows(projectId, goalId, query);
    return {
      events: rows.map((row) => mapStoredWorkEvent(this.records, row)),
      next_cursor: rows.length === (query.limit ?? DEFAULT_PAGE_SIZE) ? rows[rows.length - 1]!.journal_seq : null,
      observed_event_cursor: this.context.repository.eventCursor(projectId),
    };
  }

  listLatestTimeline(projectId: string, goalId: string, query: GoalEventHistoryQuery = {}): GoalEventTimelinePage {
    const rows = this.latestWorkEventRows(projectId, goalId, query);
    return {
      items: rows.map((row) => mapTimelineItem(this.records, row)),
      next_cursor: rows.length === (query.limit ?? DEFAULT_PAGE_SIZE) ? rows[rows.length - 1]!.journal_seq : null,
      observed_event_cursor: this.context.repository.eventCursor(projectId),
    };
  }

  listLatestReports(projectId: string, goalId: string, query: GoalEventLatestReportsQuery = {}): GoalEventLatestReports {
    this.context.requireGoal(projectId, goalId);
    const limit = query.limit ?? DEFAULT_LATEST_REPORTS;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LATEST_REPORTS) {
      throw goalErrors["goals.event_list.invalid_limit"](`最新报告最多 ${MAX_LATEST_REPORTS} 条`);
    }
    return {
      reports: this.records.workEvents.listLatestReportEvents(projectId, goalId, limit).map((row) => mapReportEvent(this.records, row)),
      observed_event_cursor: this.context.repository.eventCursor(projectId),
    };
  }

  readEvent(projectId: string, goalId: string, eventId: string): GoalWorkEventRecord {
    this.context.requireGoal(projectId, goalId);
    const row = this.records.workEvents.getWorkEvent(projectId, goalId, eventId);
    if (!row) throw goalErrors["goals.event.not_found"](`事件不存在: ${eventId}`);
    return mapStoredWorkEvent(this.records, row);
  }

  readIntentSourceKind(projectId: string, goalId: string): GoalIntentSourceKind | null {
    this.context.requireGoal(projectId, goalId);
    const row = this.records.workEvents.getIntentCreatedEvent(projectId, goalId);
    const value = row?.payload.source_kind;
    if (value === "web" || value === "onboarding" || value === "feed" || value === "runtime" || value === "tree") {
      return value;
    }
    return null;
  }

  private latestWorkEventRows(projectId: string, goalId: string, query: GoalEventHistoryQuery) {
    this.context.requireGoal(projectId, goalId);
    const beforeCursor = query.before_cursor;
    if (beforeCursor != null && (!Number.isInteger(beforeCursor) || beforeCursor < 1)) {
      throw goalErrors["goals.event_list.invalid_cursor"]("最新页游标必须是正整数");
    }
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw goalErrors["goals.event_list.invalid_limit"](`每页最多 ${MAX_PAGE_SIZE} 条`);
    }
    return this.records.workEvents.listLatestWorkEvents(projectId, goalId, beforeCursor ?? null, limit);
  }
}
