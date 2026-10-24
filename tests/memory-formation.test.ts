import assert from "node:assert/strict";
import test from "node:test";
import { MemoryService, type MemoryCaller, type MemoryProposal } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryServiceHome, observeMemoryBackend, originalMemorySources, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";

// MEM-12/21/34/35: one persistent formation path, exact originals, bounded targets and current-authority recovery.
const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true };
const caller = (operation_id: string): MemoryCaller => ({ ...person, person: false, consumer: "assistant", current_scene: "assistant", purpose: "task", source_use: "learning", operation_id });
const proposal = (text: string, extra: Partial<MemoryProposal> = {}): MemoryProposal => ({ text, scope: "project", kind: "convention", basis: "explicit", quote: text, ...extra });
async function fixture(t: Parameters<typeof memoryServiceHome>[0]) {
  const originals = originalMemorySources(["project-a"]), extraction = scriptedMemoryExtraction();
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port, generate: extraction.generate });
  const memory = await env.open();
  memory.savePrefs(person, "project", "assisted");
  return { ...env, memory, originals, extraction };
}

test("MEM-FORM no standing signal reads no source and calls no extractor", async t => {
  const originals = originalMemorySources(["project-a"]);
  const resolve = t.mock.method(originals.port, "resolve");
  let calls = 0;
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port,
    extractor: { async extract() { calls += 1; return { drafts: [] }; } } });
  const memory = await env.open();
  const result = await memory.learnFromWork(caller("no-signal"), { said: ["帮我读一下资料"], sources: [originals.add("input", "帮我读一下资料")] });
  assert.equal(result.formation.outcome, "skipped");
  assert.equal(result.formation.extraction.calls, 0);
  assert.equal(resolve.mock.callCount(), 0);
  assert.equal(calls, 0);
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.deepEqual(memory.changes(person), []);
});

test("MEM-FORM task formation uses a restricted candidate context without granting management to its caller", async t => {
  const originals = originalMemorySources(["project-a"]), text = "以后发布先整理核对清单";
  const extracted: MemoryCaller[] = [];
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port, extractor: { async extract(who, input) {
    extracted.push(who);
    assert.equal(who.purpose, "task"); assert.equal(who.person, false);
    assert.deepEqual(input.context?.existing, [], "read-off formal bodies cannot enter the extractor through candidate management");
    assert.deepEqual(input.context?.pending.map(entry => entry.text), ["待本人认可的发布清单"]);
    const slot = input.slots.find(entry => entry.scope === "project" && entry.meta.kind === "convention" && !entry.replacement)!;
    return { drafts: [{ slot_id: slot.id, text, suggested_basis: "inferred" as const,
      evidence: [{ source: input.sources[0]!, quote: text }] }] };
  } } });
  const memory = await env.open();
  memory.savePrefs(person, "personal", { learn_from_work: false });
  await memory.write(person, { scope: "project", text: "禁止自动读取的正式项目事实", kind: "fact" });
  const pending = await memory.propose(person, { scope: "project", text: "待本人认可的发布清单", kind: "convention",
    basis: "inferred", why: "待本人确认", from: "extraction" });
  const recipe = await memory.forRun({ ...caller("context-recipe"), session_id: "formation-identity" }, { query: "发布核对" });
  assert.ok(recipe);
  const { purpose: _purpose, source_use: _use, ...worker } = { ...caller("formation-identity"), session_id: "formation-identity",
    class_restrictions: recipe.class_restrictions };
  memory.savePrefs(person, "project", { task_recall: false });
  const context = await memory.learningContext(worker);
  assert.deepEqual(context.existing, []);
  assert.deepEqual(context.pending.map(entry => entry.candidate_id), [pending.candidate_id]);
  const result = await memory.learnFromWork(worker, { said: [text], sources: [originals.add("identity-original", text)] });
  assert.equal(result.formation.outcome, "completed"); assert.equal(result.recording_error, undefined);
  assert.equal(result.learned[0]?.outcome, "candidate"); assert.equal(extracted.length, 1);
  assert.equal(extracted[0]!.session_id, worker.session_id);
  assert.deepEqual(extracted[0]!.class_restrictions, worker.class_restrictions);
  assert.ok(!("purpose" in worker), "normalizing the learning invocation must not mutate its owner caller");
  const task = { ...worker, purpose: "task" as const, source_use: "learning" as const };
  await assert.rejects(env.raw(task).candidates.list("project", "project-a"), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(env.raw(task).candidates.accept({ scope: "project", owner: "project-a", candidate_id: pending.candidate_id,
    expected_version: pending.version, operation_id: "task-cannot-accept" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal((await env.raw(person).candidates.get({ scope: "project", owner: "project-a", candidate_id: pending.candidate_id }))!.state, "pending");
  assert.equal((await env.raw(person).list("project", "project-a")).length, 1);
});

test("MEM-FORM independent full originals form once then use v3 promotion and original-operation replay", { timeout: 30_000 }, async t => {
  const env = await fixture(t), text = "以后发布说明先写风险";
  env.extraction.set([proposal(text)]);
  const firstSource = env.originals.add("first-original", text);
  const first = await env.memory.learnFromWork(caller("first-form"), { said: [text], sources: [firstSource] });
  assert.equal(first.formation.extraction.calls, 1);
  assert.equal(first.learned[0]?.outcome, "candidate");
  const repeated = await env.memory.learnFromWork(caller("same-original-new-job"), { said: [text], sources: [firstSource] });
  assert.deepEqual(repeated.formation.items, [], "the production extractor filters an already represented original before SDK writes");
  const secondSource = env.originals.add("second-original", text);
  const second = await env.memory.learnFromWork(caller("second-form"), { said: [text], sources: [secondSource] });
  assert.equal(second.recording_error, undefined);
  assert.equal(second.learned[0]?.outcome, "written");
  const memoryId = second.learned[0]!.memory_id!;
  assert.deepEqual((await env.raw(person).list("project", "project-a")).map(row => [row.memory_id, row.version]), [[memoryId, 1]]);
  const pending = await env.memory.candidates(person, { scope: "project" });
  assert.equal(pending.length, 1, "the original single-source candidate remains a real manageable pending candidate");
  assert.equal(pending[0]!.candidate_id, first.learned[0]!.candidate_id);
  await env.close(); const restarted = await env.open();
  const replay = await restarted.learnFromWork(caller("second-form"), { said: [text], sources: [secondSource] });
  assert.equal(replay.recording_error, undefined);
  assert.equal(replay.formation.items[0]?.outcome, "replayed");
  assert.deepEqual((await env.raw(person).list("project", "project-a")).map(row => [row.memory_id, row.version]), [[memoryId, 1]]);
  assert.equal(restarted.changes(person).filter(change => change.kind === "auto_kept").length, 1);
  const accepted = await restarted.accept({ ...person, operation_id: "accept-covered-original" }, pending[0]!.candidate_id, { expected_version: pending[0]!.version });
  assert.equal(accepted.memory!.memory_id, memoryId);
  assert.equal((await env.raw(person).list("project", "project-a")).length, 1, "accepting the covered original never adds a second formal memory");
});

test("MEM-FORM extraction excludes expired, disabled, paused and other-scene formal context without blocking new candidates", async t => {
  let now = new Date("2026-10-23T10:00:00Z");
  const originals = originalMemorySources(["project-a"]), extraction = scriptedMemoryExtraction();
  const contexts: Array<{ ids: string[]; targets: string[] }> = [];
  const env = await memoryServiceHome(t, { projects: ["project-a"], now: () => now, sources: originals.port, generate: extraction.generate });
  const memory = await env.open();
  const seed = async (text: string, expires_at?: string) => (await memory.write(person, { scope: "project", text, kind: "fact", ...(expires_at ? { expires_at } : {}) })).memory!;
  const expired = await seed("旧短期发布事实", "2026-10-23T11:00:00Z"), disabled = await seed("停用的发布事实"), paused = await seed("暂停的发布事实");
  await env.raw(person).disable({ scope: "project", owner: "project-a", memory_id: disabled.memory_id, expected_version: disabled.version, operation_id: "disable-context", reason: "本人停用" });
  await env.raw(person).pause({ scope: "project", owner: "project-a", memory_id: paused.memory_id, expected_version: paused.version, operation_id: "pause-context", reason: "原对象不可用" });
  const other = await memory.write({ ...person, current_scene: "coding" }, { scope: "project", text: "仅编程场景可读事实", kind: "fact" });
  const active = await seed("仍然生效的发布事实"); now = new Date("2026-10-23T12:00:00Z");
  const before = await env.raw(person).list("project", "project-a");
  const backend = observeMemoryBackend(env.raw(person), bound => ({ ...bound, candidates: { ...bound.candidates, async form(input) {
    contexts.push({ ids: input.context?.existing.map(row => row.memory_id) ?? [], targets: input.slots?.flatMap(slot => slot.replacement ? [slot.replacement.memory_id] : []) ?? [] });
    return bound.candidates.form(input);
  } } }));
  const service = new MemoryService({ backend, ledger: env.ledger() }), text = "以后发布前先列风险";
  extraction.set([proposal(text, { basis: "inferred" })]);
  const result = await service.learnFromWork(caller("exclude-inactive"), { said: [text], sources: [originals.add("active-source", text)] });
  assert.equal(result.formation.outcome, "completed"); assert.equal(result.learned.length, 1);
  assert.deepEqual(contexts[0]!.ids, [active.memory_id]);
  assert.deepEqual(new Set(contexts[0]!.targets), new Set([active.memory_id]));
  for (const id of [expired.memory_id, disabled.memory_id, paused.memory_id, other.memory!.memory_id]) assert.ok(!contexts[0]!.ids.includes(id));
  assert.deepEqual(await env.raw(person).list("project", "project-a"), before, "forming a candidate does not clear old states or extend their deadlines");
  memory.savePrefs(person, "personal", { task_recall: false }); memory.savePrefs(person, "project", { task_recall: false });
  const next = "以后发布后再归档", source = originals.add("recall-off-source", next); extraction.set([proposal(next, { basis: "inferred" })]);
  const noRecall = await service.learnFromWork(caller("form-without-task-recall"), { said: [next], sources: [source] });
  assert.equal(noRecall.formation.outcome, "completed"); assert.equal(noRecall.learned.length, 1);
  assert.deepEqual(contexts[1], { ids: [], targets: [] });
});

test("MEM-FORM model inferred stays pending with two originals; a person can accept its actual version", async t => {
  const env = await fixture(t), text = "以后发布前先整理风险";
  env.extraction.set([proposal(text, { basis: "inferred" })]);
  const result = await env.memory.learnFromWork(caller("inferred"), { said: [text], sources: [env.originals.add("a", text), env.originals.add("b", text)] });
  assert.equal(result.learned[0]?.outcome, "candidate");
  assert.equal((await env.raw(person).list("project", "project-a")).length, 0);
  const [held] = await env.memory.candidates(person, { scope: "project" });
  assert.equal(held!.basis, "inferred");
  const accepted = await env.memory.accept(person, held!.candidate_id, { expected_version: held!.version });
  assert.equal(accepted.memory!.text, text);
  assert.equal(accepted.memory!.approved_by?.by, "person");
});

for (const changed of ["task-permission", "formal-version", "pending-version"] as const) {
  test(`MEM-FORM ${changed} changed after snapshot prevents actual model dispatch`, { timeout: 15_000 }, async t => {
    const originals = originalMemorySources(["project-a"]), extraction = scriptedMemoryExtraction(), text = "以后发布先核对当前负责人";
    const generate = t.mock.fn(extraction.generate);
    const env = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port, generate });
    const service = await env.open();
    const formal = (await service.write(person, { scope: "project", text: "当前发布负责人是甲", kind: "fact" })).memory!;
    const pending = await service.propose(person, { scope: "project", text: "待确认的发布负责人", kind: "convention", basis: "inferred", why: "等待确认", from: "extraction" });
    // Keep the actual production extractor; the barrier is in the real SourcePort after the Service snapshot.
    const resolve = originals.port.resolve.bind(originals.port);
    let enter!: () => void, release!: () => void, waiting = true;
    const entered = new Promise<void>(done => { enter = done; }), held = new Promise<void>(done => { release = done; });
    t.mock.method(originals.port, "resolve", async (bound, request) => {
      if (waiting) { waiting = false; enter(); await held; }
      return resolve(bound, request);
    });
    extraction.set([proposal(text, { basis: "inferred" })]);
    const running = service.learnFromWork(caller(`stale-${changed}`), { said: [text], sources: [originals.add(`source-${changed}`, text)] });
    await Promise.race([entered, running.then(() => { throw new Error("Formation ended before source barrier"); })]);
    try {
      if (changed === "task-permission") service.savePrefs(person, "project", { task_recall: false });
      else if (changed === "formal-version") await service.change(person, { memory_id: formal.memory_id, expected_version: formal.version, action: "update", text: "本人改为由乙负责发布" });
      else await env.raw(person).candidates.discard({ scope: "project", owner: "project-a", candidate_id: pending.candidate_id!, expected_version: 1, operation_id: "discard-context" });
    } finally { release(); }
    const result = await running;
    assert.equal(result.formation.outcome, "failed");
    assert.equal(generate.mock.callCount(), 0, "the Service's fixed context must still be valid before actual model dispatch");
    assert.deepEqual(result.learned, []);
    assert.equal((await env.raw(person).candidates.list("project", "project-a")).length, 1);
    assert.equal(env.ledger().candidates(person.actor_id).length, 1);
  });
}

test("MEM-FORM cross-kind correction and dynamic task retain one frozen canonical target", async t => {
  const env = await fixture(t), original = await env.memory.write(person, { scope: "project", text: "发布说明是纯文字", kind: "fact" });
  const target = original.memory!, text = "以后发布说明改成表格";
  env.extraction.set([proposal(text, { kind: "convention", supersedes: target.memory_id, applies_when: "发布说明" })]);
  const formed = await env.memory.learnFromWork(caller("correction"), { said: [text], sources: [env.originals.add("correction-source", text)] });
  assert.equal(formed.recording_error, undefined);
  const [held] = await env.memory.candidates(person, { scope: "project" });
  assert.equal(held!.supersedes, target.memory_id);
  assert.deepEqual(held!.applies, { task: "发布说明" });
  const accepted = await env.memory.accept(person, held!.candidate_id, { expected_version: held!.version });
  assert.equal(accepted.memory!.memory_id, target.memory_id);
  assert.equal(accepted.memory!.version, target.version + 1);
  assert.equal(accepted.memory!.kind, "convention");
  assert.equal((await env.raw(person).list("project", "project-a")).length, 1);
});

test("MEM-FORM later edit and deletion never rebase a replacement or turn its accept into a creation", async t => {
  const env = await fixture(t);
  for (const mode of ["edit", "delete"] as const) {
    const original = await env.memory.write(person, { scope: "project", text: `原发布约定-${mode}`, kind: "fact" });
    const target = original.memory!, text = `以后发布约定改为先写${mode}`;
    env.extraction.set([{ ...proposal(text, { supersedes: target.memory_id }), replaces_text: target.text }]);
    const formed = await env.memory.learnFromWork(caller(`fixed-${mode}`), { said: [text], sources: [env.originals.add(mode, text)] });
    const id = formed.learned[0]!.candidate_id!;
    if (mode === "edit") await env.memory.change(person, { memory_id: target.memory_id, expected_version: target.version, action: "update", text: "本人后来的不同要求" });
    else await env.raw(person).remove({ scope: "project", owner: "project-a", memory_id: target.memory_id, expected_version: target.version, operation_id: "external-removal" });
    const before = await env.raw(person).list("project", "project-a");
    await assert.rejects(env.memory.accept({ ...person, operation_id: `accept-${mode}` }, id, { expected_version: 1 }));
    assert.deepEqual(await env.raw(person).list("project", "project-a"), before);
  }
});

test("MEM-FORM App registration failure retains SDK receipt and reopens the same candidate after restart", async t => {
  const env = await fixture(t), text = "以后邮件按日期排序";
  env.extraction.set([proposal(text, { basis: "inferred" })]);
  const source = env.originals.add("registration-source", text);
  const save = env.ledger().saveCandidate.bind(env.ledger());
  let fails = true;
  t.mock.method(env.ledger(), "saveCandidate", note => { if (fails) { fails = false; throw new Error("ledger unavailable"); } save(note); });
  const result = await env.memory.learnFromWork(caller("registration-op"), { said: [text], sources: [source] });
  assert.equal(result.formation.outcome, "completed");
  assert.equal(result.formation.items.length, 1);
  assert.equal(result.recording_error?.code, "memory.conflict");
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  const [actual] = await env.raw(person).candidates.list("project", "project-a"); assert.ok(actual);
  await env.close(); const restarted = await env.open();
  const recovered = await restarted.learnFromWork(caller("registration-op"), { said: [text], sources: [source] });
  assert.equal(recovered.formation.items[0]?.outcome, "replayed");
  assert.equal(recovered.recording_error, undefined);
  assert.deepEqual(env.ledger().candidates(person.actor_id).map(note => [note.candidate_id, note.version]), [[actual.candidate_id, 1]]);
  assert.equal((await env.raw(person).candidates.list("project", "project-a")).length, 1);
});

test("MEM-FORM cancellation after SDK commit leaves no new App body projection and preserves formation facts", async t => {
  const env = await fixture(t), controller = new AbortController(), text = "以后发布前整理清单";
  env.extraction.set([proposal(text)]);
  const backend = observeMemoryBackend(env.raw(person), bound => ({ ...bound, candidates: { ...bound.candidates,
    async form(input) { const result = await bound.candidates.form(input); controller.abort(); return result; } } }));
  const memory = new MemoryService({ backend, ledger: env.ledger() });
  const result = await memory.learnFromWork({ ...caller("cancel-after-form"), signal: controller.signal }, { said: [text], sources: [env.originals.add("cancel-source", text)] });
  assert.equal(result.formation.outcome, "completed");
  assert.equal(result.formation.items.length, 1);
  assert.ok(result.recording_error);
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.deepEqual(memory.changes(person), []);
  assert.equal((await env.raw(person).candidates.list("project", "project-a")).length, 1);
});

test("MEM-FORM a later source failure preserves partial candidates and usage for the original operation", async t => {
  const originals = originalMemorySources(["project-a"]);
  const a = originals.add("partial-a", "以后先写风险"), b = originals.add("partial-b", "以后再写建议");
  let extracted = false, refuseSecond = true;
  const resolve = originals.port.resolve.bind(originals.port);
  t.mock.method(originals.port, "resolve", async (caller, request) => {
    if (extracted && refuseSecond && request.refs.length === 1 && request.refs[0]!.event_id === b.event_id) throw new Error("source owner unavailable");
    return resolve(caller, request);
  });
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port, extractor: { async extract(_caller, input) {
    extracted = true;
    const slots = input.slots.filter(slot => slot.scope === "project" && slot.meta.kind === "convention" && !slot.replacement).slice(0, 2);
    return { drafts: slots.map((slot, index) => { const source = index === 0 ? a : b; return { slot_id: slot.id, text: source.text, suggested_basis: "inferred" as const,
      evidence: [{ source, quote: source.text }] }; }), usage: { input_tokens: 24, output_tokens: 8 } };
  } } });
  const memory = await env.open();
  const result = await memory.learnFromWork(caller("partial-form"), { said: [a.text, b.text], sources: [a, b] });
  assert.equal(result.formation.outcome, "partial");
  assert.deepEqual(result.formation.items.map(item => item.outcome), ["created", "unknown"]);
  assert.deepEqual(result.formation.extraction, { calls: 1, usage: { input_tokens: 24, output_tokens: 8 } });
  assert.equal(result.learned.length, 1); assert.equal(env.ledger().candidates(person.actor_id).length, 1);
  assert.deepEqual(await env.raw(person).list("project", "project-a"), []);
  const firstId = result.formation.items[0]!.candidate!.candidate_id;
  await env.close(); const reopened = await env.open(); refuseSecond = false; extracted = false;
  const retry = await reopened.learnFromWork(caller("partial-form"), { said: [a.text, b.text], sources: [a, b] });
  assert.equal(retry.formation.outcome, "completed");
  assert.deepEqual(retry.formation.items.map(item => item.outcome), ["replayed", "created"]);
  assert.equal(retry.formation.items[0]!.candidate!.candidate_id, firstId);
  assert.equal(env.ledger().candidates(person.actor_id).length, 2);
  assert.equal((await env.raw(person).candidates.list("project", "project-a")).length, 2);
});

test("MEM-FORM pending review context cannot expose another scene, private namespace or expired candidate", async t => {
  let now = new Date("2026-10-01T00:00:00Z");
  const originals = originalMemorySources(["project-a"]), extraction = scriptedMemoryExtraction();
  const env = await memoryServiceHome(t, { projects: ["project-a"], now: () => now, sources: originals.port, generate: extraction.generate });
  const memory = await env.open();
  const input = (text: string) => ({ scope: "project" as const, text, kind: "convention" as const, basis: "inferred" as const, why: "等待本人审阅", from: "extraction" as const });
  await memory.propose(person, input("旧等待约定"));
  now = new Date("2026-10-23T00:00:00Z");
  await memory.propose({ ...person, current_scene: "coding" }, input("编程专属约定"));
  await memory.propose(person, input("私有插件约定"), { classificationMeta: { classification: { scenes: ["common"], lifecycle: "long-term" }, namespace: "private-plugin" } });
  const visible = await memory.propose(person, input("公开待审约定"));
  const before = await env.raw(person).candidates.list("project", "project-a");
  let seen: string[] = [];
  const backend = observeMemoryBackend(env.raw(person), bound => ({ ...bound, candidates: { ...bound.candidates, async form(input) {
    seen = input.context?.pending.map(row => row.candidate_id) ?? []; return bound.candidates.form(input);
  } } }));
  const service = new MemoryService({ backend, ledger: env.ledger() }), text = "以后发布前核对负责人";
  extraction.set([proposal(text, { basis: "inferred" })]);
  const result = await service.learnFromWork(caller("pending-context"), { said: [text], sources: [originals.add("pending-context-source", text)] });
  assert.equal(result.formation.outcome, "completed");
  assert.deepEqual(seen, [visible.candidate_id]);
  const after = await env.raw(person).candidates.list("project", "project-a");
  assert.deepEqual(after.filter(row => before.some(old => old.candidate_id === row.candidate_id)), before);
});

test("MEM-FORM all 144 fixed destinations fit a real invocation and same-kind drafts remain independent", { timeout: 30_000 }, async t => {
  const originals = originalMemorySources(["project-a"]); let slots = 0, serialized = 0, offeredKinds: string[] = [];
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: originals.port, extractor: { async extract(_caller, input) {
    slots = input.slots.length; serialized = JSON.stringify(input.slots).length;
    offeredKinds = [...new Set(input.slots.map(slot => slot.meta.kind!))].sort();
    const choices = input.slots.filter(slot => slot.scope === "project" && slot.meta.kind === "convention" && !slot.replacement).slice(0, 2);
    return { drafts: choices.map((slot, index) => ({ slot_id: slot.id, text: `以后发布先完成步骤${index}`, suggested_basis: "inferred" as const,
      evidence: [{ source: input.sources[0]!, quote: "以后" }] })) };
  } } });
  await env.open();
  const plugin = "io.molis.work.coding";
  const coding: MemoryCaller = { ...caller("max-slots"), consumer: "agent", plugin_id: plugin, current_scene: "coding" };
  const meta = { kind: "convention", source: "manual" as const, approved_by: { by: "person" as const },
    classification: { scenes: ["coding"], lifecycle: "long-term" }, namespace: plugin,
    applies_when: { plugins: [plugin, ...Array.from({ length: 19 }, (_, i) => `${i}-${"p".repeat(180)}`)], task: "t".repeat(200) } };
  for (let i = 0; i < 30; i += 1) await env.raw(person).write({ scope: "project", owner: "project-a", operation_id: `large-meta-${i}`,
    text: `项目记录${i}使用独立规则${i * 17}`, origin: "本人已有的编程约定", meta });
  assert.equal((await env.raw({ ...coding, purpose: "task" }).list("project", "project-a")).length, 30,
    "large metadata must actually be readable under the current production task policy");
  let requestChars = 0, requestNodes = 0;
  const backend = observeMemoryBackend(env.raw(person), bound => ({ ...bound, candidates: { ...bound.candidates, async form(input) {
    requestChars = JSON.stringify(input).length;
    const count = (value: unknown): number => 1 + (value && typeof value === "object" ? Object.values(value).reduce<number>((sum, next) => sum + count(next), 0) : 0);
    requestNodes = count(input);
    t.diagnostic(JSON.stringify({ boundary: "MemoryBackend form input before scope/name translation", requestChars, requestNodes,
      slots: input.slots?.length, slotsChars: JSON.stringify(input.slots).length, slotsNodes: count(input.slots) }));
    return bound.candidates.form(input);
  } } }));
  const memory = new MemoryService({ backend, ledger: env.ledger() });
  const text = "以后发布按步骤完成";
  const defaults = await memory.learnFromWork({ ...coding, operation_id: "default-plugin-kinds" }, {
    said: [text], sources: [originals.add("default-plugin-source", text)] });
  assert.equal(defaults.formation.outcome, "completed");
  assert.equal(defaults.learned.length, 2);
  assert.equal(slots, 72, "default Coding offers only its two authorized kinds across the same scopes and targets");
  assert.deepEqual(offeredKinds, ["convention", "preference"]);
  for (const scope of ["personal", "project"] as const) memory.savePrefs(person, scope, {
    plugins: { [plugin]: { allowed: true, kinds: ["preference", "convention", "fact", "experience"] } } });
  const result = await memory.learnFromWork(coding, { said: [text], sources: [originals.add("max-slots-source", text)] });
  t.diagnostic(JSON.stringify({ boundary: "MemoryBackend form input including App context", requestChars, requestNodes, extractorSlotChars: serialized }));
  assert.equal(result.formation.outcome, "completed", JSON.stringify({ formation: result.formation, requestChars, requestNodes, serialized }));
  assert.equal(slots, 144);
  assert.equal(result.learned.length, 2);
  assert.equal(new Set(result.learned.map(item => item.candidate_id)).size, 2);
  assert.equal(result.learned.every(item => item.outcome === "candidate"), true);
});
