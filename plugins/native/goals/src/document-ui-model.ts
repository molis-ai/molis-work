import type { GoalRecord } from "@adeptify/goalboard-contracts/modules/goals";
import type { GoalsTreeItem } from "./tree-ui-model.js";
import type { GoalEventDocumentView } from "./event-document-model.js";

export interface GoalsDocumentItem extends GoalsTreeItem {
  goal: GoalsTreeItem["goal"] & Pick<GoalRecord, "outcome" | "why" | "business_logic" | "in_scope" | "out_of_scope" | "constraints" | "required_inputs" | "promised_outputs" | "definition_state" | "updated_at" | "accepted_by" | "archived_at" | "trashed_at" | "trashed_by" | "acceptance_criteria">;
  main_action_label: string;
  action_summary: string;
  evidence: ReadonlyArray<{ evidence_id: string }>;
  events: ReadonlyArray<{ type: string; actor_id: string; reason: string }>;
  event_work?: boolean;
}
export interface GoalsDocumentContext {
  activeGoalId: string | null;
  decisionCount: number;
  relatedWorkHtml: string;
  artifactHtml: string;
  coverageHtml: string;
  eventDocument?: GoalEventDocumentView | null;
}
export interface GoalsDocumentUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: "archive" | "user" | "waiting" | "blocked" | "clipboard" | "terminal" | "check" | "arrow" | "target" | "refresh" | "more" | "plus" | "activity" | "link" | "history" | "x" | "tune" | "chevron-down" | "chevron-right" | "question" | "workflow" | "impact"): string;
  renderVisibleGoalStatus(item: Pick<GoalsDocumentItem, "status" | "display_status">): string;
  renderStatus(status: "trashed"): string;
  sectionHeading(iconName: "archive" | "book" | "refresh", title: string, description?: string): string;
}
