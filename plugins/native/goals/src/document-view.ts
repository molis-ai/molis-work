import type { GoalInputBindingRecord, GoalRecord, ImpactBindingRecord, GoalRelationRecord, GoalPolicy } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ExecutionClaimRecord as ClaimRecord, ExecutionRunRecord as RunRecord } from "@molis-ai/molis-work-contracts/modules/execution";
import type { EvidenceRecord } from "@molis-ai/molis-work-contracts/modules/evidence-verification";
import type { ReviewObligationRecord, ReviewRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";
import type { GoalsPolicyBinding } from "./policy-ui-model.js";
import type { GoalsSafetyRisk } from "./safety-ui-model.js";
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

export interface GoalsCoverageItem {
  requirement_id: string;
  statement: string;
  disposition: string;
  owner_goal_id: string | null;
  reason: string | null;
  revisit_condition: string | null;
  blocking: boolean;
  created_at: string;
  updated_at: string;
}

export type GoalsInputBinding = Omit<GoalInputBindingRecord, "board_id">;

export interface GoalsDocumentView {
  goal: GoalRecord;
  status: GoalPresentationState;
  display_status: GoalDisplayStatus;
  status_label: string;
  main_action_label: string;
  action_summary: string;
  claims: ClaimRecord[];
  runs: RunRecord[];
  evidence: EvidenceRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  risks: GoalsSafetyRisk[];
  impacts: ImpactBindingRecord[];
  relations: GoalRelationRecord[];
  coverage: GoalsCoverageItem[];
  input_bindings: GoalsInputBinding[];
  policy_bindings: GoalsPolicyBinding[];
  events: GoalsDecisionEvent[];
  resolved_policy: GoalPolicy;
  passed_criteria: string[];
  pending_reviews: string[];
  event_work: boolean;
  event_document?: import("./event-document-model.js").GoalEventDocumentView | null;
  artifact_embed_html?: string;
}
