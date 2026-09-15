import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalsModule, migrateGoalImpactHistory } from "@molis-ai/molis-work-module-goals";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("legacy Impact history schema migrates atomically and reopens without changing old declarations", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-impact-owner-"));
  const databasePath = join(directory, "project.db");
  let store = new LocalProjectDatabase(databasePath);
  try {
    new GoalProjectApplication(store).initializeBoard({ board_id: "one", title: "one", actor_id: "user", idempotency_key: "board-one" });
    new GoalsModule(store.db, {}).commands.createGoal("one", {
      goal_id: "goal-one", title: "one", outcome: "", why: "", business_logic: "", acceptance_criteria: [],
    }, { actor_id: "user", idempotency_key: "goal-one" });
    const original = {
      binding_id: "impact-original",
      board_id: "one",
      goal_id: "goal-one",
      surface: "src/shared.ts",
      access: "read",
      input_snapshot: "commit://original",
      state: "proposed",
      reason: "Read original source",
      created_by: "user",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
      deactivated_at: null,
      deactivation_reason: null,
    };
    store.db.prepare(`INSERT INTO impact_bindings (
      binding_id, board_id, goal_id, surface, access, input_snapshot, state, reason, created_by, created_at, updated_at, deactivated_at, deactivation_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      original.binding_id, original.board_id, original.goal_id, original.surface, original.access,
      original.input_snapshot, original.state, original.reason, original.created_by, original.created_at,
      original.updated_at, original.deactivated_at, original.deactivation_reason,
    );
    store.db.exec(`DROP TABLE impact_bindings;
      CREATE TABLE impact_bindings (
        binding_id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(board_id),
        goal_id TEXT NOT NULL REFERENCES goals(goal_id), surface TEXT NOT NULL, access TEXT NOT NULL,
        input_snapshot TEXT, state TEXT NOT NULL, reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      DELETE FROM schema_migrations WHERE migration_id = 5;`);
    store.db.prepare("INSERT INTO impact_bindings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      original.binding_id, original.board_id, original.goal_id, original.surface, original.access,
      original.input_snapshot, original.state, original.reason, original.created_by, original.created_at);
    const legacy = store.db.prepare("SELECT * FROM impact_bindings").all();
    store.db.exec(`CREATE TRIGGER reject_impact_migration BEFORE INSERT ON schema_migrations
      WHEN NEW.migration_id = 5 BEGIN SELECT RAISE(ABORT, 'injected migration receipt failure'); END;`);
    assert.throws(() => migrateGoalImpactHistory(store.db, "2026-09-05T00:00:00Z"), /injected migration receipt failure/);
    assert.deepEqual(store.db.prepare("SELECT * FROM impact_bindings").all(), legacy);
    assert.equal(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 5").get(), undefined);
    store.db.exec("DROP TRIGGER reject_impact_migration");
    store.close();
    store = new LocalProjectDatabase(databasePath);
    assert.deepEqual(new GoalsModule(store.db, {}).impacts.get("one", original.binding_id), original);
    assert.deepEqual(store.snapshot("one").impacts, [original]);
    store.close();
    store = new LocalProjectDatabase(databasePath);
    assert.deepEqual(new GoalsModule(store.db, {}).impacts.get("one", original.binding_id), original);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
