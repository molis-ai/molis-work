import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";

export interface GoalsSafetyItem {
  goal: { goal_id: string; title: string; archived_at: string | null; trashed_at?: string | null; priority: number; created_at: string };
  status: GoalPresentationState;
  display_status?: GoalDisplayStatus;
}
export interface GoalsSafetyView { goals: GoalsSafetyItem[]; archived_goals: GoalsSafetyItem[]; }
export interface GoalsSafetyUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: "chevron-down" | "chevron-right" | "search" | "risk" | "blocked" | "info" | "settings" | "user" | "impact" | "history" | "archive" | "plus" | "check"): string;
  currentLocale(): "zh" | "en";
  renderReference(value: string, label?: string): string;
  renderList(values: string[], empty: string): string;
}
