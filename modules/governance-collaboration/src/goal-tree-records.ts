import type { GoalTreeProposalDecisionRecord, GoalTreeProposalItemRecord, GoalTreeProposalRecord, GoalTreeItemOwner, GoalTreeSemanticReview, GovernanceRecordsApi, NewNativeGoalTreeProposal, NewNativeGoalTreeProposalItem } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { randomUUID } from "node:crypto";
import { json, text, type GovernanceRow } from "./mappers.js";
import { GovernanceRepository, type GovernanceSqliteDatabase } from "./repository.js";
import { assertGovernanceTransition, deriveGoalTreeProposalState } from "./state-machine.js";
import type { GovernanceErrorFactory } from "./errors.js";

/** Owns native proposal, item and decision records in the existing Governance tables. */
export class GovernanceGoalTreeRecords {
  constructor(private readonly db: GovernanceSqliteDatabase, private readonly errorFactory: GovernanceErrorFactory) {}

  recordGoalTreeItemDecision(input: Parameters<GovernanceRecordsApi["recordGoalTreeItemDecision"]>[0]): GoalTreeProposalDecisionRecord {
    const decisionId = `goal-tree-decision-${randomUUID()}`;
    const decisionRecord: GoalTreeProposalDecisionRecord = {
      decision_id: decisionId,
      board_id: input.board_id,
      proposal_id: input.proposal_id,
      item_id: input.item.item_id,
      decision: input.decision,
      actor_id: input.authority.actor_id,
      authority_source: input.authority.authority_source,
      runtime_actor_id: input.runtime_actor_id,
      conversation_ref: input.authority.conversation_ref,
      message_ref: input.authority.message_ref,
      reason: input.reason,
      revision_proposal_id: input.revision_proposal_id,
      materialized_objects: input.materialized_objects,
      created_at: input.at,
    };
    this.insertGoalTreeDecision(decisionRecord);
    this.transitionGoalTreeItem({
      proposal_id: input.proposal_id,
      item_id: input.item.item_id,
      state: input.item_state,
      conflict: input.conflict,
      materialized_objects: input.materialized_objects,
      revision_proposal_id: input.revision_proposal_id,
      updated_at: input.at,
    });
    new GovernanceRepository(this.db).appendEvent({
      event_id: randomUUID(),
      board_id: input.board_id,
      actor_id: input.authority.actor_id,
      type: `goal_tree_proposal.item_${input.decision}`,
      object_type: "goal_tree_proposal_item",
      object_id: input.item.item_id,
      reason: input.reason,
      payload: {
        proposal_id: input.proposal_id,
        item_state: input.item_state,
        authority_source: input.authority.authority_source,
        conversation_ref: input.authority.conversation_ref,
        message_ref: input.authority.message_ref,
        whole_confirmation_prompted: input.authority.whole_confirmation_prompted === true,
        prompted_proposal_id: input.authority.prompted_proposal_id ?? null,
        runtime_actor_id: input.runtime_actor_id,
        materialized_objects: input.materialized_objects,
        revision_proposal_id: input.revision_proposal_id,
        conflict: input.conflict,
      },
      at: input.at,
    });
    return decisionRecord;
  }

  refreshGoalTreeProposalState(
    boardId: string,
    proposalId: string,
    actorId: string,
    at: string,
    semanticReview: GoalTreeSemanticReview | null,
  ): void {
    const proposal = new GovernanceRepository(this.db).getGoalTreeProposal(boardId, proposalId);
    if (!proposal) throw this.errorFactory("goal_tree_proposal.not_found", `找不到 Goal Tree 提案: ${proposalId}`);
    const hasOpen = proposal.items.some((item) => item.state === "pending" || item.state === "conflict");
    const state = deriveGoalTreeProposalState(proposal.items);
    this.transitionGoalTreeProposal(
      proposalId,
      state,
      {
          item_states: Object.fromEntries(proposal.items.map((item) => [item.item_id, item.state])),
          latest_decision_ids: proposal.decisions.map((decision) => decision.decision_id),
          semantic_review: semanticReview ?? proposal.decision?.semantic_review ?? null,
      },
      at,
      hasOpen ? null : at,
    );
    new GovernanceRepository(this.db).appendEvent({
      event_id: randomUUID(),
      board_id: boardId,
      actor_id: actorId,
      type: "goal_tree_proposal.state_updated",
      object_type: "goal_tree_proposal",
      object_id: proposalId,
      reason: "根据逐项用户决定更新统一 Goal Tree 提案状态",
      payload: { state, item_states: Object.fromEntries(proposal.items.map((item) => [item.item_id, item.state])) },
      at,
    });
  }

  findGoalTreeItemOwner(itemId: string): GoalTreeItemOwner | null {
    const row = this.db.prepare(
      "SELECT proposal_id, board_id FROM goal_tree_proposal_items WHERE item_id = ?",
    ).get(itemId) as GovernanceRow | undefined;
    return row ? { proposal_id: text(row.proposal_id), board_id: text(row.board_id) } : null;
  }

  insertGoalTreeProposal(proposal: NewNativeGoalTreeProposal): void {
    this.db.prepare(`INSERT INTO goal_tree_proposals (
      proposal_id, board_id, root_goal_id, submitted_by, discovered_in_run_id,
      submitted_session_id, state, version, supersedes_proposal_id, supersedes_legacy_proposal_id,
      base_event_cursor, summary, narrative_json, decision_json,
      created_at, updated_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`)
      .run(
        proposal.proposal_id, proposal.board_id, proposal.root_goal_id,
        proposal.submitted_by, proposal.discovered_in_run_id, proposal.submitted_session_id ?? null,
        proposal.state, proposal.version, proposal.supersedes_proposal_id,
        proposal.supersedes_legacy_proposal_id ?? null, proposal.base_event_cursor,
        proposal.summary, proposal.narrative == null ? null : json(proposal.narrative),
        proposal.created_at, proposal.updated_at,
      );
  }

  insertGoalTreeProposalItem(item: NewNativeGoalTreeProposalItem): void {
    this.db.prepare(`INSERT INTO goal_tree_proposal_items (
      item_id, proposal_id, board_id, ordinal, kind, operation, payload_json,
      source_refs_json, reason, explanation_json, confidence, affected_objects_json,
      baseline_versions_json, requires_user_confirmation, state, conflict_json,
      materialized_objects_json, revision_proposal_id, supersedes_item_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', NULL, ?, ?, ?)`)
      .run(
        item.item_id, item.proposal_id, item.board_id, item.ordinal, item.kind,
        item.operation, json(item.payload), json(item.source_refs), item.reason,
        item.explanation == null ? null : json(item.explanation), item.confidence,
        json(item.affected_objects), json(item.baseline_versions),
        item.requires_user_confirmation ? 1 : 0, item.state,
        item.supersedes_item_id, item.created_at, item.updated_at,
      );
  }

  supersedeGoalTreeProposal(proposalId: string, at: string): void {
    this.db.prepare("UPDATE goal_tree_proposals SET state = 'superseded', updated_at = ? WHERE proposal_id = ?")
      .run(at, proposalId);
    this.db.prepare(`UPDATE goal_tree_proposal_items SET state = 'superseded', updated_at = ?
      WHERE proposal_id = ? AND state IN ('pending', 'conflict')`).run(at, proposalId);
  }

  setGoalTreeItemCheck(
    proposalId: string,
    itemId: string,
    state: "pending" | "conflict",
    conflict: Record<string, unknown> | null,
    at: string,
  ): void {
    this.db.prepare(`UPDATE goal_tree_proposal_items
      SET state = ?, conflict_json = ?, updated_at = ? WHERE item_id = ? AND proposal_id = ?`)
      .run(state, conflict ? json(conflict) : null, at, itemId, proposalId);
  }

  transitionGoalTreeProposal(
    proposalId: string,
    state: GoalTreeProposalRecord["state"],
    decision: Record<string, unknown> | null,
    at: string,
    decidedAt: string | null = at,
  ): void {
    const current = this.db.prepare("SELECT state FROM goal_tree_proposals WHERE proposal_id = ?")
      .get(proposalId) as GovernanceRow | undefined;
    if (current) {
      assertGovernanceTransition("goal_tree_proposal", text(current.state) as GoalTreeProposalRecord["state"], state);
    }
    this.db.prepare(`UPDATE goal_tree_proposals
      SET state = ?, decision_json = ?, updated_at = ?, decided_at = ? WHERE proposal_id = ?`)
      .run(state, decision == null ? null : json(decision), at, decidedAt, proposalId);
  }

  transitionGoalTreeItem(input: {
    proposal_id: string;
    item_id: string;
    state: GoalTreeProposalItemRecord["state"];
    conflict?: Record<string, unknown> | null;
    materialized_objects?: GoalTreeProposalItemRecord["materialized_objects"];
    revision_proposal_id?: string | null;
    updated_at: string;
  }): void {
    const current = this.db.prepare(
      "SELECT state FROM goal_tree_proposal_items WHERE proposal_id = ? AND item_id = ?",
    ).get(input.proposal_id, input.item_id) as GovernanceRow | undefined;
    if (current) {
      assertGovernanceTransition("goal_tree_item", text(current.state) as GoalTreeProposalItemRecord["state"], input.state);
    }
    this.db.prepare(`UPDATE goal_tree_proposal_items SET state = ?, conflict_json = ?,
      materialized_objects_json = ?, revision_proposal_id = ?, updated_at = ?
      WHERE proposal_id = ? AND item_id = ?`)
      .run(
        input.state, input.conflict ? json(input.conflict) : null,
        json(input.materialized_objects ?? []), input.revision_proposal_id ?? null,
        input.updated_at, input.proposal_id, input.item_id,
      );
  }

  insertGoalTreeDecision(decision: GoalTreeProposalDecisionRecord): void {
    this.db.prepare(`INSERT INTO goal_tree_proposal_decisions (
      decision_id, board_id, proposal_id, item_id, decision, actor_id,
      authority_source, runtime_actor_id, conversation_ref, message_ref,
      reason, revision_proposal_id, materialized_objects_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        decision.decision_id, decision.board_id, decision.proposal_id,
        decision.item_id, decision.decision, decision.actor_id,
        decision.authority_source, decision.runtime_actor_id,
        decision.conversation_ref, decision.message_ref, decision.reason,
        decision.revision_proposal_id, json(decision.materialized_objects),
        decision.created_at,
      );
  }
}
