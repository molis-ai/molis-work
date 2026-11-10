import { WORK_STATE_COPY } from "./goal-state-copy.js";
import type { GoalDisplayStatus } from "./tree-order.js";
import type { GoalStatusTranslate } from "./goal-state-explanation.js";

export const GOAL_DISPLAY_STATUSES: readonly GoalDisplayStatus[] = [
  "continue",
  "in_progress",
  "waiting_user",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
];

const STATUS_LABELS: Record<GoalDisplayStatus, string> = {
  continue: WORK_STATE_COPY.execution_pending.label,
  in_progress: WORK_STATE_COPY.executing.label,
  waiting_user: WORK_STATE_COPY.waiting_for_human.label,
  waiting: "等待中",
  blocked: WORK_STATE_COPY.execution_blocked.label,
  completed: WORK_STATE_COPY.satisfied.label,
  cancelled: WORK_STATE_COPY.invalidated.label,
};

export function createGoalActionPresenter(L: GoalStatusTranslate) {
  function goalDisplayStatusLabel(status: GoalDisplayStatus): string {
    return L(STATUS_LABELS[status]);
  }
  return { goalDisplayStatusLabel };
}
