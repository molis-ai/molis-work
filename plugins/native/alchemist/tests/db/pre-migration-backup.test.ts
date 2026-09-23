// @vitest-environment node

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createPreMigrationBackup } from "../../src/studio/server/db/pre-migration-backup.js";
import { createTempDatabase } from "./helpers/temp-database.js";

describe("pre-migration backup", () => {
  it("creates a restorable consistent copy only for an existing database with pending migrations", async () => {
    const temp = createTempDatabase();
    const backupDirectory = join(temp.directory, "backups");
    const database = new Database(temp.path);
    try {
      database.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations VALUES (7, '2026-07-30T10:00:00.000Z');
        CREATE TABLE durable_marker (value TEXT NOT NULL);
        INSERT INTO durable_marker VALUES ('before-migration');
      `);

      const backup = await createPreMigrationBackup({
        database,
        databasePath: temp.path,
        backupDirectory,
        latestSchemaVersion: 8,
        now: "2026-07-31T10:00:00.000Z",
      });

      expect(backup?.filename).toMatch(/pre-migration-v7-to-v8/);
      expect(backup && existsSync(backup.path)).toBe(true);
      const restored = new Database(backup?.path, { readonly: true });
      try {
        expect(restored.prepare("SELECT value FROM durable_marker").pluck().get()).toBe("before-migration");
      } finally {
        restored.close();
      }
    } finally {
      database.close();
      temp.cleanup();
    }
  });

  it("does not manufacture a backup for an empty or current database", async () => {
    const temp = createTempDatabase();
    const backupDirectory = join(temp.directory, "backups");
    mkdirSync(backupDirectory, { recursive: true });
    const database = new Database(temp.path);
    try {
      expect(
        createPreMigrationBackup({
          database,
          databasePath: temp.path,
          backupDirectory,
          latestSchemaVersion: 8,
          now: "2026-07-31T10:00:00.000Z",
        }),
      ).toBeUndefined();
      expect(readdirSync(backupDirectory)).toEqual([]);
    } finally {
      database.close();
      temp.cleanup();
    }
  });
});
