// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
  database = undefined;
  temporary = undefined;
});

describe("SQLite migrations", () => {
  it("creates explicit product tables and no universal node table", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);

    migrate(database);

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual([
      "action_proposals",
      "activity_events",
      "annotations",
      "claim_evidence",
      "claims",
      "conversation_messages",
      "decisions",
      "directions",
      "evidence",
      "exploration_runs",
      "idea_cards",
      "idea_versions",
      "ideas",
      "job_events",
      "jobs",
      "lens_reports",
      "lens_runs",
      "memory_rule_applications",
      "mvp_scope_versions",
      "opportunities",
      "opportunity_signals",
      "pulse_report_signals",
      "pulse_reports",
      "pulse_runs",
      "research_plans",
      "research_playbook_revisions",
      "research_playbook_rules",
      "runtime_settings",
      "schema_migrations",
      "source_fetches",
      "source_settings",
      "supply_signals",
      "taste_rules",
      "ui_context",
      "work_reuse_receipts",
      "workspace_actors",
      "workspaces",
    ]);
    expect(tables).not.toContain("nodes");
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("is idempotent and records the applied migration once", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);

    migrate(database);
    migrate(database);

    const rows = database.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    expect(rows).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
    ]);
  });
});
