import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { migrateClarificationDialogue } from "@molis-ai/molis-work-module-governance-collaboration";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import {
  insertHistoricalClarificationSession,
  insertHistoricalClarificationTurn,
} from "./historical-sql-fixture.js";

test("Governance migration 8 rolls back schema and marker together, then persists a usable dialogue after retry", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-dialogue-schema-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const sessionId = "dialogue-recovered";
  const goalId = "dialogue-goal";
  const roughIdea = "迁移后保留的真实澄清正文";
  try {
    store.db.exec(`
      DROP TABLE clarification_turns;
      DROP TABLE clarification_sessions;
      DELETE FROM schema_migrations WHERE migration_id = 8;
      CREATE TRIGGER fail_dialogue_migration BEFORE INSERT ON schema_migrations WHEN NEW.migration_id = 8
      BEGIN SELECT RAISE(ABORT, 'migration 8 interrupted'); END;
    `);
    assert.throws(() => migrateClarificationDialogue(store.db), /migration 8 interrupted/);
    assert.equal(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 8").get(), undefined);
    assert.deepEqual(store.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('clarification_sessions', 'clarification_turns')").all(), []);
    store.db.exec("DROP TRIGGER fail_dialogue_migration");
    migrateClarificationDialogue(store.db);
    const coordinator = new GoalProjectApplication(store);
    coordinator.initializeBoard({ board_id: "board", title: "Recovered dialogue", actor_id: "user", idempotency_key: "init" });
    coordinator.goals.commands.createGoal("board", {
      goal_id: goalId,
      title: "澄清会话",
      outcome: "迁移后仍能读到原文",
      why: "保留历史澄清",
      business_logic: "只读历史会话",
      acceptance_criteria: [],
    }, { actor_id: "user", idempotency_key: "create-dialogue-goal" });
    insertHistoricalClarificationSession(store.db, {
      session_id: sessionId,
      board_id: "board",
      goal_id: goalId,
      rough_idea: roughIdea,
      state: "clarifying",
      created_by: "runtime",
    });
    insertHistoricalClarificationTurn(store.db, {
      turn_id: `${sessionId}-turn-1`,
      session_id: sessionId,
      board_id: "board",
      goal_id: goalId,
      actor_id: "runtime",
      turn_index: 1,
      turn_kind: "rough_idea",
      user_message: roughIdea,
    });
  } finally { store.close(); }
  const reopened = new LocalProjectDatabase(databasePath);
  try {
    const snapshot = reopened.snapshot("board");
    assert.equal(snapshot.clarification_sessions.find((session) => session.session_id === sessionId)?.rough_idea, roughIdea);
    assert.equal(snapshot.clarification_turns.find((turn) => turn.session_id === sessionId)?.user_message, roughIdea);
  } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
});
