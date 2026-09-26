import { text, count, boolean, array, object, nullable, enumeration } from "./event-action-schemas.js";

const strings = array(text), maybeText = nullable(text);
export const goalRiskSchema = object({ risk_id: text, board_id: text, description: text, probability: text, impact: text, affected_surfaces: strings,
  trigger: text, treatment: enumeration(["accept", "mitigate", "avoid", "defer"]), treatment_plan: text,
  blocking_mode: enumeration(["none", "claim", "completion", "invalidate_on_trigger"]), revisit_condition: text, owner: text,
  state: enumeration(["open", "triggered", "resolved", "accepted", "expired"]),
  resolution_basis: nullable(object({ summary: text, evidence_refs: strings, residual_gaps: strings })), created_at: text, updated_at: text });
const coverageStatus = enumeration(["complete", "partial", "integration_required", "uncovered"]);
export const goalDecompositionReviewSchema = object({ status: enumeration(["complete", "paused"]), method_pack_ids: strings,
  task_context: enumeration(["game", "app", "ai_data", "content_research", "operations", "other"]), product_context: enumeration(["game", "app", "other"]),
  coverage: array(object({ area: text, disposition: enumeration(["goal", "owned", "not_applicable"]), goal_ids: strings, reason: text })),
  open_goal_ids: strings, next_step: text,
  contract_coverage: object({
    promised_outputs: array(object({ parent_promised_output: text, status: coverageStatus,
      child_outputs: array(object({ goal_id: text, promised_output: text, contract_revision: count }, ["goal_id", "promised_output"])), reason: text })),
    acceptance_criteria: array(object({ parent_criterion_id: text, status: coverageStatus,
      child_criteria: array(object({ goal_id: text, criterion_id: text, contract_revision: count }, ["goal_id", "criterion_id"])), reason: text })),
  }),
}, ["status", "coverage", "open_goal_ids", "next_step"]);
export const goalAcceptanceCriterionSchema = object({ criterion_id: text, goal_id: text, statement: text,
  decision_method: enumeration(["automated_check", "measurement", "inspection", "human_decision"]), pass_condition: text,
  target: nullable({ type: "object", additionalProperties: true }), required_evidence: strings });
export const goalRecordSchema = object({ goal_id: text, board_id: text, title: text, outcome: text, why: text, business_logic: text,
  in_scope: strings, out_of_scope: strings, constraints: strings, required_inputs: strings, promised_outputs: strings,
  decomposition_review: nullable(goalDecompositionReviewSchema), definition_state: enumeration(["draft", "accepted"]),
  decomposition_state: enumeration(["abstract", "frontier_open", "closed_leaf", "closed_compound"]), validity_state: enumeration(["valid", "needs_revalidation", "invalidated"]),
  fulfillment_state: enumeration(["unmet", "satisfied"]), current_contract_revision: count, trashed_at: maybeText, trashed_by: maybeText,
  archived_at: maybeText, archived_by: maybeText, priority: { type: "number" }, accepted_by: maybeText, accepted_at: maybeText,
  created_at: text, updated_at: text, acceptance_criteria: array(goalAcceptanceCriterionSchema) });
export const goalArchiveResultSchema = object({ goal: goalRecordSchema, active_goal_cleared: boolean, observed_event_cursor: count, replayed: boolean });
export const goalTrashResultSchema = object({ goal: goalRecordSchema, active_goal_cleared: boolean, observed_event_cursor: count, replayed: boolean,
  status: enumeration(["trashed", "restored", "already_trashed", "already_active", "blocked"]), deactivated_relation_ids: strings,
  restored_relation_ids: strings, pending_relation_ids: strings, blocking_claim_ids: strings, blocking_run_ids: strings });
