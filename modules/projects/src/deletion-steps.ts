import type { ProjectDeletionStep } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/** One row for each owner of project data in the Home that must clear it after a deletion committed. */
export function createDeletionStepsSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_deletion_steps (
      deletion_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'complete', 'skipped')),
      error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (deletion_id, owner_id)
    );
  `);
}

/**
 * What each owner of project data did after the deletion of a project committed, kept with the deletion receipt so a
 * step that failed is retried from it, like the staged directory's removal.
 */
export class ProjectDeletionSteps {
  constructor(private readonly db: ProjectsSqliteDatabase, private readonly now: () => string) {}

  /** Records one pending step for each owner, in the order they run. */
  begin(deletionId: string, ownerIds: readonly string[]): void {
    const insert = this.db.prepare(
      "INSERT INTO project_deletion_steps (deletion_id, owner_id, position, state, error, updated_at) VALUES (?, ?, ?, 'pending', NULL, ?)",
    );
    const at = this.now();
    ownerIds.forEach((ownerId, position) => insert.run(deletionId, ownerId, position, at));
  }

  settle(deletionId: string, ownerId: string, input: { state: ProjectDeletionStep["state"]; error: string | null }): void {
    this.db.prepare("UPDATE project_deletion_steps SET state = ?, error = ?, updated_at = ? WHERE deletion_id = ? AND owner_id = ?")
      .run(input.state, input.error, this.now(), deletionId, ownerId);
  }

  list(deletionId: string): ProjectDeletionStep[] {
    return (this.db.prepare("SELECT owner_id, state, error, updated_at FROM project_deletion_steps WHERE deletion_id = ? ORDER BY position, owner_id")
      .all(deletionId) as Row[]).map((row) => ({
      owner_id: String(row.owner_id),
      state: String(row.state) as ProjectDeletionStep["state"],
      error: row.error == null ? null : String(row.error),
      updated_at: String(row.updated_at),
    }));
  }
}
