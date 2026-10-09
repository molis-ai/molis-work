import type { ContractDescriptor } from "../platform/package.js";
import type {
  GoalChangeImpact,
  GoalEventTrustedAuthority,
  GoalEventTrustedDecisionRecord,
  PlanningGraphIssue,
  RecordGoalUserDecisionInput,
} from "./goals.js";

export type { GoalEventTrustedAuthority, GoalEventTrustedDecisionRecord, RecordGoalUserDecisionInput };

export const modulesGovernanceCollaborationContract = {
  contractId: "io.molis.work.module.governance-collaboration.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/governance-collaboration.md",
} as const satisfies ContractDescriptor;

export interface GoalTreeSemanticReview extends GoalChangeImpact {
  structural_validation: "passed";
  status: "required" | "not_required";
  next_action: "review_affected_subgraph" | "continue";
  /** The action that reviews the affected part of the Goal tree (Goals planning impact). */
  review_action: { capability_id: "goals.planning.impact"; version: 1 };
  canonical_changes_require_new_user_confirmation: true;
}

/** Stored native decision result; the application supplies its transition receipt type. */
export interface GoalTreeProposalDecisionResult<TTransition> {
  proposal: GoalTreeProposalRecord;
  revision_proposals: GoalTreeProposalRecord[];
  applied_item_ids: string[];
  rejected_item_ids: string[];
  revised_item_ids: string[];
  conflict_item_ids: string[];
  semantic_review: GoalTreeSemanticReview | null;
  transitions: TTransition[];
  observed_event_cursor: number;
  replayed: boolean;
}

export type DependencyProposalBasis =
  | "contract_output"
  | "code_reference"
  | "test_dependency"
  | "business_sequence"
  | "impact_conflict"
  | "risk_policy";

export interface DependencyProposal {
  from_goal_id: string;
  to_goal_id: string;
  type: "depends_on";
  action: "add" | "deactivate";
  reason: string;
  basis: DependencyProposalBasis;
  evidence_refs: string[];
  impact_if_rejected: string;
  confidence: number;
  direction_reason: string;
}

export type ContractFieldName =
  | "title" | "outcome" | "why" | "business_logic" | "in_scope" | "out_of_scope"
  | "constraints" | "required_inputs" | "promised_outputs" | "priority"
  | "acceptance_criteria" | "review_policy";

export interface ContractFieldSource {
  field: ContractFieldName;
  source_kind: "user_answer" | "repository_fact" | "document_fact" | "runtime_inference";
  source_refs: string[];
  confidence: number;
  rationale: string;
  status: "proposed";
  requires_user_confirmation: true;
}

export type ContractFieldSourceInput = Omit<ContractFieldSource, "status" | "requires_user_confirmation"> &
  Partial<Pick<ContractFieldSource, "status" | "requires_user_confirmation">>;

export interface GovernanceProvenanceApi {
  normalizeProposalSource(input: Pick<GoalTreeProposalItemProvenanceInput, "source_refs" | "reason" | "confidence" | "requires_user_confirmation">, index: number): Pick<GoalTreeProposalItemRecord, "source_refs" | "reason" | "confidence"> & { requires_user_confirmation: true };
  validateEventDecisionAuthority(authority: GoalEventTrustedAuthority): GoalEventTrustedAuthority;
}

export type GoalTreeProposalState =
  | "pending" | "superseded" | "approved" | "partially_applied"
  | "rejected" | "dismissed" | "closed";
/** A structure proposal creates new Goals and creates or retires relations between them. */
export type GoalTreeProposalItemKind = "goal" | "relation";
export type GoalTreeProposalOperation = "create" | "deactivate";
export type GoalTreeProposalItemState =
  | "pending" | "conflict" | "superseded" | "approved" | "applied"
  | "rejected" | "dismissed";
export type GoalTreeProposalDecisionAction = "confirm" | "reject" | "revise";
export type GoalTreeProposalDecisionState = "confirmed" | "rejected" | "revised" | "conflict";
export type ProposalAffectedObjectType = "goal" | "relation";

export interface ProposalAffectedObject {
  object_type: ProposalAffectedObjectType;
  object_id: string;
}

export interface ProposalObjectVersion extends ProposalAffectedObject {
  exists: boolean;
  version: string;
}

export interface GoalTreeProposalDecisionAuthority {
  actor_id: string;
  actor_kind: "user";
  authority_source: "runtime_dialogue" | "web" | "management";
  conversation_ref: string;
  message_ref: string;
  whole_confirmation_prompted?: boolean;
  prompted_proposal_id?: string;
}

export interface GoalTreeProposalDecisionRecord {
  decision_id: string;
  project_id: string;
  proposal_id: string;
  item_id: string;
  decision: GoalTreeProposalDecisionState;
  actor_id: string;
  authority_source: GoalTreeProposalDecisionAuthority["authority_source"];
  runtime_actor_id: string | null;
  conversation_ref: string;
  message_ref: string;
  reason: string;
  revision_proposal_id: string | null;
  materialized_objects: ProposalAffectedObject[];
  created_at: string;
}

export interface GoalTreeProposalNarrative {
  why_now: string;
  problem: string;
  main_path: string[];
  expected_effect: string;
  non_goals: string[];
}

export interface GoalTreeProposalItemExplanation {
  problem: string;
  expected_effect: string;
  non_goals: string[];
  depends_on_item_ids: string[];
}

export interface GoalTreeProposalItemRecord {
  item_id: string;
  proposal_id: string;
  project_id: string;
  ordinal: number;
  kind: GoalTreeProposalItemKind;
  operation: GoalTreeProposalOperation;
  payload: Record<string, unknown>;
  source_refs: string[];
  reason: string;
  explanation: GoalTreeProposalItemExplanation | null;
  confidence: number;
  affected_objects: ProposalAffectedObject[];
  baseline_versions: ProposalObjectVersion[];
  requires_user_confirmation: boolean;
  state: GoalTreeProposalItemState;
  conflict: Record<string, unknown> | null;
  decision: GoalTreeProposalDecisionRecord | null;
  materialized_objects: ProposalAffectedObject[];
  revision_proposal_id: string | null;
  supersedes_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalTreeProposalRecord {
  proposal_id: string;
  project_id: string;
  root_goal_id: string | null;
  submitted_by: string;
  submitted_session_id: string | null;
  state: GoalTreeProposalState;
  version: number;
  supersedes_proposal_id: string | null;
  base_event_cursor: number;
  summary: string;
  narrative: GoalTreeProposalNarrative | null;
  decision: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  items: GoalTreeProposalItemRecord[];
  decisions: GoalTreeProposalDecisionRecord[];
}

export interface GoalTreeGoalCreatePayload {
  title: string;
  outcome?: string;
  why?: string;
  business_logic?: string;
  priority?: number;
  goal_id?: string;
  requirements?: Array<{
    requirement_id?: string;
    statement: string;
    human_decision_required?: boolean;
  }>;
}

export interface GoalTreeRelationCreatePayload {
  from_goal_id: string;
  to_goal_id: string;
  type: "part_of" | "depends_on";
  reason: string;
}

export type GoalTreeRelationDeactivatePayload =
  | {
      relation_id: string;
      reason: string;
    }
  | {
      from_goal_id: string;
      to_goal_id: string;
      type: "part_of" | "depends_on";
      reason: string;
      relation_id?: string;
    };

export type GoalTreeRelationChangePayload =
  | GoalTreeRelationCreatePayload
  | GoalTreeRelationDeactivatePayload;

export interface GoalTreeProposalItemProvenanceInput {
  item_id?: string;
  source_refs: string[];
  reason: string;
  explanation?: GoalTreeProposalItemExplanation | null;
  confidence: number;
  affected_objects?: ProposalAffectedObject[];
  requires_user_confirmation?: boolean;
  supersedes_item_id?: string | null;
}

export interface GoalTreeGoalCreateItemInput extends GoalTreeProposalItemProvenanceInput {
  kind: "goal";
  operation: "create";
  payload: GoalTreeGoalCreatePayload;
}

export interface GoalTreeRelationCreateItemInput extends GoalTreeProposalItemProvenanceInput {
  kind: "relation";
  operation: "create";
  payload: GoalTreeRelationCreatePayload;
}

export interface GoalTreeRelationDeactivateItemInput extends GoalTreeProposalItemProvenanceInput {
  kind: "relation";
  operation: "deactivate";
  payload: GoalTreeRelationDeactivatePayload;
}

/** New write/revise wire only. Stored historical items remain GoalTreeProposalItemRecord. */
export type GoalTreeProposalItemInput =
  | GoalTreeGoalCreateItemInput
  | GoalTreeRelationCreateItemInput
  | GoalTreeRelationDeactivateItemInput;

export interface GoalTreeProposalSubmitInput {
  project_id: string;
  actor_id: string;
  root_goal_id?: string | null;
  summary: string;
  narrative?: GoalTreeProposalNarrative | null;
  items: GoalTreeProposalItemInput[];
  base_event_cursor?: number;
  supersedes_proposal_id?: string | null;
  idempotency_key: string;
  submitted_session_id?: string;
}

export interface GoalTreeProposalCheckInput {
  project_id: string;
  proposal_id: string;
  actor_id: string;
  idempotency_key: string;
}

export interface GoalTreeProposalItemDecisionInput {
  item_id: string;
  decision: GoalTreeProposalDecisionAction;
  reason: string;
  revised_item?: GoalTreeProposalItemInput;
}

export interface GoalTreeProposalDecideInput {
  project_id: string;
  proposal_id: string;
  runtime_actor_id?: string | null;
  authority: GoalTreeProposalDecisionAuthority;
  decisions?: GoalTreeProposalItemDecisionInput[];
  reason?: string;
  confirm_all_pending?: boolean;
  idempotency_key: string;
}

export interface GoalTreeItemOwner {
  proposal_id: string;
  project_id: string;
}

export type NewNativeGoalTreeProposal = Omit<
  GoalTreeProposalRecord,
  "items" | "decisions" | "decision" | "decided_at"
>;

export type NewNativeGoalTreeProposalItem = Omit<
  GoalTreeProposalItemRecord,
  "decision" | "materialized_objects" | "revision_proposal_id" | "conflict"
>;

export interface GovernanceSnapshot {
  goal_tree_proposals: GoalTreeProposalRecord[];
}

export interface GovernanceQueryApi {
  eventCursor(projectId: string): number;
  snapshot(projectId: string): GovernanceSnapshot;
  getGoalTreeProposal(projectId: string, proposalId: string): GoalTreeProposalRecord | null;
  listGoalTreeProposals(projectId: string): GoalTreeProposalRecord[];
}

/**
 * Current Goal Tree persistence and the atomic decision boundary.
 */
export interface GovernanceRecordsApi {
  executeGoalTreeDecision<TTransition>(input: {
    project_id: string; actor_id: string; idempotency_key: string; request_hash: string;
  }, operation: () => { value: Omit<GoalTreeProposalDecisionResult<TTransition>, "replayed">; at: string }): GoalTreeProposalDecisionResult<TTransition>;
  recordGoalTreeDecision(input: {
    project_id: string; proposal_id: string; authority: GoalTreeProposalDecisionAuthority; runtime_actor_id: string | null;
    applied_item_ids: string[]; rejected_item_ids: string[]; revised_item_ids: string[]; conflict_item_ids: string[];
    revision_proposal_ids: string[]; semantic_review: GoalTreeSemanticReview | null; at: string;
  }): number;
  recordGoalTreeRevision(input: {
    project_id: string; proposal_id: string; authority: GoalTreeProposalDecisionAuthority;
    supersedes_proposal_id: string; supersedes_item_ids: string[]; at: string;
  }): number;
  recordGoalTreeItemDecision(input: {
    project_id: string;
    proposal_id: string;
    item: GoalTreeProposalItemRecord;
    item_state: GoalTreeProposalItemRecord["state"];
    decision: GoalTreeProposalDecisionRecord["decision"];
    authority: GoalTreeProposalDecisionAuthority;
    runtime_actor_id: string | null;
    reason: string;
    conflict: Record<string, unknown> | null;
    materialized_objects: ProposalAffectedObject[];
    revision_proposal_id: string | null;
    at: string;
  }): GoalTreeProposalDecisionRecord;
  refreshGoalTreeProposalState(projectId: string, proposalId: string, actorId: string, at: string, semanticReview: GoalTreeSemanticReview | null): void;
  executeGoalTreeCheck(input: {
    project_id: string; actor_id: string; idempotency_key: string; request_hash: string;
  }, operation: () => { value: GoalTreeProposalCheckResult; at: string }): GoalTreeProposalCheckResult;
  recordGoalTreeCheck(input: {
    project_id: string; proposal_id: string; actor_id: string; conflict_item_ids: string[];
    planning_issue_codes: string[]; at: string;
  }): number;
  executeGoalTreeSubmission(input: {
    project_id: string; actor_id: string; idempotency_key: string; request_hash: string;
  }, operation: () => { proposal: GoalTreeProposalRecord; observed_event_cursor: number }): {
    proposal: GoalTreeProposalRecord; observed_event_cursor: number; replayed: boolean;
  };
  recordGoalTreeSubmission(input: {
    project_id: string; proposal_id: string; actor_id: string; root_goal_id: string | null;
    base_event_cursor: number; version: number;
    supersedes_proposal_id: string | null; item_ids: string[]; at: string;
  }): number;
  findGoalTreeItemOwner(itemId: string): GoalTreeItemOwner | null;
  insertGoalTreeProposal(proposal: NewNativeGoalTreeProposal): void;
  insertGoalTreeProposalItem(item: NewNativeGoalTreeProposalItem): void;
  supersedeGoalTreeProposal(proposalId: string, at: string): void;
  setGoalTreeItemCheck(
    proposalId: string,
    itemId: string,
    state: "pending" | "conflict",
    conflict: Record<string, unknown> | null,
    at: string,
  ): void;
  transitionGoalTreeProposal(
    proposalId: string,
    state: GoalTreeProposalRecord["state"],
    decision: Record<string, unknown> | null,
    at: string,
    decidedAt?: string | null,
  ): void;
  transitionGoalTreeItem(input: {
    proposal_id: string;
    item_id: string;
    state: GoalTreeProposalItemRecord["state"];
    conflict?: Record<string, unknown> | null;
    materialized_objects?: GoalTreeProposalItemRecord["materialized_objects"];
    revision_proposal_id?: string | null;
    updated_at: string;
  }): void;
  insertGoalTreeDecision(decision: GoalTreeProposalDecisionRecord): void;
}

export interface GovernanceDecisionApi {
  /** Keep successful item changes visible only until this whole preview ends, then roll everything back. */
  previewMaterialization<T>(operation: () => T): T;
  previewMaterializationItem<T>(operation: () => { keep: boolean; value: T }): T;
  /** Owns the atomic boundary that combines an auditable decision with target-owner commands. */
  materializeAtomically<T>(operation: () => T): T;
}

export interface GoalTreeProposalCheckResult {
  proposal: GoalTreeProposalRecord;
  conflict_item_ids: string[];
  planning_issues: PlanningGraphIssue[];
  observed_event_cursor: number;
}

export interface GovernanceEventDecisionApi {
  record(input: RecordGoalUserDecisionInput & { authority: GoalEventTrustedAuthority }): GoalEventTrustedDecisionRecord;
  read(projectId: string, decisionId: string): GoalEventTrustedDecisionRecord | null;
}

export interface GovernanceApplicationApi {
  provenance: GovernanceProvenanceApi;
  query: GovernanceQueryApi;
  records: GovernanceRecordsApi;
  decisions: GovernanceDecisionApi;
  eventDecisions: GovernanceEventDecisionApi;
}

