export type GoalDisplayStatus = "continue" | "in_progress" | "waiting_user" | "waiting" | "blocked" | "completed" | "cancelled";

export type GoalPresentationState =
  | "waiting_for_human"
  | "executing"
  | "execution_blocked"
  | "execution_pending"
  | "satisfied"
  | "invalidated"
  | "trashed"
  | "archived";

/** Goal Tree sibling order: work you can pick up, then in-flight, then blocked, then parked. */
export const GOAL_TREE_STATUS_ORDER: readonly GoalPresentationState[] = [
  "waiting_for_human",
  "execution_pending",
  "executing",
  "execution_blocked",
  "satisfied",
  "invalidated",
  "archived",
  "trashed",
];

const GOAL_TREE_DISPLAY_STATUS_ORDER: readonly GoalDisplayStatus[] = [
  "continue",
  "in_progress",
  "waiting_user",
  "blocked",
  "waiting",
  "completed",
  "cancelled",
];

function goalTreeStatusRank(status: string): number {
  const index = (GOAL_TREE_STATUS_ORDER as readonly string[]).indexOf(status);
  return index < 0 ? GOAL_TREE_STATUS_ORDER.length : index;
}

export function sortGoalTreeItems<T extends {
  status: GoalPresentationState;
  display_status?: GoalDisplayStatus;
  goal: { priority: number; created_at: string };
}>(
  items: T[],
): T[] {
  const rank = (item: T): number => {
    if (item.display_status) {
      const index = GOAL_TREE_DISPLAY_STATUS_ORDER.indexOf(item.display_status);
      if (index >= 0) return index;
    }
    return goalTreeStatusRank(item.status);
  };
  return [...items].sort(
    (left, right) =>
      rank(left) - rank(right) ||
      right.goal.priority - left.goal.priority ||
      left.goal.created_at.localeCompare(right.goal.created_at),
  );
}
