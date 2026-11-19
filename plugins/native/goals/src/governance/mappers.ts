import { storedJson } from "../stored-json.js";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type {
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
} from "../contract/governance-collaboration.js";

export type GovernanceRow = Record<string, unknown>;

export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

export function mapGoalTreeProposalDecision(row: GovernanceRow, approval: ProjectTrustedDecision): GoalTreeProposalDecisionRecord {
  return {
    decision_id: text(row.effect_id), project_id: text(row.project_id),
    proposal_id: text(row.proposal_id), item_id: text(row.item_id),
    decision: text(row.result) as GoalTreeProposalDecisionRecord["decision"],
    actor_id: approval.actor_id,
    authority_source: approval.source.entry.source,
    runtime_actor_id: optionalText(row.runtime_actor_id), conversation_ref: approval.source.entry.conversation_ref,
    message_ref: approval.source.entry.message_ref, reason: text(row.reason),
    revision_proposal_id: optionalText(row.revision_proposal_id),
    materialized_objects: storedJson(row, "goal_tree_item_effects", "materialized_objects_json", []),
    created_at: text(row.created_at),
  };
}

export interface GoalTreeApprovalHistory {
  current(): ProjectTrustedDecision | undefined;
  read(projectId: string, id: string): ProjectTrustedDecision | null;
}

export function mapGoalTreeProposalItem(
  row: GovernanceRow,
  decision: GoalTreeProposalDecisionRecord | null,
): GoalTreeProposalItemRecord {
  return {
    item_id: text(row.item_id), proposal_id: text(row.proposal_id), project_id: text(row.project_id),
    ordinal: number(row.ordinal), kind: text(row.kind) as GoalTreeProposalItemRecord["kind"],
    operation: text(row.operation) as GoalTreeProposalItemRecord["operation"],
    payload: storedJson(row, "goal_tree_proposal_items", "payload_json", {}), source_refs: storedJson(row, "goal_tree_proposal_items", "source_refs_json", []),
    reason: text(row.reason), explanation: storedJson(row, "goal_tree_proposal_items", "explanation_json", null),
    confidence: number(row.confidence), affected_objects: storedJson(row, "goal_tree_proposal_items", "affected_objects_json", []),
    baseline_versions: storedJson(row, "goal_tree_proposal_items", "baseline_versions_json", []),
    requires_user_confirmation: Number(row.requires_user_confirmation ?? 0) === 1,
    state: text(row.state) as GoalTreeProposalItemRecord["state"],
    conflict: storedJson(row, "goal_tree_proposal_items", "conflict_json", null), decision,
    materialized_objects: storedJson(row, "goal_tree_proposal_items", "materialized_objects_json", []),
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
    narrative: storedJson(row, "goal_tree_proposals", "narrative_json", null), decision: storedJson(row, "goal_tree_proposals", "decision_json", null),
    created_at: text(row.created_at), updated_at: text(row.updated_at),
    decided_at: optionalText(row.decided_at), items, decisions,
  };
}
