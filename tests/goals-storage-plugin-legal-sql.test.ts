import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalsModule } from "./fixtures/goals-modules.js";
import { GovernanceCollaborationModule } from "./fixtures/goals-modules.js";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// PG-094 S9-1 (specs/repository-anti-corruption/slices/goals-s9-1-journal-seam.md): what of Goals' and Governance's SQL a plugin's
// statement check would refuse today, and (S11) that it is nothing: the preview's undo is the platform's savepoint, not an `exec`.

const MODULES = ["plugins/native/goals/src/module", "plugins/native/goals/src/governance"];

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
  });
}

function library(): { store: LocalProjectDatabase; dispose(): void } {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-legal-sql-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  new GoalProjectApplication(store).initializeBoard({ project_id: "board-legal", actor_id: "user-1", idempotency_key: "initialize" });
  return { store, dispose: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

function spyJournal(store: LocalProjectDatabase) {
  const calls: string[] = [];
  const journal = {
    eventCursor: (projectId: string) => { calls.push("eventCursor"); return store.eventCursor(projectId); },
    appendEvent: (input: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => { calls.push(`appendEvent:${input.type}`); return store.appendEvent(input); },
    getIdempotency: (...key: Parameters<LocalProjectDatabase["getIdempotency"]>) => { calls.push("getIdempotency"); return store.getIdempotency(...key); },
    putIdempotency: (input: Parameters<LocalProjectDatabase["putIdempotency"]>[0]) => { calls.push("putIdempotency"); store.putIdempotency(input); },
  };
  return { calls, journal };
}

const goal = (goalId: string) => ({
  goal_id: goalId, title: goalId, outcome: `${goalId} 的结果`, why: "验证语句检查", business_logic: "只用 Goals 自己的表。",
  definition_state: "accepted" as const, decomposition_state: "closed_leaf" as const,
  acceptance_criteria: [{ criterion_id: `${goalId}-result`, statement: "结果存在", decision_method: "inspection" as const, pass_condition: "可以检查" }],
});

test("RAC-283 neither module names the project journal's tables, and writes its events and idempotency records through the journal it is given", () => {
  const named = MODULES.flatMap(directory => sources(directory)).filter(path =>
    /\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:events|idempotency_records)\b/iu.test(readFileSync(path, "utf8")));
  assert.deepEqual(named, [], "a statement on events or idempotency_records is the journal's, which a plugin's SQL is refused");

  const { store, dispose } = library();
  try {
    const legal = pluginLegalSql(store);
    const spy = spyJournal(store);
    const goals = new GoalsModule(legal.db, spy.journal, {});
    const context = { actor_id: "user-1", idempotency_key: "create-legal" };
    const first = goals.commands.createGoal("board-legal", goal("goal-legal"), context);
    const replay = goals.commands.createGoal("board-legal", goal("goal-legal"), context);

    assert.equal(replay.goal.goal_id, first.goal.goal_id);
    assert.ok(spy.calls.includes("getIdempotency") && spy.calls.includes("putIdempotency"), "the record is read and kept through the journal");
    assert.ok(spy.calls.some(call => call.startsWith("appendEvent:goal.")), "the event is appended through the journal");
    const created = store.readEventsDescending("board-legal").filter(event => event.object_id === "goal-legal" && event.type === "goal.created");
    assert.equal(created.length, 1, "the replay under the same key appends nothing");
    assert.equal(created[0]?.actor_id, "user-1");
    assert.ok(legal.stats.checked > 0, "the statements ran through the check");
  } finally { dispose(); }
});

test("RAC-284 the statement check the modules run under refuses a statement on the journal's tables, on another's table and a free-form exec", () => {
  const { store, dispose } = library();
  try {
    const { db, stats } = pluginLegalSql(store);
    new GoalsModule(db, store, {}).commands.createGoal("board-legal", goal("goal-kept"), { actor_id: "user-1", idempotency_key: "create-kept" });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM goals WHERE project_id = ?").get("board-legal") as { n: number }).n, 1, "Goals' own table is allowed");
    assert.ok(stats.checked >= 1);
    assert.throws(() => db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ?").get("board-legal"));
    assert.throws(() => db.prepare("INSERT INTO idempotency_records (project_id, actor_id, operation, idempotency_key, request_hash, outcome_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("board-legal", "user-1", "op", "key", "hash", "{}", "2026-10-24T00:00:00.000Z"));
    assert.throws(() => db.prepare("SELECT * FROM inbox_entries").all(), "another owner's table");
    assert.throws(() => db.exec("DELETE FROM goals"), "exec is not a plugin statement");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM goals").get() as { n: number }).n, 1, "the refused exec ran nothing");
  } finally { dispose(); }
});

// RAC-704 (goals-s10-s11-runtime-switch.md §7): the same pin, answered by the platform's savepoint.
test("RAC-285 neither module runs a free-form exec, and the Goal Tree preview undoes its writes through a savepoint, not through SQL it passes", () => {
  const withExec = MODULES.flatMap(directory => sources(directory))
    .filter(path => !path.endsWith("planning/personal-methods.ts"))
    .filter(path => /\.(?:exec|pragma)\(/u.test(readFileSync(path, "utf8")));
  assert.deepEqual(withExec, [], "a plugin has no exec; its undo is the transaction handle's savepoint");

  const { store, dispose } = library();
  try {
    const legal = pluginLegalSql(store);
    const governance = new GovernanceCollaborationModule({ db: legal.governance, journal: store });
    assert.equal(governance.decisions.previewMaterialization(() => "whole"), "whole");
    assert.equal(governance.decisions.previewMaterializationItem(() => ({ keep: false, value: "item" })), "item");
    assert.equal(legal.stats.savepoints, 2, "each preview opened one savepoint");
    assert.throws(() => legal.db.exec("SAVEPOINT free_form"), "Goals' own connection has no exec");
  } finally { dispose(); }
});
