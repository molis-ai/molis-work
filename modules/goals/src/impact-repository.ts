import type { ImpactBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsSqliteDatabase } from "./repository.js";

export const GOAL_IMPACTS_SCHEMA_SQL = `
  CREATE TABLE impact_bindings (
    binding_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    surface TEXT NOT NULL,
    access TEXT NOT NULL CHECK (access IN ('read', 'write', 'decide', 'exclusive')),
    input_snapshot TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    deactivated_at TEXT, deactivation_reason TEXT
  );
  CREATE INDEX impacts_goal_idx ON impact_bindings(board_id, goal_id, state);
  CREATE INDEX impacts_surface_idx ON impact_bindings(board_id, surface, state);
`;

export function migrateGoalImpactHistory(db: GoalsSqliteDatabase, at: string): void {
  db.transaction(() => {
    for (const column of ["updated_at", "deactivated_at", "deactivation_reason"]) {
      db.prepare(`ALTER TABLE impact_bindings ADD COLUMN ${column} TEXT`).run();
    }
    db.prepare("UPDATE impact_bindings SET updated_at = created_at WHERE updated_at IS NULL").run();
    db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (5, ?)").run(at);
  }).immediate();
}

export class GoalImpactRepository {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  list(boardId: string): ImpactBindingRecord[] {
    return (this.db.prepare("SELECT * FROM impact_bindings WHERE board_id = ? ORDER BY surface, binding_id")
      .all(boardId) as ImpactBindingRecord[]).map(mapImpact);
  }

  get(boardId: string, bindingId: string): ImpactBindingRecord | null {
    const row = this.db.prepare("SELECT * FROM impact_bindings WHERE binding_id = ? AND board_id = ?")
      .get(bindingId, boardId) as ImpactBindingRecord | undefined;
    return row ? mapImpact(row) : null;
  }
}

function mapImpact(row: ImpactBindingRecord): ImpactBindingRecord {
  return { ...row, updated_at: row.updated_at || row.created_at };
}
