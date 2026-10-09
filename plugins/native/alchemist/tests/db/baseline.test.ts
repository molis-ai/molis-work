// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { applyStudioBaseline } from "../../src/studio/server/db/schema.js";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
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

describe("SQLite baseline", () => {
  it("creates explicit product tables and no universal node table", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);

    applyStudioBaseline(database, temporary.path);

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

  it("opens a database at the same version as it is and refuses another version", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);

    applyStudioBaseline(database, temporary.path);
    applyStudioBaseline(database, temporary.path);
    expect(database.pragma("user_version", { simple: true })).toBe(1);

    database.pragma("user_version = 2");
    expect(() => applyStudioBaseline(database!, temporary!.path)).toThrow(SqliteSchemaVersionError);
    expect(database.pragma("user_version", { simple: true })).toBe(2);
  });
});
