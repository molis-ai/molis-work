import type { StoredModuleEvent } from "@molis-ai/molis-work-contracts/platform/storage";
import type {
  CandidateGoalRecord,
  ContractProposalRecord,
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  GovernanceSnapshot,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import {
  json,
  parseJson,
  mapCandidate,
  mapContractProposal,
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
  mapReview,
  mapReviewObligation,
  mapRewire,
  text,
  type GovernanceRow,
} from "./mappers.js";
export { GOVERNANCE_SCHEMA_SQL, createGovernanceSchema } from "./schema.js";

export interface GovernanceSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface GovernanceSqliteDatabase {
  prepare(sql: string): GovernanceSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
  pragma(source: string): unknown;
}

export class GovernanceRepository {
  constructor(private readonly db: GovernanceSqliteDatabase) {}

  listLifecycleEvents(boardId: string): StoredModuleEvent[] {
    return (this.db.prepare(`SELECT seq, type, object_type, object_id, payload_json, at FROM events
      WHERE board_id = ? AND type IN ('review.submitted') ORDER BY seq`)
      .all(boardId) as GovernanceRow[]).map(row => ({
      seq: Number(row.seq ?? 0), type: text(row.type), object_type: text(row.object_type), object_id: text(row.object_id),
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}), at: text(row.at),
    }));
  }

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  eventCursor(boardId: string): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE board_id = ?")
      .get(boardId) as GovernanceRow | undefined;
    return Number(row?.cursor ?? 0);
  }

  hasCandidateBootstrap(
    boardId: string,
    candidateId: string,
    goalId: string,
    proposalId: string,
  ): boolean {
    const proposal = this.getGoalTreeProposal(boardId, proposalId);
    return (proposal?.items ?? []).some((item) => {
      if (item.state !== "applied" || item.kind !== "goal" || item.operation !== "create") return false;
      return item.affected_objects.some(
        (object) => object.object_type === "candidate" && object.object_id === candidateId,
      ) && item.baseline_versions.some(
        (baseline) =>
          baseline.object_type === "candidate" &&
          baseline.object_id === candidateId &&
          baseline.exists,
      ) && item.materialized_objects.some(
        (object) => object.object_type === "goal" && object.object_id === goalId,
      );
    });
  }

  snapshot(boardId: string): GovernanceSnapshot {
    return {
      review_obligations: this.listReviewObligations(boardId),
      reviews: this.listReviews(boardId),
      candidates: this.listCandidates(boardId),
      contract_proposals: this.listContractProposals(boardId),
      rewires: this.listRewires(boardId),
      goal_tree_proposals: this.listGoalTreeProposals(boardId),
    };
  }

  getReviewObligation(boardId: string, obligationId: string): ReviewObligationRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM review_obligations WHERE board_id = ? AND obligation_id = ?",
    ).get(boardId, obligationId) as GovernanceRow | undefined;
    return row ? mapReviewObligation(row) : null;
  }

  listReviewObligations(boardId: string, goalId?: string): ReviewObligationRecord[] {
    const rows = goalId
      ? this.db.prepare("SELECT * FROM review_obligations WHERE board_id = ? AND goal_id = ? ORDER BY created_at, obligation_id").all(boardId, goalId)
      : this.db.prepare("SELECT * FROM review_obligations WHERE board_id = ? ORDER BY created_at, obligation_id").all(boardId);
    return (rows as GovernanceRow[]).map(mapReviewObligation);
  }

  listReviews(boardId: string, goalId?: string): ReviewRecord[] {
    const rows = goalId
      ? this.db.prepare("SELECT * FROM reviews WHERE board_id = ? AND goal_id = ? ORDER BY submitted_at, review_id").all(boardId, goalId)
      : this.db.prepare("SELECT * FROM reviews WHERE board_id = ? ORDER BY submitted_at, review_id").all(boardId);
    return (rows as GovernanceRow[]).map(mapReview);
  }

  getCandidate(boardId: string, candidateId: string): CandidateGoalRecord | null {
    const row = this.db.prepare("SELECT * FROM candidates WHERE board_id = ? AND candidate_id = ?")
      .get(boardId, candidateId) as GovernanceRow | undefined;
    return row ? mapCandidate(row) : null;
  }

  listCandidates(boardId: string): CandidateGoalRecord[] {
    return (this.db.prepare("SELECT * FROM candidates WHERE board_id = ? ORDER BY created_at DESC, candidate_id")
      .all(boardId) as GovernanceRow[]).map(mapCandidate);
  }

  getContractProposal(boardId: string, proposalId: string): ContractProposalRecord | null {
    const row = this.db.prepare("SELECT * FROM contract_proposals WHERE board_id = ? AND proposal_id = ?")
      .get(boardId, proposalId) as GovernanceRow | undefined;
    return row ? mapContractProposal(row) : null;
  }

  listContractProposals(boardId: string): ContractProposalRecord[] {
    return (this.db.prepare("SELECT * FROM contract_proposals WHERE board_id = ? ORDER BY created_at DESC, proposal_id")
      .all(boardId) as GovernanceRow[]).map(mapContractProposal);
  }

  getRewire(boardId: string, rewireId: string): RewireRecord | null {
    const row = this.db.prepare("SELECT * FROM rewires WHERE board_id = ? AND rewire_id = ?")
      .get(boardId, rewireId) as GovernanceRow | undefined;
    return row ? mapRewire(row) : null;
  }

  listRewires(boardId: string): RewireRecord[] {
    return (this.db.prepare("SELECT * FROM rewires WHERE board_id = ? ORDER BY created_at DESC, rewire_id")
      .all(boardId) as GovernanceRow[]).map(mapRewire);
  }

  getGoalTreeProposal(boardId: string, proposalId: string): GoalTreeProposalRecord | null {
    return this.listGoalTreeProposals(boardId).find((item) => item.proposal_id === proposalId) ?? null;
  }

  listGoalTreeProposals(boardId: string): GoalTreeProposalRecord[] {
    const decisionsByProposal = new Map<string, GoalTreeProposalDecisionRecord[]>();
    const latestDecisionByItem = new Map<string, GoalTreeProposalDecisionRecord>();
    for (const row of this.db.prepare(`
      SELECT * FROM goal_tree_proposal_decisions WHERE board_id = ?
      ORDER BY proposal_id, item_id, created_at, decision_id
    `).all(boardId) as GovernanceRow[]) {
      const decision = mapGoalTreeProposalDecision(row);
      decisionsByProposal.set(decision.proposal_id, [
        ...(decisionsByProposal.get(decision.proposal_id) ?? []), decision,
      ]);
      latestDecisionByItem.set(decision.item_id, decision);
    }
    const itemsByProposal = new Map<string, GoalTreeProposalItemRecord[]>();
    for (const row of this.db.prepare(
      "SELECT * FROM goal_tree_proposal_items WHERE board_id = ? ORDER BY proposal_id, ordinal, item_id",
    ).all(boardId) as GovernanceRow[]) {
      const item = mapGoalTreeProposalItem(row, latestDecisionByItem.get(text(row.item_id)) ?? null);
      itemsByProposal.set(item.proposal_id, [...(itemsByProposal.get(item.proposal_id) ?? []), item]);
    }
    return (this.db.prepare(
      "SELECT * FROM goal_tree_proposals WHERE board_id = ? ORDER BY created_at DESC, proposal_id",
    ).all(boardId) as GovernanceRow[]).map((row) => mapGoalTreeProposal(
      row,
      itemsByProposal.get(text(row.proposal_id)) ?? [],
      decisionsByProposal.get(text(row.proposal_id)) ?? [],
    ));
  }

  appendEvent(input: {
    event_id: string; board_id: string; actor_id: string; type: string;
    object_type: string; object_id: string; reason: string; payload: unknown; at: string;
  }): void {
    this.db.prepare(`INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.event_id, input.board_id, input.actor_id, input.type, input.object_type,
        input.object_id, input.reason, json(input.payload), input.at);
  }
}
