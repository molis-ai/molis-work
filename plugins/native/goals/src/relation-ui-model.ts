import type { GoalRecord, GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalDisplayStatus } from "./tree-order.js";
import type { GoalPresentationState } from "./tree-order.js";

export interface GoalsRelationItem {
  goal: Pick<GoalRecord, "goal_id" | "title" | "archived_at" | "priority" | "created_at">;
  status: GoalPresentationState;
  display_status?: GoalDisplayStatus;
  relations: GoalRelationRecord[];
  events: Array<{ type: string; object_id: string; reason: string }>;
}
export interface GoalsRelationView { goals: GoalsRelationItem[]; archived_goals: GoalsRelationItem[]; }
export interface GoalsRelationUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "chevron-right" | "chevron-down" | "history" | "link" | "shield"): string;
}
