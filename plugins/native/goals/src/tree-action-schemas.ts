import { text, identifier, count, boolean, object, array, nullable, enumeration } from "./event-action-schemas.js";
import { planningImpactSchema, planningGraphIssueSchema } from "./planning-action-schemas.js";

const strings = array(text), maybeText = nullable(text), record = { type: "object", additionalProperties: true };
const affected = object({ object_type: enumeration(["goal", "relation", "risk", "policy", "candidate", "rewire"]), object_id: text });
const explanation = object({ problem: text, expected_effect: text, non_goals: strings, depends_on_item_ids: strings });
export const treeNarrativeSchema = object({ why_now: text, problem: text, main_path: strings, expected_effect: text, non_goals: strings });
const provenance = { item_id: text, source_refs: strings, reason: text, explanation: nullable(explanation),
  confidence: { type: "number", minimum: 0, maximum: 1 }, affected_objects: array(object({ object_type: enumeration(["goal", "relation"]), object_id: text })), requires_user_confirmation: boolean, supersedes_item_id: maybeText };
const endpoints = { from_goal_id: text, to_goal_id: text, type: { ...enumeration(["part_of", "depends_on"]), description: "part_of：子目标 → 父目标；depends_on：消费目标 → 前置目标" }, reason: text };
const item = (kind: string, operation: string, payload: ReturnType<typeof object>) => object({ ...provenance,
  kind: { const: kind }, operation: { const: operation }, payload }, ["kind", "operation", "payload", "source_refs", "reason", "confidence"]);
export const treeItemInputSchema = { oneOf: [
  item("goal", "create", object({ title: text, outcome: text, why: text, business_logic: text,
    priority: { type: "number", minimum: 0, maximum: 100 }, goal_id: text,
    requirements: array(object({ requirement_id: text, statement: text, human_decision_required: boolean }, ["statement"])) }, ["title"])),
  item("relation", "create", object(endpoints)),
  item("relation", "deactivate", { ...object({ ...endpoints, relation_id: text }, []), anyOf: [
    { required: ["relation_id", "reason"] }, { required: Object.keys(endpoints) },
  ] }),
] };
export const treeItemDecisionSchema = object({ item_id: text, decision: enumeration(["confirm", "reject", "revise"]), reason: text,
  revised_item: treeItemInputSchema }, ["item_id", "decision"]);
const decision = object({ decision_id: text, board_id: text, proposal_id: text, item_id: text,
  decision: enumeration(["confirmed", "rejected", "revised", "conflict"]), actor_id: text,
  authority_source: enumeration(["runtime_dialogue", "web", "management"]), runtime_actor_id: maybeText,
  conversation_ref: text, message_ref: text, reason: text, revision_proposal_id: maybeText,
  materialized_objects: array(affected), created_at: text });
const storedItem = object({ item_id: text, proposal_id: text, board_id: text, ordinal: count,
  kind: enumeration(["goal", "contract", "relation", "dependency", "risk", "policy", "candidate", "rewire"]),
  operation: enumeration(["create", "update", "deactivate"]), payload: record, source_refs: strings, reason: text,
  explanation: nullable(explanation), confidence: { type: "number" }, affected_objects: array(affected),
  baseline_versions: array(object({ ...affected.properties as Record<string, object>, exists: boolean, version: text })),
  requires_user_confirmation: boolean, state: enumeration(["pending", "conflict", "superseded", "approved", "applied", "rejected", "dismissed"]),
  conflict: nullable(record), decision: nullable(decision), materialized_objects: array(affected),
  revision_proposal_id: maybeText, supersedes_item_id: maybeText, created_at: text, updated_at: text });
export const treeProposalSchema = object({ proposal_id: text, board_id: text,
  origin: enumeration(["native", "legacy_contract_proposal", "legacy_candidate", "legacy_rewire"]), root_goal_id: maybeText,
  submitted_by: text, discovered_in_run_id: maybeText, submitted_session_id: maybeText,
  state: enumeration(["pending", "superseded", "approved", "partially_applied", "rejected", "dismissed", "closed"]), version: count,
  supersedes_proposal_id: maybeText, base_event_cursor: count, summary: text, narrative: nullable(treeNarrativeSchema), decision: nullable(record),
  created_at: text, updated_at: text, decided_at: maybeText, items: array(storedItem), decisions: array(decision) });
export const treeSubmitInputSchema = object({ root_goal_id: maybeText, summary: identifier, narrative: nullable(treeNarrativeSchema),
  items: { ...array(treeItemInputSchema), minItems: 1 }, base_event_cursor: count, supersedes_proposal_id: maybeText,
  idempotency_key: identifier }, ["summary", "items", "idempotency_key"]);
export const treeReadInputSchema = object({ proposal_id: text, root_goal_id: text, include_legacy: boolean }, []);
export const treeCheckInputSchema = object({ proposal_id: identifier, idempotency_key: identifier });
export const treeDecideInputSchema = object({ proposal_id: identifier, decisions: array(treeItemDecisionSchema), reason: text,
  confirm_all_pending: boolean, idempotency_key: identifier }, ["proposal_id", "idempotency_key"]);
export const treeSubmitResultSchema = object({ proposal: treeProposalSchema, replayed: boolean, observed_event_cursor: count });
export const treeReadResultSchema = object({ proposals: array(treeProposalSchema), observed_event_cursor: count });
export const treeCheckResultSchema = object({ proposal: treeProposalSchema, conflict_item_ids: strings,
  planning_issues: array(planningGraphIssueSchema), observed_event_cursor: count });
export const treeDecisionResultSchema = object({ proposal: treeProposalSchema, revision_proposals: array(treeProposalSchema),
  applied_item_ids: strings, rejected_item_ids: strings, revised_item_ids: strings, conflict_item_ids: strings,
  semantic_review: nullable(object({ ...planningImpactSchema.properties as Record<string, object>, structural_validation: { const: "passed" },
    status: enumeration(["required", "not_required"]), next_action: enumeration(["review_affected_subgraph", "continue"]),
    review_tool: { const: "molis_work_v1_planning_analyze_change" }, canonical_changes_require_new_user_confirmation: { const: true } })),
  transitions: { type: "array", maxItems: 0 }, observed_event_cursor: count, replayed: boolean });
