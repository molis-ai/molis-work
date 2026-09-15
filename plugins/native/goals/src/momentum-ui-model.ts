import type { GoalsTreeItem, GoalsTreeView } from "./tree-ui-model.js";
import type { GoalMomentumGoalInput } from "./momentum-model.js";

export interface GoalsMomentumItem extends GoalsTreeItem {
  goal: GoalsTreeItem["goal"] & { updated_at: string; outcome?: string; decomposition_state?: string };
  work_state?: string;
  event_work?: boolean;
  reasons?: Array<{ code: string; severity: string; message: string }>;
  runs: GoalMomentumGoalInput["runs"];
  evidence: GoalMomentumGoalInput["evidence"];
  reviews: GoalMomentumGoalInput["reviews"];
  risks: GoalMomentumGoalInput["risks"];
  events: GoalMomentumGoalInput["events"];
}
export type GoalsMomentumBoardView = GoalsTreeView<GoalsMomentumItem>;
export interface GoalsMomentumUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  currentLocale(): string;
  icon(name: "info" | "arrow" | "risk" | "workflow" | "maximize" | "frame"): string;
  renderVisibleGoalStatus(item: Pick<GoalsMomentumItem, "status" | "display_status">): string;
}
