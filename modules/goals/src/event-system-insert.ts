import { randomUUID } from "node:crypto";
import type {
  GoalEventSystemPayload,
  GoalRecord,
  GoalSystemWorkEventRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsRepository, StoredWorkEvent } from "./event-facts-repository.js";

/**
 * Writes one `kind: "system"` record on a goal: appends it to the `events` log first, then inserts the
 * `goal_work_events` row with the log's cursor. The caller owns the transaction and the idempotency receipt.
 */
export function insertGoalSystemEvent(
  context: GoalsCommandContext,
  facts: GoalEventFactsRepository,
  goal: GoalRecord,
  actorId: string,
  actorKind: "user" | "runtime" | null,
  title: string,
  payload: GoalEventSystemPayload,
): GoalSystemWorkEventRecord {
  const eventId = `gevt-${randomUUID()}`;
  const at = context.now().toISOString();
  const cursor = context.repository.appendEvent({
    eventId,
    projectId: goal.project_id,
    actorId,
    type: `goal.event_state.${payload.operation}`,
    objectType: "goal_work_event",
    objectId: eventId,
    reason: title,
    payload,
    at,
  });
  const stored: StoredWorkEvent = {
    event_id: eventId,
    project_id: goal.project_id,
    goal_id: goal.goal_id,
    kind: "system",
    type_id: null,
    type_version: null,
    title,
    payload,
    actor_id: actorId,
    actor_kind: actorKind,
    received_at: at,
    journal_seq: cursor,
    config_version: facts.getConfig(goal.project_id, goal.goal_id)?.current_version ?? null,
  };
  facts.insertWorkEvent(stored);
  return {
    event_id: eventId,
    project_id: goal.project_id,
    goal_id: goal.goal_id,
    title,
    actor_id: actorId,
    actor_kind: actorKind,
    received_at: at,
    journal_seq: cursor,
    config_version: stored.config_version,
    kind: "system",
    type: null,
    payload,
    judgments: [],
  };
}
