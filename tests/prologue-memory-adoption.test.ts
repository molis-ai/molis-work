import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { adoptMemoryHome, previewMemoryHomeAdoptionCleanup, type MemoryHomeAdoptionInput, memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { createPrologueNodeAdapter, openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { homeSqlitePath, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, openMemoryLedger, type MemoryLedgerCleanupTarget } from "@molis-ai/molis-work-storage";
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
  // MEM-CLASS-03: the temporary ledger-4/eight-field Home is reverified by the real SDK before publication.
  const records = openMemoryLedger({ homeDirectory: f.home });
  for (const row of after.prefs) {
    const { class_restrictions: _restrictions, ...eight } = JSON.parse(String(row.body));
    records.savePrefs(String(row.actor_id), String(row.key), eight);
  }
  records.close();
  const reverified = await adoptMemoryHome({ homeDirectory: f.home });
  assert.equal(reverified.outcome, "completed"); assert.equal(reverified.verification, "complete");
  assert.equal(reverified.items.adopted, 0); assert.equal(reverified.items.current, 2);
  assert.deepEqual(ledgerState(f.home), after);
  const current = openMemoryLedger({ homeDirectory: f.home });
  for (const row of after.prefs) current.savePrefs(String(row.actor_id), String(row.key), { ...JSON.parse(String(row.body)),
    class_restrictions: [{ selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "off", form: "off" }] });
  current.close();
  const restricted = ledgerState(f.home);
  assert.equal((await adoptMemoryHome({ homeDirectory: f.home })).outcome, "completed");
  assert.deepEqual(ledgerState(f.home), restricted, "real SDK verification cannot clear already adopted restriction rules");
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

const missingRef = { kind: "session", id: "missing-cleanup-session", revision: 1 } as const;
const endedFormal = (id = "orphan.formal", sessionRef = missingRef) => ({ ...original, id, meta: { ...original.meta, sessionRef } });
const endedCandidate = (id = "orphan.candidate", sessionRef = missingRef) => ({ ...candidate, id, meta: { ...candidate.meta, sessionRef } });
async function cleanupPages(home: string) {
  const targets: MemoryLedgerCleanupTarget[] = [], issues: { code: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await previewMemoryHomeAdoptionCleanup({ homeDirectory: home, ...(cursor === undefined ? {} : { cursor }) });
    targets.push(...page.targets); issues.push(...page.issues); cursor = page.cursor;
    if (page.exhausted) assert.equal(cursor, undefined);
  } while (cursor !== undefined);
  return { targets, issues };
}
async function storedBodies(storageRoot: string) {
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }) });
  try {
    const result: { kind: string; id: string; body: string | null }[] = [];
    for (const kind of ["memories", "memory-candidates"]) for (const row of (await runtime.store.list({ kind })).records) {
      let body: string | null = null;
      try { body = new TextDecoder().decode(await runtime.store.readSecure({ kind, id: row.id })); }
      catch (error) { if (!row.tombstoned) throw error; }
      result.push({ kind, id: row.id, body });
    }
    return result;
  } finally { await runtime.shutdown(); }
}

for (const state of ["missing", "purged"] as const) test(`real offline cleanup discovers unregistered ${state} formal/candidate, keeps active/archived and completes only selected deletion`, async t => {
  const f = scratch(t); ledger(f.home);
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot: f.storageRoot }) });
  let ended = missingRef, active = missingRef, archived = missingRef;
  try {
    const activeSession = await runtime.sessions.create(), archivedSession = await runtime.sessions.create();
    active = activeSession.ref; archived = archivedSession.ref; await archivedSession.archive();
    if (state === "purged") { const session = await runtime.sessions.create(); ended = session.ref; await session.purge(await session.previewPurge()); }
  } finally { await runtime.shutdown(); }
  await seed(f.storageRoot, [
    { kind: "memories", shape: 2, value: endedFormal("orphan.formal", ended) },
    { kind: "memory-candidates", shape: 1, value: endedCandidate("orphan.candidate", ended) },
    { kind: "memories", shape: 2, value: endedFormal("active.formal", active) },
    { kind: "memories", shape: 2, value: endedFormal("archived.formal", archived) },
    { kind: "memories", shape: 2, value: { ...original, id: "lasting.formal" } },
  ]);
  const before = await storedBodies(f.storageRoot), beforeLedger = ledgerState(f.home), preview = await cleanupPages(f.home);
  assert.deepEqual(preview.targets.map(target => target.ref.id).sort(), ["orphan.candidate", "orphan.formal"]);
  assert.ok(preview.targets.every(target => target.reason === `session-${state}` && target.sources.length === 0));
  assert.deepEqual(preview.issues, []); assert.doesNotMatch(JSON.stringify(preview), /Use one publication|approved publication|evidence|decision/);
  assert.deepEqual(await storedBodies(f.storageRoot), before); assert.deepEqual(ledgerState(f.home), beforeLedger);
  const result = await adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "confirm", operation_id: `cleanup-${state}`, targets: preview.targets } });
  assert.equal(result.outcome, "completed"); assert.equal(result.verification, "complete");
  assert.deepEqual(result.cleanup?.map(item => item.outcome), ["completed", "completed"]); assert.equal(ledgerState(f.home).version, 4);
  const after = await storedBodies(f.storageRoot);
  assert.ok(after.filter(row => /orphan\./.test(row.id)).every(row => row.body === null));
  for (const id of ["active.formal", "archived.formal", "lasting.formal"]) {
    const body = JSON.parse(after.find(row => row.id.includes(id))!.body!);
    assert.equal(body.text, original.text); assert.equal(body.version, original.version);
  }
  const reopened = await adoptMemoryHome({ homeDirectory: f.home }); assert.equal(reopened.outcome, "completed");
  assert.deepEqual(await cleanupPages(f.home), { targets: [], issues: [] });
});

test("real cleanup isolates malformed/reserved and unknown-owner objects and refuses whole-App completion", async t => {
  const f = scratch(t); ledger(f.home);
  const { settledAtMs: _settled, entryId: _entry, ...pending } = endedCandidate("reservation");
  await seed(f.storageRoot, [
    { kind: "memories", shape: 2, value: endedFormal() },
    { kind: "memories", shape: 99, value: endedFormal("bad-shape") },
    { kind: "memories", shape: 2, value: { ...endedFormal("private-orphan"), scope: "project", owner: "unknown-private-owner" } },
    { kind: "memory-candidates", shape: 1, value: { ...pending, state: "pending" } },
  ]);
  const preview = await cleanupPages(f.home);
  assert.deepEqual(preview.targets.map(target => target.ref.id), ["orphan.formal"]);
  assert.ok(preview.issues.length >= 2); assert.doesNotMatch(JSON.stringify(preview), /unknown-private-owner|private-orphan|old-completed-decision/);
  const before = await storedBodies(f.storageRoot);
  const selected = before.find(row => row.kind === "memories" && JSON.parse(row.body!).id === "orphan.formal")!.id;
  // Selected cleanup finishes, but adoption cannot manage-read the unresolved reservation's missing Session.
  await assert.rejects(adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "confirm", operation_id: "known-only", targets: preview.targets } }), { code: "MEMORY_SCOPE_DENIED" });
  const after = await storedBodies(f.storageRoot);
  assert.equal(after.find(row => row.id === selected)?.body ?? null, null);
  assert.deepEqual(after.filter(row => row.id !== selected), before.filter(row => row.id !== selected), "unselected malformed, reserved and foreign-owner objects remain intact");
  assert.equal(ledgerState(f.home).version, 3); assert.equal(ledgerState(f.home).marker.origin, "adopting");
  await assert.rejects(adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "resume", operation_id: "known-only" } }), { code: "MEMORY_SCOPE_DENIED" });
  assert.deepEqual(await storedBodies(f.storageRoot), after);
  assert.equal(ledgerState(f.home).version, 3); assert.equal(ledgerState(f.home).marker.origin, "adopting");
});

for (const failure of ["tombstone-commit", "physical-dispatch", "physical-receipt", "ledger-commit"] as const) test(`real SDK/SQLite cleanup resumes original decision after ${failure} failure`, async t => {
  const f = scratch(t); ledger(f.home);
  await seed(f.storageRoot, [{ kind: "memories", shape: 2, value: endedFormal(original.id) }, { kind: "memory-candidates", shape: 1, value: endedCandidate() }]);
  const targets = (await cleanupPages(f.home)).targets;
  let injected = false;
  // The real public Node Host is only wrapped at its fault boundary; no fake decoder, state machine or purge result.
  const failingOpen: NonNullable<MemoryHomeAdoptionInput["open"]> = async input => {
    const host = createNodeHost({ storageRoot: f.storageRoot, exclusiveOwner: true });
    const commit = host.storage.commit.bind(host.storage);
    host.storage.commit = async (request: { kind: string }) => {
      if (failure === "tombstone-commit" && !injected && request.kind.endsWith("~memories")) { injected = true; throw new Error("tombstone commit failed"); }
      return commit(request);
    };
    // Memory retains its body-free identity: registry purge erases the body via Host.remove, not Host.purge.
    const remove = host.storage.remove.bind(host.storage);
    host.storage.remove = async (request: { kind: string }) => {
      if (failure === "physical-dispatch" && !injected && request.kind.endsWith("~memories")) { injected = true; throw new Error("physical purge interrupted after tombstone"); }
      return remove(request);
    };
    const runtime = await createRuntime({ app, host, config: { memory: { ...memoryRuntimePolicy(() => undefined).policy, preset: "manual",
      matrix: { default: { actions: ["manage-read", "delete"], formation: [] } } } }, memoryAuthority: {
      authorize: async () => true, assertCurrent: input.assertCurrent, authorizeManagement: async () => ({ allowed: true }), authorizeAdoption: async () => true,
    } });
    const bound = runtime.bindMemory({ consumer: "memory-maintenance", currentScene: "common", purpose: "management" });
    return {
      adopt: request => bound.adoptStorage({ ...request, classify: () => undefined }), verify: request => bound.verifyAdoption(request),
      previewCleanup: request => bound.previewAdoptionCleanup(request),
      purgeCleanupTarget: async request => {
        const options = { expectedVersion: request.target.expectedVersion, operationId: request.operation_id, identity: request.target.identity, signal: request.signal };
        if (request.target.ref.kind === "memory") await bound.memory.purge(request.target.ref, options);
        else await bound.candidates.purge(request.target.ref, options);
        if (failure === "physical-receipt" && !injected) { injected = true; throw new Error("physical delete receipt lost"); }
      }, close: () => runtime.shutdown(),
    };
  };
  const originalExec = DatabaseSync.prototype.exec;
  const mock = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (failure === "ledger-commit" && !injected && sql === "COMMIT"
      && this.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_markers'").get() && this.prepare("SELECT 1 FROM memory_markers WHERE key=?").get(`memory-forgotten:${original.id}`)) {
      injected = true; throw new Error("ledger cleanup commit failed");
    }
    return originalExec.call(this, sql);
  });
  const first = await adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "confirm", operation_id: failure, targets }, open: failingOpen });
  mock.mock.restore();
  assert.equal(injected, true); assert.equal(first.outcome, "incomplete"); assert.equal(first.cleanup?.[0]!.outcome, "unknown");
  assert.equal(first.cleanup?.[1]!.outcome, "not-executed"); assert.equal(ledgerState(f.home).version, 3);
  const result = await adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "resume", operation_id: failure } });
  assert.equal(result.outcome, "completed"); assert.equal(ledgerState(f.home).version, 4);
  assert.equal(ledgerState(f.home).revisions.length, 0); assert.ok((await storedBodies(f.storageRoot)).every(row => row.body === null));
});

test("real preview-version conflict performs zero deletion and leaves the newer body intact", async t => {
  const f = scratch(t); ledger(f.home);
  const value = endedFormal(); await seed(f.storageRoot, [{ kind: "memories", shape: 2, value }]);
  const targets = (await cleanupPages(f.home)).targets;
  const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot: f.storageRoot }) });
  try {
    const row = (await runtime.store.list({ kind: "memories" })).records[0]!;
    await runtime.store.commit({ kind: "memories", id: row.id, expectedVersion: row.version, metadata: row.metadata,
      secureBody: new TextEncoder().encode(JSON.stringify({ ...value, version: value.version + 1, text: "Newer protected body" })) });
  } finally { await runtime.shutdown(); }
  const before = await storedBodies(f.storageRoot);
  await assert.rejects(adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "confirm", operation_id: "stale", targets } }), { code: "memory.conflict" });
  assert.deepEqual(await storedBodies(f.storageRoot), before); assert.equal(ledgerState(f.home).version, 3);
});

test("real selected cleanup suppresses known event replay without deleting an unselected same-source lasting memory", async t => {
  const f = scratch(t); ledger(f.home);
  await seed(f.storageRoot, [{ kind: "memories", shape: 2, value: endedFormal() }, { kind: "memories", shape: 2, value: original }]);
  const source = { event_id: "original-person-event", version: "v1" };
  const db = new DatabaseSync(homeSqlitePath(f.home, MEMORY_LEDGER_STORE));
  try {
    for (const id of ["orphan.formal", original.id]) db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)")
      .run(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${id}`, "before", JSON.stringify({ sources: [source] }));
  } finally { db.close(); }
  const targets = (await cleanupPages(f.home)).targets;
  assert.deepEqual(targets[0]!.sources, [{ actor_id: LOCAL_PERSON_ACTOR_ID, ...source }]);
  assert.equal((await adoptMemoryHome({ homeDirectory: f.home, cleanup: { mode: "confirm", operation_id: "suppress-known", targets } })).outcome, "completed");
  const records = openMemoryLedger({ homeDirectory: f.home });
  const adapter = await createPrologueNodeAdapter({ app, storageRoot: f.storageRoot, memory: options,
    modelConfiguration: async () => assert.fail("cleanup replay checks must not call a model") });
  try {
    const service = new MemoryService({ ledger: records, backend: prologueMemoryBackend(async () => adapter.memory!) });
    assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "personal", scope.owner, [{ ...source, version: "v2" }]), false);
    assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "personal", scope.owner, [{ event_id: "different-source", version: "v1" }]), true);
    const entries = await adapter.memory!.withCaller(caller).list(scope.scope, scope.owner);
    assert.deepEqual(entries.map(entry => entry.memory_id), [original.id]); assert.equal(entries[0]!.text, original.text);
    assert.equal(entries[0]!.version, original.version);
  } finally { await adapter.close(); records.close(); }
});
