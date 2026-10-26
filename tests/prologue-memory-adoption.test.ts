import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { adoptMemoryHome, memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { createPrologueNodeAdapter, openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { homeSqlitePath, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { MemoryService, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { currentMemoryOptions } from "./fixtures/current-memory.ts";

// Historical row fixtures enter through the SDK's public storage owner, never its private decoder or OS format.
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const scope = { scope: "user", owner: LOCAL_PERSON_ACTOR_ID } as const;
const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", current_scene: "coding", purpose: "management", person: true } as const;
const options = currentMemoryOptions({ appId: app.appId, scopesFor: () => [scope] });
const original = { id: "old.formal", ...scope, version: 4, text: "Use one publication checklist.", origin: "person-statement", tags: ["retained"],
  tombstoned: false, meta: { kind: "convention", source: "said", basis: "explicit", evidence: [{ kind: "quote", text: "Use one publication checklist." }] },
  createdAtMs: 100, updatedAtMs: 200 };
const candidate = { id: "old.candidate", ...scope, text: "Keep the approved publication order.", origin: "extraction", tags: [],
  meta: { kind: "convention", source: "extraction" }, state: "accepted", createdAtMs: 100, settledAtMs: 200,
  entryId: original.id, decision: { input: "old-completed-decision" } };

function scratch(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-sdk-offline-adoption-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  t.mock.method(globalThis, "fetch", async () => { assert.fail("offline adoption must not send network requests"); });
  return { home, storageRoot: join(home, "agent-runtime") };
}
function ledger(home: string) {
  mkdirSync(join(home, MEMORY_LEDGER_STORE), { recursive: true });
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try {
    db.exec(MEMORY_LEDGER_BASELINE.schema); db.exec("PRAGMA user_version=3");
    const prefs = { form: true, auto: false, learn_from_work: true, learn_from_ui: false,
      consumers: { assistant: true, agent: true, ui: false, plugin: true, mcp: false }, plugins: {} };
    for (const key of ["personal", "project-default"]) db.prepare("INSERT INTO memory_prefs VALUES (?,?,?)").run(LOCAL_PERSON_ACTOR_ID, key, JSON.stringify(prefs));
    db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", "before", JSON.stringify({ origin: "existing-home" }));
    db.prepare("INSERT INTO memory_revisions VALUES (?,?,?)").run(original.id, 3, JSON.stringify({ text: "Earlier person wording" }));
    db.prepare("INSERT INTO memory_changes VALUES (?,?,?,?,?)").run("retained-change", LOCAL_PERSON_ACTOR_ID, original.id, "before", JSON.stringify({ operation: "update", version: 4 }));
    db.prepare("INSERT INTO memory_pairs VALUES (?,?,?,?)").run("retained-pair", LOCAL_PERSON_ACTOR_ID, "open", JSON.stringify({ a: original.id, b: "other" }));
  } finally { db.close(); }
}
function ledgerState(home: string) {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try { return { version: Number(db.prepare("PRAGMA user_version").get()!.user_version),
    marker: JSON.parse(String(db.prepare("SELECT body FROM memory_markers WHERE key='strategy-adoption'").get()!.body)),
    revisions: db.prepare("SELECT * FROM memory_revisions").all(), changes: db.prepare("SELECT * FROM memory_changes").all(),
    pairs: db.prepare("SELECT * FROM memory_pairs").all(), prefs: db.prepare("SELECT * FROM memory_prefs ORDER BY key").all() };
  } finally { db.close(); }
}
async function seed(storageRoot: string, rows: readonly { kind: "memories" | "memory-candidates"; shape: number; value: Record<string, unknown> }[]) {
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }) });
  try {
    for (const row of rows) {
      const owner = `${row.value.scope}-${encodeURIComponent(String(row.value.owner)).replaceAll("%", "_")}`;
      await runtime.store.commit({ kind: row.kind, id: `owner.${owner}.${row.value.id}.v1`, expectedVersion: 0,
        metadata: { scope: `owner.${owner}`, rowId: row.value.id, version: 1, state: "active", shape: row.shape },
        secureBody: new TextEncoder().encode(JSON.stringify(row.value)) });
    }
  } finally { await runtime.shutdown(); }
}
const open = (storageRoot: string, signal?: AbortSignal) => openPrologueMemoryAdoption({ storageRoot, appVersion: app.appVersion,
  scopes: [scope], policy: { ...options.policy, taxonomy: { ...options.policy.taxonomy!, scenes: { values: [{ id: "common", label: "Common" }] } } }, ...(signal ? { signal } : {}) });

// This is the default LocalHost -> real AgentHost bridge -> SDK/Node path, not an injected adoption result.
test("offline Home adoption preserves SDK identities and real ledger history, then releases the owner for a new Runtime", async t => {
  const f = scratch(t); ledger(f.home); const before = ledgerState(f.home);
  await seed(f.storageRoot, [{ kind: "memories", shape: 2, value: original }, { kind: "memory-candidates", shape: 1, value: candidate }]);
  const result = await adoptMemoryHome({ homeDirectory: f.home });
  assert.equal(result.outcome, "completed"); assert.equal(result.items.adopted, 2); assert.equal(result.verification, "complete");
  const after = ledgerState(f.home); assert.equal(after.version, 4); assert.deepEqual(after.marker, before.marker);
  assert.deepEqual(after.revisions, before.revisions); assert.deepEqual(after.changes, before.changes); assert.deepEqual(after.pairs, before.pairs);
  assert.ok(after.prefs.every(row => { const prefs = JSON.parse(String(row.body)); return prefs.enabled && prefs.task_recall && prefs.auto === false && prefs.consumers.ui === false; }));
  const adapter = await createPrologueNodeAdapter({ app, storageRoot: f.storageRoot, memory: options,
    modelConfiguration: async () => { assert.fail("maintenance must not resolve a model"); } });
  try {
    const memory = adapter.memory!.withCaller(caller);
    const entries = await memory.list(scope.scope, scope.owner);
    assert.equal(entries.length, 1); assert.equal(entries[0]!.memory_id, original.id); assert.equal(entries[0]!.version, 4);
    assert.equal(entries[0]!.text, original.text); assert.equal(entries[0]!.meta?.classification, undefined);
    const candidates = await memory.candidates.list(scope.scope, scope.owner);
    assert.equal(candidates.length, 1); assert.equal(candidates[0]!.candidate_id, candidate.id); assert.equal(candidates[0]!.version, 1);
    assert.equal(candidates[0]!.state, "accepted"); assert.equal(candidates[0]!.memory_id, original.id);
  } finally { await adapter.close(); }
});

// MEM-19/26: the adopted body stays unclassified; the production policy owns its explicit opt-in.
test("production task reads retain adopted unclassified memory without losing current scope, expiry or off gates", async t => {
  const f = scratch(t); ledger(f.home);
  await seed(f.storageRoot, [original,
    { ...original, id: "old.expired", meta: { ...original.meta, expiresAtMs: 500 } },
    { ...original, id: "old.private", meta: { ...original.meta, namespace: "io.example.other" } },
  ].map(value => ({ kind: "memories" as const, shape: 2, value })));
  assert.equal((await adoptMemoryHome({ homeDirectory: f.home })).outcome, "completed");
  const records = openMemoryLedger({ homeDirectory: f.home });
  let service!: MemoryService;
  const policy = memoryRuntimePolicy(() => ({ alive: () => true, prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
    owners: project => records.owners(project), candidateOwners: project => records.candidateOwners(project),
    projectExists: async () => false, deletingProject: () => undefined }));
  const openRuntime = () => createPrologueNodeAdapter({ app, storageRoot: f.storageRoot,
    memory: { ...policy, promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
      decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
        record: (caller, request) => service.promotion.undo.record(caller, request) } } },
    modelConfiguration: async () => { assert.fail("adopted reads do not use a model"); } });
  let adapter = await openRuntime();
  service = new MemoryService({ ledger: records, backend: prologueMemoryBackend(async () => adapter.memory!) });
  const reader = { ...caller, person: false, consumer: "agent", current_scene: "common", purpose: "task" } as const;
  const query = { ...scope, text: "publication checklist" };
  try {
    for (let pass = 0; pass < 2; pass++) {
      const hits = await adapter.memory!.withCaller(reader).recall(query);
      assert.deepEqual(hits.map(hit => hit.entry.memory_id), [original.id]);
      assert.equal(hits[0]!.entry.version, original.version); assert.deepEqual(hits[0]!.entry.meta, original.meta);
      assert.equal(hits[0]!.entry.text, original.text); assert.equal(hits[0]!.entry.meta.classification, undefined);
      await assert.rejects(adapter.memory!.withCaller({ ...reader, actor_id: "foreign" }).recall(query), { code: "MEMORY_SCOPE_DENIED" });
      if (pass === 0) { await adapter.close(); adapter = await openRuntime(); }
    }
    service.savePrefs({ ...caller, current_scene: "common" }, "personal", "off");
    await assert.rejects(adapter.memory!.withCaller(reader).recall(query), { code: "MEMORY_SCOPE_DENIED" });
    assert.equal((await adapter.memory!.withCaller({ ...caller, current_scene: "common" }).list(scope.scope, scope.owner)).length, 3);
  } finally { await adapter.close(); records.close(); }
});

test("an unresolved old reservation blocks real Home completion without rewriting its ledger history", async t => {
  const f = scratch(t); ledger(f.home); const before = ledgerState(f.home);
  const { settledAtMs: _settled, entryId: _entry, ...pending } = candidate;
  await seed(f.storageRoot, [{ kind: "memory-candidates", shape: 1, value: { ...pending, state: "pending" } }]);
  const first = await adoptMemoryHome({ homeDirectory: f.home });
  assert.equal(first.outcome, "incomplete"); assert.equal(first.items["needs-reconcile"], 1);
  const second = await adoptMemoryHome({ homeDirectory: f.home });
  assert.equal(second.outcome, "incomplete"); assert.equal(second.items["needs-reconcile"], 1);
  const after = ledgerState(f.home); assert.equal(after.version, 3); assert.equal(after.marker.origin, "adopting");
  assert.deepEqual(after.revisions, before.revisions); assert.deepEqual(after.prefs, before.prefs);
});

test("whole-App verification catches an owner absent from the App inventory without adopting or disclosing it", async t => {
  const f = scratch(t); ledger(f.home);
  await seed(f.storageRoot, [{ kind: "memories", shape: 2, value: { ...original, scope: "project", owner: "unrecorded-project" } }]);
  const result = await adoptMemoryHome({ homeDirectory: f.home });
  assert.equal(result.outcome, "incomplete"); assert.equal(result.verification, "needs-reconcile");
  assert.equal(result.items.adopted, 0); assert.equal(JSON.stringify(result).includes("unrecorded-project"), false);
  assert.equal(ledgerState(f.home).version, 3); assert.equal(ledgerState(f.home).marker.origin, "adopting");
});

test("a malformed row issue blocks completion after a valid row has been adopted", async t => {
  const f = scratch(t); ledger(f.home);
  await seed(f.storageRoot, [{ kind: "memories", shape: 2, value: original },
    { kind: "memories", shape: 99, value: { ...original, id: "unsupported" } }]);
  const result = await adoptMemoryHome({ homeDirectory: f.home });
  assert.equal(result.outcome, "incomplete"); assert.equal(result.items.adopted, 1);
  assert.equal(ledgerState(f.home).version, 3); assert.equal(ledgerState(f.home).marker.origin, "adopting");
});

test("offline bridge shares the normal writer lock, restricts scope grants, and closes before another owner can continue", async t => {
  const f = scratch(t); ledger(f.home);
  const normal = () => createPrologueNodeAdapter({ app, storageRoot: f.storageRoot, modelConfiguration: async () => { assert.fail("no model"); } });
  const active = await normal();
  try { await assert.rejects(adoptMemoryHome({ homeDirectory: f.home }), { code: "agent.storage_busy" }); }
  finally { await active.close(); }
  assert.equal(ledgerState(f.home).marker.origin, "existing-home");
  const bridge = await open(f.storageRoot);
  try {
    await assert.rejects(normal(), { code: "agent.storage_busy" });
    await assert.rejects(open(f.storageRoot), { code: "agent.storage_busy" });
    await assert.rejects(bridge.adopt({ kind: "memory", scope: "project", owner: "foreign" }));
    await assert.rejects(bridge.verify({ scopes: [{ scope: "project", owner: "foreign" }] }));
  } finally { await bridge.close(); }
  await bridge.close(); await assert.rejects(bridge.adopt({ ...scope, kind: "memory" }));
  const next = await normal(); await next.close();
});

test("a cancelled page does not convert its rows and the closed bridge releases the writer for an explicit retry", async t => {
  const f = scratch(t);
  await seed(f.storageRoot, [{ kind: "memories", shape: 2, value: original }]);
  const bridge = await open(f.storageRoot), controller = new AbortController(); controller.abort();
  try { await assert.rejects(bridge.adopt({ ...scope, kind: "memory", signal: controller.signal })); }
  finally { await bridge.close(); }
  const next = await open(f.storageRoot);
  try {
    const page = await next.adopt({ ...scope, kind: "memory" });
    assert.equal(page.items[0]!.outcome, "adopted"); assert.equal(page.items[0]!.fromShape, 2);
    assert.equal((await next.verify({ scopes: [scope] })).outcome, "complete");
  } finally { await next.close(); }
});
