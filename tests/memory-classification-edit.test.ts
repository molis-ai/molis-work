import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_FORMAL_KINDS, MEMORY_KINDS, type MemoryChangeRequest, type MemoryFormalKind } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const START = Date.parse("2026-10-23T08:00:00Z"), DAY = 86_400_000;
const caller = (operation_id: string, extra: Partial<MemoryCaller> = {}): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: "project-a", consumer: "ui", person: true, purpose: "management", current_scene: "common", operation_id, ...extra });
const target = (memory_id: string, expected_version: number, kind: MemoryFormalKind = "habit"): MemoryChangeRequest => ({ memory_id,
  expected_version, action: "reclassify", kind, classification: { scenes: ["coding"], lifecycle: "long-term" } });
async function fixture(t: Parameters<typeof memoryServiceHome>[0]) {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"], now: () => new Date(START) });
  return { ...f, service: await f.open() };
}

// MEM-04/08/15/28: the real policy/SDK/Node owner persists each declared formal kind, without widening formation.
test("formal six-kind corrections survive restart and v2 export/import while formation remains four-kind", async t => {
  const f = await fixture(t), memories: string[] = [];
  assert.deepEqual(MEMORY_KINDS, ["preference", "convention", "fact", "experience"]);
  for (const [index, kind] of MEMORY_FORMAL_KINDS.entries()) {
    const saved = (await f.service.write(caller(`seed-${index}`), { scope: "project", text: `Original formal memory ${index}` })).memory!;
    const result = await f.service.change(caller(`correct-${index}`), { ...target(saved.memory_id, saved.version, kind), classification: { scenes: ["coding", "assistant"], lifecycle: "long-term" } });
    assert.equal(result.memory!.kind, kind); assert.equal(result.memory!.version, saved.version + 1); memories.push(saved.memory_id);
  }
  await f.close(); const service = await f.open();
  const page = await service.page(caller("page"), { scope: "project", filter: { scenes: ["coding"] } });
  assert.deepEqual(page.items.map(one => one.kind).sort(), [...MEMORY_FORMAL_KINDS].sort());
  assert.deepEqual((await service.page(caller("old-scene"), { scope: "project", filter: { scenes: ["common"] } })).items, []);
  const pack = await service.exportScope(caller("export"), "project");
  assert.equal(pack.version, 2); assert.deepEqual(pack.entries.map(one => one.kind).sort(), [...MEMORY_FORMAL_KINDS].sort());
  assert.deepEqual(await service.importScope(caller("import", { project_id: "project-b" }), "project", pack), { written: 6, skipped: 0, refused: 0 });
  const task = caller("read-task", { consumer: "assistant", person: false, purpose: "task", current_scene: "assistant" });
  assert.equal((await service.recall(task, { scopes: ["project"] })).items.length, 6);
  assert.deepEqual((await service.recall({ ...task, consumer: "agent", current_scene: "common" }, { scopes: ["project"] })).items, []);
  const coding = await service.recall({ ...task, consumer: "agent", current_scene: "coding", plugin_id: "io.molis.work.coding" }, { scopes: ["project"] });
  assert.deepEqual(coding.items.map(item => item.kind).sort(), ["convention", "preference"], "plugin default reading permission remains narrow");
  await assert.rejects(service.write(caller("not-new-kind"), { scope: "project", text: "Cannot form a habit", kind: "habit" as never }));
  assert.equal((await service.page(caller("unchanged"), { scope: "project" })).items.length, memories.length);
});

// MEM-17/28/29: a metadata-only correction keeps canonical provenance and real disabled/paused state.
test("pure correction uses setMeta; a combined text correction uses one update and retains canonical metadata", async t => {
  const f = await fixture(t), raw = f.raw(caller("raw"));
  let metadataCalls = 0, updateCalls = 0;
  const service = new MemoryService({ ledger: f.ledger(), now: () => new Date(START), backend: observeMemoryBackend(raw, bound => ({ ...bound,
    setMeta: async input => { metadataCalls++; return bound.setMeta(input); }, update: async input => { updateCalls++; return bound.update(input); } })) });
  const original = await raw.write({ scope: "project", owner: "project-a", operation_id: "canonical", text: "Original body", origin: "Known origin",
    meta: { kind: "convention", source: "auto", basis: "repeated", evidence: [{ kind: "observation", text: "Bounded evidence" }], namespace: "example.plugin",
      classification: { scenes: ["common"], lifecycle: "short-term" }, expires_at_ms: START + 10 * DAY } });
  const disabled = await raw.disable({ scope: "project", owner: "project-a", memory_id: original.memory_id, expected_version: original.version, operation_id: "disable", reason: "Person disabled" });
  const request = target(original.memory_id, disabled.version);
  const corrected = await service.change(caller("pure"), request);
  assert.equal(metadataCalls, 1); assert.equal(updateCalls, 0); assert.equal(corrected.memory!.state, "disabled");
  let stored = (await raw.list("project", "project-a"))[0]!;
  assert.equal(stored.text, original.text); assert.equal(stored.origin, original.origin); assert.deepEqual(stored.disabled, disabled.disabled);
  assert.deepEqual(stored.meta, { ...original.meta, kind: "habit", classification: { scenes: ["coding"], lifecycle: "long-term" } });
  const changed = await service.change(caller("combined"), { ...target(stored.memory_id, stored.version, "project-decision"), text: "Corrected body", applies: { task: "Release work" } });
  assert.equal(metadataCalls, 1); assert.equal(updateCalls, 1); assert.equal(changed.memory!.version, stored.version + 1);
  stored = (await raw.list("project", "project-a"))[0]!; assert.equal(stored.text, "Corrected body"); assert.equal(stored.meta.applies_when?.task, "Release work"); assert.deepEqual(stored.disabled, disabled.disabled);
  const history = await service.history(caller("history"), stored.memory_id);
  assert.deepEqual(history.revisions.map(one => [one.kind, one.classification?.scenes, one.expires_at, one.snapshot_available]), [
    ["habit", ["coding"], new Date(START + 10 * DAY).toISOString(), true], ["project-decision", ["coding"], new Date(START + 10 * DAY).toISOString(), true] ]);
  assert.equal(JSON.stringify(history).includes("example.plugin"), false); assert.equal("snapshot" in history.revisions[0]!, false);
  const restored = await service.change(caller("restore"), { action: "restore", memory_id: stored.memory_id, expected_version: stored.version, version: corrected.memory!.version });
  assert.equal(restored.memory!.kind, "habit"); assert.equal(restored.memory!.text, original.text); assert.equal(restored.memory!.state, "disabled");
});

test("expiry is preserved, explicitly changed or removed; invalid and already-expired corrections have no version/history effect", async t => {
  const f = await fixture(t);
  const saved = (await f.service.write(caller("seed"), { scope: "project", text: "Deadline choice", expires_at: new Date(START + DAY).toISOString() })).memory!;
  let current = (await f.service.change(caller("keep"), target(saved.memory_id, saved.version))).memory!;
  assert.equal(current.expires_at, saved.expires_at);
  current = (await f.service.change(caller("set"), { ...target(current.memory_id, current.version), expires_at: new Date(START + 2 * DAY).toISOString(),
    classification: { scenes: ["assistant"], lifecycle: "short-term" } })).memory!;
  assert.equal(current.expires_at, new Date(START + 2 * DAY).toISOString());
  current = (await f.service.change(caller("remove"), { ...target(current.memory_id, current.version), expires_at: null })).memory!;
  assert.equal(current.expires_at, null);
  const before = await f.raw().list("project", "project-a"), history = await f.service.history(caller("before"), current.memory_id);
  for (const request of [ { ...target(current.memory_id, current.version), classification: { scenes: ["common"], lifecycle: "short-term" } },
    { ...target(current.memory_id, current.version), expires_at: "not-a-date" }, { ...target(current.memory_id, current.version), expires_at: new Date(START).toISOString() },
    { ...target(current.memory_id, current.version), kind: undefined }, { ...target(current.memory_id, current.version), classification: { scenes: ["unannounced"], lifecycle: "long-term" } } ])
    await assert.rejects(f.service.change(caller(crypto.randomUUID()), request as MemoryChangeRequest), { code: "memory.invalid" });
  assert.deepEqual(await f.raw().list("project", "project-a"), before); assert.deepEqual(await f.service.history(caller("after"), current.memory_id), history);
  t.mock.method(Date, "now", () => START + 3 * DAY);
  const expired = new MemoryService({ ledger: f.ledger(), backend: f.raw(), now: () => new Date(START + 3 * DAY) });
  // The previous still-live historical snapshot cannot be restored as an implicit renewal.
  await assert.rejects(expired.change(caller("expired-history"), { action: "restore", memory_id: current.memory_id, expected_version: current.version, version: saved.version }));
  assert.deepEqual(await expired.history(caller("same-history"), current.memory_id), history, "snapshot availability does not change with the clock");
});

// MEM-17/34: concurrent writes share the observed CAS; failed validation never authorizes a new version on retry.
test("one version permits one concurrent correction; original operations replay once and cannot change target", async t => {
  const f = await fixture(t), saved = (await f.service.write(caller("seed"), { scope: "project", text: "Concurrent choice" })).memory!;
  const request = target(saved.memory_id, saved.version), same = caller("winner");
  const outcomes = await Promise.allSettled([f.service.change(same, request), f.service.change(caller("competitor"), { ...request, kind: "project-decision" })]);
  assert.equal(outcomes.filter(one => one.status === "fulfilled").length, 1);
  const index = outcomes.findIndex(one => one.status === "fulfilled"), winner = index === 0 ? same : caller("competitor"), original = index === 0 ? request : { ...request, kind: "project-decision" as const };
  const replay = await f.service.change(winner, original); assert.equal(replay.memory!.version, saved.version + 1);
  assert.equal((await f.service.history(caller("history"), saved.memory_id)).revisions.length, 2);
  await assert.rejects(f.service.change(winner, { ...original, kind: "fact" }));
  const invalid = caller("initially-invalid"), fixed = target(saved.memory_id, replay.memory!.version);
  await assert.rejects(f.service.change(invalid, { ...fixed, classification: undefined }));
  const later = await f.service.change(caller("later"), { ...fixed, kind: "experience" });
  await assert.rejects(f.service.change(invalid, fixed));
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, later.memory!.version);
});

test("SDK commit plus ledger failure repairs one history after restart, but later edits and deletion cannot be overwritten", async t => {
  const f = await fixture(t), saved = (await f.service.write(caller("seed"), { scope: "project", text: "Crash recovery" })).memory!;
  const request = target(saved.memory_id, saved.version), who = caller("recover");
  const fail = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.change(who, request), /ledger interrupted/);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, saved.version + 1);
  fail.mock.restore(); await f.close(); let service = await f.open();
  const recovered = await service.change(who, request); assert.equal(recovered.memory!.version, saved.version + 1);
  assert.equal((await service.history(caller("history"), saved.memory_id)).revisions.length, 2);
  const later = await service.change(caller("later"), { ...target(saved.memory_id, recovered.memory!.version), text: "Person's later body" });
  await assert.rejects(service.change(who, request));
  assert.equal((await f.raw().list("project", "project-a"))[0]!.text, "Person's later body");
  await service.change(caller("remove"), { action: "remove", memory_id: saved.memory_id, expected_version: later.memory!.version });
  await f.close(); service = await f.open(); await assert.rejects(service.change(who, request));
  assert.deepEqual(await f.raw().list("project", "project-a"), []); assert.deepEqual(f.ledger().revisions(saved.memory_id), []);
});

// MEM-15/28: offline-adopted, unclassified records retain unknown provenance; no synthetic original classification.
test("an old unclassified formal record is explicitly corrected and a missing/unknown historical snapshot is never offered for restore", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) });
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: join(f.home, "sdk") }) });
  try { await runtime.store.commit({ kind: "memories", id: "owner.project-project-a.historical.v1", expectedVersion: 0,
    metadata: { scope: "owner.project-project-a", rowId: "historical", version: 1, state: "active", shape: 2 },
    secureBody: new TextEncoder().encode(JSON.stringify({ id: "historical", scope: "project", owner: "project-a", version: 1, text: "Historical rule",
      origin: "Imported record", tags: [], tombstoned: false, meta: { kind: "convention", source: "manual" }, createdAtMs: 100, updatedAtMs: 100 })) }); }
  finally { await runtime.shutdown(); }
  const maintenance = await openPrologueMemoryAdoption({ appVersion: "1.0.0", storageRoot: join(f.home, "sdk"), scopes: [{ scope: "project", owner: "project-a" }], policy: memoryRuntimePolicy(() => undefined).policy });
  try { assert.equal((await maintenance.adopt({ kind: "memory", scope: "project", owner: "project-a" })).outcome, "completed"); } finally { await maintenance.close(); }
  const service = await f.open(), before = (await service.page(caller("before"), { scope: "project", filter: { unclassified: true } })).items[0]!;
  assert.equal(before.classification, null); assert.equal(before.basis, null);
  f.ledger().addRevision(before.memory_id, { version: 1, text: before.text, kind: "convention", applies: {}, change: "created", by: "maintenance", at: new Date(100).toISOString() });
  const result = await service.change(caller("correct"), target(before.memory_id, before.version));
  assert.equal(result.memory!.basis, null); assert.equal(result.memory!.approved_by, null);
  const history = await service.history(caller("history"), before.memory_id);
  assert.equal(history.revisions[0]!.snapshot_available, false); assert.equal(history.revisions[0]!.classification, null);
  assert.equal(history.revisions[1]!.snapshot_available, true);
  await assert.rejects(service.change(caller("no-invention"), { memory_id: before.memory_id, action: "restore", expected_version: result.memory!.version, version: 1 }), { code: "memory.invalid" });
  assert.deepEqual((await service.page(caller("after"), { scope: "project", filter: { unclassified: true } })).items, []);
});

// MEM-04/15/34: deferred renewal and Session management are explicit refusals, never new refs or cleared constraints.
test("expired and Session-bound targets refuse correction without changing canonical versions or history", async t => {
  const f = await fixture(t), expires = new Date(START + DAY).toISOString();
  const saved = (await f.service.write(caller("expiring"), { scope: "project", text: "Expiring original", expires_at: expires })).memory!;
  t.mock.method(Date, "now", () => START + 2 * DAY);
  const expired = new MemoryService({ ledger: f.ledger(), backend: f.raw(), now: () => new Date(START + 2 * DAY) });
  const before = await f.raw().list("project", "project-a"), history = await expired.history(caller("before"), saved.memory_id);
  for (const deadline of [null, new Date(START + 3 * DAY).toISOString()]) await assert.rejects(expired.change(caller(crypto.randomUUID()),
    { ...target(saved.memory_id, saved.version), expires_at: deadline }), { code: "memory.invalid" });
  assert.deepEqual(await f.raw().list("project", "project-a"), before); assert.deepEqual(await expired.history(caller("after"), saved.memory_id), history);
  t.mock.method(Date, "now", () => START);
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Session classification boundary" });
  const who = caller("session", { session_id: session.session_id, current_scene: "coding" });
  const original = await f.raw(who).write({ scope: "personal", owner: who.actor_id, text: "Session-only assumption", origin: "Session", operation_id: "session-original",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["coding"], lifecycle: "session" }, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  await assert.rejects(f.service.change(who, target(original.memory_id, original.version)), { code: "memory.invalid" });
  await assert.rejects(f.service.change(caller("unbound-session"), target(original.memory_id, original.version)));
  assert.deepEqual((await f.raw(who).list("personal", who.actor_id))[0], original); assert.deepEqual(f.ledger().revisions(original.memory_id), []);
});

test("paused state, automatic undo ownership, cancellation and current scope switches remain enforced during correction", async t => {
  const f = await fixture(t), saved = (await f.service.write(caller("seed"), { scope: "project", text: "Only the person can correct this" })).memory!;
  const paused = await f.raw().pause({ scope: "project", owner: "project-a", memory_id: saved.memory_id, expected_version: saved.version, operation_id: "pause", reason: "Source unavailable" });
  f.ledger().saveChange({ change_id: "prior-auto", actor_id: LOCAL_PERSON_ACTOR_ID, owner: "project-a", project_id: "project-a", scope: "project", memory_id: saved.memory_id,
    kind: "auto_kept", by: "policy", text: saved.text, rule: "original rule", reason: null, work: null, at: new Date(START).toISOString(), state: "active", undoable: true, undo: { action: "remove" } });
  const corrected = await f.service.change(caller("correct"), target(saved.memory_id, paused.version));
  assert.equal(corrected.memory!.state, "paused"); assert.deepEqual((await f.raw().list("project", "project-a"))[0]!.paused, paused.paused);
  assert.equal(f.ledger().change("prior-auto")!.undoable, false); await assert.rejects(f.service.undo(caller("old-undo"), "prior-auto"));
  const request = target(saved.memory_id, corrected.memory!.version), before = await f.raw().list("project", "project-a"), history = f.ledger().revisions(saved.memory_id);
  await assert.rejects(f.service.change(caller("other-project", { project_id: "project-b" }), request));
  await assert.rejects(f.service.change(caller("not-person", { person: false, consumer: "agent" }), request));
  const controller = new AbortController(); controller.abort(); await assert.rejects(f.service.change(caller("cancelled", { signal: controller.signal }), request));
  const service = new MemoryService({ ledger: f.ledger(), now: () => new Date(START), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    setMeta: async input => { f.service.savePrefs(caller("switch-off"), "project", { enabled: false }); return bound.setMeta(input); } })) });
  await assert.rejects(service.change(caller("revoked-before-write"), request));
  f.service.savePrefs(caller("switch-on"), "project", { enabled: true });
  assert.deepEqual(await f.raw().list("project", "project-a"), before); assert.deepEqual(f.ledger().revisions(saved.memory_id), history);
});

// MEM-34: the request identity is fixed before a target-specific SDK child operation is selected.
test("classification request identity cannot switch memory or action, including after restart", async t => {
  const f = await fixture(t);
  const a = (await f.service.write(caller("seed-a"), { scope: "project", text: "Alpha memory target" })).memory!;
  const b = (await f.service.write(caller("seed-b"), { scope: "project", text: "Beta memory target" })).memory!;
  const who = caller("fixed-classification-request"), request = target(a.memory_id, a.version);
  const result = await f.service.change(who, request);
  assert.equal(result.memory!.version, a.version + 1);
  await assert.rejects(f.service.change(who, target(b.memory_id, b.version)), { code: "memory.conflict" });
  await assert.rejects(f.service.change(who, { memory_id: b.memory_id, expected_version: b.version, action: "update", text: "Wrong target update" }), { code: "memory.conflict" });
  await assert.rejects(f.service.change(who, { memory_id: b.memory_id, expected_version: b.version, action: "remove" }), { code: "memory.conflict" });
  await f.close(); const service = await f.open();
  assert.equal((await service.change(who, request)).memory!.version, result.memory!.version);
  await assert.rejects(service.change(who, target(b.memory_id, b.version)), { code: "memory.conflict" });
  await assert.rejects(service.change(who, { ...request, expected_version: result.memory!.version }), { code: "memory.conflict" });
  await assert.rejects(service.change(who, { memory_id: a.memory_id, expected_version: result.memory!.version, action: "disable" }), { code: "memory.conflict" });
  const stored = await f.raw().list("project", "project-a");
  assert.deepEqual(stored.map(one => [one.memory_id, one.version]).sort(), [[a.memory_id, result.memory!.version], [b.memory_id, b.version]].sort());
  assert.equal((await service.history(caller("history-a"), a.memory_id)).revisions.length, 2);
  assert.equal((await service.history(caller("history-b"), b.memory_id)).revisions.length, 1);
});

test("classification request identity is rechecked when another action was already waiting on the same request", async t => {
  const f = await fixture(t);
  const a = (await f.service.write(caller("seed-a"), { scope: "project", text: "Interleaved Alpha" })).memory!;
  const b = (await f.service.write(caller("seed-b"), { scope: "project", text: "Interleaved Beta" })).memory!;
  let entered!: () => void, release!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const waitingService = new MemoryService({ ledger: f.ledger(), now: () => new Date(START), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    list: async (scope, owner) => { const entries = await bound.list(scope, owner); if (owner === "project-a") { entered(); await resume; } return entries; } })) });
  const who = caller("interleaved-classification-request");
  const waiting = waitingService.change(who, { memory_id: b.memory_id, expected_version: b.version, action: "update", text: "Wrong interleaved body" });
  await reading;
  const corrected = await f.service.change(who, target(a.memory_id, a.version));
  release(); await assert.rejects(waiting, { code: "memory.conflict" });
  const stored = await f.raw().list("project", "project-a");
  assert.equal(stored.find(one => one.memory_id === a.memory_id)!.version, corrected.memory!.version);
  assert.equal(stored.find(one => one.memory_id === b.memory_id)!.version, b.version);
  assert.equal(stored.find(one => one.memory_id === b.memory_id)!.text, b.text);
  assert.equal(f.ledger().revisions(a.memory_id).length, 2); assert.equal(f.ledger().revisions(b.memory_id).length, 1);
});

// MEM-34: the same logical request cannot acquire a second target while its first SDK write is awaiting commit.
test("a pending SDK commit reserves the change request against a later classification target", async t => {
  const f = await fixture(t);
  const a = (await f.service.write(caller("seed-a"), { scope: "project", text: "Commit Alpha" })).memory!;
  const b = (await f.service.write(caller("seed-b"), { scope: "project", text: "Commit Beta" })).memory!;
  let entered!: () => void, release!: () => void, queued!: () => void;
  const committing = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
  const competing = new Promise<void>(resolve => { queued = resolve; });
  t.after(() => release());
  let updating = false;
  const controlled = prologueMemoryBackend(async () => f.memory(), {
    beforeEffect: async () => { if (updating) { entered(); await resume; } }, assert_current() {} });
  const waitingService = new MemoryService({ ledger: f.ledger(), now: () => new Date(START),
    // Authority also checks reads; hold the update's real SDK guard after the request has claimed its target.
    backend: observeMemoryBackend(controlled, bound => ({ ...bound, update: async input => {
      updating = true; try { return await bound.update(input); } finally { updating = false; }
    } })) });
  const competingService = new MemoryService({ ledger: f.ledger(), now: () => new Date(START), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    setMeta: async input => { queued(); return bound.setMeta(input); } })) });
  const who = caller("commit-interleaved-request");
  const waiting = waitingService.change(who, { memory_id: b.memory_id, expected_version: b.version, action: "update", text: "First pending body" });
  await committing;
  const correction = competingService.change(who, target(a.memory_id, a.version));
  const correctionResult = correction.then(value => ({ value }), error => ({ error }));
  await Promise.race([competing, correctionResult]);
  release();
  const updated = await waiting, result = await correctionResult;
  assert.ok("error" in result, "a different classification target must not acquire an already pending request");
  assert.equal(result.error.code, "memory.conflict");
  const stored = await f.raw().list("project", "project-a");
  assert.equal(stored.find(one => one.memory_id === a.memory_id)!.version, a.version);
  assert.equal(stored.find(one => one.memory_id === b.memory_id)!.version, updated.memory!.version);
  assert.equal(stored.find(one => one.memory_id === b.memory_id)!.text, "First pending body");
  assert.equal(f.ledger().revisions(a.memory_id).length, 1); assert.equal(f.ledger().revisions(b.memory_id).length, 2);
});

// MEM-34/24: request binding must not replace the existing child CAS or deletion receipt recovery.
test("change request preserves versionless update retries and closed deletion repair after restart", async t => {
  const f = await fixture(t);
  const saved = (await f.service.write(caller("seed"), { scope: "project", text: "Original retry body" })).memory!;
  const edit = { action: "update" as const, memory_id: saved.memory_id, text: "Changed retry body" };
  const updated = (await f.service.change(caller("original-edit"), edit)).memory!;
  assert.equal((await f.service.change(caller("original-edit"), edit)).memory!.version, updated.version);
  assert.equal(f.ledger().revisions(saved.memory_id).length, 2);
  const remove = { action: "remove" as const, memory_id: saved.memory_id, expected_version: updated.version };
  const fault = t.mock.method(f.ledger(), "forget", () => { throw new Error("deletion projection interrupted"); });
  await assert.rejects(f.service.change(caller("original-remove"), remove), /deletion projection interrupted/);
  fault.mock.restore();
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  const repaired = await f.service.change(caller("original-remove"), remove);
  assert.deepEqual(f.ledger().revisions(saved.memory_id), []);
  await f.close(); const service = await f.open();
  assert.equal((await service.change(caller("original-remove"), remove)).change.change_id, repaired.change.change_id);
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  assert.deepEqual(f.ledger().revisions(saved.memory_id), []);
  await assert.rejects(service.change(caller("original-remove"), target(saved.memory_id, updated.version)), { code: "memory.conflict" });
});
