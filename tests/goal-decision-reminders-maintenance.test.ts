import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { GoalProjectApplication } from "./fixtures/goal-application.js";
import { maintainGoalDecisionReminders } from "./fixtures/goal-decision-reminders-maintenance.mjs";
import { maintainProject } from "./fixtures/project-maintenance.mjs";

function seeded(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "goal-reminder-apply-")), file = join(home, "project.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new LocalProjectDatabase(file), app = new GoalProjectApplication(store);
  const attention = new AttentionModule(store.db, { exists: () => true }, { eventSink: () => undefined });
  app.initializeBoard({ project_id: "project", actor_id: "owner", idempotency_key: "init" });
  for (const id of ["pending", "assign", "settled"]) {
    app.goalEvents.createIntent({ project_id: "project", goal_id: id, title: "private title", outcome: "private outcome", actor_id: "owner", actor_kind: "user", idempotency_key: id, source_kind: "web" });
    if (id !== "settled") app.goalTreeSubmission.submitGoalTreeProposal({ project_id: "project", root_goal_id: id, actor_id: "runtime:test:session", summary: "private proposal", idempotency_key: id,
      items: [{ item_id: "item-" + id, kind: "goal", operation: "create", payload: { goal_id: "child-" + id, title: "private child", outcome: "private outcome" }, source_refs: ["runtime"], reason: "private reason", confidence: 1 }] });
  }
  // Keep one already-owned entry and one legacy-only entry; both were dismissed by the person.
  const owned = attention.query.findForSubject("project", "goal_decision", "pending", GOALS_PLUGIN_ID)[0]!;
  attention.commands.setStatus("project", owned.entry_id, "dismissed", owned.revision);
  const assign = attention.query.findForSubject("project", "goal_decision", "assign", GOALS_PLUGIN_ID)[0]!;
  attention.commands.setStatus("project", assign.entry_id, "dismissed", assign.revision);
  store.db.prepare("UPDATE inbox_entries SET owner_plugin_id=NULL WHERE entry_id=?").run(assign.entry_id);
  store.db.prepare("UPDATE attention_events SET owner_plugin_id=NULL WHERE entry_id=?").run(assign.entry_id);
  const duplicate = attention.commands.create({ project_id: "project", entry_id: "duplicate", subject_type: "goal_decision", subject_id: "pending", reason: "goal_decision" }).entry;
  const settled = attention.commands.create({ project_id: "project", entry_id: "settled", subject_type: "goal_decision", subject_id: "settled", reason: "goal_decision" }).entry;
  store.close();
  return { home, file, owned: owned.entry_id, assign: assign.entry_id, duplicate: duplicate.entry_id, settled: settled.entry_id };
}
function snapshot(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = (sql: string) => db.prepare(sql).all().map(row => ({ ...row }));
    return { version: db.prepare("PRAGMA user_version").get()!.user_version, schema: describeSqliteSchema(db),
      entries: rows("SELECT * FROM inbox_entries ORDER BY entry_id"), events: rows("SELECT * FROM attention_events ORDER BY event_id"),
      journal: rows("SELECT * FROM events ORDER BY seq"), proposals: rows("SELECT * FROM goal_tree_proposals ORDER BY proposal_id") };
  } finally { db.close(); }
}

test("RAC-2333 reminder preflight classifies real pending decisions, duplicates, settled and unknown Goals without reading or changing their text", t => {
  const home = mkdtempSync(join(tmpdir(), "goal-reminder-preflight-")), file = join(home, "project.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new LocalProjectDatabase(file), app = new GoalProjectApplication(store);
  // The old orphan is intentional; current subject validation would refuse creating that historical row.
  const attention = new AttentionModule(store.db, { exists: () => true }, { eventSink: () => undefined });
  app.initializeBoard({ project_id: "project", actor_id: "owner", idempotency_key: "init" });
  for (const id of ["pending", "settled"]) app.goalEvents.createIntent({ project_id: "project", goal_id: id, title: "private title must not be returned", outcome: "private outcome", actor_id: "owner", actor_kind: "user", idempotency_key: id, source_kind: "web" });
  app.goalTreeSubmission.submitGoalTreeProposal({ project_id: "project", root_goal_id: "pending", actor_id: "runtime:test:session", summary: "private proposal text", idempotency_key: "proposal",
    items: [{ item_id: "item", kind: "goal", operation: "create", payload: { goal_id: "child", title: "private child", outcome: "private child outcome" }, source_refs: ["runtime"], reason: "private reason", confidence: 1 }] });
  for (const id of ["pending", "settled", "unknown"]) attention.commands.create({ project_id: "project", subject_type: "goal_decision", subject_id: id, reason: "goal_decision" });
  store.close(); const before = readFileSync(file), result = maintainGoalDecisionReminders(file);
  const { proposed, pre_v11_owned_entries_blocking, changed, ...classification } = result;
  assert.deepEqual(classification, { version: 11, unowned: 3, already_owned: 1, assign: 0, duplicate: 1, settled: 1, unknown_subject: 1, unexpected_reason: 0, dismissed_pending: 0 });
  assert.equal(proposed.entries_deleted, 2); assert.equal(proposed.entries_assigned, 0); assert.equal(pre_v11_owned_entries_blocking, 0); assert.equal(changed, false);
  assert.deepEqual(readFileSync(file), before); assert.doesNotMatch(JSON.stringify(result), /private|runtime:test|child|proposal text/u);
});

test("RAC-2335 v11 cleanup retains dismissed current entries, assigns legacy pending decisions and preserves every event and journal row", t => {
  const f = seeded(t), before = snapshot(f.file), report = maintainGoalDecisionReminders(f.file, true), after = snapshot(f.file);
  assert.deepEqual(report.proposed, { entries_deleted: 2, entries_assigned: 1, event_owner_updates: 4, pending_owner_deferred_to_v11: 0 });
  assert.equal(report.dismissed_pending, 1); assert.equal(report.changed, true);
  assert.deepEqual(after.entries, before.entries.filter(row => row.entry_id !== f.duplicate && row.entry_id !== f.settled)
    .map(row => row.entry_id === f.assign ? { ...row, owner_plugin_id: GOALS_PLUGIN_ID } : row));
  assert.deepEqual(after.events, before.events.map(row => row.owner_plugin_id === null ? { ...row, owner_plugin_id: GOALS_PLUGIN_ID } : row));
  assert.deepEqual(after.journal, before.journal); assert.deepEqual(after.proposals, before.proposals); assert.deepEqual(after.schema, before.schema);
  assert.equal(after.version, 11); assert.equal(maintainGoalDecisionReminders(f.file, true).changed, false);
  const db = new DatabaseSync(f.file, { readOnly: true });
  try { assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok"); assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []); } finally { db.close(); }
});

test("RAC-2335 v10 cleanup defers pending owners to the unchanged v11 maintenance guard and preserves full production schema and history", t => {
  const f = seeded(t), fresh = snapshot(f.file), db = new DatabaseSync(f.file);
  try {
    db.prepare("DELETE FROM inbox_entries WHERE entry_id=?").run(f.duplicate);
    db.exec("UPDATE inbox_entries SET owner_plugin_id=NULL; UPDATE attention_events SET owner_plugin_id=NULL; DROP TABLE plugin_notifications; PRAGMA user_version=10");
    db.prepare("UPDATE plugin_project_databases SET version=1,tables_json=? WHERE plugin_id='io.molis.work.feed'").run('["feed_out_rules","feed_out_rules_project_enabled_idx"]');
  } finally { db.close(); }
  const before = snapshot(f.file), report = maintainGoalDecisionReminders(f.file, true);
  assert.deepEqual(report.proposed, { entries_deleted: 1, entries_assigned: 0, event_owner_updates: 0, pending_owner_deferred_to_v11: 2 });
  assert.ok(snapshot(f.file).entries.every(row => row.owner_plugin_id === null));
  assert.deepEqual(snapshot(f.file).events, before.events);
  maintainProject(f.file, 11, true);
  const after = snapshot(f.file);
  assert.deepEqual(after.schema, fresh.schema); assert.equal(after.version, 11);
  assert.deepEqual(after.entries, before.entries.filter(row => row.entry_id !== f.settled).map(row => ({ ...row, owner_plugin_id: GOALS_PLUGIN_ID })));
  assert.deepEqual(after.events, before.events.map(row => ({ ...row, owner_plugin_id: GOALS_PLUGIN_ID })));
  assert.deepEqual(after.journal, before.journal); assert.deepEqual(after.proposals, before.proposals);
});

test("RAC-2335 unknown subjects, unexpected reasons, wrong versions/shapes and pre-v11 owned entries refuse without changing source bytes", t => {
  for (const kind of ["unknown", "reason", "version", "shape", "v10-owner"] as const) {
    const f = seeded(t), db = new DatabaseSync(f.file);
    try {
      if (kind === "unknown") db.prepare("UPDATE inbox_entries SET subject_id='missing' WHERE entry_id=?").run(f.assign);
      if (kind === "reason") db.prepare("UPDATE inbox_entries SET reason='manual' WHERE entry_id=?").run(f.assign);
      if (kind === "version") db.exec("PRAGMA user_version=12");
      if (kind === "shape") db.exec("CREATE TABLE unexpected(value TEXT)");
      if (kind === "v10-owner") db.exec("DROP TABLE plugin_notifications; PRAGMA user_version=10");
    } finally { db.close(); }
    const before = readFileSync(f.file);
    assert.throws(() => maintainGoalDecisionReminders(f.file, true), /unrecognized|version|structure|already has owned/u, kind);
    assert.deepEqual(readFileSync(f.file), before, kind);
  }
});

test("RAC-2335 a fault after reminder deletes/assignments rolls back every row and preserves the original version and bytes", t => {
  const f = seeded(t), before = readFileSync(f.file), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) {
    if (String(sql).startsWith("UPDATE attention_events")) throw new Error("injected event-owner write failure");
    return prepare.call(this, sql);
  };
  try { assert.throws(() => maintainGoalDecisionReminders(f.file, true), /injected event-owner write failure/u); }
  finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(readFileSync(f.file), before); assert.equal(maintainGoalDecisionReminders(f.file, true).changed, true);
});
