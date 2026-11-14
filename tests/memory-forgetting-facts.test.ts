import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { MemoryForgettingDecision, MemoryForgettingFacts } from "@molis-ai/molis-work-contracts/services/memory";
import { acquireStorageOwner, initializeMemoryForgetting, inspectMemoryForgetting, mergeMemoryForgetting, openMemoryForgetting, openMemoryLedger,
  parseMemoryForgetting, serializeMemoryForgetting, type StorageOwner } from "@molis-ai/molis-work-storage";

const accepted: MemoryForgettingDecision = { selection_mode: "related", operation_id: "person-delete", actor_id: "person-a", scope: "personal", owner: "person-a",
  accepted_at: "2026-11-04T00:00:00.000Z", memories: [{ memory_id: "canonical", version: 4 }],
  candidates: [{ candidate_id: "candidate", version: 2 }], source_event_ids: ["original-b", "original-a"] };
const file = (...decisions: MemoryForgettingDecision[]): MemoryForgettingFacts => ({ format_version: 1, decisions });

test("Independent forgetting facts preserve fixed identities and explicitly empty initialized facts", () => {
  const encoded = serializeMemoryForgetting(file(accepted)), decoded = parseMemoryForgetting(encoded);
  assert.deepEqual(decoded.decisions[0], { ...accepted, source_event_ids: ["original-a", "original-b"] });
  assert.equal(serializeMemoryForgetting(decoded), encoded);
  assert.deepEqual(parseMemoryForgetting('{"format_version":1,"decisions":[]}'), file());
  for (const body of ["", "{}", "null", '{"format_version":1}', '{"format_version":2,"decisions":[]}'])
    assert.throws(() => parseMemoryForgetting(body), { code: "memory.forgetting_invalid" });
});

test("The initial strict format requires an explicit mode and exact identities never carry sources", () => {
  const { selection_mode: _mode, ...old } = accepted;
  for (const item of [old, { ...accepted, selection_mode: "unknown" },
    { ...accepted, selection_mode: "exact-identities" },
    { ...accepted, selection_mode: "exact-identities", memories: [], candidates: [], source_event_ids: [] }])
    assert.throws(() => parseMemoryForgetting(JSON.stringify({ format_version: 1, decisions: [item] })), { code: "memory.forgetting_invalid" });
  const exact = { ...accepted, selection_mode: "exact-identities" as const, source_event_ids: [] };
  assert.deepEqual(parseMemoryForgetting(serializeMemoryForgetting(file(exact))), file(exact));
  assert.throws(() => mergeMemoryForgetting(file(exact), file({ ...exact, selection_mode: "related" })), { code: "memory.conflict" });
  assert.throws(() => mergeMemoryForgetting(file(exact), file({ ...exact, candidates: [] })), { code: "memory.conflict" });
});

test("Independent forgetting facts reject unknown fields, wrong owners and incomplete fixed selections", () => {
  for (const item of [
    { ...accepted, text: "a body must never be stored here" }, { ...accepted, owner: "another-person" },
    { ...accepted, scope: "unknown" }, { ...accepted, operation_id: "" }, { ...accepted, accepted_at: "not a date" },
    { ...accepted, memories: [{ memory_id: "canonical", version: 0 }] },
    { ...accepted, candidates: [{ candidate_id: "candidate", version: 2.5 }] },
    { ...accepted, source_event_ids: ["original", "original"] },
    { ...accepted, memories: [...accepted.memories, ...accepted.memories] },
    { ...accepted, memories: [], candidates: [], source_event_ids: [] },
  ]) assert.throws(() => parseMemoryForgetting(JSON.stringify({ format_version: 1, decisions: [item] })), { code: "memory.forgetting_invalid" });
  assert.throws(() => parseMemoryForgetting(JSON.stringify(file(accepted, accepted))), { code: "memory.forgetting_invalid" });
});

test("Repeated accepted operations merge once and reject any changed fixed input", () => {
  const current = parseMemoryForgetting(serializeMemoryForgetting(file(accepted)));
  assert.deepEqual(mergeMemoryForgetting(current, file({ ...accepted, source_event_ids: [...accepted.source_event_ids].reverse() })), current);
  for (const change of [
    { scope: "project" as const, owner: "project-a" }, { memories: [{ memory_id: "canonical", version: 5 }] },
    { candidates: [] }, { source_event_ids: ["original-a"] }, { accepted_at: "2026-11-04T01:00:00.000Z" },
  ]) assert.throws(() => mergeMemoryForgetting(current, file({ ...accepted, ...change })), { code: "memory.conflict" });
});

test("Monotonic merging retains another version decision and keeps source ownership separate", () => {
  const later = { ...accepted, operation_id: "later-delete", memories: [{ memory_id: "canonical", version: 8 }] };
  const project = { ...accepted, operation_id: "project-delete", scope: "project" as const, owner: "project-b" };
  const anotherActor = { ...accepted, actor_id: "person-b", owner: "person-b" };
  const combined = mergeMemoryForgetting(file(accepted), file(later, project, anotherActor));
  assert.equal(combined.decisions.length, 4);
  assert.deepEqual(new Set(combined.decisions.flatMap(item => item.memories.map(memory => memory.version))), new Set([4, 8]));
  assert.deepEqual(combined.decisions.map(item => [item.actor_id, item.scope, item.owner]).sort(),
    [["person-a", "personal", "person-a"], ["person-a", "personal", "person-a"], ["person-a", "project", "project-b"], ["person-b", "personal", "person-b"]].sort());
  assert.deepEqual(mergeMemoryForgetting(combined, file(accepted)), combined);
});

function storage(t: TestContext) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "molis-forgetting-owner-")));
  let owner: StorageOwner | undefined = acquireStorageOwner(join(home, "agent-runtime"));
  const close = () => { const held = owner; owner = undefined; held?.release(); };
  const input = (assertCurrent = () => {}) => ({ homeDirectory: home, storageOwner: owner!, assertCurrent });
  t.after(() => { close(); fs.rmSync(home, { recursive: true, force: true }); });
  return { home, input, close, reopen() { close(); owner = acquireStorageOwner(join(home, "agent-runtime")); } };
}
const selection = () => { const { accepted_at: _time, ...fixed } = accepted; return fixed; };

test("Only explicit fresh initialization creates facts; accepted selections survive owner reopen", t => {
  const f = storage(t);
  assert.throws(() => openMemoryForgetting(f.input()), { code: "memory.forgetting_invalid" });
  assert.equal(fs.existsSync(join(f.home, "memory-forgetting-v2.json")), false);
  initializeMemoryForgetting(f.input());
  const port = openMemoryForgetting(f.input()), result = port.accept(selection());
  f.reopen();
  const reopened = openMemoryForgetting(f.input());
  assert.deepEqual(reopened.read(), file({ ...result, source_event_ids: ["original-a", "original-b"] }));
  assert.deepEqual(reopened.accept({ ...selection(), source_event_ids: ["original-a", "original-b"] }), result);
  assert.equal(reopened.read().decisions.length, 1);
  const before = fs.readFileSync(join(f.home, "memory-forgetting-v2.json"));
  assert.throws(() => reopened.accept({ ...selection(), memories: [{ memory_id: "another", version: 4 }] }), { code: "memory.conflict" });
  assert.deepEqual(fs.readFileSync(join(f.home, "memory-forgetting-v2.json")), before);
  assert.throws(() => port.read(), { code: "storage.owner.closed" });
});

test("Nonempty, missing and damaged independent facts never become an empty decision set", t => {
  const f = storage(t), target = join(f.home, "memory-forgetting-v2.json");
  fs.writeFileSync(join(f.home, "business.bin"), "existing business");
  assert.throws(() => initializeMemoryForgetting(f.input()), { code: "memory.forgetting_invalid" });
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(target, "broken independent facts", { mode: 0o600 });
  assert.throws(() => inspectMemoryForgetting(f.home), { code: "memory.forgetting_invalid" });
  assert.throws(() => openMemoryForgetting(f.input()), { code: "memory.forgetting_invalid" });
  assert.equal(fs.readFileSync(target, "utf8"), "broken independent facts");
});

for (const failure of ["damaged-facts", "closed-owner"] as const)
test(`Failed ledger construction closes its real SQLite connections after ${failure}`, t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const input = f.input();
  if (failure === "damaged-facts") fs.writeFileSync(join(f.home, "memory-forgetting-v2.json"), "broken independent facts");
  else f.close();
  const connections = new Set<DatabaseSync>(), exec = DatabaseSync.prototype.exec;
  const observed = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    connections.add(this); return exec.call(this, sql);
  });
  try {
    assert.throws(() => openMemoryLedger(input), { code: failure === "damaged-facts" ? "memory.forgetting_invalid" : "storage.owner.closed" });
    assert.ok(connections.size > 0, "the public constructor really opened and initialized SQLite before the failure");
    for (const db of connections) assert.throws(() => db.prepare("SELECT 1").get(), { code: "ERR_INVALID_STATE" }, "no connection remains usable after construction failed");
  } finally {
    observed.mock.restore();
    for (const db of connections) { try { db.close(); } catch { /* Already closed by the production constructor. */ } }
  }
});

test("All live gates share their original owner's immutable facts without rereading the whole file", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const owner = openMemoryForgetting(f.input()), first = { accept: owner.accept, read: owner.read }, second = { read: owner.read };
  const read = fs.readSync; let reads = 0;
  const counter = t.mock.method(fs, "readSync", (...args: Parameters<typeof read>) => { reads++; return read(...args); });
  syncBuiltinESMExports();
  try {
    first.accept(selection());
    const facts = first.read();
    for (let i = 0; i < 100; i++) assert.equal(second.read(), facts);
    assert.equal(reads, 0, "ordinary same-owner gates do not reread or parse the growing decision file");
    assert.ok(Object.isFrozen(facts.decisions[0]!.memories[0]));
    assert.equal(second.read().decisions.length, 1);
  } finally { counter.mock.restore(); syncBuiltinESMExports(); }
});

test("Ledger marker statement reuse still reads each identity and current forgetting facts across owner reopen", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  let ledger = openMemoryLedger(f.input());
  t.after(() => ledger.close());
  const prepare = DatabaseSync.prototype.prepare;
  let compilations = 0, queries = 0, factReads = 0;
  t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql === "SELECT 1 FROM memory_markers WHERE actor_id='' AND key=?") {
      compilations++;
      const get = statement.get;
      t.mock.method(statement, "get", function(this: typeof statement, ...args: Parameters<typeof get>) {
        queries++; return get.apply(this, args);
      });
    }
    return statement;
  });
  const read = ledger.forgetting.read;
  t.mock.method(ledger.forgetting, "read", () => { factReads++; return read(); });
  for (const id of ["canonical", "marker", "other"]) ledger.addRevision(id, {
    version: 1, text: id, kind: "fact", applies: {}, change: "created", by: "person", at: "2026-11-06T00:00:00Z",
  });
  const before = { queries, factReads };
  for (const id of ["marker", "other", "marker"]) assert.equal(ledger.revisions(id)[0]?.text, id);
  assert.equal(compilations, 1, "one live DB owner reuses only the compiled marker SELECT");
  assert.equal(queries - before.queries, 3, "each check still queries its own current marker");
  assert.equal(factReads - before.factReads, 3, "each check still crosses the accepted-facts currentness gate");
  ledger.setMarker("", "memory-forgotten:marker", { state: "forgotten" }, "2026-11-06T00:00:00Z");
  assert.deepEqual(ledger.revisions("marker"), []);
  assert.equal(ledger.revisions("other")[0]?.text, "other");
  ledger.forgetting.accept(selection());
  assert.deepEqual(ledger.revisions("canonical"), [], "later accepted facts are immediately visible");
  f.close();
  assert.throws(() => ledger.revisions("other"), { code: "storage.owner.closed" });
  ledger.close();
  assert.throws(() => ledger.revisions("other"), /记忆账本已经关闭/);
  f.reopen(); ledger = openMemoryLedger(f.input());
  assert.deepEqual(ledger.revisions("marker"), []);
  assert.deepEqual(ledger.revisions("canonical"), []);
  assert.equal(ledger.revisions("other")[0]?.text, "other");
  assert.equal(compilations, 2, "reopened ledger owns its own statement");
});

test("receipt batches read current facts at their boundaries and preserve all 752 identity checks and rows", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger(f.input()); t.after(() => ledger.close());
  const original = DatabaseSync.prototype.prepare, read = ledger.forgetting.read;
  let factReads = 0;
  const markerIdentities = new Set<string>();
  t.mock.method(ledger.forgetting, "read", () => { factReads++; return read(); });
  t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = original.call(this, sql);
    if (sql.startsWith("SELECT key FROM memory_markers WHERE actor_id='' AND key IN")) {
      const all = statement.all;
      t.mock.method(statement, "all", function(this: typeof statement, ...args: Parameters<typeof all>) {
        assert.ok(args.length > 0 && args.length <= 128, "the marker set query stays bounded");
        for (const identity of args) markerIdentities.add(String(identity).slice("memory-forgotten:".length));
        return all.apply(this, args);
      });
    }
    return statement;
  });
  const uses = Array.from({ length: 752 }, (_, index) => ({ memory_id: `identity-${index}`, memory_version: 1,
    receipt_id: "complete-batch", at: "2026-11-06T00:00:00Z", consumer: "ui" as const, title: "Current recall", work_id: null,
    source: "recall" as const, state: index < 8 ? "returned" as const : "omitted" as const }));
  ledger.recordUses(uses);
  assert.equal(factReads, 2, "one fresh fact set plus the original owner check immediately before COMMIT");
  assert.deepEqual(markerIdentities, new Set(uses.map(use => use.memory_id)), "set queries still check every input identity's current marker");
  const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
  try {
    const rows = persisted.prepare("SELECT body FROM memory_uses WHERE receipt_id=? ORDER BY memory_id").all("complete-batch")
      .map(row => JSON.parse(String(row.body)));
    assert.deepEqual(rows, uses.toSorted((a, b) => a.memory_id.localeCompare(b.memory_id)), "all versions, states and identities actually persist");
    assert.equal(rows.filter(row => row.state === "returned").length, 8);
    assert.equal(rows.filter(row => row.state === "omitted").length, 744);
  } finally { persisted.close(); }
  ledger.recordUses([{ ...uses[0]!, receipt_id: "next-call" }]);
  assert.equal(factReads, 4, "a later batch obtains its own current facts");
  // Exercise markers for every identity across set-query and write boundaries, including returned and omitted rows.
  for (let parity = 0; parity < 2; parity++) {
    for (let index = parity; index < uses.length; index += 2)
      ledger.setMarker("", `memory-forgotten:${uses[index]!.memory_id}`, {}, uses[index]!.at);
    const receipt = `late-${parity}`;
    ledger.recordUses(uses.map(use => ({ ...use, receipt_id: receipt })));
    const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
    try {
      const rows = persisted.prepare("SELECT body FROM memory_uses WHERE receipt_id=? ORDER BY memory_id").all(receipt)
        .map(row => JSON.parse(String(row.body)));
      const survivors = parity === 0 ? uses.filter((_, index) => index % 2 === 1).map(use => ({ ...use, receipt_id: receipt })) : [];
      assert.deepEqual(rows, survivors.toSorted((a, b) => a.memory_id.localeCompare(b.memory_id)), "late batches never write a marked identity or suppress an unmarked peer");
    } finally { persisted.close(); }
  }
  ledger.forgetting.accept(selection());
  ledger.recordUses([{ ...uses[0]!, memory_id: "canonical", receipt_id: "accepted-before-batch" }]);
  const persistedAccepted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
  try { assert.equal(persistedAccepted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id=?").get("accepted-before-batch")!.count, 0); }
  finally { persistedAccepted.close(); }
});

for (const fault of ["accepted", "released", "replaced", "linked", "damaged", "restore-pending"] as const)
test(`receipt batch rolls back every staged row when ${fault} changes during synchronous SQLite execution`, t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger(f.input()); t.after(() => ledger.close());
  const prepare = DatabaseSync.prototype.prepare;
  let injected = false;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql.startsWith("INSERT INTO memory_uses")) {
      const run = statement.run;
      t.mock.method(statement, "run", function(this: typeof statement, ...args: Parameters<typeof run>) {
        const result = run.apply(this, args);
        if (!injected) {
          injected = true;
          const target = join(f.home, "memory-forgetting-v2.json");
          if (fault === "accepted") ledger.forgetting.accept(selection());
          if (fault === "released") f.close();
          if (fault === "replaced") {
            const replacement = target + ".replacement";
            fs.writeFileSync(replacement, fs.readFileSync(target), { mode: 0o600 }); fs.renameSync(replacement, target);
          }
          if (fault === "linked") { fs.renameSync(target, target + ".original"); fs.symlinkSync(target + ".original", target); }
          if (fault === "damaged") fs.writeFileSync(target, "invalid current facts");
          if (fault === "restore-pending") fs.writeFileSync(join(f.home, "agent-runtime", ".molis-home-restore.json"), "{}");
        }
        return result;
      });
    }
    return statement;
  });
  const use = { memory_id: "canonical", memory_version: 4, receipt_id: "rollback-whole-batch", at: "2026-11-06T00:00:00Z",
    consumer: "ui" as const, title: "No stale receipt", work_id: null, source: "recall" as const, state: "returned" as const };
  assert.throws(() => ledger.recordUses([use, { ...use, memory_id: "unrelated", state: "omitted" }]), {
    code: fault === "accepted" ? "memory.conflict" : fault === "released" ? "storage.owner.closed"
      : fault === "restore-pending" ? "storage.owner.recovery_required" : "memory.forgetting_invalid",
  });
  observe.mock.restore(); assert.equal(injected, true);
  const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
  try { assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses").get()!.count, 0); }
  finally { persisted.close(); }
  if (fault === "accepted") {
    assert.equal(ledger.forgetting.read().decisions.length, 1, "rollback cannot undo the independent accepted decision");
    ledger.recordUses([{ ...use, receipt_id: "late" }]);
    assert.deepEqual(ledger.uses({ memory_id: "canonical" }), [], "subsequent late receipts remain fenced");
  }
});

test("nested receipt phase rechecks facts again at its outer COMMIT and refuses a new accepted decision", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger(f.input()); t.after(() => ledger.close());
  assert.throws(() => ledger.transaction(() => {
    ledger.recordUses([{ memory_id: "canonical", receipt_id: "nested", at: "2026-11-06T00:00:00Z", consumer: "ui",
      title: "Nested receipt", work_id: null, state: "returned" }]);
    ledger.setMarker("person-a", "also-rollback", {}, "2026-11-06T00:00:00Z");
    ledger.forgetting.accept(selection());
  }), { code: "memory.conflict" });
  assert.equal(ledger.marker("person-a", "also-rollback"), null);
  const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
  try { assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses").get()!.count, 0); }
  finally { persisted.close(); }
  assert.equal(ledger.forgetting.read().decisions.length, 1);
});

test("catching an inner receipt phase refusal cannot commit rows checked before a reentrant forgetting decision", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger(f.input()); t.after(() => ledger.close());
  let changed = false;
  const use = { get memory_id() {
    if (!changed) { changed = true; ledger.forgetting.accept(selection()); }
    return "canonical";
  }, receipt_id: "caught-inner", at: "2026-11-06T00:00:00Z", consumer: "ui" as const,
  title: "Outer caller catches refusal", work_id: null, state: "returned" as const };
  assert.throws(() => ledger.transaction(() => {
    assert.throws(() => ledger.recordUses([use]), { code: "memory.conflict" });
    ledger.setMarker("person-a", "caught-inner-marker", {}, use.at);
  }), { code: "memory.conflict" });
  assert.equal(changed, true);
  assert.equal(ledger.marker("person-a", "caught-inner-marker"), null);
  const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
  try { assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses").get()!.count, 0); }
  finally { persisted.close(); }
  assert.equal(ledger.forgetting.read().decisions.length, 1);
});

for (const phase of ["serialization", "sql"] as const)
test(`receipt set queries cannot revive a marker forgotten reentrantly during ${phase}`, t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger(f.input()); t.after(() => ledger.close());
  ledger.addRevision("target-200", { version: 1, text: "Original history", kind: "fact", applies: {}, change: "created", by: "person", at: "2026-11-07T00:00:00Z" });
  let injected = false;
  const forget = () => { if (!injected) { injected = true; ledger.forget("target-200", "related"); } };
  const prepare = DatabaseSync.prototype.prepare;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (phase === "sql" && sql.startsWith("INSERT INTO memory_uses")) {
      const run = statement.run;
      t.mock.method(statement, "run", function(this: typeof statement, ...args: Parameters<typeof run>) {
        const result = run.apply(this, args); forget(); return result;
      });
    }
    return statement;
  });
  const uses = Array.from({ length: 260 }, (_, index) => ({ memory_id: `target-${index}`, receipt_id: "reentrant-set",
    at: "2026-11-07T00:00:00Z", consumer: "ui" as const, title: "Current selection", work_id: null, state: "omitted" as const }));
  const first = phase === "serialization" ? { ...uses[0]!, toJSON() { forget(); return uses[0]!; } } : uses[0]!;
  assert.throws(() => ledger.transaction(() => {
    assert.throws(() => ledger.recordUses([first, ...uses.slice(1)]), { code: "memory.conflict" });
    ledger.setMarker("person-a", "caught-marker-refusal", {}, uses[0]!.at);
  }), { code: "memory.conflict" });
  observe.mock.restore(); assert.equal(injected, true);
  const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
  try {
    assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id='reentrant-set'").get()!.count, 0,
      "neither the already-written chunk nor the later chunk survives the changed marker gate");
    assert.equal(ledger.marker("person-a", "caught-marker-refusal"), null);
    assert.equal(ledger.revisions("target-200")[0]?.text, "Original history", "the enclosing SQL transaction also rolls back its reentrant cleanup");
    ledger.forget("target-200", "related");
    ledger.recordUses(uses.map(use => ({ ...use, receipt_id: "after-forgetting" })));
    const rows = persisted.prepare("SELECT memory_id FROM memory_uses WHERE receipt_id='after-forgetting'").all();
    assert.deepEqual(new Set(rows.map(row => String(row.memory_id))), new Set(uses.filter(use => use.memory_id !== "target-200").map(use => use.memory_id)));
    assert.deepEqual(ledger.revisions("target-200"), []);
  } finally { persisted.close(); }
});

test("receipt batches hold off a second SQLite marker writer and check its committed marker on the next batch", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger(f.input()), writer = new DatabaseSync(join(f.home, "memory", "memory.db"));
  t.after(() => { writer.close(); ledger.close(); });
  writer.exec("PRAGMA busy_timeout=0");
  const mark = writer.prepare("INSERT INTO memory_markers(actor_id,key,at,body) VALUES ('',?,?,?)");
  const use = { memory_id: "concurrent-marker", receipt_id: "before-marker", at: "2026-11-07T00:00:00Z", consumer: "ui" as const,
    title: "Concurrent marker", work_id: null, state: "returned" as const };
  const prepare = DatabaseSync.prototype.prepare;
  let attempted = false;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql.startsWith("INSERT INTO memory_uses")) {
      const run = statement.run;
      t.mock.method(statement, "run", function(this: typeof statement, ...args: Parameters<typeof run>) {
        if (!attempted) {
          attempted = true;
          assert.throws(() => mark.run(`memory-forgotten:${use.memory_id}`, use.at, "{}"), /database is locked/,
            "BEGIN IMMEDIATE prevents another SQLite owner changing a marker between set reads and writes");
        }
        return run.apply(this, args);
      });
    }
    return statement;
  });
  ledger.recordUses([use]); observe.mock.restore();
  assert.equal(attempted, true);
  assert.equal(writer.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id='before-marker'").get()!.count, 1);
  mark.run(`memory-forgotten:${use.memory_id}`, use.at, "{}");
  ledger.recordUses([{ ...use, receipt_id: "after-marker" }]);
  assert.equal(writer.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id='after-marker'").get()!.count, 0);
  assert.deepEqual(ledger.uses({ memory_id: use.memory_id }), [], "the committed marker also hides the previous historical receipt");
});

test("receipt facts compare by content for the existing inspection reader without an owner", t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const ledger = openMemoryLedger({ homeDirectory: f.home }); t.after(() => ledger.close());
  ledger.recordUses([{ memory_id: "unchanged", receipt_id: "inspection", at: "2026-11-06T00:00:00Z", consumer: "ui",
    title: "Structurally unchanged facts", work_id: null, state: "returned" }]);
  assert.equal(ledger.uses({ receipt_id: "inspection" })[0]?.memory_id, "unchanged");
});

for (const fault of ["directory-sync", "cancel-after-sync"] as const)
test(`Independent acceptance keeps visible facts for original-operation confirmation after ${fault}`, t => {
  const f = storage(t); initializeMemoryForgetting(f.input());
  const signal = new AbortController(), port = openMemoryForgetting(f.input(() => signal.signal.throwIfAborted()));
  const sync = fs.fsyncSync, failure = new Error("acceptance confirmation interrupted");
  const injection = t.mock.method(fs, "fsyncSync", (fd: number) => {
    const result = sync(fd);
    if (fs.fstatSync(fd).isDirectory()) {
      if (fault === "directory-sync") throw failure;
      signal.abort(failure);
    }
    return result;
  });
  try { assert.throws(() => port.accept(selection()), error => error === failure); }
  finally { injection.mock.restore(); }
  const visible = inspectMemoryForgetting(f.home);
  assert.equal(visible.decisions.length, 1);
  f.reopen();
  const retry = openMemoryForgetting(f.input()).accept(selection());
  assert.deepEqual(retry, visible.decisions[0]);
  assert.deepEqual(inspectMemoryForgetting(f.home), visible, "confirmation never adds another decision or changes its acceptance identity");
});
