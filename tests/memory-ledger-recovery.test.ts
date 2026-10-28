import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { homeSqlitePath, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, openMemoryLedgerRecoveryInspection } from "@molis-ai/molis-work-storage";
import { interpretMemoryLedgerRecoveryFact, resolveForgottenMemoryIdentity } from "@molis-ai/molis-work-service-memory";
import type { MemoryLedgerRecoveryFact as Fact, MemoryLedgerRecoveryPage } from "@molis-ai/molis-work-contracts/services/memory";

const at = "2026-10-25T00:00:00.000Z", content = "PRIVATE_BODY_MUST_NOT_LEAVE_OWNER";
function fixture(t: TestContext, wal = false) {
  const home = mkdtempSync(join(tmpdir(), "molis-ledger-recovery-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, MEMORY_LEDGER_STORE));
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  db.exec(MEMORY_LEDGER_BASELINE.schema); db.exec("PRAGMA user_version=4");
  if (wal) db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  t.after(() => { if (db.isOpen) db.close(); });
  const marker = (key: string, body: unknown, actor = "person") => db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run(actor, key, at, JSON.stringify(body));
  return { home, db, marker };
}
function inspect(home: string) { return openMemoryLedgerRecoveryInspection({ homeDirectory: home, assertCurrent() {} }); }
function pages(handle: ReturnType<typeof inspect>, limit = 2) {
  const result: MemoryLedgerRecoveryPage[] = [];
  for (let i = 0; i < 500; i++) {
    const page = handle.next({ limit }); result.push(page);
    assert.ok(page.facts.length + page.issues.length <= limit);
    if (page.exhausted) return result;
  }
  assert.fail("reader did not exhaust");
}
const op = (id: string, kind = "remove", memory = "gone", scope = "personal", owner = "person") => ({
  kind, operation_id: id, scope, owner, memory_id: memory, expected_version: 3, phase: "closed", at,
});
function preview(ids: string[], scope = "user", owner = "person") {
  return { count: ids.length, fingerprint: "fingerprint", operation_id: "scope-operation", items: ids.map(id => ({ memory_id: id, version: 2 })),
    decision: { version: 1, binding: "binding", scope, owner, items: ids.map(id => ({ ref: { kind: "memory", id, revision: 1 }, expectedVersion: 2,
      operationId: `scope-operation:${id}`, mutation: { kind: "purge" } })) } };
}

test("rewind requires exhaustion and retains one snapshot across a concurrent committed writer", t => {
  const { home, db, marker } = fixture(t, true);
  marker("memory-source-links:original", { sources: [{ event_id: "old-event", version: "old" }] });
  const change = { change_id: "change", actor_id: "person", memory_id: "original", at, scope: "project", owner: "project",
    project_id: "project", kind: "removed", state: "active", applied_version: 3, operation_id: "remove" };
  db.prepare("INSERT INTO memory_changes VALUES (?,?,?,?,?)").run("change", "person", "original", at, JSON.stringify(change));
  const reader = inspect(home);
  assert.throws(() => reader.rewind(), { code: "memory.recovery_not_exhausted" });
  const first = pages(reader, 1);
  assert.deepEqual(first.flatMap(page => page.issues), []);
  db.exec("BEGIN IMMEDIATE");
  db.prepare("UPDATE memory_markers SET body=? WHERE key=?").run(JSON.stringify({ sources: [{ event_id: "new-event", version: "new" }] }), "memory-source-links:original");
  marker("memory-forgotten:original", { memory_id: "original", state: "forgotten" }, "");
  db.prepare("UPDATE memory_changes SET body=? WHERE change_id='change'").run(JSON.stringify({ ...change, applied_version: 4 }));
  db.exec("COMMIT");
  reader.rewind();
  assert.deepEqual(pages(reader, 1), first);
  reader.close();
  assert.throws(() => reader.rewind(), { code: "memory.recovery_closed" });
  const fresh = inspect(home), facts = pages(fresh).flatMap(page => page.facts); fresh.close();
  assert.ok(facts.some(fact => fact.kind === "source-link" && fact.event_id === "new-event" && fact.version === "new"));
  assert.ok(facts.some(fact => fact.kind === "forgotten" && fact.memory_id === "original"));
  assert.ok(facts.some(fact => fact.kind === "change" && fact.applied_version === 4));
});

// This uses a real retained SQLite file and the public packages, never an internal decoder or fake SQL runner.
test("nonempty pages cover marker producers and identity tables without text, reasons, or undo", t => {
  const { home, db, marker } = fixture(t);
  marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
  marker('memory-source-forgotten:["personal","person","event"]', { event_id: "event" });
  marker("memory-source-links:gone", { sources: [{ event_id: "event", version: "v1" }, { event_id: "event", version: "v2" }] });
  marker("memory-operation:remove:change:gone", op("remove:change:gone"));
  marker("memory-operation:remove:purge:gone", op("remove:purge:gone", "purge"));
  marker("memory-operation:ordinary:commit", { ...op("ordinary:commit", "commit", "kept"), result: { memory_id: "kept", version: 3 } });
  marker("memory-operation:parent:step:remove", { parent_operation_id: "parent", step: "remove", operation_id: "child" });
  marker("memory-operation:promotion:promotion-journal", { ...op("promotion", "promotion", "promoted"),
    candidate: { candidate_id: "candidate", version: 2 }, policy: "memory", version: 3, change_id: "change-promotion",
    sources: [{ event_id: "event", version: "v1" }], reason: content });
  marker("memory-operation:upkeep:upkeep", { ...op("upkeep", "merge", "kept"), change_id: "merge-change", reason: content,
    authority: { actor_id: "person" }, undo: { text: content }, drop: { memory_id: "drop", expected_version: 2, operation_id: "drop-operation" } });
  marker("memory-operation:upkeep-pending", { plans: ["upkeep"] });
  marker("memory-clear:clear", { scope: "personal", owner: "person", started: true,
    parts: [{ ...preview(["clear-a", "clear-b", "clear-c"]), scope: "personal", owner: "person" }] });
  marker("memory-selection:selection", { action: "remove", project_id: null,
    items: [{ scope: "personal", owner: "person", memory_id: "selected", expected_version: 2 }], children: ["selection-child"] });
  marker("memory-project-delete:project", { operation_id: "project-delete", complete: true });
  marker("memory-project-clear:project-delete:project:project", { preview: preview(["project-a"], "project", "project"), candidates: [{ candidate_id: "project-candidate", version: 1 }] });
  marker("memory-operation:cleanup:adoption-cleanup", { kind: "adoption-cleanup", operation_id: "cleanup", phase: "pending", items: [{
    operation_id: "cleanup-child", completed: false, target: { ref: { kind: "memory", id: "orphan", revision: 1 }, expectedVersion: 2,
      identity: { scope: "user", owner: "person" }, sessionRef: { kind: "session", id: "session", revision: 1 }, state: "active", reason: "session-purged",
      sources: [{ actor_id: "person", event_id: "orphan-event", version: "v1" }] },
  }] }, "");
  db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run("character", "character-owner", "project", content, "character");
  db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?)").run("candidate", "person", "accepted", JSON.stringify({
    candidate_id: "candidate", actor_id: "person", scope: "personal", owner: "person", project_id: null, state: "accepted", version: 2,
    memory_id: "promoted", supersedes: null, text: content, why: content, source_refs: [{ event_id: "candidate-event", version: "v1" }],
  }));
  db.prepare("INSERT INTO memory_changes VALUES (?,?,?,?,?)").run("change", "person", "gone", at, JSON.stringify({
    change_id: "change", actor_id: "person", memory_id: "gone", at, scope: "personal", owner: "person", project_id: null,
    kind: "removed", state: "active", applied_version: 3, operation_id: "remove", text: content, reason: content, undo: { text: content },
  }));
  const handle = inspect(home), result = pages(handle); handle.close();
  assert.ok(result.length > 8); assert.deepEqual(result.flatMap(p => p.issues), []);
  const facts = result.flatMap(p => p.facts);
  assert.equal(JSON.stringify(result).includes(content), false);
  for (const field of ['"text":', '"why":', '"reason":', '"undo":', '"title":', '"body":']) assert.equal(JSON.stringify(facts).includes(field), false);
  assert.deepEqual([...new Set(facts.map(f => f.kind))].sort(), ["forgotten", "source-forgotten", "source-link", "operation", "step", "promotion", "upkeep", "upkeep-pending", "plan", "plan-target", "project-delete", "owner", "candidate", "change"].sort());
  const find = <K extends Fact["kind"]>(kind: K) => facts.find(f => f.kind === kind)!;
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(find("source-forgotten"), facts), { kind: "event-barrier", actor_id: "person", identity: { scope: "personal", owner: "person" }, event_id: "event" });
  assert.equal(interpretMemoryLedgerRecoveryFact(facts.find(f => f.kind === "operation" && f.action === "commit")!, facts).kind, "none");
  assert.equal(interpretMemoryLedgerRecoveryFact(find("source-link"), facts).kind, "none");
  const merge = interpretMemoryLedgerRecoveryFact(find("upkeep"), facts);
  assert.ok(merge.kind === "inspect-target" && merge.id === "drop" && merge.intent === "merge-drop");
  assert.equal(interpretMemoryLedgerRecoveryFact(facts.find(f => f.kind === "plan-target" && f.family === "selection")!, facts).kind, "unresolved");
  for (const family of ["scope-clear", "project-clear", "adoption-cleanup"]) assert.equal(interpretMemoryLedgerRecoveryFact(facts.find(f => f.kind === "plan-target" && f.family === family)!, facts).kind, "inspect-target");
  assert.equal((find("candidate") as Extract<Fact, { kind: "candidate" }>).sources_known, true);
  assert.equal(interpretMemoryLedgerRecoveryFact(find("forgotten"), facts).kind, "inspect-target");
  assert.equal(interpretMemoryLedgerRecoveryFact(facts.find(f => f.kind === "operation" && f.action === "purge")!, facts).kind, "inspect-target");
});

test("unknown and corrupt relevant rows stay explicit across pages; a bare ID and conflicting identities stay unresolved", t => {
  const { home, db, marker } = fixture(t);
  marker("memory-operation:future", { ...op("future"), kind: "future-delete" });
  marker("memory-unknown:private", { text: content });
  marker('memory-source-forgotten:["personal","person","event"]', { event_id: "different" });
  marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
  db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", "memory-operation:corrupt", at, "{bad json:" + content);
  marker("memory-operation:one", op("one", "commit", "gone"));
  marker("memory-operation:two", op("two", "commit", "gone", "project", "project"));
  const handle = inspect(home), result = pages(handle, 1); handle.close();
  assert.equal(result.flatMap(p => p.issues).length, 4); assert.ok(result.at(-1)!.exhausted);
  assert.equal(JSON.stringify(result).includes(content), false);
  const facts = result.flatMap(p => p.facts), forgotten = facts.find(f => f.kind === "forgotten")!;
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(forgotten), { kind: "unresolved", reason: "identity-missing" });
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(forgotten, facts), { kind: "unresolved", reason: "identity-conflict" });
  assert.deepEqual(resolveForgottenMemoryIdentity("gone", [], [{ scope: "project", owner: "project", memory_id: "gone" }]),
    { kind: "resolved", identity: { scope: "project", owner: "project" } });
});

test("a plan with many items continues across bounded pages without flattening its entire output", t => {
  const { home, marker } = fixture(t);
  marker("memory-clear:large", { scope: "personal", owner: "person", started: false,
    parts: [{ ...preview(Array.from({ length: 137 }, (_, i) => `m-${i}`)), scope: "personal", owner: "person" }] });
  const handle = inspect(home);
  assert.throws(() => handle.next({ limit: 101 }), { code: "memory.recovery_limit_invalid" });
  assert.throws(() => handle.next({ limit: 0 }), { code: "memory.recovery_limit_invalid" });
  const first = handle.next(); assert.equal(first.facts.length, 40);
  const rest = pages(handle, 7), facts = [...first.facts, ...rest.flatMap(p => p.facts)]; handle.close();
  assert.equal(facts.filter(f => f.kind === "plan-target").length, 137);
  assert.equal(new Set(facts.filter(f => f.kind === "plan-target").map(f => f.id)).size, 137);
  assert.equal(interpretMemoryLedgerRecoveryFact(facts.find(f => f.kind === "plan-target")!, facts).kind, "unresolved");
});

test("WAL is visible and all subsequent pages stay on the same SQLite snapshot", t => {
  const { home, db, marker } = fixture(t, true);
  marker("memory-forgotten:first", { memory_id: "first", state: "forgotten" }, "");
  marker("memory-forgotten:second", { memory_id: "second", state: "forgotten" }, "");
  assert.ok(readFileSync(homeSqlitePath(home, MEMORY_LEDGER_STORE) + "-wal").length > 32);
  const handle = inspect(home), first = handle.next({ limit: 1 });
  marker("memory-forgotten:later", { memory_id: "later", state: "forgotten" }, "");
  const all = [...first.facts, ...pages(handle, 1).flatMap(p => p.facts)]; handle.close();
  assert.deepEqual(all.filter(f => f.kind === "forgotten").map(f => f.memory_id), ["first", "second"]);
  const newer = inspect(home); assert.equal(pages(newer).flatMap(p => p.facts).length, 3); newer.close();
  assert.equal(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()!.busy, 0);
});

test("final authority rejection retains the complete page and close releases the snapshot even after revocation", t => {
  const { home, db, marker } = fixture(t, true);
  marker("memory-forgotten:first", { memory_id: "first", state: "forgotten" }, "");
  marker("memory-forgotten:second", { memory_id: "second", state: "forgotten" }, "");
  let calls = 0, rejectAt = Infinity;
  const handle = openMemoryLedgerRecoveryInspection({ homeDirectory: home, assertCurrent() { if (++calls === rejectAt) throw new Error("revoked"); } });
  rejectAt = calls + 5; // Initial/pre-read, row fetch, row projection, then final publication check.
  assert.throws(() => handle.next({ limit: 1 }), /revoked/);
  rejectAt = Infinity;
  assert.throws(() => handle.rewind(), { code: "memory.recovery_not_exhausted" });
  assert.equal((handle.next({ limit: 1 }).facts[0] as Extract<Fact, { kind: "forgotten" }>).memory_id, "first");
  assert.equal((handle.next({ limit: 1 }).facts[0] as Extract<Fact, { kind: "forgotten" }>).memory_id, "second");
  rejectAt = calls + 1; assert.throws(() => handle.close(), /revoked/); handle.close();
  assert.throws(() => handle.next(), { code: "memory.recovery_closed" });
  assert.equal(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()!.busy, 0);
});

test("abort, asynchronous authority, missing stores and wrong schema fail without creating or retaining a connection", t => {
  const { home, db, marker } = fixture(t, true);
  marker("memory-forgotten:one", { memory_id: "one", state: "forgotten" }, "");
  const controller = new AbortController(), handle = openMemoryLedgerRecoveryInspection({ homeDirectory: home, signal: controller.signal, assertCurrent() {} });
  controller.abort(); assert.throws(() => handle.next(), { name: "AbortError" });
  assert.throws(() => handle.close(), { name: "AbortError" });
  assert.equal(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()!.busy, 0);
  assert.throws(() => openMemoryLedgerRecoveryInspection({ homeDirectory: home, assertCurrent: (() => Promise.resolve()) as () => void }), { code: "memory.recovery_current_required" });
  const absent = join(home, "missing-home"); assert.throws(() => inspect(absent), { code: "memory.recovery_open_failed" }); assert.equal(existsSync(absent), false);
  const empty = join(home, "empty-home"); mkdirSync(empty); assert.throws(() => inspect(empty)); assert.deepEqual(readdirSync(empty), []);
  db.exec("PRAGMA user_version=99"); assert.throws(() => inspect(home), error => {
    assert.equal((error as { code: string }).code, "memory.recovery_schema_invalid");
    assert.equal(String(error).includes(home), false); return true;
  });
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 99);
  assert.equal(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()!.busy, 0);
});

test("only the working copy is opened; original T1 and T0 bytes remain intact", t => {
  const { home, db, marker } = fixture(t, true);
  marker("memory-forgotten:wal", { memory_id: "wal", state: "forgotten" }, "");
  // The writer is held idle here; copy DB/WAL/SHM as one controlled source fixture, never checkpoint away the WAL.
  const original = join(home, "original-t1"), backup = join(home, "t0"), work = join(home, "work");
  for (const path of [original, backup, work]) { mkdirSync(path); cpSync(join(home, "memory"), join(path, "memory"), { recursive: true }); }
  const bytes = (path: string) => readdirSync(join(path, "memory")).sort().map(name => [name, readFileSync(join(path, "memory", name))] as const);
  const t1 = bytes(original), t0 = bytes(backup);
  const handle = inspect(work), result = pages(handle); handle.close();
  assert.ok(result.flatMap(p => p.facts).some(f => f.kind === "forgotten" && f.memory_id === "wal"));
  assert.deepEqual(bytes(original), t1); assert.deepEqual(bytes(backup), t0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memory_markers").get()!.n, 1);
});

test("a SQLite read failure never skips already-buffered facts; close reports a late failure after releasing", t => {
  const { home, db, marker } = fixture(t, true);
  for (const id of ["first", "second"]) marker(`memory-forgotten:${id}`, { memory_id: id, state: "forgotten" }, "");
  const handle = inspect(home), prepare = DatabaseSync.prototype.prepare;
  let reads = 0;
  const faultyRead = t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
    if (sql.includes("ORDER BY rowid LIMIT 1") && ++reads === 2) throw new Error(content);
    return prepare.call(this, sql);
  });
  assert.throws(() => handle.next({ limit: 2 }), { code: "memory.recovery_read_failed" });
  faultyRead.mock.restore();
  assert.deepEqual(pages(handle, 1).flatMap(p => p.facts).filter(f => f.kind === "forgotten").map(f => f.memory_id), ["first", "second"]);
  const close = DatabaseSync.prototype.close;
  const faultyClose = t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) { close.call(this); throw new Error(content); });
  assert.throws(() => handle.close(), { code: "memory.recovery_close_failed" });
  faultyClose.mock.restore(); handle.close();
  assert.equal(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()!.busy, 0);
});

test("opening rejection after the snapshot is acquired disposes it; malformed schema is never repaired", t => {
  const { home, db, marker } = fixture(t, true);
  marker("memory-forgotten:one", { memory_id: "one", state: "forgotten" }, "");
  let checks = 0;
  assert.throws(() => openMemoryLedgerRecoveryInspection({ homeDirectory: home, assertCurrent() { if (++checks === 2) throw new Error("revoked"); } }), /revoked/);
  assert.equal(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()!.busy, 0);
  db.exec("ALTER TABLE memory_markers ADD COLUMN unexpected TEXT");
  assert.throws(() => inspect(home), { code: "memory.recovery_schema_invalid" });
  assert.ok(db.prepare("PRAGMA table_info(memory_markers)").all().some(row => row.name === "unexpected"));
});


test("contradictory owner relations and an isolated candidate purge remain unresolved", t => {
  const { home, db, marker } = fixture(t);
  db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run("character", "same-owner", "project-a", content, "character");
  db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?)").run("candidate", "person", "pending", JSON.stringify({
    candidate_id: "candidate", actor_id: "person", scope: "character", owner: "same-owner", project_id: "project-b",
    state: "pending", version: 1, memory_id: null, supersedes: "original", text: content,
  }));
  marker("memory-operation:parent:candidate-purge:candidate", { kind: "purge", operation_id: "parent:candidate-purge:candidate",
    scope: "character", owner: "same-owner", candidate_id: "candidate", expected_version: 1, phase: "pending", at });
  const handle = inspect(home), facts = pages(handle, 1).flatMap(p => p.facts); handle.close();
  const candidate = facts.find(f => f.kind === "candidate")!;
  assert.equal(candidate.sources_known, false); assert.equal(candidate.supersedes, "original");
  for (const fact of facts) assert.equal(interpretMemoryLedgerRecoveryFact(fact, facts).kind, "unresolved");
});


test("scope-clear empty plans retain contradictions even when no target fact exists", t => {
  const { home, marker } = fixture(t);
  const own = { ...preview([], "user", "person"), scope: "personal", owner: "person" };
  const foreign = { ...preview([], "project", "foreign"), scope: "project", owner: "foreign" };
  for (const [id, parts] of [["missing", []], ["duplicate", [own, own]], ["foreign", [foreign]], ["legal", [own]]] as const)
    marker(`memory-clear:${id}`, { scope: "personal", owner: "person", started: true, parts });
  const handle = inspect(home), result = pages(handle, 1); handle.close();
  assert.deepEqual(result.flatMap(page => page.issues), []);
  const facts = result.flatMap(page => page.facts);
  assert.equal(facts.some(fact => fact.kind === "plan-target"), false);
  for (const id of ["missing", "duplicate", "foreign", "legal"]) {
    const parent = facts.find(fact => fact.kind === "plan" && fact.plan_id === id && fact.started !== undefined)!;
    assert.ok(parent);
    assert.deepEqual(interpretMemoryLedgerRecoveryFact(parent, facts), id === "legal" ? { kind: "none" }
      : { kind: "unresolved", reason: "identity-conflict" });
  }
});

test("scope-clear retains parent/part conflicts and accepts original legal plans without surviving owners", t => {
  const { home, db, marker } = fixture(t);
  const part = (scope: string, owner: string, ids: string[]) => ({
    ...preview(ids, scope === "personal" ? "user" : scope, owner), scope, owner,
  });
  const cases = [
    { name: "personal-foreign-project", scope: "personal", owner: "person", parts: [part("project", "foreign", ["foreign"])], conflict: true },
    { name: "personal-mixed", scope: "personal", owner: "person", parts: [part("personal", "person", ["own"]), part("project", "foreign", ["foreign"])], conflict: true },
    { name: "character-foreign-owner", scope: "character", owner: "character", parts: [part("character", "other", ["foreign"])], conflict: true },
    { name: "project-foreign-project", scope: "project", owner: "project", parts: [part("project", "other", ["foreign"])], conflict: true },
    { name: "project-missing-own-part", scope: "project", owner: "project", parts: [part("character", "character", ["child"])], conflict: true },
    { name: "duplicate-part", scope: "personal", owner: "person", parts: [part("personal", "person", ["one"]), part("personal", "person", ["two"])], conflict: true },
    { name: "personal", scope: "personal", owner: "person", parts: [part("personal", "person", ["own"])], conflict: false },
    { name: "character", scope: "character", owner: "character", parts: [part("character", "character", ["own"])], conflict: false },
    { name: "project-with-character", scope: "project", owner: "project", parts: [part("project", "project", ["own"]), part("character", "character", ["child"])], conflict: false },
    { name: "project-empty-own-part", scope: "project", owner: "project", parts: [part("project", "project", []), part("character", "character", ["child"])], conflict: false },
  ];
  for (const entry of cases) marker(`memory-clear:${entry.name}`, { scope: entry.scope, owner: entry.owner, started: true, parts: entry.parts });
  const handle = inspect(home), result = pages(handle, 1); handle.close();
  assert.deepEqual(result.flatMap(page => page.issues), []);
  const facts = result.flatMap(page => page.facts);
  assert.equal(db.prepare("SELECT count(*) AS count FROM memory_owners").get()?.count, 0);
  for (const entry of cases) {
    const targets = facts.filter(fact => fact.kind === "plan-target" && fact.plan_id === entry.name);
    assert.ok(targets.length > 0, entry.name);
    for (const target of targets) {
      const observed = interpretMemoryLedgerRecoveryFact(target, facts);
      if (entry.conflict) assert.deepEqual(observed, { kind: "unresolved", reason: "identity-conflict" }, entry.name);
      else assert.ok(observed.kind === "inspect-target" && observed.intent === "confirmed-plan", entry.name);
    }
  }
  db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run("character", "character", "other-project", "", "character");
  const conflictHandle = inspect(home), conflicting = pages(conflictHandle).flatMap(page => page.facts); conflictHandle.close();
  const target = conflicting.find(fact => fact.kind === "plan-target" && fact.plan_id === "project-with-character" && fact.identity.scope === "character")!;
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(target, conflicting), { kind: "unresolved", reason: "identity-conflict" });
});
