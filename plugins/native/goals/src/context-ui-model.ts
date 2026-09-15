import type { GoalRecord, GoalInputBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsTreeItem, GoalsTreeView } from "./tree-ui-model.js";

export interface GoalsContextItem extends GoalsTreeItem {
  goal: GoalsTreeItem["goal"] & Pick<GoalRecord, "outcome" | "why" | "business_logic" | "priority" | "definition_state" | "decomposition_state" | "in_scope" | "out_of_scope" | "constraints" | "required_inputs" | "promised_outputs" | "acceptance_criteria" | "decomposition_review">;
  input_bindings: Array<Pick<GoalInputBindingRecord, "input_name" | "source_ref" | "state" | "reason" | "snapshot_digest">>;
  coverage: Array<{ requirement_id: string; statement: string; disposition: string; blocking: boolean; reason: string | null; revisit_condition: string | null }>;
}
export type GoalsContextView = GoalsTreeView<GoalsContextItem>;
export interface GoalsContextUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  currentLocale(): string;
  icon(name: "check" | "chevron-down" | "chevron-right" | "completed" | "x" | "plus" | "risk" | "arrow" | "impact" | "settings" | "book"): string;
  subsectionHeading(iconName: "clipboard" | "link" | "check" | "folder", title: string, description?: string): string;
  explainWorkState(state: GoalsTreeItem["status"]): { label: string; meaning: string; nextAction: string };
  explainParentCompletion(goal: Pick<GoalRecord, "definition_state" | "decomposition_state" | "decomposition_review" | "fulfillment_state">, completedChildren: number, totalChildren: number): { label: string; meaning: string; tone: "progress" };
}
