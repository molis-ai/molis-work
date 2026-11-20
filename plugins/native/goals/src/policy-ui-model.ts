import type { GoalPolicy } from "./contract/goals.js";

export interface GoalsPolicyItem {
  goal: { goal_id: string };
  resolved_policy: GoalPolicy;
  event_document?: Pick<import("./event-document-model.js").GoalEventDocumentView, "state" | "acceptance"> | null;
}

export interface GoalsPolicyUiPrimitives {
  escapeHtml(value: unknown): string;
  icon(name: "shield" | "folder"): string;
}
