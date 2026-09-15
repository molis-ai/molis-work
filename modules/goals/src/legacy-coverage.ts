import type { GoalLegacyCoverageRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext } from "./command-support.js";

type Coverage = Omit<GoalLegacyCoverageRecord, "board_id">;

/** Compatibility facts from V3 imports; not the live decomposition/revision ledger. */
export class LegacyGoalCoverage {
  constructor(private readonly context: GoalsCommandContext) {}

  list(boardId: string): Coverage[] {
    const rows = this.context.repository.db.prepare(
      "SELECT * FROM coverage_items WHERE board_id = ? ORDER BY created_at, requirement_id",
    ).all(boardId) as Array<Omit<Coverage, "blocking"> & { blocking: number }>;
    return rows.map(row => ({
      requirement_id: row.requirement_id, statement: row.statement,
      disposition: row.disposition, owner_goal_id: row.owner_goal_id,
      reason: row.reason, revisit_condition: row.revisit_condition,
      blocking: Boolean(row.blocking), created_at: row.created_at, updated_at: row.updated_at,
    }));
  }

  import(boardId: string, rows: readonly Coverage[]): void {
    this.context.repository.immediate(() => {
      this.context.requireBoard(boardId);
      const insert = this.context.repository.db.prepare(`INSERT INTO coverage_items (
        requirement_id, board_id, statement, disposition, owner_goal_id,
        reason, revisit_condition, blocking, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const row of rows) {
        if (row.owner_goal_id !== null) this.context.requireGoal(boardId, row.owner_goal_id);
        insert.run(row.requirement_id, boardId, row.statement, row.disposition, row.owner_goal_id,
          row.reason, row.revisit_condition, Number(row.blocking), row.created_at, row.updated_at);
      }
    });
  }
}
