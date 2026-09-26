import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { text, count, boolean, array, object, nullable, enumeration } from "./event-action-schemas.js";
import { goalRecordSchema, goalRiskSchema, goalDecompositionReviewSchema } from "./goal-record-schema.js";
import { goalPolicySchema, goalRelationSchema } from "./configuration-actions.js";
import { projectGuidanceEntrySchema } from "./guidance-actions.js";
import { treeProposalSchema } from "./tree-action-schemas.js";
import { planningMethodSchema } from "./planning-action-schemas.js";

const strings = array(text), maybeText = nullable(text), number = { type: "number" };
// These historical records explicitly allow arbitrary payloads in their owning contracts.
const record = { type: "object", additionalProperties: true };
const role = enumeration(["clarifier", "executor", "self_verifier", "cross_reviewer", "adversarial_reviewer", "revalidator"]);
const board = object({ board_id: text, title: text, active_goal_id: maybeText, created_at: text, updated_at: text });
const impact = object({ binding_id: text, board_id: text, goal_id: text, surface: text, access: enumeration(["read", "write", "decide", "exclusive"]),
  input_snapshot: maybeText, state: enumeration(["proposed", "confirmed", "inactive"]), reason: text, created_by: text,
  created_at: text, updated_at: text, deactivated_at: maybeText, deactivation_reason: maybeText });
const claim = object({ claim_id: text, board_id: text, goal_id: text, actor_id: text, role, contract_revision: count,
  action_kind: nullable(enumeration(["clarify", "execute", "submit_evidence", "revise", "review", "revalidate", "mitigate_risk", "accept_risk", "release", "renew", "repair", "wait"])),
  action_target_id: maybeText, state: enumeration(["active", "released", "expired", "revoked"]), capabilities: strings, goal_mode_attestation: boolean,
  resolved_policy: goalPolicySchema, claimed_at: text, expires_at: text, renewed_at: maybeText, released_at: maybeText, release_reason: maybeText });
const run = object({ run_id: text, board_id: text, goal_id: text, claim_id: text, actor_id: text, role,
  state: enumeration(["started", "blocked", "completed", "failed", "abandoned"]), block_reason: maybeText,
  output_refs: strings, discovery_refs: strings, started_at: text, ended_at: maybeText });
const correction = object({ correction_id: text, board_id: text, goal_id: text, target_evidence_id: text, action: enumeration(["supersede", "retract"]),
  replacement_evidence_id: maybeText, actor_id: text, reason: text, created_at: text });
const evidence = object({ evidence_id: text, board_id: text, goal_id: text, contract_revision: count, criterion_ids: strings,
  producer_actor_id: text, run_id: maybeText, review_id: maybeText, kind: enumeration(["test", "measurement", "artifact", "inspection", "attestation", "human_verdict"]),
  locator: text, locator_status: enumeration(["verified", "unverified"]), locator_validation_reason: text, locator_checked_at: maybeText,
  locator_workspace_id: maybeText, digest: maybeText, captured_at: text, result: enumeration(["passed", "failed", "inconclusive"]),
  lifecycle_state: enumeration(["effective", "superseded", "retracted"]), correction: nullable(correction), historical_unmapped: boolean });
const obligation = object({ obligation_id: text, board_id: text, goal_id: text, contract_revision: count,
  role: enumeration(["self_verifier", "cross_reviewer", "adversarial_reviewer", "human_approver"]), required_count: count,
  independence_rule: text, criterion_scope: strings, state: enumeration(["pending", "satisfied", "waived"]), created_at: text });
const review = object({ review_id: text, board_id: text, goal_id: text, obligation_id: text, claim_id: maybeText, actor_id: text,
  verdict: enumeration(["pass", "fail", "needs_changes", "inconclusive"]), evidence_refs: strings, reasoning: text, submitted_at: text });
const leafReadiness = object({ verdict: enumeration(["ready", "split_required"]), primary_deliverable: text,
  output_coverage: array(object({ promised_output: text, role: enumeration(["primary", "supporting", "independent"]), reason: text })),
  split_candidates: array(object({ work_item: text, separately_deliverable: boolean, separately_acceptable: boolean, independently_reworkable: boolean,
    decision: enumeration(["keep", "split"]), reason: text })), rationale: text, unresolved_decisions: strings, independent_deliverables: strings, acceptance_criterion_ids: strings });
const goalInput = object({ goal_id: text, title: text, outcome: text, why: text, business_logic: text,
  in_scope: strings, out_of_scope: strings, constraints: strings, required_inputs: strings, promised_outputs: strings,
  leaf_readiness: leafReadiness, decomposition_review: goalDecompositionReviewSchema, definition_state: enumeration(["draft", "accepted"]),
  decomposition_state: enumeration(["abstract", "frontier_open", "closed_leaf", "closed_compound"]), priority: number,
  acceptance_criteria: array(object({ criterion_id: text, statement: text, decision_method: enumeration(["automated_check", "measurement", "inspection", "human_decision"]),
    pass_condition: text, target: nullable(record), required_evidence: strings }, ["statement", "decision_method", "pass_condition"])) },
  ["title", "outcome", "why", "business_logic", "acceptance_criteria"]);
const candidate = object({ candidate_id: text, board_id: text, submitted_by: text, discovered_in_run_id: maybeText, proposed_goal: goalInput,
  proposed_relations: array(record), proposed_impacts: array(record), proposed_risks: array(record), blocking_mode: enumeration(["none", "current_run", "dependent_claims"]),
  state: enumeration(["pending", "approved", "rejected", "dismissed", "superseded"]), decision: nullable(record), created_at: text, decided_at: maybeText });
const proposalRisk = object({ risk_id: text, description: text, probability: text, impact: text, affected_surfaces: strings,
  trigger: text, treatment: enumeration(["accept", "mitigate", "avoid", "defer"]), treatment_plan: text,
  blocking_mode: enumeration(["none", "claim", "completion", "invalidate_on_trigger"]), revisit_condition: text, owner: text },
  ["risk_id", "description", "probability", "impact", "affected_surfaces", "trigger", "treatment", "blocking_mode", "revisit_condition", "owner"]);
const contractProposal = object({ proposal_id: text, board_id: text, goal_id: text, submitted_by: text, discovered_in_run_id: text, proposed_goal: goalInput,
  field_sources: array(object({ field: enumeration(["title", "outcome", "why", "business_logic", "in_scope", "out_of_scope", "constraints", "required_inputs", "promised_outputs", "priority", "acceptance_criteria", "review_policy"]),
    source_kind: enumeration(["user_answer", "repository_fact", "document_fact", "runtime_inference"]), source_refs: strings, confidence: number, rationale: text,
    status: { const: "proposed" }, requires_user_confirmation: { const: true } })), review_policy: goalPolicySchema,
  proposed_impacts: array(object({ surface: text, access: enumeration(["read", "write", "decide", "exclusive"]), input_snapshot: maybeText, reason: text }, ["surface", "access", "reason"])),
  proposed_risks: array(proposalRisk), dependency_rewire_ids: strings, state: enumeration(["pending", "approved", "rejected", "superseded"]),
  decision: nullable(record), created_at: text, decided_at: maybeText });
const rewire = object({ rewire_id: text, board_id: text, candidate_id: maybeText,
  proposal: { ...object({ formal_goal_id: text, proposal_kind: enumeration(["candidate", "dependency"]), submitted_by: text, discovered_in_run_id: maybeText,
    blocking_mode: enumeration(["none", "current_run"]), relations: array(record), impacts: array(record), risks: array(record) }, []), additionalProperties: true },
  impact: record, state: enumeration(["pending", "confirmed", "rejected", "applied"]), created_at: text, decided_at: maybeText });
const clarification = object({ session_id: text, board_id: text, goal_id: text, claim_id: maybeText, run_id: maybeText, rough_idea: text,
  state: enumeration(["clarifying", "proposal_ready", "closed"]), current_understanding: maybeText, next_question: maybeText, proposal_summary: maybeText,
  created_by: text, created_at: text, updated_at: text, closed_at: maybeText });
const turn = object({ turn_id: text, session_id: text, board_id: text, goal_id: text, run_id: maybeText, actor_id: text, turn_index: count,
  turn_kind: enumeration(["rough_idea", "user_answer"]), user_message: text, current_understanding: maybeText,
  known_facts: array(object({ statement: text, source_kind: enumeration(["user_answer", "repository_fact", "document_fact"]), source_refs: strings, confidence: number, confirmed_by_user: boolean })),
  assumptions: array(object({ statement: text, source_refs: strings, confidence: number, requires_user_confirmation: { const: true } })),
  next_question: maybeText, proposal_summary: maybeText, created_at: text });
const historical = { impacts: array(impact), claims: array(claim), runs: array(run), evidence: array(evidence), evidence_corrections: array(correction),
  review_obligations: array(obligation), reviews: array(review), candidates: array(candidate), contract_proposals: array(contractProposal), rewires: array(rewire),
  clarification_sessions: array(clarification), clarification_turns: array(turn), goal_tree_proposals: array(treeProposalSchema) };
export const boardSnapshotSchema = object({ cursor: count, board, goals: array(goalRecordSchema), relations: array(goalRelationSchema), risks: array(goalRiskSchema),
  goal_risks: array(object({ goal_id: text, risk_id: text })), ...historical,
  goal_contract_revisions: array(object({ goal_id: text, board_id: text, revision: count, contract: goalInput, effect: enumeration(["metadata", "revalidate", "rework"]),
    source_proposal_id: maybeText, changed_by: text, reason: text, created_at: text })),
  coverage_contract_revisions: array(object({ parent_goal_id: text, child_goal_id: text, parent_contract_revision: count, child_contract_revision: count, recorded_at: text })),
  lifecycle_events: array(object({ seq: count, type: text, object_type: text, object_id: text, payload: record, at: text })),
  planning_method_packs: array(planningMethodSchema), project_guidance: array(projectGuidanceEntrySchema) });
const coverage = (goalDecompositionReviewSchema.properties as Record<string, ActionSchema>).contract_coverage!;
export const goalContractSchema = object({ board, observed_event_cursor: count, goal_path: text, goal: goalRecordSchema,
  parent_contract_coverage: array(object({ parent_goal_id: text, parent_goal_title: text, record_status: enumeration(["recorded", "unrecorded"]),
    ...coverage.properties as Record<string, ActionSchema> })), relations: array(goalRelationSchema), risks: array(goalRiskSchema),
  resolved_policy: goalPolicySchema, project_guidance: array(projectGuidanceEntrySchema), ...historical });
