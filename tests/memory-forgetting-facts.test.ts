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
