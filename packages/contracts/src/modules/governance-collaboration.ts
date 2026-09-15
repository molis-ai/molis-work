import type { ContractDescriptor } from "../platform/package.js";
import type {
  CreateGoalInput,
  GoalChangeImpact,
  GoalEventTrustedAuthority,
  GoalEventTrustedDecisionRecord,
  GoalPolicy,
  PlanningGraphIssue,
  RecordGoalUserDecisionInput,
  RiskBlockingMode,
  RiskRecord,
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
  review_tool: "molis_work_v1_planning_analyze_change";
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

export type GovernanceReviewRole =
  | "self_verifier"
  | "cross_reviewer"
  | "adversarial_reviewer"
  | "human_approver";
export type GovernanceReviewVerdict = "pass" | "fail" | "needs_changes" | "inconclusive";

export interface ReviewObligationRecord {
  obligation_id: string;
  board_id: string;
  goal_id: string;
  contract_revision: number;
  role: GovernanceReviewRole;
  required_count: number;
  independence_rule: string;
  criterion_scope: string[];
  state: "pending" | "satisfied" | "waived";
  created_at: string;
}

export interface ReviewRecord {
  review_id: string;
  board_id: string;
  goal_id: string;
  obligation_id: string;
  claim_id: string | null;
  actor_id: string;
  verdict: GovernanceReviewVerdict;
  evidence_refs: string[];
  reasoning: string;
  submitted_at: string;
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

export interface ClarificationFact {
  statement: string;
  source_kind: "user_answer" | "repository_fact" | "document_fact";
  source_refs: string[];
  confidence: number;
  confirmed_by_user: boolean;
}

export interface ClarificationAssumption {
  statement: string;
  source_refs: string[];
  confidence: number;
  requires_user_confirmation: true;
}

export type ClarificationFactInput = Pick<ClarificationFact, "statement" | "source_kind"> &
  Partial<Pick<ClarificationFact, "source_refs" | "confidence" | "confirmed_by_user">>;
export type ClarificationAssumptionInput = Pick<ClarificationAssumption, "statement"> &
  Partial<Pick<ClarificationAssumption, "source_refs" | "confidence">>;

export type LegacyGovernanceSnapshot = Pick<GovernanceSnapshot, "contract_proposals" | "candidates" | "rewires">;

export type ClarificationSessionState = "clarifying" | "proposal_ready" | "closed";

export interface ClarificationSessionRecord {
  session_id: string;
  board_id: string;
  goal_id: string;
  claim_id: string | null;
  run_id: string | null;
  rough_idea: string;
  state: ClarificationSessionState;
  current_understanding: string | null;
  next_question: string | null;
  proposal_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface ClarificationTurnRecord {
  turn_id: string;
  session_id: string;
  board_id: string;
  goal_id: string;
  run_id: string | null;
  actor_id: string;
  turn_index: number;
  turn_kind: "rough_idea" | "user_answer";
  user_message: string;
  current_understanding: string | null;
  known_facts: ClarificationFact[];
  assumptions: ClarificationAssumption[];
  next_question: string | null;
  proposal_summary: string | null;
  created_at: string;
}

export interface GovernanceProvenanceApi {
  normalizeProposalSource(input: Pick<GoalTreeProposalItemProvenanceInput, "source_refs" | "reason" | "confidence" | "requires_user_confirmation">, index: number): Pick<GoalTreeProposalItemRecord, "source_refs" | "reason" | "confidence"> & { requires_user_confirmation: true };
  validateEventDecisionAuthority(authority: GoalEventTrustedAuthority): GoalEventTrustedAuthority;
  legacyProposalView(snapshot: LegacyGovernanceSnapshot): GoalTreeProposalRecord[];
}

export interface ContractProposalImpact {
  surface: string;
  access: "read" | "write" | "decide" | "exclusive";
  input_snapshot?: string | null;
  reason: string;
}

export interface ContractProposalRisk {
  risk_id: string;
  description: string;
  probability: string;
  impact: string;
  affected_surfaces: string[];
  trigger: string;
  treatment: RiskRecord["treatment"];
  treatment_plan?: string;
  blocking_mode: RiskBlockingMode;
  revisit_condition: string;
  owner: string;
}

export interface ContractProposalRecord {
  proposal_id: string;
  board_id: string;
  goal_id: string;
  submitted_by: string;
  discovered_in_run_id: string;
  proposed_goal: CreateGoalInput;
  field_sources: ContractFieldSource[];
  review_policy: GoalPolicy;
  proposed_impacts: ContractProposalImpact[];
  proposed_risks: ContractProposalRisk[];
  dependency_rewire_ids: string[];
  state: "pending" | "approved" | "rejected" | "superseded";
  decision: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
}

export interface CandidateGoalRecord {
  candidate_id: string;
  board_id: string;
  submitted_by: string;
  discovered_in_run_id: string | null;
  proposed_goal: CreateGoalInput;
  proposed_relations: Array<Record<string, unknown>>;
  proposed_impacts: Array<Record<string, unknown>>;
  proposed_risks: Array<Record<string, unknown>>;
  blocking_mode: "none" | "current_run" | "dependent_claims";
  state: "pending" | "approved" | "rejected" | "dismissed" | "superseded";
  decision: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
}

export interface RewireRecord {
  rewire_id: string;
  board_id: string;
  candidate_id: string | null;
  proposal: {
    formal_goal_id?: string;
    proposal_kind?: "candidate" | "dependency";
    submitted_by?: string;
    discovered_in_run_id?: string | null;
    blocking_mode?: "none" | "current_run";
    relations?: Array<Record<string, unknown>>;
    impacts?: Array<Record<string, unknown>>;
    risks?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  impact: Record<string, unknown>;
  state: "pending" | "confirmed" | "rejected" | "applied";
  created_at: string;
  decided_at: string | null;
}

export type GoalTreeProposalOrigin =
  | "native" | "legacy_contract_proposal" | "legacy_candidate" | "legacy_rewire";
export type GoalTreeProposalState =
  | "pending" | "superseded" | "approved" | "partially_applied"
  | "rejected" | "dismissed" | "closed";
export type GoalTreeProposalItemKind =
  | "goal" | "contract" | "relation" | "dependency" | "risk" | "policy"
  | "candidate" | "rewire";
export type GoalTreeProposalOperation = "create" | "update" | "deactivate";
export type GoalTreeProposalItemState =
  | "pending" | "conflict" | "superseded" | "approved" | "applied"
  | "rejected" | "dismissed";
export type GoalTreeProposalDecisionAction = "confirm" | "reject" | "revise";
export type GoalTreeProposalDecisionState = "confirmed" | "rejected" | "revised" | "conflict";
export type ProposalAffectedObjectType = "goal" | "relation" | "risk" | "policy" | "candidate" | "rewire";

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
  board_id: string;
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
  board_id: string;
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
  board_id: string;
  origin: GoalTreeProposalOrigin;
  root_goal_id: string | null;
  submitted_by: string;
  discovered_in_run_id: string | null;
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
  board_id: string;
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
  board_id: string;
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
  board_id: string;
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
  board_id: string;
}

export type NewNativeGoalTreeProposal = Omit<
  GoalTreeProposalRecord,
  "origin" | "items" | "decisions" | "decision" | "decided_at"
> & {
  supersedes_legacy_proposal_id?: string | null;
};

export type NewNativeGoalTreeProposalItem = Omit<
  GoalTreeProposalItemRecord,
  "decision" | "materialized_objects" | "revision_proposal_id" | "conflict"
>;

export interface GovernanceSnapshot {
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
}

export interface GovernanceQueryApi {
  hasCandidateBootstrap(boardId: string, candidateId: string, goalId: string, proposalId: string): boolean;
  listLifecycleEvents(boardId: string): import("../platform/storage.js").StoredModuleEvent[];
  eventCursor(boardId: string): number;
  snapshot(boardId: string): GovernanceSnapshot;
  getReviewObligation(boardId: string, obligationId: string): ReviewObligationRecord | null;
  listReviewObligations(boardId: string, goalId?: string): ReviewObligationRecord[];
  listReviews(boardId: string, goalId?: string): ReviewRecord[];
  getCandidate(boardId: string, candidateId: string): CandidateGoalRecord | null;
  getContractProposal(boardId: string, proposalId: string): ContractProposalRecord | null;
  getRewire(boardId: string, rewireId: string): RewireRecord | null;
  getGoalTreeProposal(boardId: string, proposalId: string): GoalTreeProposalRecord | null;
  listGoalTreeProposals(boardId: string): GoalTreeProposalRecord[];
}

/**
 * Current Goal Tree persistence and the atomic decision boundary.
 * Historical Candidate/Contract/Rewire rows are read through query, not this write port.
 */
export interface GovernanceRecordsApi {
  executeGoalTreeDecision<TTransition>(input: {
    board_id: string; actor_id: string; idempotency_key: string; request_hash: string;
  }, operation: () => { value: Omit<GoalTreeProposalDecisionResult<TTransition>, "replayed">; at: string }): GoalTreeProposalDecisionResult<TTransition>;
  recordGoalTreeDecision(input: {
    board_id: string; proposal_id: string; authority: GoalTreeProposalDecisionAuthority; runtime_actor_id: string | null;
    applied_item_ids: string[]; rejected_item_ids: string[]; revised_item_ids: string[]; conflict_item_ids: string[];
    revision_proposal_ids: string[]; semantic_review: GoalTreeSemanticReview | null; at: string;
  }): number;
  recordGoalTreeRevision(input: {
    board_id: string; proposal_id: string; authority: GoalTreeProposalDecisionAuthority;
    supersedes_proposal_id: string; supersedes_item_ids: string[]; at: string;
  }): number;
  recordGoalTreeItemDecision(input: {
    board_id: string;
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
  refreshGoalTreeProposalState(boardId: string, proposalId: string, actorId: string, at: string, semanticReview: GoalTreeSemanticReview | null): void;
  executeGoalTreeCheck(input: {
    board_id: string; actor_id: string; idempotency_key: string; request_hash: string;
  }, operation: () => { value: GoalTreeProposalCheckResult; at: string }): GoalTreeProposalCheckResult;
  recordGoalTreeCheck(input: {
    board_id: string; proposal_id: string; actor_id: string; conflict_item_ids: string[];
    planning_issue_codes: string[]; at: string;
  } & ({ origin: "native" } | { origin: "legacy_contract_proposal"; raw_proposal_id: string })): number;
  executeGoalTreeSubmission(input: {
    board_id: string; actor_id: string; idempotency_key: string; request_hash: string;
  }, operation: () => { proposal: GoalTreeProposalRecord; observed_event_cursor: number }): {
    proposal: GoalTreeProposalRecord; observed_event_cursor: number; replayed: boolean;
  };
  recordGoalTreeSubmission(input: {
    board_id: string; proposal_id: string; actor_id: string; root_goal_id: string | null;
    discovered_in_run_id: string | null; base_event_cursor: number; version: number;
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
  read(boardId: string, decisionId: string): GoalEventTrustedDecisionRecord | null;
}

export interface GovernanceApplicationApi {
  clarification: GovernanceClarificationApi;
  provenance: GovernanceProvenanceApi;
  query: GovernanceQueryApi;
  records: GovernanceRecordsApi;
  decisions: GovernanceDecisionApi;
  eventDecisions: GovernanceEventDecisionApi;
}

/** Historical dialogue records. Current work does not write clarification sessions. */
export interface GovernanceClarificationApi {
  listSessions(boardId: string): ClarificationSessionRecord[];
  listTurns(boardId: string): ClarificationTurnRecord[];
}
