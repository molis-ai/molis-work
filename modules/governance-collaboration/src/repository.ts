import type {
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  GovernanceSnapshot,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import {
  json,
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
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

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  eventCursor(boardId: string): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE board_id = ?")
      .get(boardId) as GovernanceRow | undefined;
    return Number(row?.cursor ?? 0);
  }

  snapshot(boardId: string): GovernanceSnapshot {
    return {
      goal_tree_proposals: this.listGoalTreeProposals(boardId),
    };
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
