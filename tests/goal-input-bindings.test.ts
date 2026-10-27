import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalInputBindings } from "./fixtures/goals-modules.js";
import { GOALS_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-goals";
import type { GoalInputBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { PROJECT_ROOT_SCHEMA_SQL, writeProjectRoot } from "@molis-ai/molis-work-module-projects";

// The tables are the ones Goals declares for a project's library; the rows only fill their required columns. The board is keyed to the
// project's root row, which the platform's baseline makes (PLIB-13), so a project's root goes in before its board.
function createLibrary(db: Database.Database): void {
  db.exec(PROJECT_ROOT_SCHEMA_SQL);
  db.exec(GOALS_PROJECT_DATABASE.schema);
}

function insertBoard(db: Database.Database, projectId: string): void {
  writeProjectRoot(db, projectId, "2026-09-01T00:00:00Z");
  db.prepare("INSERT INTO boards (project_id, created_at, updated_at) VALUES (?, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')").run(projectId);
}

function insertGoal(db: Database.Database, goalId: string, projectId: string): void {
  db.prepare(`INSERT INTO goals (goal_id, project_id, title, outcome, why, business_logic, definition_state, decomposition_state,
    validity_state, fulfillment_state, created_at, updated_at) VALUES (?, ?, 'Goal', 'Outcome', 'Why', 'Logic', 'draft', 'abstract',
    'valid', 'unmet', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`).run(goalId, projectId);
}

test("Goal input receipts retain opaque locators and snapshots, isolate Projects, and share rollback", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  createLibrary(db);
  insertBoard(db, "project-a");
  insertBoard(db, "project-b");
  insertGoal(db, "goal-a", "project-a");
  try {
    const inputs = new GoalInputBindings(db, createContextLedger(db, { authorize: () => true }));
    const record: GoalInputBindingRecord = { binding_id: "binding-a", project_id: "project-a", goal_id: "goal-a",
      input_name: "Product requirements", source_type: "url", source_ref: "https://example.com/requirements",
      snapshot_digest: "sha256:existing-snapshot", state: "confirmed", reason: "User chose this source",
      created_by: "user-a", created_at: "2026-09-05T00:00:00Z" };
    inputs.register(record);
    assert.deepEqual(inputs.list("project-a"), [record]);
    assert.deepEqual(inputs.list("project-b"), []);
    assert.throws(() => inputs.register({ ...record, binding_id: "wrong-project", project_id: "project-b" }), /不属于这个 Project/);
    assert.deepEqual(inputs.list("project-a"), [record]);
    assert.deepEqual(inputs.list("project-b"), []);
    assert.throws(() => db.transaction(() => {
      insertGoal(db, "goal-new", "project-a");
      inputs.register({ ...record, binding_id: "rolled-back", goal_id: "goal-new" });
      throw new Error("later action failed");
    }).immediate(), /later action failed/);
    assert.equal(db.prepare("SELECT goal_id FROM goals WHERE goal_id = 'goal-new'").get(), undefined);
    assert.deepEqual(inputs.list("project-a"), [record]);
  } finally { db.close(); }
});

const feedReceipt: GoalInputBindingRecord = {
  binding_id: "binding-feed", project_id: "project-a", goal_id: "goal-a", input_name: "Inbox input",
  source_type: "feed_item", source_ref: "feed-item:item-a", snapshot_digest: "old-confirmed-snapshot",
  state: "confirmed", reason: "Confirmed by user", created_by: "original-user", created_at: "2026-09-01T10:00:00Z",
};

function seedGoal(db: Database.Database): void {
  createLibrary(db);
  insertBoard(db, "project-a");
  insertGoal(db, "goal-a", "project-a");
}

test("Feed input provenance is recorded once and survives reopen independently of current Feed links", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-input-ledger-"));
  const path = join(directory, "test.db");
  let db = new Database(path);
  try {
    seedGoal(db);
    let ledger = createContextLedger(db, { authorize: () => true });
    let inputs = new GoalInputBindings(db, ledger);
    inputs.register(feedReceipt);
    const access = { actor_id: "reader", scope: { kind: "personal" as const, id: "project-a" } };
    assert.deepEqual(inputs.list("project-a"), [feedReceipt]);
    assert.deepEqual(inputs.list("project-b"), []);
    assert.deepEqual(db.prepare("SELECT source_ref, source_edge_key FROM input_bindings").get(), {
      source_ref: "", source_edge_key: "goal.input:binding-feed",
    });
    const edge = ledger.query.get(access, "goal.input:binding-feed")!;
    assert.equal(edge.actor_id, "original-user");
    assert.equal(edge.recorded_at, "2026-09-01T10:00:00Z");
    assert.deepEqual(edge.target, { module: "feed", id: "item-a", version: null, scope: access.scope });
    // A Feed item can move to another Goal or be deleted without changing the confirmed source receipt.
    ledger.commands.put(access, { key: "feed.goal:item-a", type: "feed.goal", source: edge.target,
      target: { ...edge.source, id: "goal-other" }, cause: "feed.link_goal" });
    ledger.commands.remove(access, "feed.goal:item-a", "feed.item_deleted");
    assert.deepEqual(inputs.list("project-a"), [feedReceipt]);
    db.close();
    db = new Database(path);
    ledger = createContextLedger(db, { authorize: () => true });
    inputs = new GoalInputBindings(db, ledger);
    assert.deepEqual(inputs.list("project-a"), [feedReceipt]);
    assert.equal(ledger.query.history(access, "goal.input:binding-feed").length, 1);
    ledger.commands.remove(access, "goal.input:binding-feed", "test.missing_source");
    assert.throws(() => inputs.list("project-a"), { code: "goals.goal.input_source_missing" });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Source registration rolls back ledger writes and receipt changes on failure", () => {
  const db = new Database(":memory:");
  try {
    seedGoal(db);
    const ledger = createContextLedger(db, { authorize: () => true });
    const access = { actor_id: "reader", scope: { kind: "personal" as const, id: "project-a" } };
    let fail = true;
    const failingLedger = { query: ledger.query, commands: { ...ledger.commands,
      put: (...args: Parameters<typeof ledger.commands.put>) => {
        const result = ledger.commands.put(...args);
        if (fail) throw new Error("source write failed");
        return result;
      },
    } };
    const inputs = new GoalInputBindings(db, failingLedger);
    assert.throws(() => inputs.register(feedReceipt), /source write failed/);
    assert.deepEqual(ledger.query.list(access), []);
    assert.deepEqual(inputs.list("project-a"), []);
    fail = false;
    inputs.register(feedReceipt);
    fail = true;
    assert.throws(() => inputs.register({ ...feedReceipt, binding_id: "failed-new" }), /source write failed/);
    assert.deepEqual(ledger.query.history(access, "goal.input:failed-new"), []);
    assert.deepEqual(inputs.list("project-a"), [feedReceipt]);
    fail = false;
    inputs.register({ ...feedReceipt, binding_id: "new" });
    assert.equal(inputs.list("project-a").length, 2);
    assert.throws(() => inputs.register({ ...feedReceipt, source_ref: "feed-item:replacement" }), /UNIQUE constraint/);
    assert.equal(ledger.query.get(access, "goal.input:binding-feed")?.target.id, "item-a");
    assert.equal(ledger.query.history(access, "goal.input:binding-feed").length, 1);
    assert.equal(inputs.list("project-a")[0]?.source_ref, "feed-item:item-a");
  } finally { db.close(); }
});
