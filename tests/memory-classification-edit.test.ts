import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_FORMAL_KINDS, MEMORY_KINDS, type MemoryChangeRequest, type MemoryFormalKind } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const START = Date.parse("2026-11-04T08:00:00Z"), DAY = 86_400_000;
const caller = (operation_id: string, extra: Partial<MemoryCaller> = {}): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: "project-a", consumer: "ui", person: true, purpose: "management", current_scene: "common", operation_id, ...extra });
const target = (memory_id: string, expected_version: number, kind: MemoryFormalKind = "habit"): MemoryChangeRequest => ({ memory_id,
  expected_version, action: "reclassify", kind, classification: { scenes: ["coding"], lifecycle: "long-term" } });

// MEM-04/08/28: production Node SDK and ledger, not a classification-only fixture.
test("six formal kinds survive correction, restart and v2 export/import without widening formation", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] }); let service = await f.open();
  assert.deepEqual(MEMORY_KINDS, ["preference", "convention", "fact", "experience"]);
  for (const [index, kind] of MEMORY_FORMAL_KINDS.entries()) {
    const saved = (await service.write(caller(`seed-${index}`), { scope: "project", text: `Formal example number ${index}` })).memory!;
    const updated = await service.change(caller(`correct-${index}`), target(saved.memory_id, saved.version, kind));
    assert.equal(updated.memory!.kind, kind); assert.equal(updated.memory!.version, saved.version + 1);
  }
  await f.close(); service = await f.open();
  assert.deepEqual(new Set((await service.page(caller("page"), { scope: "project" })).items.map(item => item.kind)), new Set(MEMORY_FORMAL_KINDS));
  const pack = await service.exportScope(caller("export"), "project");
  assert.deepEqual(new Set(pack.entries.map(item => item.kind)), new Set(MEMORY_FORMAL_KINDS));
  const result = await service.importScope(caller("import", { project_id: "project-b" }), "project", pack);
  assert.equal(result.written, 6);
  await f.close(); service = await f.open();
  assert.deepEqual(new Set((await service.page(caller("page-b", { project_id: "project-b" }), { scope: "project" })).items.map(item => item.kind)), new Set(MEMORY_FORMAL_KINDS));
});

test("pure and combined corrections use one canonical CAS and preserve namespace, raw disabled state and deadline", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }); await f.open();
  const raw = f.raw(caller("raw"));
  const saved = await raw.write({ scope: "project", owner: "project-a", operation_id: "raw", text: "Original concise notes", origin: "person",
    meta: { kind: "convention", source: "manual", namespace: "example.plugin", classification: { scenes: ["common"], lifecycle: "long-term" }, expires_at_ms: START + DAY } });
  const disabled = await raw.disable({ scope: "project", owner: "project-a", memory_id: saved.memory_id, operation_id: "disable", expected_version: saved.version, reason: "Person disabled" });
  let metadata = 0, updates = 0;
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, setMeta: async value => { metadata++; return bound.setMeta(value); }, update: async value => { updates++; return bound.update(value); } }));
  const service = new MemoryService({ ledger: f.ledger(), backend, now: () => new Date(START) });
  let result = await service.change(caller("pure"), target(saved.memory_id, disabled.version));
  assert.equal(metadata, 1); assert.equal(updates, 0); assert.equal(result.memory!.state, "disabled");
  const first = (await raw.list("project", "project-a"))[0]!;
  assert.equal(first.origin, saved.origin); assert.equal(first.meta.namespace, saved.meta.namespace);
  assert.equal(first.meta.expires_at_ms, START + DAY); assert.deepEqual(first.disabled, disabled.disabled);
  result = await service.change(caller("combined"), { ...target(saved.memory_id, first.version, "project-decision"), text: "Updated concise notes", applies: { task: "Release notes" } });
  assert.equal(metadata, 1); assert.equal(updates, 1); assert.equal(result.memory!.version, first.version + 1);
  const last = (await raw.list("project", "project-a"))[0]!;
  assert.equal(last.text, "Updated concise notes"); assert.equal(last.meta.applies_when?.task, "Release notes"); assert.deepEqual(last.disabled, disabled.disabled);
});

test("one change identity rejects changed targets, actions, class, text and deadline before and after restart", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); let service = await f.open();
  const a = (await service.write(caller("a"), { scope: "project", text: "Original preference a" })).memory!;
  const b = (await service.write(caller("b"), { scope: "project", text: "Original preference b" })).memory!;
  const request = { ...target(a.memory_id, a.version), expires_at: new Date(Date.now() + DAY).toISOString() };
  const result = await service.change(caller("fixed"), request);
  for (const changed of [{ ...request, memory_id: b.memory_id }, { ...request, action: "disable" },
    { ...request, classification: { scenes: ["assistant"], lifecycle: "long-term" } }, { ...request, text: "Another body" },
    { ...request, expires_at: new Date(Date.now() + 2 * DAY).toISOString() }])
    await assert.rejects(service.change(caller("fixed"), changed as MemoryChangeRequest));
  await f.close(); service = await f.open();
  assert.equal((await service.change(caller("fixed"), request)).memory!.version, result.memory!.version);
  await assert.rejects(service.change(caller("fixed"), { ...request, classification: { scenes: ["assistant"], lifecycle: "long-term" } }));
  const entries = await f.raw().list("project", "project-a"); assert.equal(entries.find(item => item.memory_id === a.memory_id)!.version, result.memory!.version); assert.equal(entries.find(item => item.memory_id === b.memory_id)!.version, b.version);
  assert.equal(f.ledger().changesOf(a.memory_id).filter(change => change.kind === "edited").length, 1);
});

test("SDK commit with ledger failure repairs once within its original deadline after restart", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(START) }); let service = await f.open();
  const saved = (await service.write(caller("seed"), { scope: "project", text: "Repair within original deadline", expires_at: new Date(START + DAY).toISOString() })).memory!;
  const request = target(saved.memory_id, saved.version);
  const add = f.ledger().addRevision.bind(f.ledger()); let fail = true;
  t.mock.method(f.ledger(), "addRevision", (...args: Parameters<typeof add>) => { if (fail) { fail = false; throw new Error("ledger after SDK"); } return add(...args); });
  await assert.rejects(service.change(caller("repair"), request), /ledger after SDK/);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, saved.version + 1);
  await f.close(); service = await f.open();
  const repaired = await service.change(caller("repair"), request);
  assert.equal(repaired.memory!.version, saved.version + 1); assert.equal(repaired.memory!.expires_at, saved.expires_at);
  assert.equal((await service.change(caller("repair"), request)).change.change_id, repaired.change.change_id);
  assert.equal(f.ledger().changesOf(saved.memory_id).filter(item => item.kind === "edited").length, 1);
  assert.equal(f.ledger().revisions(saved.memory_id).filter(item => item.version === saved.version + 1).length, 1);
  const restored = await service.change(caller("restore"), { memory_id: saved.memory_id, expected_version: repaired.memory!.version, action: "restore", version: saved.version });
  assert.equal(restored.memory!.text, saved.text); assert.equal(restored.memory!.kind, saved.kind); assert.equal(restored.memory!.expires_at, saved.expires_at);
});

test("an uncommitted correction does not use the old operation time to pass a deadline", async t => {
  let now = START;
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(now) }); const original = await f.open();
  const saved = (await original.write(caller("seed"), { scope: "project", text: "Uncommitted expiring correction", expires_at: new Date(START + DAY).toISOString() })).memory!;
  const request = target(saved.memory_id, saved.version); let blocked = true;
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, setMeta: async input => { if (blocked) { blocked = false; throw new Error("not dispatched"); } return bound.setMeta(input); } }));
  const service = new MemoryService({ ledger: f.ledger(), backend, now: () => new Date(now) });
  await assert.rejects(service.change(caller("uncommitted"), request), /not dispatched/);
  now += 2 * DAY;
  await assert.rejects(service.change(caller("uncommitted"), request), { code: "memory.invalid" });
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, saved.version);
});

test("SDK commit with ledger failure repairs once after expiry and restart but refuses a later edit", async t => {
  let now = START;
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(now) }); let service = await f.open();
  const saved = (await service.write(caller("seed"), { scope: "project", text: "A recoverable correction", expires_at: new Date(START + DAY).toISOString() })).memory!;
  const request = target(saved.memory_id, saved.version);
  const add = f.ledger().addRevision.bind(f.ledger()); let fail = true;
  t.mock.method(f.ledger(), "addRevision", (...args: Parameters<typeof add>) => { if (fail) { fail = false; throw new Error("ledger failure after SDK commit"); } return add(...args); });
  await assert.rejects(service.change(caller("repair"), request), /ledger failure/);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, saved.version + 1);
  assert.equal(f.ledger().revisions(saved.memory_id).filter(item => item.version > saved.version).length, 0);
  await f.close(); now += 2 * DAY; service = await f.open();
  const repaired = await service.change(caller("repair"), request);
  assert.equal(repaired.memory!.version, saved.version + 1); assert.equal(repaired.memory!.expires_at, saved.expires_at);
  assert.equal((await service.change(caller("repair"), request)).change.change_id, repaired.change.change_id);
  assert.equal(f.ledger().changesOf(saved.memory_id).filter(item => item.kind === "edited").length, 1);
  const fresh = (await service.write(caller("next"), { scope: "project", text: "Another pending correction" })).memory!;
  const second = target(fresh.memory_id, fresh.version);
  const raw = f.raw(caller("outside"));
  const revision = f.ledger().addRevision.bind(f.ledger()); let breakAgain = true;
  t.mock.method(f.ledger(), "addRevision", (...args: Parameters<typeof revision>) => { if (breakAgain) { breakAgain = false; throw new Error("second ledger failure"); } return revision(...args); });
  await assert.rejects(service.change(caller("second"), second), /second ledger failure/);
  const current = (await raw.list("project", "project-a")).find(item => item.memory_id === fresh.memory_id)!;
  const edited = await raw.update({ scope: "project", owner: "project-a", memory_id: current.memory_id, operation_id: "human-successor", expected_version: current.version, change: { text: "Later human edit", meta: current.meta } });
  await f.close(); service = await f.open();
  await assert.rejects(service.change(caller("second"), second));
  assert.equal((await f.raw().list("project", "project-a")).find(item => item.memory_id === fresh.memory_id)!.text, edited.text);
  assert.equal(f.ledger().changesOf(fresh.memory_id).filter(item => item.kind === "edited").length, 0);
});

test("a human successor after an unrecorded SDK correction cannot be backfilled as the original result", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); let service = await f.open();
  const saved = (await service.write(caller("seed"), { scope: "project", text: "Pending correction before human edit" })).memory!;
  const request = target(saved.memory_id, saved.version);
  const add = f.ledger().addRevision.bind(f.ledger()); let fail = true;
  t.mock.method(f.ledger(), "addRevision", (...args: Parameters<typeof add>) => { if (fail) { fail = false; throw new Error("unrecorded correction"); } return add(...args); });
  await assert.rejects(service.change(caller("pending"), request), /unrecorded correction/);
  const raw = f.raw(caller("human")), entry = (await raw.list("project", "project-a"))[0]!;
  await raw.update({ scope: "project", owner: "project-a", memory_id: saved.memory_id, operation_id: "human-successor", expected_version: entry.version,
    change: { text: "Later human content", meta: entry.meta } });
  await f.close(); service = await f.open();
  await assert.rejects(service.change(caller("pending"), request));
  assert.equal((await f.raw().list("project", "project-a"))[0]!.text, "Later human content");
  assert.equal(f.ledger().changesOf(saved.memory_id).filter(item => item.kind === "edited").length, 0);
  assert.equal(f.ledger().revisions(saved.memory_id).length, 1);
});

test("a correction cancelled after its real SDK lookup leaves no new operation marker or projection", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); const original = await f.open();
  const saved = (await original.write(caller("seed"), { scope: "project", text: "Cancel after canonical lookup" })).memory!;
  const control = new AbortController();
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, list: async (scope, owner) => {
    const items = await bound.list(scope, owner); if (items.some(item => item.memory_id === saved.memory_id)) control.abort(); return items;
  } }));
  const service = new MemoryService({ ledger: f.ledger(), backend });
  await assert.rejects(service.change(caller("late-cancel", { signal: control.signal }), target(saved.memory_id, saved.version)), { name: "AbortError" });
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:late-cancel:change-request"), null);
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-operation:late-cancel:change:${saved.memory_id}`), null);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, saved.version);
  assert.equal(f.ledger().changesOf(saved.memory_id).filter(item => item.kind === "edited").length, 0);
});

test("stale versions, expired or Session targets, invalid classes, off and cancellation never rewrite canonical contents", async t => {
  let now = START;
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(now) }); const service = await f.open();
  const saved = (await service.write(caller("seed"), { scope: "project", text: "Bounded correction", expires_at: new Date(START + DAY).toISOString() })).memory!;
  for (const request of [{ ...target(saved.memory_id, saved.version), kind: undefined },
    { ...target(saved.memory_id, saved.version), classification: { scenes: ["unknown"], lifecycle: "long-term" } },
    { ...target(saved.memory_id, saved.version), classification: { scenes: ["coding"], lifecycle: "short-term" }, expires_at: null },
    { ...target(saved.memory_id, saved.version), expires_at: new Date(START).toISOString() }]) await assert.rejects(service.change(caller(crypto.randomUUID()), request as MemoryChangeRequest));
  const abort = new AbortController(); abort.abort(); await assert.rejects(service.change(caller("cancelled", { signal: abort.signal }), target(saved.memory_id, saved.version)));
  const results = await Promise.allSettled([service.change(caller("one"), target(saved.memory_id, saved.version)), service.change(caller("two"), target(saved.memory_id, saved.version, "fact"))]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  const current = (await f.raw().list("project", "project-a"))[0]!;
  now += 2 * DAY; await assert.rejects(service.change(caller("expired"), target(current.memory_id, current.version)));
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, current.version);
  service.savePrefs(caller("off"), "project", "off"); await assert.rejects(service.change(caller("off-change"), target(current.memory_id, current.version)));
  service.savePrefs(caller("on"), "project", "reviewed"); now = START;
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Session classification boundary" });
  const who = caller("session", { session_id: session.session_id, current_scene: "coding" });
  const original = await f.raw(who).write({ scope: "personal", owner: who.actor_id, text: "Session-only assumption", origin: "Session", operation_id: "session-original",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["coding"], lifecycle: "session" }, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  await assert.rejects(service.change(who, target(original.memory_id, original.version)), { code: "memory.invalid" });
  assert.deepEqual((await f.raw(who).list("personal", who.actor_id))[0], original);

});

for (const lifecycle of ["long-term", "short-term"] as const)
test(`Session to ${lifecycle} repairs only the original canonical CAS after post-commit control failure and reopen`, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); const base = await f.open();
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Original Session classification" });
  const who = caller("original-classify", { current_scene: "coding", session_id: session.session_id, memory_session: {
    session, current_scene: "coding", target: { kind: "coding", id: "business", project_id: "project-a" } } });
  const saved = (await base.write({ ...who, operation_id: "seed-session" }, { scope: "project", text: `Original ${lifecycle} retention body`, kind: "preference",
    classification: { scenes: ["coding"], lifecycle: "session" }, expires_at: "2099-01-01T00:00:00.000Z" })).memory!;
  let sdkCommitted = false;
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, setMeta: async input => { const result = await bound.setMeta(input); sdkCommitted = true; return result; } }));
  const service = new MemoryService({ ledger: f.ledger(), backend, beforeEffect() { if (sdkCommitted) throw new Error("original post-commit control failed before bookkeeping"); } });
  const request: MemoryChangeRequest = { action: "reclassify", memory_id: saved.memory_id, expected_version: saved.version, kind: "preference", classification: { scenes: ["coding"], lifecycle } };
  await assert.rejects(service.change(who, request), /post-commit control/);
  const canonical = (await f.raw().list("project", "project-a")).find(one => one.memory_id === saved.memory_id)!;
  assert.equal(canonical.version, saved.version + 1); assert.equal(canonical.meta.session_ref, undefined); assert.equal(canonical.meta.classification?.lifecycle, lifecycle);
  assert.equal(f.ledger().revisions(saved.memory_id).filter(one => one.version === canonical.version).length, 0);
  await f.close(); const reopened = await f.open();
  await assert.rejects(reopened.change({ ...who, operation_id: "new-operation" }, request));
  await assert.rejects(reopened.change({ ...who, memory_session: { ...who.memory_session!, session: { ...session, session_id: "other-session" } }, session_id: "other-session" }, request));
  await assert.rejects(reopened.change(who, { ...request, text: "changed retry command" }));
  const repaired = await reopened.change(who, request);
  assert.equal(repaired.memory!.memory_id, saved.memory_id); assert.equal(repaired.memory!.version, canonical.version); assert.equal(repaired.memory!.expires_at, saved.expires_at);
  assert.equal(repaired.memory!.text, saved.text); assert.equal(repaired.memory!.state, saved.state);
  assert.equal(f.ledger().revisions(saved.memory_id).filter(one => one.version === canonical.version).length, 1);
  assert.equal((await reopened.change(who, request)).change.change_id, repaired.change.change_id);
});
