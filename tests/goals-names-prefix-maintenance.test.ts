import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { GoalProjectApplication, LocalProjectDatabase, goalsJournal } from "@molis-ai/molis-work-app-local-host";
import { GOALS_JOURNAL_NAMESPACE as NS, type GoalInputBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { GoalsModule } from "@molis-ai/molis-work-module-goals";
import { listGoalsNames, rewriteGoalsNames } from "../scripts/maintenance/goals-namespace-prefix.mjs";
import { UNPREFIX_GOALS_NAMES_SQL } from "./fixtures/goals-names-aged.js";

// PG-094 S9-2 (specs/repository-anti-corruption/slices/goals-s9-2-namespace.md): the maintenance that gives the names Goals wrote
// before the namespace their prefix. Run only on a library made here, in a directory made here; it is never pointed at a real Home.

const SCRIPT = new URL("../scripts/maintenance/goals-namespace-prefix.mjs", import.meta.url).pathname;
const PROJECT = "board-names";
const access = { actor_id: "user-1", scope: { kind: "personal" as const, id: PROJECT } };

/** The events a Goals build writes that the scenario below does not reach, as the current build names them. */
const SYNTHETIC: Array<[type: string, objectType: string]> = [
  ["goal.updated", "goal"], ["goal.accepted", "goal"], ["goal.trashed", "goal"], ["goal.restored_from_trash", "goal"],
  ["goal.event_config.updated", "goal_event_config"], ["goal.work_event.recorded", "goal_work_event"],
  ["goal.event_state.closure_submitted", "goal"], ["relation.deactivated", "relation"], ["board.active_goal_changed", "board"],
  ["planning.method_saved", "planning_method"], ["policy.project_defaults_saved", "policy_binding"],
  ["project.guidance_added", "project_guidance"], ["goal_tree_proposal.decided", "goal_tree_proposal"],
  ["goal_tree_proposal.item_accepted", "goal_tree_proposal_item"],
];

interface Library { path: string; directory: string; dispose(): void }

/** A library as the current build leaves it: a board, goals, a relation, guidance, a feed input, deliverable edges and the rows above. */
function library(): Library {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-names-"));
  const path = join(directory, "molis-work.sqlite");
  const store = new LocalProjectDatabase(path);
  try {
    new GoalProjectApplication(store).initializeBoard({ project_id: PROJECT, actor_id: "user-1", idempotency_key: "initialize" });
    const goals = new GoalsModule(store.db, goalsJournal(store), {});
    const goal = (goalId: string) => ({
      goal_id: goalId, title: goalId, outcome: `${goalId} 的结果`, why: "演练维护", business_logic: "只在一次性目录里。",
      definition_state: "accepted" as const, decomposition_state: "closed_leaf" as const,
      acceptance_criteria: [{ criterion_id: `${goalId}-result`, statement: "结果存在", decision_method: "inspection" as const, pass_condition: "可以检查" }],
    });
    goals.commands.createGoal(PROJECT, goal("goal-a"), { actor_id: "user-1", idempotency_key: "create-a" });
    goals.commands.createGoal(PROJECT, goal("goal-b"), { actor_id: "user-1", idempotency_key: "create-b" });
    goals.commands.addRelation(PROJECT, { from_goal_id: "goal-b", to_goal_id: "goal-a", type: "part_of", reason: "演练" }, { actor_id: "user-1", idempotency_key: "relate" });
    goals.commands.addProjectGuidance({ project_id: PROJECT, actor_id: "user-1", kind: "quality_bar", content: "演练", reason: "演练", confirmation_summary: "确认", user_confirmed: true, idempotency_key: "guidance" });

    const ledger = createContextLedger(store.db, { authorize: () => true });
    const binding: GoalInputBindingRecord = { binding_id: "binding-feed", project_id: PROJECT, goal_id: "goal-a", input_name: "Inbox input",
      source_type: "feed_item", source_ref: "feed-item:item-a", snapshot_digest: "digest", state: "confirmed", reason: "确认", created_by: "user-1", created_at: "2026-10-24T00:00:00Z" };
    new GoalProjectApplication(store).goalInputs.register(binding);
    const edge = { type: "goal.output", source: { module: "goals", id: "goal-a", version: null, scope: access.scope },
      target: { module: "artifacts", id: "artifact-a", version: 1, scope: access.scope }, cause: "goals.deliverable" };
    ledger.commands.put(access, { ...edge, key: `${NS}goal.output:goal-a:artifact-a`, recorded_at: "2026-10-24T00:01:00Z" });
    ledger.commands.remove(access, `${NS}goal.output:goal-a:artifact-a`, "goal.output_removed", "2026-10-24T00:02:00Z");
    ledger.commands.put(access, { ...edge, type: "goal.input.proposal", key: `${NS}goal.input.proposal:goal-a:artifact-b`, recorded_at: "2026-10-24T00:03:00Z" });
    // Edges that are not Goals': another owner's key and type stay as they are.
    ledger.commands.put(access, { type: "artifact.link", key: "artifact-link:one", source: edge.source, target: edge.target, cause: "artifacts", recorded_at: "2026-10-24T00:04:00Z" });

    SYNTHETIC.forEach(([type, objectType], index) => store.appendEvent({
      eventId: `event-synthetic-${index}`, projectId: PROJECT, actorId: "user-1", type: NS + type, objectType: NS + objectType,
      objectId: `object-${index}`, reason: "演练", payload: { index }, at: "2026-10-24T00:05:00Z" }));
    // Not Goals': the attention module's and the home's events and another owner's idempotency record keep their names.
    store.appendEvent({ eventId: "event-inbox", projectId: PROJECT, actorId: "user-1", type: "inbox_entry.created", objectType: "inbox_entry", objectId: "entry-1", reason: "x", payload: {}, at: "2026-10-24T00:06:00Z" });
    store.appendEvent({ eventId: "event-judgment", projectId: PROJECT, actorId: "user-1", type: "judgment_completed", objectType: "judgment", objectId: "j-1", reason: "x", payload: {}, at: "2026-10-24T00:07:00Z" });
    store.putIdempotency({ projectId: PROJECT, actorId: "user-1", operation: `${NS}decide_goal_tree_proposal`, key: "tree-1", requestHash: "h", outcome: { ok: true }, at: "2026-10-24T00:08:00Z" });
  } finally { store.close(); }
  return { path, directory, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

/** The library as a build before the namespace left it: every name Goals wrote, without the prefix, and Goals' store at version 1. */
function age(path: string): void {
  const db = new Database(path);
  try { db.exec(UNPREFIX_GOALS_NAMES_SQL); } finally { db.close(); }
}

/** Every row of the four tables the maintenance touches, names included. */
function content(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    return createHash("sha256").update(JSON.stringify(["events ORDER BY seq", "idempotency_records ORDER BY project_id, actor_id, operation, idempotency_key",
      "context_edges ORDER BY scope_id, edge_key, revision", "input_bindings ORDER BY binding_id"].map(table => db.prepare(`SELECT * FROM ${table}`).all()))).digest("hex");
  } finally { db.close(); }
}

const bytes = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
const open = (path: string) => new Database(path);
const cli = (mode: string, path: string) => spawnSync(process.execPath, [SCRIPT, mode, path], { encoding: "utf8" });

test("RAC-287 list reads only: it says what a rewrite renames, row counts by old name, and writes nothing", () => {
  const fresh = library(); const aged = library();
  try {
    age(aged.path);
    const before = bytes(aged.path);
    const db = new Database(aged.path, { readonly: true });
    const report = (() => { try { return listGoalsNames(db); } finally { db.close(); } })();
    assert.deepEqual(report.conflicts, []);
    assert.ok(report.events.some((entry: { from: string }) => entry.from === "goal.created / goal"), "the events the modules wrote");
    assert.ok(SYNTHETIC.every(([type, objectType]) => report.events.some((entry: { from: string }) => entry.from === `${type} / ${objectType}`)), "every family");
    assert.ok(report.idempotency_records.some((entry: { from: string }) => entry.from === "create_goal"));
    assert.equal(report.context_edges, 3, "the three Goals keys; the other owner's edge is not one of them");
    assert.equal(report.input_bindings, 1);
    assert.deepEqual(report.outside.map((entry: { name: string }) => entry.name).sort(),
      ["context_edges artifact-link", "events inbox_entry.created / inbox_entry", "events judgment_completed / judgment"]);
    assert.equal(bytes(aged.path), before, "the library file is the same bytes");

    const clean = new Database(fresh.path, { readonly: true });
    try { const none = listGoalsNames(clean); assert.deepEqual([none.events, none.idempotency_records, none.context_edges, none.input_bindings, none.conflicts], [[], [], 0, 0, []]); }
    finally { clean.close(); }
  } finally { fresh.dispose(); aged.dispose(); }
});

test("RAC-293 the two shapes the real Home's libraries showed: an old Goals contract event is renamed with the rest, and Feed's event on a board object keeps its name", () => {
  const aged = library();
  try {
    age(aged.path);
    const db = open(aged.path);
    try {
      const insert = db.prepare("INSERT INTO events (event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at) VALUES (?, ?, 'user-1', ?, ?, ?, 'x', '{}', '2026-10-24T00:09:00Z')");
      insert.run("event-contract-old", PROJECT, "contract.downstream_revalidation_required", "goal", "goal-a");
      insert.run("event-feed-board", PROJECT, "feed.relay_ownership_migrated", "board", PROJECT);
    } finally { db.close(); }
    const run = cli("rewrite", aged.path);
    assert.equal(run.status, 0, run.stderr);
    const after = open(aged.path);
    try {
      const row = (id: string) => after.prepare("SELECT type, object_type FROM events WHERE event_id = ?").get(id) as { type: string; object_type: string };
      assert.deepEqual(row("event-contract-old"), { type: `${NS}contract.downstream_revalidation_required`, object_type: `${NS}goal` });
      assert.deepEqual(row("event-feed-board"), { type: "feed.relay_ownership_migrated", object_type: "board" });
    } finally { after.close(); }
  } finally { aged.dispose(); }
});

test("RAC-288 rewrite gives an aged library exactly the rows the current build writes, in one transaction, and a second run writes nothing", () => {
  const fresh = library(); const aged = library();
  try {
    age(aged.path);
    assert.notEqual(content(aged.path), content(fresh.path), "the aged library does differ");
    const result = cli("rewrite", aged.path);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /backup: /u);
    // Fresh and aged were made apart: compare what is the same by construction (everything but the ids the clock and uuid give).
    const names = (path: string) => { const db = open(path); try { return {
      events: db.prepare("SELECT type, object_type FROM events ORDER BY seq").all(),
      records: db.prepare("SELECT operation FROM idempotency_records ORDER BY operation, idempotency_key").all(),
      edges: db.prepare("SELECT edge_key, relation_type, revision, state FROM context_edges ORDER BY edge_key, revision").all(),
      sources: db.prepare("SELECT source_edge_key FROM input_bindings").all() }; } finally { db.close(); } };
    assert.deepEqual(names(aged.path), names(fresh.path));

    const after = bytes(aged.path); const rows = content(aged.path);
    const again = cli("rewrite", aged.path);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /nothing to rename/u);
    assert.equal(content(aged.path), rows, "no row changed");
    assert.equal(readdirSync(aged.directory).filter(name => name.includes("before-goals-namespace")).length, 1, "the second run made no backup");
    assert.equal(bytes(aged.path).length === after.length, true);

    const backup = join(aged.directory, readdirSync(aged.directory).find(name => name.includes("before-goals-namespace"))!);
    const old = new Database(backup, { readonly: true });
    try { assert.ok((old.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'goal.created'").get() as { n: number }).n > 0, "the backup has the names as they were"); }
    finally { old.close(); }
  } finally { fresh.dispose(); aged.dispose(); }
});

test("RAC-289 the renamed library opens under the current build and works: history is read, the feed input resolves, new writes land under the prefix", () => {
  const aged = library();
  try {
    age(aged.path);
    assert.equal(cli("rewrite", aged.path).status, 0);
    const store = new LocalProjectDatabase(aged.path);
    try {
      const app = new GoalProjectApplication(store);
      assert.equal(app.goalInputs.list(PROJECT)[0]?.source_ref, "feed-item:item-a", "the input's source edge is found under its new key");
      assert.ok(app.goalQueries.getGoal(PROJECT, "goal-a"));
      const goals = new GoalsModule(store.db, goalsJournal(store), {});
      const replay = goals.commands.createGoal(PROJECT, { goal_id: "goal-a", title: "goal-a", outcome: "goal-a 的结果", why: "演练维护", business_logic: "只在一次性目录里。",
        definition_state: "accepted", decomposition_state: "closed_leaf",
        acceptance_criteria: [{ criterion_id: "goal-a-result", statement: "结果存在", decision_method: "inspection", pass_condition: "可以检查" }] }, { actor_id: "user-1", idempotency_key: "create-a" });
      assert.equal(replay.replayed, true, "the record written before the rename is found under its new operation name");
      goals.commands.createGoal(PROJECT, { goal_id: "goal-c", title: "c", outcome: "c", why: "w", business_logic: "b", definition_state: "accepted", decomposition_state: "closed_leaf",
        acceptance_criteria: [{ criterion_id: "c-result", statement: "s", decision_method: "inspection", pass_condition: "p" }] }, { actor_id: "user-1", idempotency_key: "create-c" });
      const last = store.readEventsDescending(PROJECT)[0]!;
      assert.equal(last.type, `${NS}goal.created`);
    } finally { store.close(); }
  } finally { aged.dispose(); }
});

test("RAC-290 a conflict stops everything: nothing is written, the file keeps its bytes, and the exit code says so", () => {
  const cases: Array<[string, (db: Database.Database) => void, RegExp]> = [
    ["the new name already exists", db => db.prepare("INSERT INTO idempotency_records SELECT project_id, actor_id, ?, idempotency_key, request_hash, outcome_json, created_at FROM idempotency_records WHERE operation = 'create_goal' LIMIT 1").run(`${NS}create_goal`), /new name already exists/u],
    ["a Goals object with a type nobody listed", db => db.prepare("INSERT INTO events (event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at) VALUES ('e-x', ?, 'u', 'mystery.thing', 'goal', 'g', 'r', '{}', 't')").run(PROJECT), /mystery\.thing/u],
    ["a type and an object type that are not both renamed", db => db.prepare("UPDATE events SET object_type = ? WHERE type = 'goal.created' AND object_id = 'goal-a'").run(`${NS}goal`), /not both/u],
    ["some revisions of an edge renamed and some not", db => db.prepare("UPDATE context_edges SET edge_key = ? WHERE edge_key = 'goal.output:goal-a:artifact-a' AND revision = 1").run(`${NS}goal.output:goal-a:artifact-a`), /some revisions/u],
    ["an old name in a column nobody renames", db => db.prepare("UPDATE goals SET why = 'goal.input:binding-feed' WHERE goal_id = 'goal-b'").run(), /does not rename/u],
  ];
  for (const [name, spoil, pattern] of cases) {
    const aged = library();
    try {
      age(aged.path);
      const db = open(aged.path); try { spoil(db); } finally { db.close(); }
      const before = bytes(aged.path);
      const listed = cli("list", aged.path);
      assert.equal(listed.status, 1, `${name}: list`);
      assert.match(listed.stdout, pattern, name);
      const result = cli("rewrite", aged.path);
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, pattern, name);
      assert.equal(bytes(aged.path), before, `${name}: the file is untouched`);
      assert.equal(readdirSync(aged.directory).filter(file => file.includes("before-goals-namespace")).length, 0, `${name}: no backup was needed`);
    } finally { aged.dispose(); }
  }
});

test("RAC-291 a fault after the n-th update rolls everything back, for every n; a busy library is refused, not waited for", () => {
  const aged = library();
  try {
    age(aged.path);
    const original = join(aged.directory, "original.sqlite");
    copyFileSync(aged.path, original);
    const total = (() => { const db = new Database(original, { readonly: true }); try {
      const r = listGoalsNames(db); return r.events.reduce((n: number, e: { rows: number }) => n + e.rows, 0) + r.idempotency_records.reduce((n: number, e: { rows: number }) => n + e.rows, 0) + r.context_edges + r.input_bindings; } finally { db.close(); } })();
    assert.ok(total > 20);
    const rowsBefore = content(original);
    for (const n of [1, 2, Math.floor(total / 2), total - 1, total]) {
      const db = new Database(original);
      try {
        assert.throws(() => rewriteGoalsNames(db, { afterUpdate: (done: number) => { if (done === n) throw new Error(`fault after ${n}`); } }), new RegExp(`fault after ${n}`, "u"));
        assert.equal(db.inTransaction, false);
      } finally { db.close(); }
      assert.equal(content(original), rowsBefore, `after a fault at ${n} the rows are as they were`);
    }
    const holder = open(original);
    try {
      holder.exec("BEGIN IMMEDIATE");
      const busy = cli("rewrite", original);
      assert.equal(busy.status, 2, busy.stderr);
    } finally { holder.exec("ROLLBACK"); holder.close(); }
    assert.equal(content(original), rowsBefore);
  } finally { aged.dispose(); }
});
