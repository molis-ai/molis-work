import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryExtractionRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryClassRestriction } from "@molis-ai/molis-work-contracts/services/memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, observeMemoryBackend, originalMemorySources } from "./fixtures/memory-service-home.js";

const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true };
const worker = (operation_id: string): MemoryCaller => ({ ...person, person: false, consumer: "assistant", current_scene: "assistant", source_use: "learning", operation_id });
const rule = (read: MemoryClassRestriction["read"], form: MemoryClassRestriction["form"], selector: Partial<MemoryClassRestriction["selector"]> = {}): MemoryClassRestriction => ({
  selector: { consumer: "assistant", current_scene: "assistant", ...selector }, read, form,
});
const draft = (input: AgentMemoryExtractionRequest, text: string) => {
  const slot = input.slots.find(item => item.scope === "project" && !item.replacement && item.meta.kind === "convention");
  assert.ok(slot, "the production formation planner supplies the authorized destination");
  return { drafts: [{ slot_id: slot.id, text, suggested_basis: "inferred" as const,
    evidence: [{ source: { event_id: input.sources[0]!.event_id, version: input.sources[0]!.version }, quote: text }] }] };
};

test("proposal deduplication and the three-candidate limit use only authorized canonical classes across restart", async t => {
  const env = await memoryServiceHome(t, { projects: ["project-a", "project-b"] });
  let memory = await env.open();
  const work = { work_id: "bounded-work", title: "项目工作" };
  const input = (text: string, kind: "fact" | "convention" = "convention") => ({ scope: "project" as const, text, kind,
    basis: "inferred" as const, why: "待本人核对", from: "gate" as const });
  const hidden = [];
  for (const [index, text] of ["项目部署按阶段核验", "办公室位于河东", "采购窗口在周五"].entries())
    hidden.push(await memory.propose({ ...person, work, operation_id: `hidden-${index}` }, input(text, "fact")));
  memory.savePrefs(person, "project", { class_restrictions: [rule("off", "off", { kind: "fact" })] });
  const recipe = await memory.forRun({ ...worker("recipe"), session_id: "proposal-session" }, { query: "核对约定" });
  assert.ok(recipe);
  const caller: MemoryCaller = { ...worker("allowed-one"), source_use: "explicit", purpose: "task", session_id: "proposal-session",
    class_restrictions: recipe.class_restrictions, work };
  const allowed = await memory.propose(caller, input(hidden[0]!.text));
  assert.notEqual(allowed.candidate_id, hidden[0]!.candidate_id, "invisible text and three invisible notes cannot veto an authorized proposal");
  await assert.rejects(memory.propose({ ...caller, operation_id: "same" }, input(allowed.text)), /已经建议过/);
  await assert.rejects(memory.propose({ ...caller, operation_id: "similar" }, input(allowed.text + "结果")), /已经建议过/);
  await memory.propose({ ...caller, operation_id: "allowed-two" }, input("输出代码需包含注释"));
  await memory.propose({ ...caller, operation_id: "allowed-three" }, input("账单采用季度汇总"));
  await assert.rejects(memory.propose({ ...caller, operation_id: "fourth" }, input("测试报告附性能数据")), /3 条建议/);
  const before = env.ledger().candidates(person.actor_id);
  assert.equal(before.length, 6);
  const lookup = { scope: "project" as const, owner: "project-a", candidate_id: hidden[0]!.candidate_id };
  await assert.rejects(env.raw({ ...caller, purpose: "management" }).candidates.get(lookup), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal((await env.raw(person).candidates.get(lookup))?.candidate_id, lookup.candidate_id);
  await assert.rejects(env.raw(person).candidates.get({ ...lookup, owner: "project-b" }), /候选不属于指定范围/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(env.raw(person).candidates.get({ ...lookup, signal: controller.signal }), { name: "AbortError" });

  memory.savePrefs(person, "project", { class_restrictions: [rule("inherit", "off", { kind: "convention" })] });
  const closed = await memory.forRun({ ...caller, session_id: "closed-session" }, { query: "核对约定" }); assert.ok(closed);
  await assert.rejects(memory.propose({ ...caller, work: undefined, operation_id: "closed-current" }, input("发布先做安全核验")), { code: "MEMORY_SCOPE_DENIED" });
  memory.savePrefs(person, "project", { class_restrictions: [rule("off", "off", { kind: "fact" })] });
  await assert.rejects(memory.propose({ ...caller, work: undefined, class_restrictions: closed.class_restrictions,
    operation_id: "closed-frozen" }, input("发布先做安全核验")), { code: "MEMORY_SCOPE_DENIED" });
  assert.deepEqual(env.ledger().candidates(person.actor_id), before);
  await env.close(); memory = await env.open();
  await assert.rejects(memory.propose({ ...caller, operation_id: "same-after-restart" }, input(allowed.text)), /已经建议过/);
  await assert.rejects(memory.propose({ ...caller, operation_id: "fourth-after-restart" }, input("测试报告附性能数据")), /3 条建议/);
  assert.deepEqual(env.ledger().candidates(person.actor_id), before);
  assert.equal((await env.raw(person).candidates.list("project", "project-a")).length, 6);
});

for (const boundary of ["formal-read", "candidate-fallback"] as const) test(`proposal ignores candidates whose form authority closes during ${boundary}`, { timeout: 30_000 }, async t => {
  const env = await memoryServiceHome(t, { projects: ["project-a"] });
  const memory = await env.open(), work = { work_id: "changing-work", title: "核对约定" };
  const input = (text: string, kind: "fact" | "convention" | "experience" = "convention") => ({ scope: "project" as const,
    text, kind, basis: "inferred" as const, why: "待本人核对", from: "gate" as const });
  const first = await memory.propose({ ...person, work, operation_id: "first" }, input("项目部署按阶段核验", "fact"));
  if (boundary === "formal-read") {
    await memory.propose({ ...person, work, operation_id: "second" }, input("办公室位于河东", "fact"));
    await memory.propose({ ...person, work, operation_id: "third" }, input("采购窗口在周五", "fact"));
  } else await memory.propose({ ...person, work, operation_id: "hidden" }, input("先验证结果再整理经验", "experience"));
  const restrictions = boundary === "candidate-fallback" ? [rule("off", "off", { kind: "experience" })] : [];
  memory.savePrefs(person, "project", { learn_from_work: false, class_restrictions: restrictions });
  const recipe = await memory.forRun({ ...worker("prepare"), session_id: "changing-session" }, { query: "核对约定" }); assert.ok(recipe);
  const caller: MemoryCaller = { ...worker("authorized-convention"), source_use: "explicit", purpose: "task", session_id: "changing-session",
    class_restrictions: recipe.class_restrictions, work };
  const reached = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
  t.after(() => gate.resolve());
  let held = false;
  const backend = observeMemoryBackend(env.raw(), bound => ({ ...bound,
    async list(scope, owner) {
      const entries = await bound.list(scope, owner);
      if (boundary === "formal-read" && !held) { held = true; reached.resolve(); await gate.promise; }
      return entries;
    },
    candidates: { ...bound.candidates, async get(request) {
      if (boundary === "candidate-fallback" && !held) { held = true; reached.resolve(); await gate.promise; }
      return bound.candidates.get(request);
    } },
  }));
  const service = new MemoryService({ backend, ledger: env.ledger() });
  const pending = service.propose(caller, input(boundary === "formal-read" ? "账单采用季度汇总" : first.text));
  await reached.promise;
  memory.savePrefs(person, "project", { class_restrictions: [...restrictions, rule("inherit", "off", { kind: "fact" })] });
  gate.resolve();
  const proposed = await pending;
  assert.notEqual(proposed.candidate_id, first.candidate_id);
  assert.equal(proposed.kind, "convention");
  assert.equal(proposed.state, "pending");
  assert.equal(env.ledger().candidates(person.actor_id).filter(row => row.candidate_id === proposed.candidate_id).length, 1);
  assert.equal((await env.raw(person).candidates.get({ scope: "project", owner: "project-a", candidate_id: proposed.candidate_id }))?.text, proposed.text);
  await assert.rejects(service.propose({ ...caller, operation_id: "duplicate-explicit" }, input(proposed.text)), /已经建议过/,
    "explicit proposals still deduplicate while automatic work learning is off");
  assert.deepEqual(await env.raw(person).list("project", "project-a"), [], "proposal never creates formal memory");
});

for (const damage of ["missing", "corrupt"] as const) test(`an inaccessible but ${damage} canonical candidate still blocks proposal without ledger repair after restart`, async t => {
  const env = await memoryServiceHome(t, { projects: ["project-a"] });
  let memory = await env.open();
  const input = { scope: "project" as const, text: "候选原件必须保留", kind: "fact" as const, basis: "inferred" as const, why: "核对事实", from: "gate" as const };
  const candidate = await memory.propose({ ...person, operation_id: "original" }, input);
  memory.savePrefs(person, "project", { class_restrictions: [rule("off", "off", { kind: "fact" })] });
  const recipe = await memory.forRun({ ...worker("prepare"), session_id: "original-session" }, { query: "核对约定" }); assert.ok(recipe);
  const caller: MemoryCaller = { ...worker("retry-proposal"), source_use: "explicit", purpose: "task", session_id: "original-session",
    class_restrictions: recipe.class_restrictions };
  const notes = env.ledger().candidates(person.actor_id);
  if (damage === "missing") {
    await env.raw(person).candidates.purge({ scope: "project", owner: "project-a", candidate_id: candidate.candidate_id,
      expected_version: candidate.version, operation_id: "purge-original" });
  } else {
    await env.close();
    // Corrupt the actual persistent candidate through the public SDK store, preserving its metadata and CAS version.
    const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
    const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
    const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
    const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: join(env.home, "sdk") }) });
    try {
      const records = (await runtime.store.list({ kind: "memory-candidates" })).records; assert.equal(records.length, 1);
      const record = records[0]!;
      const body = JSON.parse(new TextDecoder().decode(await runtime.store.readSecure({ kind: "memory-candidates", id: record.id })));
      await runtime.store.commit({ kind: "memory-candidates", id: record.id, expectedVersion: record.version,
        metadata: record.metadata, secureBody: new TextEncoder().encode(JSON.stringify({ ...body, version: -1 })) });
    } finally { await runtime.shutdown(); }
    memory = await env.open();
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const expected = { code: damage === "missing" ? "memory.not_found" : "MEMORY_NOT_ACCEPTED" };
    await assert.rejects(memory.propose(caller, { ...input, text: "合法约定不能掩盖损坏", kind: "convention" }), expected);
    await assert.rejects(memory.candidates(person), expected);
    assert.deepEqual(env.ledger().candidates(person.actor_id), notes);
    assert.deepEqual(await env.raw(person).list("project", "project-a"), []);
    await env.close(); memory = await env.open();
  }
  if (damage === "missing") assert.deepEqual(await env.raw(person).candidates.list("project", "project-a"), []);
  else await assert.rejects(env.raw(person).candidates.list("project", "project-a"), { code: "MEMORY_NOT_ACCEPTED" });
});

// MEM-CLASS-01: real SDK candidates still form when the formal class is unreadable; no hidden context copies.
test("read off removes formal extraction context but allows new candidates and later person acceptance", async t => {
  const sources = originalMemorySources(["project-a"]), text = "以后发布前先写风险";
  const observed: AgentMemoryExtractionRequest[] = [];
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract(_caller, input) { observed.push(input); return draft(input, text); } } });
  const memory = await env.open();
  const existing = (await memory.write(person, { scope: "project", text: "既有发布约定", kind: "convention" })).memory!;
  for (const scope of ["personal", "project"] as const) memory.savePrefs(person, scope, { class_restrictions: [rule("off", "inherit")] });
  let formalReads = 0;
  const backend = observeMemoryBackend(env.raw(), bound => ({ ...bound, async list(scope, owner) {
    formalReads++; return bound.list(scope, owner);
  } }));
  const service = new MemoryService({ backend, ledger: env.ledger() });
  const result = await service.learnFromWork(worker("read-off-form"), { said: [text], sources: [sources.add("read-off-source", text)] });
  assert.equal(formalReads, 0, "read off prevents formal list hydration while form independently admits candidates");
  assert.equal(result.formation.extraction.calls, 1); assert.equal(result.learned[0]?.outcome, "candidate");
  assert.deepEqual(observed[0]!.context?.existing, []);
  assert.ok(!observed[0]!.slots.some(slot => slot.replacement?.memory_id === existing.memory_id));
  assert.deepEqual(await env.raw({ ...worker("read-off-task"), purpose: "task" }).list("project", "project-a"), []);
  assert.equal((await env.raw(person).list("project", "project-a")).length, 1);
  memory.savePrefs(person, "project", { class_restrictions: [rule("off", "off")] });
  const accepted = await memory.accept({ ...person, operation_id: "person-accept-off-class" }, result.learned[0]!.candidate_id!);
  assert.equal(accepted.memory?.text, text);
  assert.equal(accepted.candidate.state, "accepted");
  assert.equal((await env.raw(person).list("project", "project-a")).length, 2);
});

// MEM-CLASS-01 / MEM-34: the destination's lifecycle and the source class both restrict replacement slots.
test("formation filters complete new and replacement classes without hiding readable source context", async t => {
  const sources = originalMemorySources(["project-a"]), seen: AgentMemoryExtractionRequest[] = [];
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract(_caller, input) { seen.push(input); return { drafts: [] }; } } });
  const memory = await env.open();
  const fact = (await memory.write(person, { scope: "project", kind: "fact", text: "本项目交付日为周五" })).memory!;
  memory.savePrefs(person, "project", { class_restrictions: [rule("inherit", "off", { scene: "common", kind: "fact" }),
    rule("inherit", "off", { scene: "assistant", kind: "convention", lifecycle: "long-term" })] });
  const text = "以后都先核对交付日";
  const result = await memory.learnFromWork(worker("classified-slots"), { said: [text], sources: [sources.add("slot-source", text)] });
  assert.equal(result.formation.extraction.calls, 1);
  assert.ok(seen[0]!.context?.existing.some(entry => entry.memory_id === fact.memory_id), "read remains independently allowed");
  assert.ok(!seen[0]!.slots.some(slot => slot.replacement?.memory_id === fact.memory_id), "changing kind cannot bypass the original class restriction");
  assert.ok(!seen[0]!.slots.some(slot => slot.scope === "project" && !slot.replacement && slot.meta.kind === "convention"));
  assert.ok(seen[0]!.slots.some(slot => slot.scope === "project" && slot.meta.kind === "preference"));
});

// MEM-CLASS-02: all fixed destinations closed means no extractor or canonical source resolution.
test("all formation classes closed skips extraction and keeps independent manual saving", async t => {
  const sources = originalMemorySources(["project-a"]), resolve = t.mock.method(sources.port, "resolve"); let calls = 0;
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract() { calls++; return { drafts: [] }; } } });
  const memory = await env.open();
  for (const scope of ["personal", "project"] as const) memory.savePrefs(person, scope, { class_restrictions: [rule("inherit", "off")] });
  const text = "以后发布前都检查风险";
  const result = await memory.learnFromWork(worker("all-form-closed"), { said: [text], sources: [sources.add("closed-source", text)] });
  assert.equal(result.formation.outcome, "skipped"); assert.equal(result.formation.extraction.calls, 0);
  assert.equal(calls, 0); assert.equal(resolve.mock.callCount(), 0);
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.equal((await memory.write(person, { scope: "project", text: "本人明确保留的约定" })).outcome, "written");
});

// MEM-CLASS-02: the real SDK commit guard rejects output arriving after a class was closed.
test("closing a class while extraction is pending creates no late candidate or history", async t => {
  const sources = originalMemorySources(["project-a"]), text = "以后发布说明先列风险";
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract(_caller, input) { entered(); await gate; return draft(input, text); } } });
  const memory = await env.open();
  const pending = memory.learnFromWork(worker("late-class-result"), { said: [text], sources: [sources.add("late-source", text)] });
  await started; memory.savePrefs(person, "project", { class_restrictions: [rule("inherit", "off")] }); release();
  const result = await pending;
  assert.equal(result.formation.extraction.calls, 1);
  assert.ok(result.formation.outcome !== "completed");
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.deepEqual(await env.raw(person).list("project", "project-a"), []);
  assert.deepEqual(memory.changes(person), []);
});

// MEM-CLASS-02: dispatch rechecks the complete fixed slots after extraction was admitted.
test("closing a fixed slot before actual model dispatch prevents provider calls", async t => {
  const sources = originalMemorySources(["project-a"]); let dispatches = 0;
  let closeClass!: () => void;
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract(_caller, input) {
      closeClass(); await input.before_dispatch(); dispatches++; return { drafts: [] };
    } } });
  const memory = await env.open();
  closeClass = () => memory.savePrefs(person, "project", { class_restrictions: [rule("inherit", "off", { kind: "convention", lifecycle: "long-term" })] });
  const text = "以后发布前先核对风险";
  const result = await memory.learnFromWork(worker("dispatch-class-closed"), { said: [text], sources: [sources.add("dispatch-source", text)] });
  assert.equal(dispatches, 0); assert.ok(result.formation.outcome !== "completed");
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.deepEqual(memory.changes(person), []);
});

// MEM-CLASS-02: a later scope await cannot leave an earlier scope's captured body authorized for dispatch.
test("closing personal read during project reread prevents dispatch of captured formal context", { timeout: 60_000 }, async t => {
  const sources = originalMemorySources(["project-a"]), text = "以后发布前先核对风险";
  let dispatches = 0, holdProjectRead = false, entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract(_caller, input) {
      assert.ok(input.context?.existing.some(entry => entry.scope === "user"));
      assert.ok(input.context?.existing.some(entry => entry.scope === "project"));
      holdProjectRead = true;
      await input.before_dispatch();
      dispatches++;
      return draft(input, text);
    } } });
  const memory = await env.open();
  await memory.write(person, { scope: "personal", kind: "convention", text: "个人发布偏好：先写结论" });
  await memory.write(person, { scope: "project", kind: "convention", text: "项目发布约定：先核对风险" });
  const history = memory.changes(person);
  const backend = observeMemoryBackend(env.raw(), bound => ({ ...bound, async list(scope, owner) {
    const entries = await bound.list(scope, owner);
    if (holdProjectRead && scope === "project") { holdProjectRead = false; entered(); await gate; }
    return entries;
  } }));
  const service = new MemoryService({ backend, ledger: env.ledger() });
  const caller = worker("cross-scope-read-revoked");
  const recipe = await memory.forRun(caller, { query: text });
  const pending = service.learnFromWork({ ...caller, class_restrictions: recipe!.class_restrictions },
    { said: [text], sources: [sources.add("cross-scope-read-source", text)] });
  await waiting;
  memory.savePrefs(person, "personal", { class_restrictions: [rule("off", "inherit")] });
  release();
  const result = await pending;
  assert.equal(dispatches, 0, "personal read was revoked after its own canonical reread but before the project reread completed");
  assert.ok(result.formation.outcome !== "completed");
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.deepEqual(await env.raw(person).candidates.list("project", "project-a"), []);
  assert.equal((await env.raw(person).list("personal", person.actor_id)).length, 1);
  assert.equal((await env.raw(person).list("project", "project-a")).length, 1);
  assert.deepEqual(memory.changes(person), history);
});

// MEM-CLASS-02 / MEM-34: revoking only the original class must stop canonical replacement proposal creation.
test("closing only the replacement source class during extraction creates no canonical candidate", { timeout: 60_000 }, async t => {
  const sources = originalMemorySources(["project-a"]), text = "以后发布前先核对交付日期";
  let entered!: () => void, release!: () => void, originalId!: string;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: sources.port,
    extractor: { async extract(_caller, input) {
      const slot = input.slots.find(item => item.scope === "project" && item.replacement?.memory_id === originalId && item.meta.kind === "convention");
      assert.ok(slot, "an initially authorized fact-to-convention correction uses a fixed replacement slot");
      entered(); await gate;
      return { drafts: [{ slot_id: slot.id, text, suggested_basis: "inferred", evidence: [{
        source: { event_id: input.sources[0]!.event_id, version: input.sources[0]!.version }, quote: text,
      }] }] };
    } } });
  const memory = await env.open();
  originalId = (await memory.write(person, { scope: "project", kind: "fact", text: "本项目交付日为周五" })).memory!.memory_id;
  const original = await env.raw(person).list("project", "project-a"), history = memory.changes(person);
  const caller = worker("replacement-source-revoked");
  const recipe = await memory.forRun(caller, { query: text });
  const pending = memory.learnFromWork({ ...caller, class_restrictions: recipe!.class_restrictions },
    { said: [text], sources: [sources.add("replacement-source-only", text)] });
  await waiting;
  memory.savePrefs(person, "project", { class_restrictions: [rule("inherit", "off", { kind: "fact" })] });
  release();
  const result = await pending;
  assert.equal(result.formation.extraction.calls, 1);
  assert.deepEqual(await env.raw(person).candidates.list("project", "project-a"), [], "the original class is enforced before SDK candidate persistence");
  assert.deepEqual(await env.raw(person).list("project", "project-a"), original);
  assert.deepEqual(env.ledger().candidates(person.actor_id), []);
  assert.deepEqual(memory.changes(person), history);
});

// MEM-CLASS-02: this is after the SDK canonical proposal guard, inside the Host's final storage wait.
test("closing only the destination class during the final Host commit wait leaves no durable candidate", { timeout: 60_000 }, async t => {
  const sources = originalMemorySources(["project-a"]), text = "以后发布前先核对风险清单";
  let extracted = false, canonicalSourceChecked = false, heldCommit = false, entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const checkSource = sources.port.check.bind(sources.port);
  const env = await memoryServiceHome(t, { projects: ["project-a"], sources: { ...sources.port,
    async check(caller, request) {
      const allowed = await checkSource(caller, request);
      if (extracted && allowed) canonicalSourceChecked = true;
      return allowed;
    },
  }, extractor: { async extract(_caller, input) {
    assert.ok(input.slots.some(slot => slot.scope === "project" && slot.meta.kind === "fact"), "another class remains formable");
    const output = draft(input, text); // A new convention, not a replacement or promotion.
    extracted = true;
    return output;
  } } });
  const memory = await env.open();
  await memory.write(person, { scope: "project", kind: "fact", text: "本项目交付日为周五" });
  const original = await env.raw(person).list("project", "project-a"), history = memory.changes(person);
  const source = sources.add("final-commit-source", text), originals = structuredClone([...sources.entries]);
  const backend = prologueMemoryBackend(async () => env.memory(), {
    async beforeEffect() {
      if (!extracted || !canonicalSourceChecked || heldCommit) return;
      // Hold the real invocation gate after extraction and canonical source verification.
      // This gate precedes the SDK's final class fence; do not depend on its call count or
      // whether the adapter runs it in storage.commit or before authority authorization.
      assert.equal(canonicalSourceChecked, true, "the real SDK rechecked canonical sources after extraction");
      heldCommit = true; entered(); await gate;
    },
    assert_current() {}, // The invocation remains authorized; only its destination class changes.
  });
  const service = new MemoryService({ backend, ledger: env.ledger() });
  const caller = worker("destination-revoked-at-host-commit");
  const recipe = await memory.forRun(caller, { query: text });
  const pending = service.learnFromWork({ ...caller, class_restrictions: recipe!.class_restrictions }, { said: [text], sources: [source] });
  await Promise.race([waiting, pending.then(result => { throw new Error(`Formation ended before the final Host commit wait: ${JSON.stringify(result)}`); })]);
  memory.savePrefs(person, "project", { class_restrictions: [rule("inherit", "off", { kind: "convention" })] });
  assert.deepEqual(memory.prefsFor(person.actor_id, "project", "project-a").class_restrictions,
    [rule("inherit", "off", { kind: "convention" })], "fact and preference formation remain enabled");
  release();
  const result = await pending;
  assert.equal(result.formation.extraction.calls, 1);
  assert.equal(result.formation.code, "MEMORY_SCOPE_DENIED", "class revocation is an authority rejection, not a model extraction failure");
  // Reopen the actual owners: UI filtering or an empty App ledger must not hide an SDK durable write.
  await env.close();
  const reopened = await env.open();
  assert.deepEqual(await env.raw(person).candidates.list("project", "project-a"), [], "no SDK candidate survives the revoked final commit");
  assert.deepEqual(env.ledger().candidates(person.actor_id), [], "no App candidate was registered");
  assert.deepEqual(await env.raw(person).list("project", "project-a"), original, "the existing formal source is unchanged");
  assert.deepEqual([...sources.entries], originals, "canonical input sources are unchanged");
  assert.deepEqual(reopened.changes(person), history);
});
