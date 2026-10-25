import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";
import { beginMemoryLedgerAdoption, createMemoryLedgerProjectRetention, createMemoryLedgerSelectedRetention, homeSqlitePath,
  inspectMemoryLedgerAdoption, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, type MemoryLedgerSelectedRetentionPlan } from "@molis-ai/molis-work-storage";
import { currentMemoryOptions } from "./fixtures/current-memory.js";

const sdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(sdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(sdk.resolve("@prologue/sdk/node"));
const denied = { code: "memory.adoption_conflict" }, identity = { scope: "project" as const, owner: "project" };
function homeFor(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-selected-cleared-")));
  t.after(() => rmSync(home, { recursive: true, force: true })); return home;
}
function access<T>(home: string, work: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try { return work(db); } finally { db.close(); }
}
function ledger(home: string, memory: string, candidate: string) {
  mkdirSync(join(home, MEMORY_LEDGER_STORE));
  access(home, db => {
    db.exec(MEMORY_LEDGER_BASELINE.schema); db.exec("PRAGMA user_version=3");
    db.prepare("INSERT INTO memory_markers VALUES ('person','strategy-adoption','before',?)").run(JSON.stringify({ origin: "existing-home" }));
    for (const key of ["personal", "project-default", "project:project"]) db.prepare("INSERT INTO memory_prefs VALUES ('person',?,?)").run(key, JSON.stringify({ form: true, key }));
    db.exec("INSERT INTO memory_owners VALUES ('project','project','project','title','subject'); INSERT INTO memory_signal_events VALUES ('signal','person','project|project|x','once','before')");
    for (const id of [memory, "later-memory"]) {
      db.prepare("INSERT INTO memory_revisions VALUES (?,1,?)").run(id, JSON.stringify({ version: 1, text: `${id} original` }));
      db.prepare("INSERT INTO memory_changes VALUES (?,'person',?,'before',?)").run(`change-${id}`, id, JSON.stringify({
        change_id: `change-${id}`, actor_id: "person", memory_id: id, at: "before", ...identity, text: "old text", reason: "why", undoable: true, undo: { text: "undo" } }));
    }
    for (const id of [candidate, "later-candidate"]) db.prepare("INSERT INTO memory_candidates VALUES (?,'person','pending',?)").run(id, JSON.stringify({
      candidate_id: id, actor_id: "person", state: "pending", ...identity, project_id: "project", memory_id: null, text: "candidate original" }));
  });
  return beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
}
const plan = (memory: string, candidate: string): MemoryLedgerSelectedRetentionPlan => ({ actor_id: "person", operation_id: "fixed-cleared", scopes: [{
  ...identity, memories: [{ memory_id: memory, state: "cleared" }], candidates: [{ candidate_id: candidate, state: "cleared" }], sources: [],
}] });
const records = (home: string) => access(home, db => Object.fromEntries(["memory_prefs", "memory_owners", "memory_signal_events", "memory_revisions", "memory_candidates", "memory_changes"]
  .map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));
function bytes(root: string): Record<string, Buffer> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? Object.entries(bytes(path)).map(([key, value]) => [`${entry.name}/${key}`, value]) : [[entry.name, readFileSync(path)]];
  }));
}

test("MEM-40-SELECTED-07: real SDK cleared originals need no fabricated version; exact Ledger cleanup preserves later objects", async t => {
  const home = homeFor(t), storageRoot = join(home, "sdk"), app = { appId: "io.molis.work", appVersion: "1.0.0" };
  const options = currentMemoryOptions({ appId: app.appId, scopesFor: () => [identity] });
  const policy = { ...options.policy, taxonomy: { ...options.policy.taxonomy!, scenes: {
    values: [{ id: "coding", label: "Coding" }, { id: "common", label: "Common" }], default: ["coding"] } } };
  const open = () => createRuntime({ app, host: createNodeHost({ storageRoot }), config: { memory: policy }, memoryAuthority: {
    defaultContext: { consumer: "ui", currentScene: "coding", purpose: "management" },
    authorize: async (requests: readonly { appId: string; target: { scope: string; owner: string } }[]) => requests.every(request =>
      request.appId === app.appId && request.target.scope === identity.scope && request.target.owner === identity.owner),
    authorizeManagement: async () => ({ allowed: true }),
  } });
  const runtime = await open(); let memory, candidate;
  try {
    memory = await runtime.memory.write({ ...identity, text: "original memory", origin: "person" });
    candidate = await runtime.bindMemory({ consumer: "ui", currentScene: "coding", purpose: "management" }).candidates.propose(
      { ...identity, text: "original candidate", origin: "person" }, { expectedVersion: 0, operationId: "candidate" });
  } finally { await runtime.shutdown(); }
  const input = { storageRoot, appVersion: app.appVersion, scopes: [identity], policy };
  const writer = await openPrologueMemoryAdoption({ ...input, memoryPurges: [memory, candidate].map(item => ({
    ref: item.ref, identity, expectedVersion: item.version, operationId: `purge-${item.ref.kind}`,
  })) });
  try {
    for (const item of [memory, candidate]) {
      await writer.purgeMemoryTarget({ ref: item.ref });
      assert.deepEqual(await writer.inspectMemory({ ref: item.ref, identity }), { state: "cleared" });
    }
  } finally { await writer.close(); }
  const next = await open(); let later;
  try { later = await next.memory.write({ ...identity, text: "later same-project memory", origin: "person" }); }
  finally { await next.shutdown(); }
  const sdkBefore = bytes(storageRoot), snapshot = ledger(home, memory.ref.id, candidate.ref.id), before = records(home);
  const inputPlan = { homeDirectory: home, plan: plan(memory.ref.id, candidate.ref.id), mode: "cleanup" as const, assertCurrent() {} };
  const retained = createMemoryLedgerSelectedRetention(inputPlan);
  assert.throws(() => retained.verifyOriginal({ snapshot }), denied);
  assert.throws(() => retained.forget({ snapshot, memory_id: "later-memory" }), denied);
  assert.throws(() => retained.dropCandidate({ snapshot, candidate_id: "later-candidate" }), denied);
  const dropped = retained.dropCandidate({ snapshot, candidate_id: candidate.ref.id });
  const after = retained.forget({ snapshot: dropped, memory_id: memory.ref.id });
  retained.verifyOriginal({ snapshot: after });
  assert.deepEqual(after, snapshot); assert.deepEqual(bytes(storageRoot), sdkBefore);
  const rows = records(home);
  for (const table of ["memory_prefs", "memory_owners", "memory_signal_events"]) assert.deepEqual(rows[table], before[table]);
  assert.deepEqual(rows.memory_revisions, before.memory_revisions!.filter(row => row.memory_id === "later-memory"));
  assert.deepEqual(rows.memory_candidates, before.memory_candidates!.filter(row => row.candidate_id === "later-candidate"));
  assert.deepEqual(rows.memory_changes!.find(row => row.memory_id === "later-memory"), before.memory_changes!.find(row => row.memory_id === "later-memory"));
  const original = createMemoryLedgerSelectedRetention({ ...inputPlan, mode: "original" });
  assert.throws(() => original.forget({ snapshot: after, memory_id: memory.ref.id }), denied); original.verifyOriginal({ snapshot: after });
  const reader = await openPrologueMemoryAdoptionInspection(input);
  try {
    assert.equal((await reader.inspectMemory({ ref: later.ref, identity })).state, "present");
    for (const item of [memory, candidate]) assert.deepEqual(await reader.inspectMemory({ ref: item.ref, identity }), { state: "cleared" });
  } finally { await reader.close(); }
});

test("MEM-40-SELECTED-07: missing present versions, mixed cleared versions and unknown states reject without writes", t => {
  const home = homeFor(t), snapshot = ledger(home, "memory", "candidate"), before = records(home);
  for (const entries of ["memories", "candidates"] as const) for (const shape of [{}, { state: "present" }, { state: "cleared", version: 1 },
    { state: "cleared", version: undefined }, { state: "other" }, { version: 1, state: undefined }]) {
    const choice = plan("memory", "candidate"), key = entries === "memories" ? "memory_id" : "candidate_id";
    const scope = { ...choice.scopes[0]!, [entries]: [{ [key]: entries === "memories" ? "memory" : "candidate", ...shape }] };
    assert.throws(() => createMemoryLedgerSelectedRetention({ homeDirectory: home, plan: { ...choice, scopes: [scope] } as never, mode: "cleanup", assertCurrent() {} }), denied);
  }
  assert.deepEqual(records(home), before); assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: home }), snapshot);
});

test("MEM-40-SELECTED-07: Project rejects either cleared branch at runtime while its original versioned plan remains valid", t => {
  const home = homeFor(t); ledger(home, "memory", "candidate"); const before = records(home);
  for (const entries of ["memories", "candidates"] as const) {
    const choice = { project_id: "project", actor_id: "person", operation_id: "project-original", scopes: [{ ...identity,
      memories: [{ memory_id: "memory", version: 1 }], candidates: [{ candidate_id: "candidate", version: 1 }], sources: [] }] };
    const scope = { ...choice.scopes[0]!, [entries]: plan("memory", "candidate").scopes[0]![entries] };
    assert.throws(() => createMemoryLedgerProjectRetention({ homeDirectory: home, plan: { ...choice, scopes: [scope] } as never, mode: "cleanup", assertCurrent() {} }), denied);
    assert.ok(createMemoryLedgerProjectRetention({ homeDirectory: home, plan: choice, mode: "cleanup", assertCurrent() {} }));
  }
  assert.deepEqual(records(home), before);
});
