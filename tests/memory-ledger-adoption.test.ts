import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, completeMemoryLedgerAdoption, homeSqlitePath, inspectMemoryLedgerAdoption,
  MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, type MemoryLedgerAdoptionSnapshot } from "@molis-ai/molis-work-storage";
import type { MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";

const full: MemoryPrefs = { enabled: true, task_recall: true, form: true, auto: false, learn_from_work: true, learn_from_ui: false,
  consumers: { assistant: false, agent: true, ui: true, plugin: true, mcp: false }, plugins: { blocked: { allowed: false, kinds: ["preference"] } } };

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-ledger-adoption-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

async function oldLedger(t: TestContext) {
  const home = fixture(t), { mkdirSync } = await import("node:fs");
  mkdirSync(join(home, MEMORY_LEDGER_STORE));
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  db.exec(MEMORY_LEDGER_BASELINE.schema); db.exec("PRAGMA user_version=3");
  const { enabled: _enabled, task_recall: _task, ...old } = full;
  for (const key of ["personal", "project-default", "project:blocked"]) db.prepare("INSERT INTO memory_prefs VALUES (?,?,?)")
    .run("person", key, JSON.stringify(key === "project:blocked" ? { form: false, plugins: full.plugins } : old));
  db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", "strategy-adoption", "2026-10-22T00:00:00Z", JSON.stringify({ origin: "existing-home", retained: "keep" }));
  db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", "other-marker", "before", JSON.stringify({ value: "untouched" }));
  db.prepare("INSERT INTO memory_revisions VALUES (?,?,?)").run("memory-a", 1, JSON.stringify({ text: "history remains" }));
  db.close();
  return home;
}

const profiles = (snapshot: MemoryLedgerAdoptionSnapshot) => snapshot.profiles.map(row => ({ ...row, prefs: { ...full, ...(row.prefs as Partial<MemoryPrefs>) } }));

test("offline adoption persists the startup barrier, resumes after reopen, and atomically preserves every old profile and history", async t => {
  const home = await oldLedger(t);
  const before = inspectMemoryLedgerAdoption({ homeDirectory: home });
  const blocked = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: before });
  assert.equal((blocked.adoptions[0]!.body as { origin: string }).origin, "adopting");
  const resumed = inspectMemoryLedgerAdoption({ homeDirectory: home });
  assert.deepEqual(resumed, blocked);
  assert.deepEqual(beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: resumed }), resumed);
  completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: resumed, profiles: profiles(resumed) });
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE), { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 4);
    const rows = db.prepare("SELECT key,body FROM memory_prefs ORDER BY key").all();
    assert.equal(rows.length, 3);
    assert.equal(JSON.parse(String(rows.find(row => row.key === "project:blocked")!.body)).form, false);
    assert.deepEqual(JSON.parse(String(rows[0]!.body)).plugins, full.plugins);
    const marker = db.prepare("SELECT body FROM memory_markers WHERE key='strategy-adoption'").get()!;
    assert.deepEqual(JSON.parse(String(marker.body)), { origin: "existing-home", retained: "keep" });
    assert.equal(db.prepare("SELECT body FROM memory_revisions").get()!.body, JSON.stringify({ text: "history remains" }));
    assert.equal(db.prepare("SELECT at FROM memory_markers WHERE key='other-marker'").get()!.at, "before");
  } finally { db.close(); }
});

test("stale profiles or markers cannot begin or finish adoption, and failure keeps adopting plus ledger 3", async t => {
  const home = await oldLedger(t), before = inspectMemoryLedgerAdoption({ homeDirectory: home });
  const blocked = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: before });
  assert.throws(() => beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: before }), { code: "memory.adoption_conflict" });
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: blocked, profiles: profiles(blocked).slice(1) }), { code: "memory.adoption_conflict" });
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: home }), blocked);
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  db.prepare("UPDATE memory_prefs SET body=? WHERE key='project:blocked'").run(JSON.stringify({ form: false, auto: false })); db.close();
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: blocked, profiles: profiles(blocked) }), { code: "memory.adoption_conflict" });
  assert.equal((inspectMemoryLedgerAdoption({ homeDirectory: home }).adoptions[0]!.body as { origin: string }).origin, "adopting");
});

test("inspection never creates missing storage and completion cannot bypass the persisted startup barrier", async t => {
  const empty = fixture(t);
  assert.throws(() => inspectMemoryLedgerAdoption({ homeDirectory: empty }));
  assert.equal(existsSync(homeSqlitePath(empty, MEMORY_LEDGER_STORE)), false);
  const home = await oldLedger(t), before = inspectMemoryLedgerAdoption({ homeDirectory: home });
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: before, profiles: profiles(before) }), { code: "memory.adoption_conflict" });
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: home }), before);
});

test("adoption rejects malformed complete profiles and an owner set changed after SDK planning", async t => {
  const home = await oldLedger(t), before = inspectMemoryLedgerAdoption({ homeDirectory: home });
  const blocked = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: before });
  const invalid = profiles(blocked).map(row => ({ ...row, prefs: { ...row.prefs, task_recall: "yes" } }));
  // @ts-expect-error The maintenance boundary must reject a malformed external profile at runtime.
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: blocked, profiles: invalid }), { code: "memory.adoption_conflict" });
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: home }), blocked);
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  db.prepare("INSERT INTO memory_owners (scope, owner, project_id, title, subject) VALUES (?,?,?,?,?)")
    .run("character", "character-new", "project-new", "New character", "character-new");
  db.close();
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: blocked, profiles: profiles(blocked) }), { code: "memory.adoption_conflict" });
  const current = inspectMemoryLedgerAdoption({ homeDirectory: home });
  assert.deepEqual(current.owners, [{ scope: "character", owner: "character-new", project_id: "project-new" }]);
  assert.equal(current.version, 3);
});
