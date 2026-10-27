import { randomUUID } from "node:crypto";
import type {
  GoalReportWorkEventRecord,
  ReportGoalEventsInput,
  ReportGoalEventsRecordedResult,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";
import { goalErrors } from "./errors.js";
import type { GoalEventFactsConfig } from "./event-facts-config.js";
import { parseOptionalReportProgress } from "./event-facts-validation.js";
import { mapReportEvent } from "./event-facts-mapping.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import type { StoredWorkEvent } from "./event-facts-work-event-records.js";
import type { GoalEventState } from "./event-state.js";
import { eventActorKind } from "./event-state-write.js";
import { requireWritableGoal } from "./goal-writable.js";

/** Recording the work events and requirement judgments an agent reports on a Goal, with the progress summary that may ride along. */
export class GoalEventReporting {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
    private readonly configWrites: GoalEventFactsConfig,
    private readonly state: GoalEventState,
  ) {}

  report(input: ReportGoalEventsInput): ReportGoalEventsRecordedResult {
    const progress = parseOptionalReportProgress(input.progress);
    const hash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      events: input.events,
      progress,
    });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<ReportGoalEventsRecordedResult, "replayed">>(
        input.project_id, input.actor_id, "report_goal_events", input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = requireWritableGoal(this.context, input.project_id, input.goal_id);
      if (!this.state.isEventStateOwner(goal.project_id, goal.goal_id)) {
        throw goalErrors["goals.event_state.not_owner"]("这个 Goal 还没有事件状态归属。请先保存意图或登记事件配置，不要把旧完成入口和新状态效果混用");
      }
      if (!Array.isArray(input.events) || input.events.length === 0) {
        throw goalErrors["goals.event_report.empty_batch"]("至少需要一条工作事实");
      }
      const prepared = input.events.map((item, index) => this.configWrites.prepareReport(goal, item, index));
      const at = this.context.now().toISOString();
      const actorKind = eventActorKind(input.actor_kind);
      const stored: GoalReportWorkEventRecord[] = [];
      for (const item of prepared) {
        const eventId = `gevt-${randomUUID()}`;
        const cursor = this.context.repository.appendEvent({
          eventId,
          projectId: goal.project_id,
          actorId: input.actor_id,
          type: "goal.work_event.recorded",
          objectType: "goal_work_event",
          objectId: eventId,
          reason: item.title,
          payload: {
            type_id: item.type.type_id,
            type_version: item.type.version,
            fields: item.fields,
            judgments: item.judgments,
          },
          at,
        });
        const event: StoredWorkEvent = {
          event_id: eventId,
          project_id: goal.project_id,
          goal_id: goal.goal_id,
          kind: "report",
          type_id: item.type.type_id,
          type_version: item.type.version,
          title: item.title,
          payload: item.fields,
          actor_id: input.actor_id,
          actor_kind: actorKind,
          received_at: at,
          journal_seq: cursor,
          config_version: this.records.config.getConfig(goal.project_id, goal.goal_id)?.current_version ?? null,
        };
        this.records.workEvents.insertWorkEvent(event);
        this.records.workEvents.insertJudgments(eventId, item.judgments);
        stored.push(mapReportEvent(this.records, event));
      }
      const judged = [...new Set(prepared.flatMap((item) => item.judgments.map((judgment) => judgment.requirement_id)))];
      this.state.reassessAfterReports(goal, input.actor_id, actorKind, judged);
      if (progress) {
        this.state.writeProgress(goal, input.actor_id, actorKind, {
          summary: progress.summary,
          based_on_cursor: this.records.workEvents.maxGoalCursor(goal.project_id, goal.goal_id),
          next_step: progress.next_step,
          next_actor: progress.next_actor,
        });
      }
      const outcome = {
        events: stored,
        observed_event_cursor: this.context.repository.eventCursor(goal.project_id),
      };
      this.context.remember(goal.project_id, input.actor_id, "report_goal_events", input.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }
}
