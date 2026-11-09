import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalDisplayStatus } from "./tree-order.js";
import type { GoalStatusTranslate } from "./goal-state-explanation.js";

export const GOAL_DISPLAY_STATUSES: readonly GoalDisplayStatus[] = [
  "continue",
  "in_progress",
  "waiting_user",
  "waiting",
  "blocked",
  "completed",
];

const STATUS_LABELS: Record<GoalDisplayStatus, string> = {
  continue: "goals.action-presentation.continue",
  in_progress: "goals.action-presentation.running",
  waiting_user: "goals.action-presentation.needs",
  waiting: "goals.action-presentation.waiting",
  blocked: "goals.action-presentation.blocked",
  completed: "goals.action-presentation.completed",
};

export function createGoalActionPresenter(_L: GoalStatusTranslate) {
  function goalDisplayStatusLabel(status: GoalDisplayStatus): string {
    return uiText.text(STATUS_LABELS[status]);
  }
  return { goalDisplayStatusLabel };
}
