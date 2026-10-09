import type { GoalInputBindingRecord, GoalRecord, GoalRelationRecord, GoalPolicy } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";
import type { GoalsPolicyBinding } from "./policy-ui-model.js";
import type { GoalsDecisionEvent } from "./decision-view.js";

/** Read-only Goal presentation; facts and work states remain defined by their owners. */
export const GOALS_PRESENTATION_STATES: readonly GoalPresentationState[] = [
  "waiting_for_human",
  "executing",
  "execution_blocked",
  "execution_pending",
  "satisfied",
  "invalidated",
  "trashed",
  "archived",
];

export type GoalsInputBinding = Omit<GoalInputBindingRecord, "project_id">;

export interface GoalsDocumentView {
  goal: GoalRecord;
  status: GoalPresentationState;
  display_status: GoalDisplayStatus;
  status_label: string;
  main_action_label: string;
  action_summary: string;
  relations: GoalRelationRecord[];
  input_bindings: GoalsInputBinding[];
  policy_bindings: GoalsPolicyBinding[];
  events: GoalsDecisionEvent[];
  resolved_policy: GoalPolicy;
  event_work: boolean;
  created_by?: string | null;
  event_document?: import("./event-document-model.js").GoalEventDocumentView | null;
  artifact_embed_html?: string;
  artifact_outputs?: number;
  artifact_inputs?: ReadonlyArray<{ artifact_id: string; version: number; title: string; state: "available" | "unavailable" | "archived" | "missing"; reason: string | null }>;
}
