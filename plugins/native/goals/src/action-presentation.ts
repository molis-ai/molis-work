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
  continue: "可继续",
  in_progress: "进行中",
  waiting_user: "等你",
  waiting: "等待中",
  blocked: "受阻",
  completed: "已完成",
  cancelled: "已取消",
};

export function createGoalActionPresenter(L: GoalStatusTranslate) {
  function goalDisplayStatusLabel(status: GoalDisplayStatus): string {
    return L(STATUS_LABELS[status]);
  }
  return { goalDisplayStatusLabel };
}
