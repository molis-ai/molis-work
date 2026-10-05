import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { text, count, boolean, array, object, nullable, enumeration, recordedDecisionMethod } from "./event-action-schemas.js";
import { goalRecordSchema, goalRiskSchema, goalDecompositionReviewSchema } from "./goal-record-schema.js";
import { goalPolicySchema, goalRelationSchema } from "./configuration-actions.js";
import { projectGuidanceEntrySchema } from "./guidance-actions.js";
import { treeProposalSchema } from "./tree-action-schemas.js";
import { planningMethodSchema } from "./planning-action-schemas.js";

const strings = array(text), maybeText = nullable(text), number = { type: "number" };
// Goal targets and journal payloads allow arbitrary objects in their owning contracts.
const record = { type: "object", additionalProperties: true };
const board = object({ board_id: text, title: text, active_goal_id: maybeText, created_at: text, updated_at: text });
const leafReadiness = object({ verdict: enumeration(["ready", "split_required"]), primary_deliverable: text,
  output_coverage: array(object({ promised_output: text, role: enumeration(["primary", "supporting", "independent"]), reason: text })),
  split_candidates: array(object({ work_item: text, separately_deliverable: boolean, separately_acceptable: boolean, independently_reworkable: boolean,
    decision: enumeration(["keep", "split"]), reason: text })), rationale: text, unresolved_decisions: strings, independent_deliverables: strings, acceptance_criterion_ids: strings });
const goalInput = object({ goal_id: text, title: text, outcome: text, why: text, business_logic: text,
  in_scope: strings, out_of_scope: strings, constraints: strings, required_inputs: strings, promised_outputs: strings,
  leaf_readiness: leafReadiness, decomposition_review: nullable(goalDecompositionReviewSchema), definition_state: enumeration(["draft", "accepted"]),
  decomposition_state: enumeration(["abstract", "frontier_open", "closed_leaf", "closed_compound"]), priority: number,
  acceptance_criteria: array(object({ criterion_id: text, statement: text, decision_method: recordedDecisionMethod,
    pass_condition: text, target: nullable(record), required_evidence: strings }, ["statement", "decision_method", "pass_condition"])) },
  ["title", "outcome", "why", "business_logic", "acceptance_criteria"]);
const proposals = { goal_tree_proposals: array(treeProposalSchema) };
export const boardSnapshotSchema = object({ cursor: count, board, goals: array(goalRecordSchema), relations: array(goalRelationSchema), risks: array(goalRiskSchema),
  goal_risks: array(object({ goal_id: text, risk_id: text })), ...proposals,
  goal_contract_revisions: array(object({ goal_id: text, board_id: text, revision: count, contract: goalInput, effect: enumeration(["metadata", "revalidate", "rework"]),
    source_proposal_id: maybeText, changed_by: text, reason: text, created_at: text })),
  lifecycle_events: array(object({ seq: count, type: text, object_type: text, object_id: text, payload: record, at: text })),
  planning_method_packs: array(planningMethodSchema), project_guidance: array(projectGuidanceEntrySchema) });
const coverage = (goalDecompositionReviewSchema.properties as Record<string, ActionSchema>).contract_coverage!;
export const goalContractSchema = object({ board, observed_event_cursor: count, goal_path: text, goal: goalRecordSchema,
  parent_contract_coverage: array(object({ parent_goal_id: text, parent_goal_title: text, record_status: enumeration(["recorded", "unrecorded"]),
    ...coverage.properties as Record<string, ActionSchema> })), relations: array(goalRelationSchema), risks: array(goalRiskSchema),
  resolved_policy: goalPolicySchema, project_guidance: array(projectGuidanceEntrySchema), ...proposals });
