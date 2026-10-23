import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCapability, AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryCaller, MemoryProposal } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";

const actor = LOCAL_PERSON_ACTOR_ID;
const person: MemoryCaller = { actor_id: actor, project_id: "project-a", consumer: "ui", person: true };
const caller = (operation: string): MemoryCaller => ({ actor_id: actor, project_id: "project-a", consumer: "assistant", current_scene: "assistant",
  purpose: "management", operation_id: operation, work: { work_id: operation, title: operation } });
const snapshot = (id: string, text: string): AgentMemorySourceSnapshot => ({ event_id: id, version: "1", text,
  speaker: { kind: "person", id: actor }, derivation: "original", occurred_at_ms: 1_795_000_000_000 });
const proposal = (text: string, extra: Partial<MemoryProposal> = {}): MemoryProposal => ({ text, kind: "convention", scope: "project", basis: "explicit", quote: text, ...extra });

async function fixture(t: Parameters<typeof memoryServiceHome>[0]) {
  const sources = new Map<string, AgentMemorySourceSnapshot>();
  const extraction = scriptedMemoryExtraction();
  const env = await memoryServiceHome(t, { projects: ["project-a"], generate: extraction.generate, sources: {
    async resolve(caller, request) {
      if (caller.actor_id !== actor || request.target.scope !== "project" || request.target.owner !== "project-a") return [];
      return request.refs.flatMap(ref => { const source = sources.get(ref.event_id); return source?.version === ref.version ? [source] : []; });
    },
    async check(caller, request) {
      if (caller.actor_id !== actor || request.target.scope !== "project" || request.target.owner !== "project-a") return false;
      return request.identities.every(identity => { const source = sources.get(identity.event_id); if (!source) return false;
        const { text: _text, ...current } = source; return isDeepStrictEqual(current, identity); });
    },
  } });
  let memory = await env.open();
  memory.savePrefs(person, "project", "assisted");
  memory.savePrefs(person, "personal", { learn_from_work: false });
  const learn = async (operation: string, originals: AgentMemorySourceSnapshot[], proposed = proposal(originals[0]!.text)) => {
    for (const source of originals) sources.set(source.event_id, source);
    extraction.set([proposed]);
    const result = await memory.learnFromWork(caller(operation), { said: originals.map(source => source.text), sources: originals });
    if (result.recording_error || !["completed", "skipped"].includes(result.formation.outcome))
      throw new ActionError(result.recording_error?.code ?? result.formation.code ?? "memory.conflict", "Source-bound learning did not complete", { details: { formation: result.formation } });
    return result.learned;
  };
  return { ...env, sources, extraction, capability: env.memory, memory: () => memory, learn, reopen: async () => { await env.close(); memory = await env.open(); return memory; } };
}

// MEM-09: actual Node candidate queue, formal CAS, journal and undo must finish; no mocked promotion owner.
test("MEM-09 two independent originals promote once; repeating an original under a new job is not evidence", { timeout: 20_000 }, async t => {
  const env = await fixture(t), text = "以后发布前先跑全量回归";
  const first = snapshot("person-input-1", text), second = snapshot("person-input-2", text);
  const initial = await env.learn("first", [first]);
  assert.equal(initial[0]!.outcome, "candidate");
  assert.equal((await env.memory().list(person, { scope: "project" })).items.length, 0);
  assert.deepEqual(await env.learn("different-job-same-original", [first]), []);
  assert.equal((await env.memory().candidates(person, { scope: "project" })).length, 1);
  const repeated = await env.learn("second", [second]);
  assert.equal(repeated[0]!.outcome, "written");
  const [entry] = (await env.memory().list(person, { scope: "project" })).items;
  assert.ok(entry);
  assert.equal(entry.basis, "repeated");
  assert.deepEqual(entry.approved_by, { by: "policy", policy: "memory.write-gate", version: 3 });
  const changes = env.memory().changes(person).filter(item => item.kind === "auto_kept");
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.undoable, true);
  assert.equal((await env.memory().history(person, entry.memory_id)).revisions.length, 1);
  assert.ok(!("source_refs" in (await env.memory().candidates(person, { scope: "project" }))[0]!), "internal source refs do not leak into Action views");
  await env.reopen();
  await env.memory().undo(person, changes[0]!.change_id);
  assert.equal((await env.memory().list(person, { scope: "project" })).items.length, 0);
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", [first, second]), false, "undo removal suppresses every contributing original");
});

test("MEM-09 whole-message meaning, unknown sources, non-person sources and duplicate source ids cannot promote", { timeout: 20_000 }, async t => {
  const env = await fixture(t);
  const text = "以后发布前先跑全量回归";
  const quoted = "假设同事说“以后发布前先跑全量回归”，不要把它当成我的要求。";
  const result = await env.learn("quoted", [snapshot("quote-1", quoted), snapshot("quote-2", quoted)], proposal(text));
  assert.equal(result[0]!.outcome, "candidate");
  assert.equal((await env.memory().candidates(person, { scope: "project" }))[0]!.basis, "inferred");
  assert.equal((await env.memory().offer(caller("naked-repeat"), { scope: "project", text: "以后邮件统一用中文", kind: "convention", basis: "repeated", why: "模型声称重复", from: "extraction" })).outcome, "candidate");
  const beforeModel = await env.raw(person).candidates.list("project", "project-a");
  await assert.rejects(env.learn("model", [{ ...snapshot("model-1", "以后版本号写在标题"), speaker: { kind: "model", id: "assistant" } }]), { code: "MEMORY_NOT_ACCEPTED" });
  assert.deepEqual(await env.raw(person).candidates.list("project", "project-a"), beforeModel, "non-person originals create no candidate");
  await env.learn("duplicate-ids", [snapshot("only-one", "以后先列风险"), snapshot("only-one", "以后先列风险")]);
  assert.equal((await env.memory().list(person, { scope: "project" })).items.length, 0);
});

test("MEM-09 committed formal with failed journal retries the original operation after restart without another write", { timeout: 20_000 }, async t => {
  const env = await fixture(t), text = "以后发布说明先列风险";
  const originals = [snapshot("retry-1", text), snapshot("retry-2", text)];
  const originalSave = env.ledger().saveChange.bind(env.ledger());
  let fail = true;
  t.mock.method(env.ledger(), "saveChange", record => {
    if (record.kind === "auto_kept" && fail) { fail = false; throw new Error("journal unavailable"); }
    originalSave(record);
  });
  await assert.rejects(env.learn("retry-operation", originals), (error: { code?: string; operation_id?: string; committed?: { version: number } }) => {
    assert.equal(error.code, "agent.memory_promotion_record_pending");
    assert.equal((error as ActionError).details?.formation && ((error as ActionError).details!.formation as { outcome: string }).outcome, "completed", "SDK formation facts survive the App journal failure");
    return true;
  });
  const [committed] = await env.raw(person).list("project", "project-a");
  assert.ok(committed);
  assert.equal(env.memory().changes(person).length, 0);
  await env.reopen();
  const retried = await env.learn("retry-operation", originals);
  assert.equal(retried[0]!.memory_id, committed.memory_id);
  const entries = await env.raw(person).list("project", "project-a");
  assert.deepEqual(entries.map(item => [item.memory_id, item.version]), [[committed.memory_id, 1]]);
  assert.equal(env.memory().changes(person).filter(item => item.kind === "auto_kept").length, 1);
  assert.equal((await env.memory().history(person, committed.memory_id)).revisions.length, 1);
});

test("MEM-09 prepare failure writes no formal; forgetting retains suppression through failed deletion and restart", { timeout: 20_000 }, async t => {
  const env = await fixture(t), text = "以后上线前先核对审批";
  const originals = [snapshot("prepare-1", text), snapshot("prepare-2", text)];
  const setMarker = env.ledger().setMarker.bind(env.ledger());
  let fail = true;
  t.mock.method(env.ledger(), "setMarker", (actor, key, body, at) => {
    if (key.endsWith(":promotion-journal") && fail) { fail = false; throw new Error("prepare unavailable"); }
    setMarker(actor, key, body, at);
  });
  await assert.rejects(env.learn("prepare-retry", originals), { code: "MEMORY_NOT_ACCEPTED" });
  assert.equal((await env.raw(person).list("project", "project-a")).length, 0);
  const result = await env.learn("prepare-retry", originals);
  assert.equal(result[0]!.outcome, "written");
  const preview = await env.memory().previewScope(person, "project");
  const capability = env.capability(), bound = capability.withCaller.bind(capability);
  let refusePurge = true;
  t.mock.method(capability, "withCaller", (...args: Parameters<AgentMemoryCapability["withCaller"]>) => {
    const memory = bound(...args);
    return { ...memory, candidates: { ...memory.candidates, purge: async (...input: Parameters<AgentMemoryCapability["candidates"]["purge"]>) => {
      if (refusePurge) { refusePurge = false; throw new Error("candidate delete unavailable"); }
      return memory.candidates.purge(...input);
    } } };
  });
  const deletion = { ...person, operation_id: "forget-prepared-originals" };
  await assert.rejects(env.memory().clearScope(deletion, "project", preview.fingerprint), /candidate delete unavailable/);
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", originals), false, "forgetting is durable before candidate deletion");
  assert.equal((await env.raw(person).list("project", "project-a")).length, 1, "failed cleanup did not claim formal removal");
  await env.memory().clearScope(deletion, "project", preview.fingerprint);
  await env.reopen();
  await assert.rejects(env.learn("relearn-old-source", originals), { code: "MEMORY_PROMOTION_HELD" }, "a suppressed original cannot regain automatic approval");
  assert.equal((await env.raw(person).list("project", "project-a")).length, 0);
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", [{ ...originals[0]!, version: "2" }]), false);
});

test("MEM-09 a source withdrawn during undo preparation prevents the formal commit", { timeout: 20_000 }, async t => {
  const env = await fixture(t), text = "以后提交前先检查类型";
  const originals = [snapshot("withdraw-1", text), snapshot("withdraw-2", text)];
  const prepare = env.memory().promotion.undo.prepare;
  t.mock.method(env.memory().promotion.undo, "prepare", async (caller, request) => {
    await prepare(caller, request);
    env.sources.delete(originals[1]!.event_id);
  });
  await assert.rejects(env.learn("withdraw-during-prepare", originals));
  assert.equal((await env.raw(person).list("project", "project-a")).length, 0);
  assert.equal(env.memory().changes(person).length, 0);
});

test("MEM-09 cancellation and current automatic/formation switches are rechecked after undo preparation", { timeout: 20_000 }, async t => {
  const env = await fixture(t), prepare = env.memory().promotion.undo.prepare;
  for (const mode of ["cancel", "auto", "form"] as const) {
    env.memory().savePrefs(person, "project", "assisted");
    const signal = new AbortController(), text = `以后发布说明先写${mode}结论`;
    const sources = [snapshot(`${mode}-1`, text), snapshot(`${mode}-2`, text)];
    for (const source of sources) env.sources.set(source.event_id, source);
    const mocked = t.mock.method(env.memory().promotion.undo, "prepare", async (caller, request) => {
      await prepare(caller, request);
      if (mode === "cancel") signal.abort();
      else env.memory().savePrefs(person, "project", { [mode]: false });
    });
    env.extraction.set([proposal(text)]);
    const result = await env.memory().learnFromWork({ ...caller(`stop-${mode}`), signal: signal.signal }, { said: [text], sources });
    assert.ok(result.recording_error, "the original formation receipt survives a stopped promotion");
    mocked.mock.restore();
    assert.equal((await env.raw(person).list("project", "project-a")).length, 0, mode);
    assert.equal(env.memory().changes(person).length, 0, mode);
  }
});

test("MEM-09 manual acceptance and explicit saves retain source identity for permanent forgetting", { timeout: 20_000 }, async t => {
  const env = await fixture(t), text = "以后邮件只写确认过的数字";
  const source = snapshot("accepted-source", text);
  const [suggestion] = await env.learn("manual-review", [source]);
  const accepted = await env.memory().accept(person, suggestion!.candidate_id!);
  await env.memory().change(person, { memory_id: accepted.memory!.memory_id, action: "remove" });
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", [source]), false);
  const explicit = snapshot("explicit-source", "以后邮件附上原始依据");
  env.sources.set(explicit.event_id, explicit);
  const saved = await env.memory().write(caller("explicit-write"), { scope: "project", text: explicit.text, said: explicit.text }, {
    originals: [explicit.text], sources: [explicit],
  });
  assert.equal(saved.outcome, "written");
  await env.memory().change(person, { memory_id: saved.memory!.memory_id, action: "remove" });
  await env.reopen();
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", [explicit]), false);
  await assert.rejects(env.memory().write(caller("replayed-explicit"), { scope: "project", text: explicit.text, said: explicit.text }, {
    originals: [explicit.text], sources: [explicit],
  }), { code: "memory.forbidden" });
});

test("MEM-09 replacement keeps prior source identities for permanent forgetting and an exact prior-version undo", { timeout: 20_000 }, async t => {
  const env = await fixture(t), before = "以后发布说明先列风险", after = "以后发布说明先列影响";
  const oldSources = [snapshot("old-1", before), snapshot("old-2", before)];
  const first = await env.learn("original-promotion", oldSources);
  const memoryId = first[0]!.memory_id!;
  const newSources = [snapshot("new-1", after), snapshot("new-2", after)];
  const changed = await env.learn("replacement-promotion", newSources, proposal(after, { supersedes: memoryId }));
  assert.equal(changed[0]!.outcome, "replaced");
  const [entry] = await env.raw(person).list("project", "project-a");
  assert.equal(entry!.memory_id, memoryId);
  assert.equal(entry!.version, 2);
  const change = env.memory().changes(person).find(item => item.kind === "auto_replaced")!;
  assert.equal(change.undoable, true);
  await env.reopen();
  await env.memory().undo(person, change.change_id);
  assert.equal((await env.raw(person).list("project", "project-a"))[0]!.text, before);
  await env.memory().change(person, { memory_id: memoryId, action: "remove" });
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", oldSources), false);
  assert.equal(env.memory().sourceAllowed(actor, "project", "project-a", newSources), false);
  assert.equal((await env.raw(person).candidates.list("project", "project-a")).length, 0);
});


test("MEM-09 a UUID learning operation keeps a bounded journal receipt and replays one committed version", { timeout: 20_000 }, async t => {
  const env = await fixture(t), text = "以后交付前先确认验收范围", operation = randomUUID();
  const originals = [snapshot("receipt-length-1", text), snapshot("receipt-length-2", text)];
  const [result] = await env.learn(operation, originals);
  assert.equal(result!.outcome, "written");
  const [change] = env.memory().changes(person);
  assert.ok(change && change.change_id.length <= 200, "the actual SDK receipt must fit its public contract");
  await env.reopen();
  assert.equal((await env.learn(operation, originals))[0]!.memory_id, result!.memory_id);
  assert.deepEqual((await env.raw(person).list("project", "project-a")).map(entry => [entry.memory_id, entry.version]), [[result!.memory_id, 1]]);
  assert.deepEqual(env.memory().changes(person).map(item => item.change_id), [change.change_id]);
  assert.equal((await env.memory().history(person, result!.memory_id!)).revisions.length, 1);
});
