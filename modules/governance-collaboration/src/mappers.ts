import type {
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
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

export function mapGoalTreeProposalDecision(row: GovernanceRow): GoalTreeProposalDecisionRecord {
  return {
    decision_id: text(row.decision_id), project_id: text(row.project_id),
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
    item_id: text(row.item_id), proposal_id: text(row.proposal_id), project_id: text(row.project_id),
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
    proposal_id: text(row.proposal_id), project_id: text(row.project_id),
    root_goal_id: optionalText(row.root_goal_id), submitted_by: text(row.submitted_by),
    submitted_session_id: optionalText(row.submitted_session_id),
    state: text(row.state) as GoalTreeProposalRecord["state"], version: number(row.version),
    supersedes_proposal_id: optionalText(row.supersedes_proposal_id),
    base_event_cursor: number(row.base_event_cursor), summary: text(row.summary),
    narrative: parseJson(row.narrative_json, null), decision: parseJson(row.decision_json, null),
    created_at: text(row.created_at), updated_at: text(row.updated_at),
    decided_at: optionalText(row.decided_at), items, decisions,
  };
}
