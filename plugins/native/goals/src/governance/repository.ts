import type {
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  GovernanceSnapshot,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

import {
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
  text,
  type GovernanceRow,
} from "./mappers.js";

export interface GovernanceSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

/**
 * What Governance needs of a SQLite connection: statements, a transaction that nests, and a point it can roll back to without ending
 * the transaction (the Goal Tree preview). No free SQL: Governance sends nothing a plugin's statement check would refuse.
 * `savepoint` undoes the body's writes when `keep` is false or the body throws, and gives the body's value either way.
 */
export interface GovernanceSqliteDatabase {
  prepare(sql: string): GovernanceSqliteStatement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
  savepoint<T>(body: () => { readonly keep: boolean; readonly value: T }): T;
}

/** The connection `better-sqlite3` gives (the project library's own, in tests and in the Host while it assembles Goals), as Governance meets it. */
export function governanceSqlite(db: Pick<GovernanceSqliteDatabase, "prepare" | "transaction"> & { exec(sql: string): unknown }): GovernanceSqliteDatabase {
  let points = 0;
  return {
    prepare: sql => db.prepare(sql),
    transaction: operation => db.transaction(operation),
    savepoint<T>(body: () => { readonly keep: boolean; readonly value: T }): T {
      const name = `governance_savepoint_${++points}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = body();
        if (!result.keep) db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        return result.value;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      }
    },
  };
}

/**
 * The project's journal as Governance reaches it (PG-094 S9-1): the storage package's methods over `events` and
 * `idempotency_records`, which are not Goals' tables, so no statement here names either one (a plugin's SQL is refused when it does).
 */
export interface GovernanceJournal {
  eventCursor(projectId: string): number;
  appendEvent(input: {
    eventId: string; projectId: string; actorId: string; type: string; objectType: string; objectId: string;
    reason: string; payload: unknown; at: string;
  }): number;
  getIdempotency(projectId: string, actorId: string, operation: string, key: string): { request_hash: string; outcome: unknown } | null;
  putIdempotency(input: {
    projectId: string; actorId: string; operation: string; key: string; requestHash: string; outcome: unknown; at: string;
  }): void;
}

export class GovernanceRepository {
  constructor(private readonly db: GovernanceSqliteDatabase, readonly journal: GovernanceJournal) {}

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  eventCursor(projectId: string): number {
    return this.journal.eventCursor(projectId);
  }

  snapshot(projectId: string): GovernanceSnapshot {
    return {
      goal_tree_proposals: this.listGoalTreeProposals(projectId),
    };
  }

  getGoalTreeProposal(projectId: string, proposalId: string): GoalTreeProposalRecord | null {
    return this.listGoalTreeProposals(projectId).find((item) => item.proposal_id === proposalId) ?? null;
  }

  listGoalTreeProposals(projectId: string): GoalTreeProposalRecord[] {
    const decisionsByProposal = new Map<string, GoalTreeProposalDecisionRecord[]>();
    const latestDecisionByItem = new Map<string, GoalTreeProposalDecisionRecord>();
    for (const row of this.db.prepare(`
      SELECT * FROM goal_tree_proposal_decisions WHERE project_id = ?
      ORDER BY proposal_id, item_id, created_at, decision_id
    `).all(projectId) as GovernanceRow[]) {
      const decision = mapGoalTreeProposalDecision(row);
      decisionsByProposal.set(decision.proposal_id, [
        ...(decisionsByProposal.get(decision.proposal_id) ?? []), decision,
      ]);
      latestDecisionByItem.set(decision.item_id, decision);
    }
    const itemsByProposal = new Map<string, GoalTreeProposalItemRecord[]>();
    for (const row of this.db.prepare(
      "SELECT * FROM goal_tree_proposal_items WHERE project_id = ? ORDER BY proposal_id, ordinal, item_id",
    ).all(projectId) as GovernanceRow[]) {
      const item = mapGoalTreeProposalItem(row, latestDecisionByItem.get(text(row.item_id)) ?? null);
      itemsByProposal.set(item.proposal_id, [...(itemsByProposal.get(item.proposal_id) ?? []), item]);
    }
    return (this.db.prepare(
      "SELECT * FROM goal_tree_proposals WHERE project_id = ? ORDER BY created_at DESC, proposal_id",
    ).all(projectId) as GovernanceRow[]).map((row) => mapGoalTreeProposal(
      row,
      itemsByProposal.get(text(row.proposal_id)) ?? [],
      decisionsByProposal.get(text(row.proposal_id)) ?? [],
    ));
  }

  appendEvent(input: {
    event_id: string; project_id: string; actor_id: string; type: string;
    object_type: string; object_id: string; reason: string; payload: unknown; at: string;
  }): void {
    this.journal.appendEvent({
      eventId: input.event_id, projectId: input.project_id, actorId: input.actor_id, type: input.type,
      objectType: input.object_type, objectId: input.object_id, reason: input.reason, payload: input.payload, at: input.at,
    });
  }
}
