import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { SqliteDatabase } from "./open-database.js";

export interface MigrationBackup {
  path: string;
  filename: string;
  fromVersion: number;
  toVersion: number;
}

export function createPreMigrationBackup(input: {
  database: SqliteDatabase;
  databasePath: string;
  backupDirectory: string;
  latestSchemaVersion: number;
  now: string;
}): MigrationBackup | undefined {
  const userTables = (
    input.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
  if (userTables.length === 0) return undefined;
  const fromVersion = userTables.includes("schema_migrations")
    ? Number(
        input.database.prepare("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").pluck().get() ?? 0,
      )
    : 0;
  if (fromVersion >= input.latestSchemaVersion) return undefined;

  mkdirSync(input.backupDirectory, { recursive: true });
  const timestamp = input.now.replace(/[:.]/g, "-");
  const filename = `${basename(input.databasePath)}.pre-migration-v${fromVersion}-to-v${input.latestSchemaVersion}-${timestamp}.sqlite`;
  const path = join(input.backupDirectory, filename);
  input.database.prepare("VACUUM INTO ?").run(path);
  return { path, filename, fromVersion, toVersion: input.latestSchemaVersion };
}
