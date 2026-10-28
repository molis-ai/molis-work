import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_BATCH_MAX_ITEMS, type MemoryBatchItem, type MemoryItem } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome, observeMemoryBackend, originalMemorySources, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";

const caller = (operation_id: string, extra: Partial<MemoryCaller> = {}): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: "project-a", consumer: "ui", person: true, current_scene: "common", purpose: "management", operation_id, ...extra });
const selected = (item: MemoryItem): MemoryBatchItem => ({ scope: item.scope, owner: item.scope === "personal" ? LOCAL_PERSON_ACTOR_ID : "project-a",
  memory_id: item.memory_id, expected_version: item.version });
async function fixture(t: Parameters<typeof memoryServiceHome>[0]) {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] });
  return { ...f, service: await f.open() };
}
async function seed(service: MemoryService, name: string) {
  return (await service.write(caller("seed-" + name), { scope: "project", text: name + " convention for this project" })).memory!;
}

test("fixed selection excludes later additions, survives restart and never repeats a completed disable over a later edit", async t => {
  const f = await fixture(t), a = await seed(f.service, "First"), b = await seed(f.service, "Second");
  const request = { action: "disable" as const, items: [selected(a), selected(b)] };
  const preview = await f.service.batches.preview(caller("preview-disable"), request);
  assert.equal(preview.max_items, MEMORY_BATCH_MAX_ITEMS);
  const marker = f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-selection:" + preview.preview_id);
  assert.ok(marker); assert.equal(JSON.stringify(marker).includes(a.text), false);
  const later = await seed(f.service, "Later");
  const done = await f.service.batches.apply(caller("apply-first"), preview.preview_id);
  assert.equal(done.complete, true); assert.deepEqual(done.items.map(item => item.outcome), ["completed", "completed"]);
  const disabled = (await f.service.list(caller("read"), { scope: "project" })).items.find(item => item.memory_id === a.memory_id)!;
  const enabled = (await f.service.change(caller("enable-later"), { memory_id: a.memory_id, expected_version: disabled.version, action: "enable" })).memory!;
  const edited = (await f.service.change(caller("edit-later"), { memory_id: a.memory_id, expected_version: enabled.version, action: "update", text: "The person changed this later" })).memory!;
  await f.close(); const reopened = await f.open();
  assert.deepEqual(await reopened.batches.preview(caller("preview-disable"), request), preview);
  assert.deepEqual(await reopened.batches.apply(caller("apply-again"), preview.preview_id), done);
  const items = (await reopened.list(caller("final"), { scope: "project" })).items;
  assert.deepEqual(items.find(item => item.memory_id === a.memory_id), edited);
  assert.equal(items.find(item => item.memory_id === later.memory_id)!.state, "active");
  assert.deepEqual(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-selection:" + preview.preview_id), marker);
});

test("preview binds exact owner and version; foreign caller, project, duplicate or oversized selections cannot execute", async t => {
  const f = await fixture(t), a = await seed(f.service, "Selected"), b = await seed(f.service, "Unchanged");
  const item = selected(a), preview = await f.service.batches.preview(caller("bound"), { action: "disable", items: [item, selected(b)] });
  for (const items of [[item, item], Array.from({ length: 101 }, () => item), [{ ...item, owner: "project-b" }]])
    await assert.rejects(f.service.batches.preview(caller(crypto.randomUUID()), { action: "remove", items }));
  await assert.rejects(f.service.batches.preview(caller("bound"), { action: "remove", items: [item] }), { code: "memory.conflict" });
  await assert.rejects(f.service.batches.apply(caller("foreign-project", { project_id: "project-b" }), preview.preview_id), { code: "memory.scope" });
  await assert.rejects(f.service.batches.apply(caller("foreign-actor", { actor_id: "other" }), preview.preview_id));
  await assert.rejects(f.service.batches.apply(caller("agent", { person: false, consumer: "agent" }), preview.preview_id));
  const edited = (await f.service.change(caller("edit"), { action: "update", memory_id: a.memory_id, expected_version: a.version, text: "New human version" })).memory!;
  const result = await f.service.batches.apply(caller("execute"), preview.preview_id);
  assert.equal(result.complete, false); assert.deepEqual(result.items.map(one => one.outcome), ["conflict", "completed"]);
  await f.close(); const reopened = await f.open();
  assert.deepEqual(await reopened.batches.apply(caller("retry-conflict"), preview.preview_id), result);
  const persisted = await f.raw(caller("read")).list("project", "project-a");
  const kept = persisted.find(one => one.memory_id === a.memory_id)!, disabled = persisted.find(one => one.memory_id === b.memory_id)!;
  assert.equal(kept.version, edited.version); assert.equal(kept.text, edited.text); assert.equal(!!kept.disabled, false);
  assert.equal(disabled.version, b.version + 1); assert.ok(disabled.disabled);
  assert.equal(f.ledger().changesOf(b.memory_id).filter(change => change.kind === "disabled").length, 1);
});

test("a non-conflict Agent failure remains unknown and stops the next fixed item", async t => {
  const f = await fixture(t), a = await seed(f.service, "First unavailable"), b = await seed(f.service, "Later untouched");
  const preview = await f.service.batches.preview(caller("preview-unavailable"), { action: "disable", items: [selected(a), selected(b)] });
  const before = await f.raw().list("project", "project-a");
  let calls = 0;
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.adapter().memory!), bound => ({ ...bound,
    previewMutation: async () => { calls++; throw Object.assign(new Error("Memory capability unavailable"), { code: "agent.capability_unavailable" }); } }));
  const service = new MemoryService({ backend, ledger: f.ledger() });
  const result = await service.batches.apply(caller("apply-unavailable"), preview.preview_id);
  assert.equal(result.complete, false); assert.deepEqual(result.items.map(item => item.outcome), ["unknown", "not-executed"]);
  assert.equal(calls, 1); assert.deepEqual(await f.raw().list("project", "project-a"), before);
  for (const item of [a, b]) assert.equal(f.ledger().changesOf(item.memory_id).some(change => change.kind === "disabled"), false);
});

for (const interrupted of ["candidate-response", "ledger", "receipt"] as const) test("forget interrupted at " + interrupted + " resumes the original child after restart", async t => {
  const f = await fixture(t), a = await seed(f.service, "Forget"), b = await seed(f.service, "Keep until retry");
  const candidate = await f.service.propose(caller("candidate"), { scope: "project", text: "A pending replacement", kind: "convention",
    basis: "inferred", why: "Needs personal confirmation", from: "gate", supersedes: a.memory_id });
  await f.service.recall(caller("recall"), { query: "Forget", scopes: ["project"], used_for: "Test actual returned receipt" });
  assert.ok(f.ledger().uses({ memory_id: a.memory_id }).length > 0, "recall must create a real use before testing cleanup");
  f.ledger().savePair(LOCAL_PERSON_ACTOR_ID, { pair_id: "selected-pair", kind: "conflict", scope: "project", owner: "project-a", project_id: "project-a", state: "pending",
    a: { memory_id: a.memory_id, text: a.text, source: a.source }, b: { memory_id: b.memory_id, text: b.text, source: b.source }, why: "Related", created_at: new Date().toISOString() });
  const preview = await f.service.batches.preview(caller("forget-preview"), { action: "remove", items: [selected(a), selected(b)] });
  const fail = interrupted === "candidate-response" ? undefined
    : t.mock.method(f.ledger(), interrupted === "ledger" ? "forget" : "saveChange", () => { throw new Error("Ledger unavailable"); });
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.adapter().memory!), bound => ({ ...bound,
    candidates: { ...bound.candidates, purge: async input => { await bound.candidates.purge(input); throw new Error("Candidate response lost"); } } }));
  const service = interrupted === "candidate-response" ? new MemoryService({ backend, ledger: f.ledger() }) : f.service;
  const partial = await service.batches.apply(caller("first"), preview.preview_id);
  assert.equal(partial.complete, false); assert.deepEqual(partial.items.map(item => item.outcome), ["unknown", "not-executed"]);
  assert.equal((await f.raw().list("project", "project-a")).some(item => item.memory_id === a.memory_id), interrupted === "candidate-response");
  if (interrupted === "receipt") assert.deepEqual(f.ledger().revisions(a.memory_id), []);
  else assert.ok(f.ledger().revisions(a.memory_id).length > 0, "partial projection is not hidden by completed");
  fail?.mock.restore(); await f.close(); const reopened = await f.open();
  const done = await reopened.batches.apply(caller("retry"), preview.preview_id);
  assert.equal(done.complete, true); assert.deepEqual(await f.raw().list("project", "project-a"), []);
  assert.equal((await f.raw().candidates.list("project", "project-a")).some(item => item.candidate_id === candidate.candidate_id), false);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(item => item.candidate_id === candidate.candidate_id), false);
  for (const item of [a, b]) {
    assert.deepEqual(f.ledger().revisions(item.memory_id), []); assert.deepEqual(f.ledger().uses({ memory_id: item.memory_id }), []);
    assert.ok(f.ledger().changesOf(item.memory_id).every(change => change.text === "" && change.undo === null));
  }
  assert.deepEqual(f.ledger().pairs(LOCAL_PERSON_ACTOR_ID), []);
  assert.deepEqual(await reopened.batches.apply(caller("again"), preview.preview_id), done);
});

for (const failure of ["cancel", "revoke"] as const) test("batch " + failure + " after SDK removal stops later items and preserves pending cleanup for retry", async t => {
  const f = await fixture(t), a = await seed(f.service, "First removal"), b = await seed(f.service, "Later removal");
  const preview = await f.service.batches.preview(caller("preview"), { action: "remove", items: [selected(a), selected(b)] });
  const controller = new AbortController(); let allowed = true, calls = 0, forgets = 0;
  const forget = f.ledger().forget.bind(f.ledger());
  t.mock.method(f.ledger(), "forget", id => { forgets++; return forget(id); });
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.adapter().memory!), bound => ({ ...bound, remove: async request => {
    calls++; await bound.remove(request); if (failure === "cancel") controller.abort(); else allowed = false;
  } }));
  const service = new MemoryService({ backend, ledger: f.ledger(), beforeEffect: () => { if (!allowed) throw new Error("App grant revoked"); } });
  const result = await service.batches.apply(caller("apply", { signal: controller.signal }), preview.preview_id);
  assert.equal(result.complete, false); assert.deepEqual(result.items.map(item => item.outcome), ["unknown", "not-executed"]);
  assert.equal(calls, 1); assert.equal(forgets, 0); assert.ok(f.ledger().revisions(a.memory_id).length > 0);
  assert.ok((await f.raw().list("project", "project-a")).some(item => item.memory_id === b.memory_id));
  await f.close(); const reopened = await f.open();
  assert.equal((await reopened.batches.apply(caller("retry"), preview.preview_id)).complete, true);
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
});

test("preview ledger write uses current App authority and a lost disable receipt cannot overwrite a successor", async t => {
  const f = await fixture(t), a = await seed(f.service, "Original");
  const backend = prologueMemoryBackend(async () => f.adapter().memory!);
  const denied = new MemoryService({ backend, ledger: f.ledger(), beforeEffect: () => { throw new Error("App authority revoked"); } });
  await assert.rejects(denied.batches.preview(caller("denied-preview"), { action: "disable", items: [selected(a)] }), /revoked/);
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-selection:denied-preview"), null);
  const preview = await f.service.batches.preview(caller("preview"), { action: "disable", items: [selected(a)] });
  const failure = t.mock.method(f.ledger(), "saveChange", () => { throw new Error("Receipt unavailable"); });
  assert.equal((await f.service.batches.apply(caller("first"), preview.preview_id)).items[0]!.outcome, "unknown");
  failure.mock.restore();
  const disabled = (await f.raw().list("project", "project-a"))[0]!;
  const successor = await f.raw().update({ scope: "project", owner: "project-a", memory_id: a.memory_id,
    expected_version: disabled.version, operation_id: "later-edit", change: { text: "Later personal body" } });
  await f.close(); const reopened = await f.open();
  assert.equal((await reopened.batches.apply(caller("retry"), preview.preview_id)).items[0]!.outcome, "conflict");
  const final = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(final.text, successor.text); assert.equal(final.version, successor.version);
});

test("batch forgetting an accepted original suppresses the same event and version before and after restart", { timeout: 30_000 }, async t => {
  const originals = originalMemorySources(["project-a"]), extraction = scriptedMemoryExtraction();
  let service: MemoryService | undefined;
  // Original identity/body come from the fixture; App suppression is the same live owner callback used by memorySources.
  const allowed = (who: Parameters<typeof originals.port.resolve>[0], request: Parameters<typeof originals.port.resolve>[1]) =>
    !!service?.sourceAllowed(who.actor_id, request.target.scope === "user" ? "personal" : request.target.scope, request.target.owner, request.refs);
  const sources: typeof originals.port = {
    async resolve(who, request) {
      if (!allowed(who, request)) return [];
      const found = await originals.port.resolve(who, request);
      return allowed(who, request) ? found : [];
    },
    async check(who, request) {
      const refs = request.identities.map(({ event_id, version }) => ({ event_id, version }));
      return allowed(who, { ...request, refs }) && await originals.port.check(who, request) && allowed(who, { ...request, refs });
    },
  };
  const generate = t.mock.fn(extraction.generate);
  const f = await memoryServiceHome(t, { projects: ["project-a"], sources, generate });
  service = await f.open();
  service.savePrefs(caller("formation-project"), "project", "assisted");
  service.savePrefs(caller("formation-personal"), "personal", { learn_from_work: false });
  const text = "以后发布说明先列风险与核对步骤", original = originals.add("selected-original-event", text);
  extraction.set([{ text, scope: "project", kind: "convention", basis: "explicit", quote: text }]);
  const worker = caller("source-recipe", { person: false, consumer: "assistant", current_scene: "assistant",
    source_use: "learning", purpose: "task", session_id: "selected-source-session" });
  const recipe = await service.forRun(worker, { query: "发布核对" }); assert.ok(recipe);
  const learn = (operation_id: string) => service!.learnFromWork({ ...worker, operation_id, class_restrictions: recipe.class_restrictions },
    { said: [text], sources: [original] });
  const formed = await learn("form-original");
  assert.equal(formed.recording_error, undefined); assert.equal(formed.formation.outcome, "completed");
  assert.equal(formed.formation.extraction.calls, 1); assert.equal(formed.learned[0]!.outcome, "candidate");
  const candidate = (await service.candidates(caller("view-candidate"), { scope: "project" }))[0]!;
  const canonical = (await f.raw().candidates.list("project", "project-a"))[0]!;
  assert.deepEqual(canonical.sources?.map(({ event_id, version }) => ({ event_id, version })), [{ event_id: original.event_id, version: original.version }]);
  const accepted = await service.accept(caller("accept-original"), candidate.candidate_id, { expected_version: candidate.version });
  assert.ok(accepted.memory); assert.equal(accepted.memory.text, text);
  const preview = await service.batches.preview(caller("preview-original"), { action: "remove", items: [selected(accepted.memory)] });
  const removed = await service.batches.apply(caller("forget-original"), preview.preview_id);
  assert.equal(removed.complete, true); assert.equal(removed.items[0]!.outcome, "completed");
  const calls = generate.mock.callCount();
  const unchanged = async (operation: string) => {
    assert.equal(service!.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", [original]), false);
    const refused = await learn(operation);
    assert.equal(refused.formation.outcome, "failed"); assert.deepEqual(refused.learned, []);
    assert.equal(refused.formation.extraction.calls, 0); assert.equal(generate.mock.callCount(), calls);
    assert.deepEqual(await f.raw().list("project", "project-a"), []);
    assert.deepEqual(await f.raw().candidates.list("project", "project-a"), []);
    assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), []);
    assert.deepEqual(f.ledger().revisions(accepted.memory!.memory_id), []);
    assert.ok(f.ledger().changesOf(accepted.memory!.memory_id).every(change => change.text === "" && change.undo === null));
  };
  await unchanged("relearn-same-event-version");
  await f.close(); service = await f.open();
  await unchanged("relearn-after-restart");
});


test("the fixed maximum accepts 100 real identities across legal owners and rejects the 101st before saving", { timeout: 90_000 }, async t => {
  const f = await fixture(t), items: MemoryBatchItem[] = [];
  for (let index = 0; index < MEMORY_BATCH_MAX_ITEMS + 1; index++) {
    const scope = index % 2 ? "personal" as const : "project" as const, owner = scope === "personal" ? LOCAL_PERSON_ACTOR_ID : "project-a";
    const entry = await f.raw(caller("seed-maximum")).write({ scope, owner, operation_id: "maximum-" + index,
      text: "Explicitly selected rule number " + index, origin: "Person's fixed selection",
      meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } } });
    items.push({ scope, owner, memory_id: entry.memory_id, expected_version: entry.version });
  }
  await assert.rejects(f.service.batches.preview(caller("too-large"), { action: "disable", items }), { code: "memory.invalid" });
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-selection:too-large"), null);
  const fixed = items.slice(0, MEMORY_BATCH_MAX_ITEMS), preview = await f.service.batches.preview(caller("maximum-preview"), { action: "disable", items: fixed });
  assert.deepEqual(preview.items, fixed);
  const done = await f.service.batches.apply(caller("maximum-apply"), preview.preview_id);
  assert.equal(done.complete, true); assert.equal(done.items.length, MEMORY_BATCH_MAX_ITEMS);
  for (const [scope, owner] of [["personal", LOCAL_PERSON_ACTOR_ID], ["project", "project-a"]] as const) {
    for (const entry of await f.raw().list(scope, owner)) {
      assert.equal(!!entry.disabled, fixed.some(item => item.memory_id === entry.memory_id));
      assert.equal(entry.version, entry.memory_id === items.at(-1)!.memory_id ? 1 : 2);
    }
  }
});

test("overlapping applies reconcile one original child while its committed SDK response is delayed", { timeout: 30_000 }, async t => {
  const f = await fixture(t), item = await seed(f.service, "Concurrent original");
  const preview = await f.service.batches.preview(caller("concurrent-preview"), { action: "disable", items: [selected(item)] });
  let entered!: () => void, release!: () => void, delayed = false;
  const reached = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => f.adapter().memory!), bound => ({ ...bound, disable: async input => {
    const result = await bound.disable(input);
    if (!delayed) { delayed = true; entered(); await barrier; }
    return result;
  } }));
  const service = new MemoryService({ ledger: f.ledger(), backend });
  const first = service.batches.apply(caller("first-overlap"), preview.preview_id);
  try {
    await reached;
    const second = await service.batches.apply(caller("second-overlap"), preview.preview_id);
    assert.equal(second.complete, true);
    release(); assert.deepEqual(await first, second);
    const final = (await f.raw().list("project", "project-a")).find(entry => entry.memory_id === item.memory_id)!;
    assert.equal(final.version, item.version + 1); assert.ok(final.disabled);
    assert.equal(f.ledger().changesOf(item.memory_id).filter(change => change.kind === "disabled").length, 1);
    assert.deepEqual(await service.batches.apply(caller("after-overlap"), preview.preview_id), second);
  } finally { release(); await first; }
});
