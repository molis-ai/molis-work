import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id });
const where = { scope: "personal" as const, owner: LOCAL_PERSON_ACTOR_ID };

test("MEM-40: management pages hide accepted pending deletion before and after reopen, and do not report a physical total as exact", async t => {
  const f = await memoryServiceHome(t, { projects: [] });
  let service = await f.open();
  const forgotten = (await service.write(caller("forgotten"), { scope: "personal", text: "不能再出现的管理页正文", kind: "preference" })).memory!;
  const retained = (await service.write(caller("retained"), { scope: "personal", text: "继续保留的管理页正文", kind: "preference" })).memory!;
  assert.deepEqual((await service.page(caller("before"), { scope: "personal" })).total, { kind: "exact", value: 2 });
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    remove: async () => { throw new Error("physical cleanup interrupted before SDK effect"); },
  })) });
  const request = { action: "remove" as const, memory_id: forgotten.memory_id, expected_version: forgotten.version };
  await assert.rejects(deleting.change(caller("forget"), request), error => {
    assert.deepEqual((error as { details?: unknown }).details, { operation_id: "forget", forgetting: "accepted", cleanup: "pending" }); return true;
  });
  for (let reopen = 0; reopen < 2; reopen++) {
    if (reopen) { await f.close(); service = await f.open(); }
    assert.equal((await f.raw().list(where.scope, where.owner)).length, 2, "real encrypted storage still contains the pending body");
    const page = await service.page(caller("read"), { scope: "personal" });
    assert.deepEqual(page.items.map(item => item.memory_id), [retained.memory_id]);
    assert.deepEqual(page.total, { kind: "unknown" });
    assert.equal(JSON.stringify(page).includes(forgotten.text), false);
    assert.equal(page.exhausted, true);
  }
  assert.equal((await service.change(caller("forget"), request)).memory, null);
  const cleaned = await service.page(caller("cleaned"), { scope: "personal" });
  assert.deepEqual(cleaned.items.map(item => item.memory_id), [retained.memory_id]);
  assert.deepEqual(cleaned.total, { kind: "exact", value: 1 });
});

test("MEM-40: a page already read by the SDK rechecks accepted forgetting after its last asynchronous wait", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const forgotten = (await service.write(caller("forgotten"), { scope: "personal", text: "等待期间被遗忘的正文", kind: "preference" })).memory!;
  const retained = (await service.write(caller("retained"), { scope: "personal", text: "等待期间继续保留", kind: "preference" })).memory!;
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const reading = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    page: async input => { const result = await bound.page(input); enter(); await barrier; return result; },
  })) });
  const pending = reading.page(caller("read"), { scope: "personal" });
  await entered;
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    remove: async () => { throw new Error("physical cleanup interrupted before SDK effect"); },
  })) });
  try {
    await assert.rejects(deleting.change(caller("forget"), { action: "remove", memory_id: forgotten.memory_id, expected_version: forgotten.version }),
      error => (error as { details?: { forgetting?: string } }).details?.forgetting === "accepted");
  } finally { release(); }
  const result = await pending;
  assert.deepEqual(result.items.map(item => item.memory_id), [retained.memory_id]);
  assert.deepEqual(result.total, { kind: "unknown" });
  assert.equal(JSON.stringify(result).includes(forgotten.text), false);
});


test("B4: discovery after reopen supplies the exact bodyless original accepted deletion request", async t => {
  const f = await memoryServiceHome(t, { projects: [] });
  let service = await f.open();
  const saved = (await service.write(caller("write"), { scope: "personal", text: "B4独有待清理正文", kind: "preference" })).memory!;
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    remove: async () => { throw new Error("physical pending"); },
  })) });
  await assert.rejects(deleting.change(caller("forget-original"), { action: "remove", memory_id: saved.memory_id, expected_version: saved.version }));
  await f.close(); service = await f.open();
  const pending = await service.listOperations(caller("read"), { scope: "personal" });
  const original = pending.items.find(item => item.operation_id === "forget-original")!;
  assert.ok(original); assert.equal(original.forgetting, "accepted");
  assert.deepEqual(original.request, { action: "remove", memory_id: saved.memory_id, expected_version: saved.version });
  assert.equal(JSON.stringify(pending).includes(saved.text), false);
  await service.change(caller(original.operation_id), original.request!);
  assert.deepEqual((await service.listOperations(caller("read"), { scope: "personal" })).items, []);
  assert.deepEqual(await f.raw().list(where.scope, where.owner), []);
});

test("B4 batch: an unconfirmed selection is not cleanup, and SDK fixed disable excludes later additions", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const a = (await service.write(caller("a"), { scope: "personal", text: "批量甲正文", kind: "preference" })).memory!;
  const b = (await service.write(caller("b"), { scope: "personal", text: "批量乙正文", kind: "preference" })).memory!;
  const preview = await service.previewBatch(caller("preview"), { scope: "personal", action: "disable", items: [a, b].map(item => ({ memory_id: item.memory_id, expected_version: item.version })) });
  assert.equal(JSON.stringify(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-batch:${preview.preview_id}`)).includes(a.text), false);
  assert.equal((await service.listOperations(caller("before-confirm"), { scope: "personal" })).items.some(item => item.kind === "batch"), false);
  const c = (await service.write(caller("c"), { scope: "personal", text: "预览之后新增丙", kind: "preference" })).memory!;
  const done = await service.applyBatch(caller("confirm"), preview.preview_id);
  assert.equal(done.complete, true); assert.equal(done.items.length, 2);
  assert.deepEqual(done.items.map(item => item.outcome), ["completed", "completed"]);
  const raw = await f.raw().list(where.scope, where.owner);
  assert.ok(raw.filter(item => [a.memory_id, b.memory_id].includes(item.memory_id)).every(item => item.disabled));
  assert.equal(raw.find(item => item.memory_id === c.memory_id)!.disabled, undefined);
  assert.deepEqual(f.ledger().forgetting.read().decisions, []);
});

test("B4 batch: two owner groups are accepted before first physical failure and resume their original plan after restart", async t => {
  const f = await memoryServiceHome(t, { projects: ["b4-project"] });
  let service = await f.open();
  const person = { ...caller("p"), project_id: "b4-project" };
  const a = (await service.write({ ...person, operation_id: "a" }, { scope: "project", text: "项目选中正文", kind: "convention" })).memory!;
  const b = (await service.write({ ...person, operation_id: "b", character: { id: "writer", title: "作者" } }, { scope: "character", text: "角色选中正文", kind: "preference" })).memory!;
  const a2 = (await service.write({ ...person, operation_id: "a2" }, { scope: "project", text: "交错选中项目第三项", kind: "convention" })).memory!;
  const failing = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(person), bound => ({ ...bound,
    applyBatch: async () => { throw new Error("first physical batch failed"); },
  })) });
  const preview = await failing.previewBatch(person, { scope: "project", action: "remove", items: [a, b, a2].map(item => ({ memory_id: item.memory_id, expected_version: item.version })) });
  await assert.rejects(failing.applyBatch({ ...person, operation_id: "confirm" }, preview.preview_id), error => { t.diagnostic(JSON.stringify({ error: String(error), ...(error as object) })); return true; });
  assert.equal(f.ledger().forgetting.read().decisions.length, 2);
  assert.deepEqual((await service.page(person, { scope: "project" })).items, []);
  await f.close(); service = await f.open();
  let cursor: string | undefined, original;
  do {
    const page = await service.listOperations(person, { scope: "project", ...(cursor ? { cursor } : {}) });
    original = page.items.find(item => item.kind === "batch") ?? original; cursor = page.cursor;
  } while (cursor);
  assert.equal(original?.preview_id, preview.preview_id);
  const done = await service.applyBatch(person, original!.preview_id!);
  assert.equal(done.complete, true);
  assert.deepEqual(done.items.map(item => item.memory_id), [a.memory_id, b.memory_id, a2.memory_id], "results retain the visible selection order across owner grouping and restart");
  assert.equal((await f.raw(person).list("project", "b4-project")).length, 0);
});

test("B4 scope clear accepts every fixed owner before the first physical cleanup and keeps the original clear for restart", async t => {
  const f = await memoryServiceHome(t, { projects: ["b4-clear"] });
  let service = await f.open();
  const person = { ...caller("p"), project_id: "b4-clear" };
  await service.write({ ...person, operation_id: "a" }, { scope: "project", text: "项目清空甲", kind: "convention" });
  await service.write({ ...person, operation_id: "b", character: { id: "writer", title: "作者" } }, { scope: "character", text: "角色清空乙", kind: "preference" });
  const failing = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(person), bound => ({ ...bound,
    clearScope: async () => { throw new Error("first physical scope failed"); },
  })) });
  const preview = await failing.previewScope(person, "project");
  await assert.rejects(failing.clearScope(person, "project", preview.fingerprint));
  assert.equal(f.ledger().forgetting.read().decisions.length, 2);
  assert.deepEqual((await service.page(person, { scope: "project" })).items, []);
  await f.close(); service = await f.open();
  const pending = await service.listOperations(person, { scope: "project" });
  const original = pending.items.find(item => item.kind === "scope-clear")!;
  assert.equal(original.fingerprint, preview.fingerprint);
  assert.equal(original.cleanup, "pending", "a complete fixed clear plan remains resumable without a completion marker");
  assert.equal((await service.clearScope(person, "project", original.fingerprint!)).complete, true);
});

test("B4 batch retains SDK success across ledger failure, confirms its original receipt after restart, and leaves no bodyful plan", async t => {
  const f = await memoryServiceHome(t, { projects: [] }); let service = await f.open();
  const a = (await service.write(caller("a"), { scope: "personal", text: "SDK已清但账本尚待清理甲", kind: "preference" })).memory!;
  const preview = await service.previewBatch(caller("preview"), { scope: "personal", action: "remove", items: [{ memory_id: a.memory_id, expected_version: a.version }] });
  const fail = t.mock.method(f.ledger(), "forget", () => { throw new Error("ledger unavailable after SDK success"); });
  await assert.rejects(service.applyBatch(caller("confirm"), preview.preview_id));
  assert.deepEqual(await f.raw().list(where.scope, where.owner), []);
  const plan = f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-batch:${preview.preview_id}`)!;
  assert.equal(JSON.stringify(plan).includes(a.text), false);
  fail.mock.restore(); await f.close(); service = await f.open();
  const pending = await service.listOperations(caller("read"), { scope: "personal" });
  const original = pending.items.find(item => item.kind === "batch")!;
  const done = await service.applyBatch(caller("resume"), original.preview_id!);
  assert.equal(done.complete, true);
  assert.deepEqual(f.ledger().revisions(a.memory_id), []);
  assert.equal((await service.listOperations(caller("read"), { scope: "personal" })).items.some(item => item.kind === "batch"), false);
});

test("B4 batch conflicts never rebase onto later versions, and missing original operation evidence is needs-reconcile", async t => {
  const f = await memoryServiceHome(t, { projects: [] }); let service = await f.open();
  const a = (await service.write(caller("a"), { scope: "personal", text: "批量原所见版本甲", kind: "preference" })).memory!;
  const preview = await service.previewBatch(caller("preview"), { scope: "personal", action: "disable", items: [{ memory_id: a.memory_id, expected_version: a.version }] });
  const edited = (await service.change(caller("edit"), { action: "update", memory_id: a.memory_id, expected_version: a.version, text: "另一合法决定的后来版本" })).memory!;
  const done = await service.applyBatch(caller("confirm"), preview.preview_id);
  assert.equal(done.complete, false); assert.deepEqual(done.items.map(item => item.outcome), ["conflict"]);
  await f.close(); service = await f.open();
  const retried = await service.applyBatch(caller("retry"), preview.preview_id);
  assert.deepEqual(retried.items.map(item => item.outcome), ["conflict"]);
  assert.equal((await f.raw().list(where.scope, where.owner))[0]!.version, edited.version);
  assert.equal((await f.raw().list(where.scope, where.owner))[0]!.disabled, undefined);
  // An accepted identity without its original request must not become a newly constructed deletion command.
  f.ledger().forgetting.accept({ selection_mode: "related", actor_id: LOCAL_PERSON_ACTOR_ID, operation_id: "orphan-decision", ...where,
    memories: [{ memory_id: a.memory_id, version: edited.version }], candidates: [], source_event_ids: [] });
  let cursor: string | undefined, orphan;
  do {
    const page = await service.listOperations(caller("read"), { scope: "personal", ...(cursor ? { cursor } : {}) });
    orphan = page.items.find(item => item.operation_id === "orphan-decision") ?? orphan; cursor = page.cursor;
  } while (cursor);
  assert.equal(orphan?.cleanup, "needs-reconcile"); assert.equal(orphan?.request, undefined);
});

test("B4 second acceptance failure and cancellation preserve unaccepted groups and execute zero physical batch effects", async t => {
  const f = await memoryServiceHome(t, { projects: ["b4-accept"] }), service = await f.open();
  const person = { ...caller("p"), project_id: "b4-accept" };
  const a = (await service.write({ ...person, operation_id: "a" }, { scope: "project", text: "接受组甲", kind: "convention" })).memory!;
  const b = (await service.write({ ...person, operation_id: "b", character: { id: "writer", title: "作者" } }, { scope: "character", text: "接受组乙", kind: "preference" })).memory!;
  let physical = 0;
  const measured = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(person), bound => ({ ...bound,
    applyBatch: async input => { physical++; return bound.applyBatch(input); },
  })) });
  const preview = await measured.previewBatch(person, { scope: "project", action: "remove", items: [a, b].map(item => ({ memory_id: item.memory_id, expected_version: item.version })) });
  const accept = f.ledger().forgetting.accept.bind(f.ledger().forgetting); let decisions = 0;
  const failure = t.mock.method(f.ledger().forgetting, "accept", input => { if (++decisions === 2) throw new Error("second acceptance failed"); return accept(input); });
  await assert.rejects(measured.applyBatch(person, preview.preview_id));
  assert.equal(physical, 0); assert.equal(f.ledger().forgetting.read().decisions.length, 1);
  const first = await service.page(person, { scope: "project" });
  assert.deepEqual(first.items, [], "accepted project item stays hidden");
  assert.ok(first.cursor, "the unaccepted character remains on its own original owner page");
  assert.deepEqual((await service.page(person, { scope: "project", cursor: first.cursor })).items.map(item => item.memory_id), [b.memory_id]);
  const pending = await service.listOperations(person, { scope: "project" });
  assert.equal(pending.items.find(item => item.kind === "batch")!.forgetting, "unknown", "the unaccepted group is not reported as forgotten");
  failure.mock.restore();
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(measured.applyBatch({ ...person, signal: cancelled.signal }, preview.preview_id));
  assert.equal(physical, 0); assert.equal(f.ledger().forgetting.read().decisions.length, 1);
  assert.equal((await measured.applyBatch(person, preview.preview_id)).complete, true);
});

test("B4: bounded discovery never skips accepted originals created in reverse operation order", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const failing = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    remove: async () => { throw new Error("pending physical cleanup"); },
  })) });
  for (const operation_id of ["z-original", "a-original"]) {
    const entry = (await service.write(caller(`write-${operation_id}`), { scope: "personal", text: operation_id, kind: "preference" })).memory!;
    await assert.rejects(failing.change(caller(operation_id), { action: "remove", memory_id: entry.memory_id, expected_version: entry.version }));
  }
  const found: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await service.listOperations(caller("read"), { scope: "personal", limit: 1, ...(cursor ? { cursor } : {}) });
    found.push(...page.items.map(item => item.operation_id)); cursor = page.cursor;
  } while (cursor);
  assert.deepEqual(found.sort(), ["a-original", "z-original"]);
});

test("B4 v2 missing original clear SDK decision stays needs-reconcile and cannot execute", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  await service.write(caller("save"), { scope: "personal", text: "缺原决定仍不可猜测清除", kind: "convention" });
  const failing = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    clearScope: async () => { throw new Error("physical clear interrupted"); },
  })) });
  const preview = await failing.previewScope(caller("preview"), "personal");
  await assert.rejects(failing.clearScope(caller("clear"), "personal", preview.fingerprint));
  assert.equal(f.ledger().forgetting.read().decisions.length, 1, "the original real clear was accepted before its physical failure");
  const key = `memory-clear:${preview.fingerprint}`, marker = f.ledger().marker(LOCAL_PERSON_ACTOR_ID, key)!;
  const broken = structuredClone(marker.body) as { parts: Array<{ decision?: unknown }> };
  delete broken.parts[0]!.decision;
  f.ledger().setMarker(LOCAL_PERSON_ACTOR_ID, key, broken, marker.at);
  const found = await service.listOperations(caller("read"), { scope: "personal" });
  const original = found.items.find(item => item.fingerprint === preview.fingerprint)!;
  assert.equal(original.cleanup, "needs-reconcile");
  assert.equal(original.forgetting, "unknown", "missing plan evidence cannot claim that no acceptance happened");
  await assert.rejects(service.clearScope(caller("clear"), "personal", preview.fingerprint), error => (error as { code?: string }).code === "memory.conflict");
  assert.equal((await f.raw().list(where.scope, where.owner)).length, 1);
});
