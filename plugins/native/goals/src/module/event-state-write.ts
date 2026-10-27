import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";
import { goalErrors } from "./errors.js";
import type { GoalEventStateHost } from "./event-state-host.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";

/** What the write path needs from the event-state class: the command context, the state records and two host checks. */
export interface GoalEventStateWriteDeps {
  readonly context: GoalsCommandContext;
  readonly records: GoalEventStateRepository;
  readonly host: Pick<GoalEventStateHost, "requireWritableGoal" | "actorKind">;
}

/** Ordinary records a cancelled goal still takes. Anything else needs the goal to be resumed first. */
const ORDINARY_RECORD_OPERATIONS: ReadonlySet<string> = new Set(["record_goal_note", "record_goal_progress", "acknowledge_goal_event"]);

/** The kind a write names for its actor: `user`, `runtime`, or none. Anything else is refused. */
export function eventActorKind(kind: "user" | "runtime" | undefined): "user" | "runtime" | null {
  if (kind == null) return null;
  if (kind !== "user" && kind !== "runtime") throw goalErrors["goals.event_report.invalid_actor_kind"]("actor_kind 只能是 user 或 runtime");
  return kind;
}

/** Resuming is the one explicit way out of "cancelled", so a cancelled goal takes it too. */
function cancelledGoalTakes(operation: string): boolean {
  return ORDINARY_RECORD_OPERATIONS.has(operation) || operation === "resume_goal_event_work";
}

/** The goal a state write may land on: writable, and already owned by the event state. */
export function requireOwnedWritableGoal(deps: GoalEventStateWriteDeps, projectId: string, goalId: string): GoalRecord {
  const goal = deps.host.requireWritableGoal(projectId, goalId);
  if (!deps.records.owner.isOwner(projectId, goalId)) {
    throw goalErrors["goals.event_state.not_owner"]("这个 Goal 还没有事件状态归属。请先保存意图或登记事件配置，不要把旧完成入口和新状态效果混用");
  }
  return goal;
}

/** One state write in one immediate transaction: replay by idempotency key, check the goal, write, remember the outcome. */
export function mutateGoalEventState<T extends { event_id: string; observed_event_cursor: number; recorded: true }>(
  deps: GoalEventStateWriteDeps,
  input: { project_id: string; goal_id: string; actor_id: string; actor_kind?: "user" | "runtime"; idempotency_key: string },
  operation: string,
  hash: string,
  write: (goal: GoalRecord, actorKind: "user" | "runtime" | null) => T,
): T & { replayed: boolean } {
  const { context, records, host } = deps;
  return context.repository.immediate(() => {
    const replay = context.replay<T>(input.project_id, input.actor_id, operation, input.idempotency_key, hash);
    if (replay) return { ...replay, replayed: true };
    const goal = requireOwnedWritableGoal(deps, input.project_id, input.goal_id);
    const cancelled = records.owner.workStatus(goal.project_id, goal.goal_id) === "cancelled";
    if (cancelled && !cancelledGoalTakes(operation)) {
      throw goalErrors["goals.event_closure.cancelled"]("已取消的 Goal 不会被普通记录自动恢复，需要显式继续");
    }
    const outcome = write(goal, host.actorKind(input.actor_kind));
    context.remember(goal.project_id, input.actor_id, operation, input.idempotency_key, hash, outcome, context.now().toISOString());
    return { ...outcome, replayed: false };
  });
}
