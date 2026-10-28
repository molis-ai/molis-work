import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, completeMemoryLedgerAdoption, homeSqlitePath, inspectMemoryLedgerAdoption,
  inspectMemoryLedgerCleanupSources, beginMemoryLedgerCleanup, readMemoryLedgerCleanupDecision, suppressMemoryLedgerCleanupSources, completeMemoryLedgerCleanupTarget, type MemoryLedgerCleanupTarget,
  MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, readMemoryLedgerProfiles, type MemoryLedgerAdoptionSnapshot } from "@molis-ai/molis-work-storage";
import type { MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";

const full: MemoryPrefs = { enabled: true, task_recall: true, form: true, auto: false, learn_from_work: true, learn_from_ui: false,
  consumers: { assistant: false, agent: true, ui: true, plugin: true, mcp: false }, plugins: { blocked: { allowed: false, kinds: ["preference"] } }, class_restrictions: [] };

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
  const { enabled: _enabled, task_recall: _task, class_restrictions: _restrictions, ...old } = full;
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

test("startup profile inspection is read-only, includes every actor and key, and refuses noncurrent ledger versions", async t => {
  const empty = fixture(t);
  assert.throws(() => readMemoryLedgerProfiles({ homeDirectory: empty }));
  assert.equal(existsSync(homeSqlitePath(empty, MEMORY_LEDGER_STORE)), false);
  const home = await oldLedger(t), path = homeSqlitePath(home, MEMORY_LEDGER_STORE), oldBytes = readFileSync(path);
  assert.throws(() => readMemoryLedgerProfiles({ homeDirectory: home }), { code: "storage.schema_version_mismatch" });
  assert.deepEqual(readFileSync(path), oldBytes);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=4");
  db.prepare("INSERT INTO memory_prefs VALUES (?,?,?)").run("another-person", "personal", JSON.stringify(full));
  db.close();
  const before = readFileSync(path), snapshot = inspectMemoryLedgerAdoption({ homeDirectory: home });
  assert.equal(snapshot.version, 4);
  assert.deepEqual(readMemoryLedgerProfiles({ homeDirectory: home }), snapshot.profiles);
  assert.equal(snapshot.profiles.length, 4);
  assert.deepEqual(readFileSync(path), before);
});

test("completion rejects eight-field results without clearing existing nine-field rules", async t => {
  const home = await oldLedger(t), snapshot = inspectMemoryLedgerAdoption({ homeDirectory: home });
  const blocked = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot });
  const incomplete = profiles(blocked).map(row => {
    const { class_restrictions: _restrictions, ...eight } = row.prefs;
    return { ...row, prefs: eight };
  });
  // @ts-expect-error Old profile shapes are only input to offline mapping, never a valid completed result.
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: home, snapshot: blocked, profiles: incomplete }), { code: "memory.adoption_conflict" });
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: home }), blocked);
});

const cleanupFormal: Omit<MemoryLedgerCleanupTarget, "sources"> = {
  ref: { kind: "memory", id: "memory-a", revision: 1 }, expectedVersion: 2,
  identity: { scope: "user", owner: "person" }, sessionRef: { kind: "session", id: "missing", revision: 1 }, state: "active", reason: "session-missing",
};
function cleanupState(home: string) {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try { return Object.fromEntries(["memory_revisions", "memory_candidates", "memory_changes", "memory_pairs", "memory_uses", "memory_markers"]
    .map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()])); }
  finally { db.close(); }
}
function seedCleanupCopies(home: string) {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try {
    db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", "memory-source-links:memory-a", "before", JSON.stringify({ sources: [{ event_id: "source-a", version: "1" }] }));
    db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", "memory-operation:promotion:promotion-journal", "before", JSON.stringify({
      kind: "promotion", scope: "personal", owner: "person", memory_id: "memory-a", candidate: { candidate_id: "candidate-a" }, sources: [{ event_id: "source-b", version: "2" }], phase: "committed",
    }));
    db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?)").run("candidate-a", "person", "accepted", JSON.stringify({
      candidate_id: "candidate-a", actor_id: "person", scope: "personal", owner: "person", memory_id: "memory-a", text: "candidate body", why: "candidate evidence", source_refs: [{ event_id: "source-c", version: "3" }],
    }));
    db.prepare("INSERT INTO memory_changes VALUES (?,?,?,?,?)").run("change-a", "person", "memory-a", "before", JSON.stringify({ text: "change body", reason: "change reason", undoable: true, undo: { action: "recreate", text: "undo body" } }));
    db.prepare("INSERT INTO memory_pairs VALUES (?,?,?,?)").run("pair-a", "person", "open", JSON.stringify({ a: { memory_id: "memory-a" }, b: { memory_id: "keep" } }));
    db.prepare("INSERT INTO memory_uses VALUES (?,?,?,?,?,?)").run("memory-a", "receipt-a", "before", null, "response-observed", JSON.stringify({ text: "use copy" }));
  } finally { db.close(); }
}

test("cleanup maintenance preserves source suppressions through SQLite rollback and closes all proven formal copies on original resume", async t => {
  const home = await oldLedger(t); seedCleanupCopies(home);
  const snapshot = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const context = { homeDirectory: home, snapshot, assertCurrent: () => {} }, operation_id = "cleanup-fixed";
  const targets = inspectMemoryLedgerCleanupSources({ homeDirectory: home, targets: [cleanupFormal] });
  assert.deepEqual(targets[0]!.sources.map(source => source.event_id), ["source-a", "source-b", "source-c"]);
  let decision = beginMemoryLedgerCleanup({ ...context, operation_id, targets });
  suppressMemoryLedgerCleanupSources({ ...context, decision, index: 0 });
  const suppressed = cleanupState(home);
  assert.equal(suppressed.memory_markers!.filter(row => String(row.key).startsWith("memory-source-forgotten:")).length, 3);
  const originalExec = DatabaseSync.prototype.exec;
  let failed = false;
  const mock = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (!failed && sql === "COMMIT" && this.prepare("SELECT 1 FROM memory_markers WHERE key='memory-forgotten:memory-a'").get()) {
      failed = true; throw new Error("ledger commit failed");
    }
    return originalExec.call(this, sql);
  });
  assert.throws(() => completeMemoryLedgerCleanupTarget({ ...context, decision, index: 0 }), /ledger commit failed/);
  mock.mock.restore();
  assert.equal(failed, true); assert.deepEqual(cleanupState(home), suppressed);
  assert.throws(() => completeMemoryLedgerAdoption({ ...context, profiles: profiles(snapshot) }), { code: "memory.adoption_conflict" });
  const resumed = readMemoryLedgerCleanupDecision({ ...context, operation_id }); assert.deepEqual(resumed, decision);
  decision = completeMemoryLedgerCleanupTarget({ ...context, decision: resumed!, index: 0 });
  assert.equal(decision.phase, "committed");
  const cleaned = cleanupState(home);
  assert.equal(cleaned.memory_revisions!.length, 0); assert.equal(cleaned.memory_pairs!.length, 0); assert.equal(cleaned.memory_uses!.length, 0);
  assert.deepEqual(JSON.parse(String(cleaned.memory_changes![0]!.body)), { text: "", reason: null, undoable: false, undo: null });
  const note = JSON.parse(String(cleaned.memory_candidates![0]!.body)); assert.equal(note.text, ""); assert.equal(note.why, ""); assert.equal(note.memory_id, null);
  const adoption = cleaned.memory_markers!.find(row => row.key === "strategy-adoption")!;
  assert.deepEqual(JSON.parse(String(adoption.body)), { origin: "adopting", retained: "keep", original_origin: "existing-home" });
  // Completion restores this one control marker; every cleaned copy and suppression must stay identical.
  adoption.body = JSON.stringify({ origin: "existing-home", retained: "keep" });
  completeMemoryLedgerAdoption({ ...context, profiles: profiles(snapshot) });
  assert.equal(inspectMemoryLedgerAdoption({ homeDirectory: home }).version, 4);
  assert.deepEqual(cleanupState(home), cleaned, "normal adopted reopen cannot put back removed copies");
});

test("candidate-only cleanup removes its exact projection without erasing the unselected formal result", async t => {
  const home = await oldLedger(t); seedCleanupCopies(home);
  const snapshot = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const context = { homeDirectory: home, snapshot, assertCurrent: () => {} };
  const target = { ...cleanupFormal, ref: { kind: "memory-candidate" as const, id: "candidate-a", revision: 1 }, expectedVersion: 1, state: "accepted" as const };
  const targets = inspectMemoryLedgerCleanupSources({ homeDirectory: home, targets: [target] });
  assert.deepEqual(targets[0]!.sources.map(source => source.event_id), ["source-b", "source-c"]);
  const decision = beginMemoryLedgerCleanup({ ...context, operation_id: "candidate-only", targets });
  suppressMemoryLedgerCleanupSources({ ...context, decision, index: 0 }); const before = cleanupState(home);
  completeMemoryLedgerCleanupTarget({ ...context, decision, index: 0 }); const after = cleanupState(home);
  assert.equal(after.memory_candidates!.length, 0);
  for (const table of ["memory_revisions", "memory_changes", "memory_uses", "memory_pairs"]) assert.deepEqual(after[table], before[table]);
});

test("cleanup storage rechecks current authority inside transaction and requires matching original source/decision", async t => {
  const home = await oldLedger(t); seedCleanupCopies(home);
  const snapshot = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const context = { homeDirectory: home, snapshot, assertCurrent: () => {} };
  const targets = inspectMemoryLedgerCleanupSources({ homeDirectory: home, targets: [cleanupFormal] });
  assert.throws(() => beginMemoryLedgerCleanup({ ...context, operation_id: "forged", targets: [{ ...targets[0]!, sources: [] }] }), { code: "memory.adoption_conflict" });
  const decision = beginMemoryLedgerCleanup({ ...context, operation_id: "checked", targets }), before = cleanupState(home);
  let checks = 0;
  assert.throws(() => completeMemoryLedgerCleanupTarget({ ...context, decision, index: 0, assertCurrent: () => {
    if (++checks === 2) throw new Error("revoked before commit");
  } }), /revoked before commit/);
  assert.equal(checks, 2); assert.deepEqual(cleanupState(home), before);
  assert.throws(() => completeMemoryLedgerCleanupTarget({ ...context, decision: { ...decision, operation_id: "absent" }, index: 0 }), { code: "memory.adoption_conflict" });
});
