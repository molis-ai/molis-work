import type {
  CandidateGoalRecord,
  ContractProposalRecord,
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

export type GovernanceRow = Record<string, unknown>;

export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

export function mapReviewObligation(row: GovernanceRow): ReviewObligationRecord {
  return {
    obligation_id: text(row.obligation_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    contract_revision: Math.max(1, number(row.contract_revision) || 1),
    role: text(row.role) as ReviewObligationRecord["role"],
    required_count: number(row.required_count),
    independence_rule: text(row.independence_rule),
    criterion_scope: parseJson<string[]>(row.criterion_scope_json, []),
    state: text(row.state) as ReviewObligationRecord["state"],
    created_at: text(row.created_at),
  };
}

export function mapReview(row: GovernanceRow): ReviewRecord {
  return {
    review_id: text(row.review_id), board_id: text(row.board_id), goal_id: text(row.goal_id),
    obligation_id: text(row.obligation_id), claim_id: optionalText(row.claim_id),
    actor_id: text(row.actor_id), verdict: text(row.verdict) as ReviewRecord["verdict"],
    evidence_refs: parseJson<string[]>(row.evidence_refs_json, []),
    reasoning: text(row.reasoning), submitted_at: text(row.submitted_at),
  };
}

export function mapCandidate(row: GovernanceRow): CandidateGoalRecord {
  return {
    candidate_id: text(row.candidate_id), board_id: text(row.board_id),
    submitted_by: text(row.submitted_by), discovered_in_run_id: optionalText(row.discovered_in_run_id),
    proposed_goal: parseJson(row.proposed_goal_json, {} as CandidateGoalRecord["proposed_goal"]),
    proposed_relations: parseJson(row.proposed_relations_json, []),
    proposed_impacts: parseJson(row.proposed_impacts_json, []),
    proposed_risks: parseJson(row.proposed_risks_json, []),
    blocking_mode: text(row.blocking_mode) as CandidateGoalRecord["blocking_mode"],
    state: text(row.state) as CandidateGoalRecord["state"],
    decision: parseJson(row.decision_json, null), created_at: text(row.created_at),
    decided_at: optionalText(row.decided_at),
  };
}

export function mapContractProposal(row: GovernanceRow): ContractProposalRecord {
  return {
    proposal_id: text(row.proposal_id), board_id: text(row.board_id), goal_id: text(row.goal_id),
    submitted_by: text(row.submitted_by), discovered_in_run_id: text(row.discovered_in_run_id),
    proposed_goal: parseJson(row.proposed_goal_json, {} as ContractProposalRecord["proposed_goal"]),
    field_sources: parseJson(row.field_sources_json, []),
    review_policy: parseJson(row.review_policy_json, {} as ContractProposalRecord["review_policy"]),
    proposed_impacts: parseJson(row.proposed_impacts_json, []),
    proposed_risks: parseJson(row.proposed_risks_json, []),
    dependency_rewire_ids: parseJson(row.dependency_rewire_ids_json, []),
    state: text(row.state) as ContractProposalRecord["state"],
    decision: parseJson(row.decision_json, null), created_at: text(row.created_at),
    decided_at: optionalText(row.decided_at),
  };
}

export function mapRewire(row: GovernanceRow): RewireRecord {
  return {
    rewire_id: text(row.rewire_id), board_id: text(row.board_id), candidate_id: optionalText(row.candidate_id),
    proposal: parseJson(row.proposal_json, {}), impact: parseJson(row.impact_json, {}),
    state: text(row.state) as RewireRecord["state"], created_at: text(row.created_at),
    decided_at: optionalText(row.decided_at),
  };
}

export function mapGoalTreeProposalDecision(row: GovernanceRow): GoalTreeProposalDecisionRecord {
  return {
    decision_id: text(row.decision_id), board_id: text(row.board_id),
    proposal_id: text(row.proposal_id), item_id: text(row.item_id),
    decision: text(row.decision) as GoalTreeProposalDecisionRecord["decision"],
    actor_id: text(row.actor_id),
    authority_source: text(row.authority_source) as GoalTreeProposalDecisionRecord["authority_source"],
    runtime_actor_id: optionalText(row.runtime_actor_id), conversation_ref: text(row.conversation_ref),
    message_ref: text(row.message_ref), reason: text(row.reason),
    revision_proposal_id: optionalText(row.revision_proposal_id),
    materialized_objects: parseJson(row.materialized_objects_json, []), created_at: text(row.created_at),
  };
}

export function mapGoalTreeProposalItem(
  row: GovernanceRow,
  decision: GoalTreeProposalDecisionRecord | null,
): GoalTreeProposalItemRecord {
  return {
    item_id: text(row.item_id), proposal_id: text(row.proposal_id), board_id: text(row.board_id),
    ordinal: number(row.ordinal), kind: text(row.kind) as GoalTreeProposalItemRecord["kind"],
    operation: text(row.operation) as GoalTreeProposalItemRecord["operation"],
    payload: parseJson(row.payload_json, {}), source_refs: parseJson(row.source_refs_json, []),
    reason: text(row.reason), explanation: parseJson(row.explanation_json, null),
    confidence: number(row.confidence), affected_objects: parseJson(row.affected_objects_json, []),
    baseline_versions: parseJson(row.baseline_versions_json, []),
    requires_user_confirmation: Number(row.requires_user_confirmation ?? 0) === 1,
    state: text(row.state) as GoalTreeProposalItemRecord["state"],
    conflict: parseJson(row.conflict_json, null), decision,
    materialized_objects: parseJson(row.materialized_objects_json, []),
    revision_proposal_id: optionalText(row.revision_proposal_id),
    supersedes_item_id: optionalText(row.supersedes_item_id),
    created_at: text(row.created_at), updated_at: text(row.updated_at),
  };
}

export function mapGoalTreeProposal(
  row: GovernanceRow,
  items: GoalTreeProposalItemRecord[],
  decisions: GoalTreeProposalDecisionRecord[],
): GoalTreeProposalRecord {
  return {
    proposal_id: text(row.proposal_id), board_id: text(row.board_id), origin: "native",
    root_goal_id: optionalText(row.root_goal_id), submitted_by: text(row.submitted_by),
    discovered_in_run_id: optionalText(row.discovered_in_run_id),
    submitted_session_id: optionalText(row.submitted_session_id),
    state: text(row.state) as GoalTreeProposalRecord["state"], version: number(row.version),
    supersedes_proposal_id: optionalText(row.supersedes_proposal_id) ?? optionalText(row.supersedes_legacy_proposal_id),
    base_event_cursor: number(row.base_event_cursor), summary: text(row.summary),
    narrative: parseJson(row.narrative_json, null), decision: parseJson(row.decision_json, null),
    created_at: text(row.created_at), updated_at: text(row.updated_at),
    decided_at: optionalText(row.decided_at), items, decisions,
  };
}
