import {
  ARTIFACTS_SCHEMA_SQL,
  PROCESS_ITEMS_SCHEMA_SQL,
  type ArtifactsSqliteDatabase,
} from "./repository.js";

export const ARTIFACTS_MIGRATION_ID = 31;

/** The 成果库 and the process items store side by side; both idempotent, so a project missing either gets it. */
export function migrateArtifactsSchema(db: ArtifactsSqliteDatabase): void {
  db.transaction(() => {
    db.exec(ARTIFACTS_SCHEMA_SQL);
    db.exec(PROCESS_ITEMS_SCHEMA_SQL);
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
    ).run(ARTIFACTS_MIGRATION_ID, new Date().toISOString());
  }).immediate();
}
