import { TASKS_SCHEMA_SQL, type TaskSqliteDatabase } from "./repository.js";

export const TASKS_MIGRATION_ID = 37;

export function migrateTasksSchema(db: TaskSqliteDatabase): void {
  db.transaction(() => {
    db.exec(TASKS_SCHEMA_SQL);
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
    ).run(TASKS_MIGRATION_ID, new Date().toISOString());
  }).immediate();
}
