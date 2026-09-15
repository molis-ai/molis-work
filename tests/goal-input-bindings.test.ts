import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOAL_INPUT_BINDINGS_SCHEMA_SQL, GoalInputBindings } from "@molis-ai/molis-work-module-goals";
import type { GoalInputBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";

test("Goal input receipts retain opaque locators and snapshots, isolate Projects, and share rollback", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE boards (board_id TEXT PRIMARY KEY);
    CREATE TABLE goals (goal_id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(board_id));
    INSERT INTO boards VALUES ('project-a'), ('project-b');
    INSERT INTO goals VALUES ('goal-a', 'project-a');
    ${GOAL_INPUT_BINDINGS_SCHEMA_SQL}`);
  try {
    const inputs = new GoalInputBindings(db, createContextLedger(db, { authorize: () => true }));
    const record: GoalInputBindingRecord = { binding_id: "binding-a", board_id: "project-a", goal_id: "goal-a",
      input_name: "Product requirements", source_type: "url", source_ref: "https://example.com/requirements",
      snapshot_digest: "sha256:existing-snapshot", state: "confirmed", reason: "User chose this source",
      created_by: "user-a", created_at: "2026-09-05T00:00:00Z" };
    inputs.register(record);
    assert.deepEqual(inputs.list("project-a"), [record]);
    assert.deepEqual(inputs.list("project-b"), []);
    assert.throws(() => inputs.register({ ...record, binding_id: "wrong-project", board_id: "project-b" }), /不属于这个 Project/);
    assert.deepEqual(inputs.list("project-a"), [record]);
    assert.deepEqual(inputs.list("project-b"), []);
    assert.throws(() => db.transaction(() => {
      db.prepare("INSERT INTO goals VALUES ('goal-new', 'project-a')").run();
      inputs.register({ ...record, binding_id: "rolled-back", goal_id: "goal-new" });
      throw new Error("later action failed");
    }).immediate(), /later action failed/);
    assert.equal(db.prepare("SELECT goal_id FROM goals WHERE goal_id = 'goal-new'").get(), undefined);
    assert.deepEqual(inputs.list("project-a"), [record]);
  } finally { db.close(); }
});

const oldSchema = `CREATE TABLE input_bindings (
  binding_id TEXT PRIMARY KEY, board_id TEXT NOT NULL, goal_id TEXT NOT NULL,
  input_name TEXT NOT NULL, source_type TEXT NOT NULL, source_ref TEXT NOT NULL,
  snapshot_digest TEXT, state TEXT NOT NULL, reason TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);`;
const feedReceipt: GoalInputBindingRecord = {
  binding_id: "binding-feed", board_id: "project-a", goal_id: "goal-a", input_name: "Inbox input",
  source_type: "feed_item", source_ref: "feed-item:item-a", snapshot_digest: "old-confirmed-snapshot",
  state: "confirmed", reason: "Confirmed by user", created_by: "original-user", created_at: "2026-09-01T10:00:00Z",
};

function seedLegacy(db: Database.Database): void {
  db.exec(`CREATE TABLE goals (goal_id TEXT PRIMARY KEY, board_id TEXT);
    INSERT INTO goals VALUES ('goal-a', 'project-a'); ${oldSchema}`);
  db.prepare("INSERT INTO input_bindings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(feedReceipt.binding_id, feedReceipt.board_id, feedReceipt.goal_id, feedReceipt.input_name,
      feedReceipt.source_type, feedReceipt.source_ref, feedReceipt.snapshot_digest, feedReceipt.state,
      feedReceipt.reason, feedReceipt.created_by, feedReceipt.created_at);
}

test("Feed input provenance migrates losslessly and survives reopen independently of current Feed links", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-input-ledger-"));
  const path = join(directory, "test.db");
  let db = new Database(path);
  try {
    seedLegacy(db);
    let ledger = createContextLedger(db, { authorize: () => true });
    let inputs = new GoalInputBindings(db, ledger);
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
    assert.throws(() => inputs.list("project-a"), { code: "goal.input_source_missing" });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Source migration and registration roll back ledger writes and receipt changes on failure", () => {
  const db = new Database(":memory:");
  try {
    seedLegacy(db);
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
    assert.throws(() => new GoalInputBindings(db, failingLedger), /source write failed/);
    assert.equal((db.prepare("SELECT source_ref FROM input_bindings").get() as { source_ref: string }).source_ref, "feed-item:item-a");
    assert.equal((db.prepare("PRAGMA table_info(input_bindings)").all() as Array<{ name: string }>)
      .some((column) => column.name === "source_edge_key"), false);
    assert.deepEqual(ledger.query.list(access), []);
    fail = false;
    const inputs = new GoalInputBindings(db, failingLedger);
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
