import { readFileSync } from "node:fs";
import type { SqliteDatabase } from "./open-database.js";

const migrations = [
  {
    version: 1,
    sql: new URL("./migrations/001_m1_foundation.sql", import.meta.url),
  },
  {
    version: 2,
    sql: new URL("./migrations/002_idea_assumptions.sql", import.meta.url),
  },
  {
    version: 3,
    sql: new URL("./migrations/003_idea_card_position.sql", import.meta.url),
  },
  {
    version: 4,
    sql: new URL("./migrations/004_m1_conversation.sql", import.meta.url),
  },
  {
    version: 5,
    sql: new URL("./migrations/005_m2_research_decision.sql", import.meta.url),
  },
  {
    version: 6,
    sql: new URL("./migrations/006_m3_market_pulse.sql", import.meta.url),
  },
  {
    version: 7,
    sql: new URL("./migrations/007_m4_calibration_settings.sql", import.meta.url),
  },
  {
    version: 8,
    sql: new URL("./migrations/008_runtime_defaults.sql", import.meta.url),
  },
  { version: 9, sql: new URL("./migrations/009_host_runtime.sql", import.meta.url) },
] as const;

export const LATEST_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export function migrate(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const hasMigration = database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (hasMigration.get(migration.version)) continue;
    const sql = readFileSync(migration.sql, "utf8");
    database.transaction(() => {
      database.exec(sql);
      recordMigration.run(migration.version, new Date().toISOString());
    })();
  }
}
