import type { GoalRecord, GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";

export interface GoalsTreeItem {
  goal: Pick<GoalRecord, "goal_id" | "title" | "priority" | "created_at" | "fulfillment_state" | "acceptance_criteria">;
  status: GoalPresentationState;
  display_status: GoalDisplayStatus;
  passed_criteria: string[];
  relations: GoalRelationRecord[];
}
export interface GoalsTreeView<T extends GoalsTreeItem = GoalsTreeItem> {
  goals: T[];
  archived_goals: T[];
  trashed_goals: T[];
  snapshot: { relations: GoalRelationRecord[] };
}
export type GoalVisibleStatus = GoalDisplayStatus | "archived" | "trashed";
export interface GoalsTreeUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  currentLocale(): string;
  listJoin(values: string[]): string;
  icon(name: "link" | "chevron-down" | "chevron-right" | "target" | "list" | "workflow" | "search" | "filter" | "plus" | "tree" | "archive" | "trash" | "back"): string;
  renderStatus(status: GoalPresentationState): string;
  renderActionStatus(status: GoalDisplayStatus): string;
  renderVisibleGoalStatus(item: GoalsTreeItem): string;
  displayStatuses: readonly GoalDisplayStatus[];
}
