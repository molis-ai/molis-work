import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsTreeItem } from "./tree-ui-model.js";
import { visibleGoalStatus } from "./tree-presentation.js";

/** Presentation input, not a Goal fact store or an execution permission decision. */
export interface GoalsNavigationItem extends Pick<GoalsTreeItem, "status" | "display_status"> {
  goal: Pick<GoalRecord, "goal_id" | "title" | "decomposition_state"> & Partial<Pick<GoalRecord, "outcome">>;
  status_label: string;
  action_summary: string;
  main_action_label: string;
  event_work?: boolean;
}

export function buildGoalsNavigationItems(
  items: readonly GoalsNavigationItem[],
  childrenOf: (goalId: string) => readonly GoalsNavigationItem[],
  statusIcon: (item: Pick<GoalsTreeItem, "status" | "display_status">) => string,
) {
  return items.map(item => ({
    goal: { goal_id: item.goal.goal_id, title: item.goal.title, ...(item.goal.outcome !== undefined ? { outcome: item.goal.outcome } : {}) },
    status: visibleGoalStatus(item),
    status_label: item.status_label,
    status_meaning: item.action_summary,
    status_icon: statusIcon(item),
    is_waiting_parent: item.display_status === "waiting",
    is_compound_parent: item.goal.decomposition_state === "closed_compound" && !item.event_work,
    children: childrenOf(item.goal.goal_id).map(child => ({
      goal: { goal_id: child.goal.goal_id, title: child.goal.title },
      status: visibleGoalStatus(child),
      status_label: child.status_label,
      status_meaning: child.action_summary,
      next_action: child.main_action_label,
    })),
  }));
}
