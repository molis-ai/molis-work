import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true };
const worker = { ...person, consumer: "agent" as const, person: false, current_scene: "common", purpose: "task" as const };
const closed = [{ selector: { consumer: "agent" as const, current_scene: "common" as const }, read: "off" as const, form: "inherit" as const }];

// MEM-CLASS-02: pending-count preparation is a real asynchronous tail after the formal entries were collected.
test("closing a formal class during the pending-count wait does not return the already collected body", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), original = await f.open();
  await original.write(person, { scope: "personal", text: "每次发布先验证清单", kind: "convention" });
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  let armed = true;
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({ ...bound,
    candidates: { ...bound.candidates, list: async (...args) => {
      const rows = await bound.candidates.list(...args);
      if (armed) { armed = false; reached.resolve(); await release.promise; }
      return rows;
    } },
  }));
  const service = new MemoryService({ backend, ledger: f.ledger() });
  const pending = service.list(worker, { scope: "personal" });
  await reached.promise; original.savePrefs(person, "personal", { class_restrictions: closed }); release.resolve();
  await assert.rejects(pending, { code: "memory.forbidden" });
  assert.equal((await original.page(person, { scope: "personal" })).items.length, 1, "management and the persisted entry remain intact");
});

// MEM-CLASS-01: task list/count is a read, not permission to inspect automatic-formation material.
test("read-off/form-on pending candidates do not contribute task list counts or candidate bodies", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  await service.propose({ ...person, operation_id: "person-pending" }, { scope: "personal", text: "每次发布先验证清单", kind: "convention", basis: "inferred", why: "等待本人决定", from: "gate" });
  service.savePrefs(person, "personal", { class_restrictions: closed });
  assert.equal((await service.list(worker, { scope: "personal" })).counts.pending, 0);
  assert.deepEqual(await service.candidates(worker, { scope: "personal" }), []);
  assert.equal((await service.candidates(person, { scope: "personal" })).length, 1);
});

// The controlled list returns real persisted SDK entries; only App reads of the actual SQLite ledger are counted.
test("one synchronous scope filter reads settings at its boundaries, skips empty and hidden input, and rereads next invocation", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), original = await f.open();
  for (const text of ["每次发布先验证清单", "日志检查保留错误码", "文档标题使用完整名称"])
    await original.write(person, { scope: "personal", text, kind: "convention" });
  const persisted = await f.raw().list("personal", person.actor_id);
  assert.equal(persisted.length, 3);
  let rows = persisted.slice(0, 1);
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({ ...bound, list: async () => rows }));
  const service = new MemoryService({ backend, ledger: f.ledger() });
  const prefs = t.mock.method(f.ledger(), "prefs");
  for (const selected of [persisted.slice(0, 1), persisted]) {
    rows = selected; prefs.mock.resetCalls();
    const result = await service.history(worker, selected[0]!.memory_id);
    assert.equal(result.memory_id, selected[0]!.memory_id);
    assert.equal(result.revisions[0]?.text, selected[0]!.text);
    assert.equal(prefs.mock.callCount(), 2, "one current profile serves every classified entry, then the phase rechecks it");
    t.diagnostic(`scope filter: ${selected.length} persisted entries, ${prefs.mock.callCount()} ledger.prefs read`);
  }
  original.savePrefs(person, "personal", { class_restrictions: closed }); prefs.mock.resetCalls();
  await assert.rejects(service.history(worker, persisted[0]!.memory_id), { code: "memory.not_found" });
  assert.equal(prefs.mock.callCount(), 2, "the next call uses and rechecks the newly closed class");
  rows = []; prefs.mock.resetCalls();
  await assert.rejects(service.history(person, persisted[0]!.memory_id), { code: "memory.not_found" });
  assert.equal(prefs.mock.callCount(), 0, "empty input does not read settings");
  rows = persisted;
  const session = await f.adapter().createSession({ actor_id: person.actor_id, project_id: null, plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Excluded long-term entries" });
  prefs.mock.resetCalls();
  await assert.rejects(service.history({ ...person, memory_session: { session, current_scene: "coding",
    target: { kind: "coding", id: "different-session", project_id: null } } }, persisted[0]!.memory_id), { code: "memory.not_found" });
  assert.equal(prefs.mock.callCount(), 0, "Session-excluded entries do not read settings");
  f.ledger().forgetting.accept({ scope: "personal", owner: person.actor_id, actor_id: person.actor_id,
    operation_id: "hide-fixed-scope", accepted_at: new Date().toISOString(), selection_mode: "exact-identities",
    memories: persisted.map(entry => ({ memory_id: entry.memory_id, version: entry.version })), candidates: [], source_event_ids: [] });
  prefs.mock.resetCalls();
  await assert.rejects(service.history(person, persisted[0]!.memory_id), { code: "memory.not_found" });
  assert.equal(prefs.mock.callCount(), 0, "accepted hidden entries do not read settings");
});

test("recall rereads the current profile at each synchronous phase boundary after its final wait", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), original = await f.open();
  for (const text of ["每次发布先验证清单", "日志检查保留错误码", "文档标题使用完整名称"])
    await original.write(person, { scope: "personal", text, kind: "convention" });
  const rows = await f.raw().list("personal", person.actor_id);
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({ ...bound, list: async () => rows }));
  const service = new MemoryService({ backend, ledger: f.ledger() }), prefs = t.mock.method(f.ledger(), "prefs");
  let preparationReads = 0;
  const result = await service.recall(worker, { scopes: ["personal"] }, { beforeEffect: async () => {
    preparationReads = prefs.mock.callCount(); prefs.mock.resetCalls();
  } });
  assert.deepEqual(result.items.map(item => item.memory_id).sort(), rows.map(entry => entry.memory_id).sort());
  assert.equal(prefs.mock.callCount(), 2, "all final consumer and per-entry class checks share this phase's profile, followed by its currentness check");
  assert.equal(preparationReads, 3, "scope access reads before the wait; the entry filter reads and rechecks after it");
  t.diagnostic(`recall: ${rows.length} persisted entries, ${preparationReads} preparation + ${prefs.mock.callCount()} final ledger.prefs reads`);
  assert.equal(service.uses({ receipt_id: result.receipt_id }).length, rows.length);
});

for (const boundary of ["backend", "beforeEffect"] as const) {
  test(`closing a class during recall ${boundary} wait refuses stale bodies and records no use`, async t => {
    const f = await memoryServiceHome(t, { projects: [] }), original = await f.open();
    const saved = await original.write(person, { scope: "personal", text: "每次发布先验证清单", kind: "convention" });
    assert.ok(saved.memory);
    const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
    const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({ ...bound,
      list: async (...args) => {
        const rows = await bound.list(...args);
        if (boundary === "backend") { reached.resolve(); await release.promise; }
        return rows;
      },
    }));
    const service = new MemoryService({ backend, ledger: f.ledger() });
    const pending = service.recall(worker, { scopes: ["personal"] }, { beforeEffect: async () => {
      if (boundary === "beforeEffect") { reached.resolve(); await release.promise; }
    } });
    await reached.promise; original.savePrefs(person, "personal", { class_restrictions: closed }); release.resolve();
    if (boundary === "backend") assert.deepEqual((await pending).items, []);
    else await assert.rejects(pending, { code: "memory.off" });
    assert.deepEqual(f.ledger().uses({ memory_id: saved.memory.memory_id }), [], "neither returned nor omitted usage is recorded");
    assert.equal((await original.page(person, { scope: "personal" })).items[0]?.memory_id, saved.memory.memory_id);
  });
}

for (const phase of ["filter", "delivery"] as const) for (const mutation of ["forgetting", "preferences"] as const)
test(`synchronous ${phase} reentry changing ${mutation} refuses every collected body and writes no receipt`, async t => {
  const f = await memoryServiceHome(t, { projects: [] }), original = await f.open();
  for (const text of ["发布前验证完整清单", "发布后核查错误日志"])
    await original.write(person, { scope: "personal", text, kind: "convention" });
  const persisted = await f.raw().list("personal", person.actor_id);
  assert.equal(persisted.length, 2);
  let armed = phase === "filter", changed = false;
  const rows = persisted.map((entry, index) => index !== 1 ? entry : { ...entry, get meta() {
    if (armed && !changed) {
      changed = true;
      if (mutation === "preferences") original.savePrefs(person, "personal", { class_restrictions: closed });
      else f.ledger().forgetting.accept({ scope: "personal", owner: person.actor_id, actor_id: person.actor_id,
        operation_id: `reentrant-${phase}`, selection_mode: "exact-identities",
        memories: [{ memory_id: persisted[0]!.memory_id, version: persisted[0]!.version }], candidates: [], source_event_ids: [] });
    }
    return entry.meta;
  } });
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({ ...bound, list: async () => rows }));
  const service = new MemoryService({ backend, ledger: f.ledger() });
  await assert.rejects(service.recall(worker, { scopes: ["personal"] }, { beforeEffect: async () => { armed = true; } }), {
    code: mutation === "preferences" ? "memory.off" : "memory.conflict",
  });
  assert.equal(changed, true, "the mutation occurred inside the actual synchronous filter or delivery checks");
  for (const entry of persisted) assert.deepEqual(f.ledger().uses({ memory_id: entry.memory_id }), []);
  assert.equal((await f.raw().list("personal", person.actor_id)).length, 2, "the refusal did not modify canonical entries");
  if (mutation === "preferences") assert.deepEqual((await original.recall(worker, { scopes: ["personal"] })).items, []);
  else assert.equal((await original.recall(worker, { scopes: ["personal"] })).items.some(item => item.memory_id === persisted[0]!.memory_id), false);
});

test("scope filtering shares forgetting data but keeps each scope and owner identity check", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), original = await f.open();
  await original.write(person, { scope: "personal", text: "本人范围的发布约定", kind: "convention" });
  const persisted = await f.raw().list("personal", person.actor_id);
  f.ledger().forgetting.accept({ scope: "project", owner: "project-a", actor_id: person.actor_id, operation_id: "other-scope-same-id",
    selection_mode: "exact-identities", memories: [{ memory_id: persisted[0]!.memory_id, version: persisted[0]!.version }], candidates: [], source_event_ids: [] });
  const read = f.ledger().forgetting.read;
  let reads = 0;
  const counted = t.mock.method(f.ledger().forgetting, "read", () => { reads++; return read(); });
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.memory()), bound => ({ ...bound, list: async () => persisted }));
  const service = new MemoryService({ backend, ledger: f.ledger() });
  const result = await service.recall({ ...worker, context_selection: true }, { scopes: ["personal"] });
  assert.equal(result.items[0]?.memory_id, persisted[0]!.memory_id, "an accepted identity in another scope cannot hide this scope's body");
  assert.equal(result.items[0]?.text, persisted[0]!.text);
  assert.equal(reads, 4, "scope filtering and delivery each obtain and recheck their own current facts");
  counted.mock.restore();
});
