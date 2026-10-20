import type {
  AcknowledgeGoalEventInput,
  GoalEventAcknowledgementCategory,
  GoalEventAcknowledgementReference,
  GoalEventAcknowledgementsApi,
  GoalEventMutationResult,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { requestHash, type GoalsCommandContext } from "./command-support.js";
import { goalErrors } from "./errors.js";
import type { GoalEventFactsRepository, StoredWorkEvent } from "./event-facts-repository.js";
import { requiredText } from "./event-facts-validation.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";
import { eventActorKind, mutateGoalEventState, type GoalEventStateWriteDeps } from "./event-state-write.js";
import { insertGoalSystemEvent } from "./event-system-insert.js";
import { requireWritableGoal } from "./goal-writable.js";

/** What an acknowledgement may point at, by the system operation that wrote the record; a configuration record is a requirement too. */
const SYSTEM_CATEGORIES: Readonly<Record<string, GoalEventAcknowledgementCategory>> = {
  observation_note: "note",
  agreement_set: "requirement",
  user_decision: "decision",
};

function acknowledgeable(event: StoredWorkEvent): { category: GoalEventAcknowledgementCategory; operation: string | null } | null {
  if (event.kind === "configuration") return { category: "requirement", operation: null };
  const operation = event.kind === "system" ? String(event.payload.operation ?? "") : "";
  const category = SYSTEM_CATEGORIES[operation];
  return category ? { category, operation } : null;
}

/**
 * An AI session's statement that it read a note, a requirement or the person's decision on a Goal and how it will treat it. A claim, not a
 * fact about the Goal: it lands as one `system` record on the Goal's timeline and changes nothing else. Who said it comes from the call
 * (`by`); the record it is about is copied from that record, not from the input. The note's length (1 to 300 characters) and the treatment
 * word are the action schema's rules. A cancelled Goal takes it like any ordinary record and stays cancelled.
 */
export class GoalEventAcknowledgements implements GoalEventAcknowledgementsApi {
  private readonly writes: GoalEventStateWriteDeps;

  constructor(
    private readonly context: GoalsCommandContext,
    private readonly facts: GoalEventFactsRepository,
    records: GoalEventStateRepository,
  ) {
    this.writes = { context, records, host: {
      requireWritableGoal: (projectId, goalId) => requireWritableGoal(context, projectId, goalId),
      actorKind: eventActorKind,
    } };
  }

  acknowledge(input: AcknowledgeGoalEventInput): GoalEventMutationResult {
    const hash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      event_id: input.event_id,
      treatment: input.treatment,
      note: input.note,
      read_cursor: input.read_cursor,
    });
    return mutateGoalEventState(this.writes, input, "acknowledge_goal_event", hash, (goal, actorKind) => {
      const note = requiredText(input.note, "goals.event_note.body_required", "处理说明需要原文").trim();
      const reference = this.reference(goal.project_id, goal.goal_id, input.event_id);
      this.assertCursor(goal.project_id, input.read_cursor, reference);
      const event = insertGoalSystemEvent(this.context, this.facts, goal, input.actor_id, actorKind, note.slice(0, 80), {
        operation: "input_acknowledged",
        reference,
        treatment: input.treatment,
        note,
        read_cursor: input.read_cursor,
        by: { channel: input.by.channel, runtime_id: input.by.runtime_id, session_id: input.by.session_id },
      });
      return { event_id: event.event_id, observed_event_cursor: event.journal_seq, recorded: true as const };
    });
  }

  /** The record on this Goal the caller named. One refusal covers a record that does not exist, is on another Goal or in another project. */
  private reference(projectId: string, goalId: string, eventId: string): GoalEventAcknowledgementReference {
    const event = this.facts.getWorkEvent(projectId, goalId, eventId);
    if (!event) throw goalErrors["goals.event_acknowledgement.reference_missing"]("这个 Goal 上没有这条记录");
    const kind = acknowledgeable(event);
    if (!kind) throw goalErrors["goals.event_acknowledgement.reference_kind"]("只能对笔记、要求或本人的决定说明处理方式");
    return { event_id: event.event_id, category: kind.category, operation: kind.operation, title: event.title, journal_seq: event.journal_seq };
  }

  /** The cursor is the session's own word for how far it had read: it only has to exist, and not be before the record it answers. */
  private assertCursor(projectId: string, cursor: number, reference: GoalEventAcknowledgementReference): void {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.context.repository.eventCursor(projectId)) {
      throw goalErrors["goals.event_acknowledgement.cursor_invalid"]("读到的游标必须是项目里已经存在的事件游标");
    }
    if (cursor < reference.journal_seq) {
      throw goalErrors["goals.event_acknowledgement.cursor_before_reference"]("读到的游标不能早于被说明的这条记录");
    }
  }
}
