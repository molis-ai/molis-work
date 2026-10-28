import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, MEMORY_GATE_RULE, type MemoryCaller, type MemoryProposal } from "@molis-ai/molis-work-service-memory";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_NAME, AssistantStore, memoryRuntimePolicy, memorySources, memoryExtractor, prologueMemoryBackend, type HostTextGeneration } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryCapability, AgentMemoryExecutionControl, AgentMemoryFormationResult, AgentMemorySourceSnapshot, AgentRunRef, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryServiceHome, originalMemorySources, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";
import { learnFromQueuedWork, learnFromWork } from "../apps/local-host/dist/memory/memory-learning.js";
import { MEMORY_EXTRACT } from "../apps/local-host/dist/agent-definitions/system-prompts.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

function newProjectConvention(prompt: string): string {
  const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)) as {
    destinations: Array<{ scope: string; replacement?: string; slots: Record<string, string[]> }>;
  };
  const id = data.destinations.find(group => group.scope === "project" && !group.replacement)?.slots.convention?.[0];
  assert.ok(id, "the model must select a supplied project convention destination"); return id;
}

async function memoryHome(t: Parameters<typeof memoryServiceHome>[0]) {
  const sources = originalMemorySources(["project-q4"]), model = scriptedMemoryExtraction();
  let generate: HostTextGeneration = model.generate;
  const env = await memoryServiceHome(t, { projects: ["project-q4"], projectTitle: async () => "Q4 plan", sources: sources.port,
    generate: (prompt, options) => generate(prompt, options) });
  const service = await env.open();
  const learn = async (caller: MemoryCaller, input: { said: string[]; sources?: AgentMemorySourceSnapshot[]; proposals: MemoryProposal[] }) => {
    model.set(input.proposals);
    const originals = input.sources ?? input.said.map((text, index) => sources.add(`${caller.work!.work_id}:${index}`, text));
    return (await service.learnFromWork(caller, { said: input.said, sources: originals })).learned;
  };
  return { home: env.home, service, sources, learn, setGeneration: (next: HostTextGeneration) => { generate = next; }, model, env };
}

const inWork = (work_id: string, title: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", consumer: "assistant", work: { work_id, title } });
const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", consumer: "ui", person: true };
const riskFirst = { text: "Q4 plan 的周报把风险放在最前面", kind: "convention" as const, scope: "project" as const, applies_when: "写 Q4 plan 的周报时", basis: "explicit" as const };

test("a wish said once is only suggested; a second independent original is kept automatically, shown as a recent change, and undo removes it from storage and recall", { timeout: 60_000 }, async t => {
  const { service, sources, learn } = await memoryHome(t);
  const text = "以后周报都把风险放最前面，别放最后", request = { ...riskFirst, text, quote: text };
  const firstSaid = ["帮我写这周的周报", text];
  assert.equal(service.worthLearning(inWork("work-1", "周报 9/23"), firstSaid), true);
  const first = await learn(inWork("work-1", "周报 9/23"), { said: firstSaid, sources: [sources.add("input-first", text)], proposals: [request] });
  assert.deepEqual(first.map(item => item.outcome), ["candidate"], "once is not repeated: it waits for the person");
  const [waiting] = await service.candidates(person, { scope: "project" });
  assert.equal(waiting!.basis, "explicit");
  assert.match(waiting!.hold_reason!, /只有一份原始表态/);
  assert.equal((await service.list(person)).items.length, 0, "nothing kept yet");

  // A different original input, with the same complete meaning. A work label alone is never evidence.
  const second = await learn(inWork("work-2", "周报 9/30"), { said: [text], sources: [sources.add("input-second", text)],
    proposals: [{ ...request, same_as: waiting!.candidate_id }] });
  assert.deepEqual(second.map(item => item.outcome), ["written"]);
  const [kept] = (await service.list(person)).items;
  assert.equal(kept!.source, "auto");
  assert.equal(kept!.basis, "repeated");
  assert.deepEqual(kept!.approved_by, { by: "policy", policy: "memory.write-gate", version: 3 });
  assert.match(kept!.origin, new RegExp(`^${MEMORY_GATE_RULE}`));
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => [item.candidate_id, item.state]), [[waiting!.candidate_id, "pending"]], "the original single-source suggestion retains its real pending state");
  const [change] = service.changes(person, { scope: "project" });
  assert.equal(change!.kind, "auto_kept");
  assert.match(change!.reason!, /两份独立的本人原始表态/);
  assert.ok((await service.recall(inWork("work-3", "周报 10/7"), { query: "写周报" })).items.some(item => item.memory_id === kept!.memory_id));

  // Undo: gone from the store, never recalled again.
  await service.undo(person, change!.change_id);
  assert.equal((await service.list(person)).items.length, 0);
  assert.equal((await service.recall(inWork("work-3", "周报 10/7"), { query: "写周报 风险" })).items.length, 0);
});

test("only once, only inferred, a background fact, words the person never said, or 'don't remember' — none is written automatically", { timeout: 60_000 }, async t => {
  const { service, sources, learn } = await memoryHome(t);
  // Words not in what the person said: an inference, however the model labelled it.
  const invented = await learn(inWork("work-1", "周报"), { said: ["以后周报用表格吧"], proposals: [{ ...riskFirst, quote: "风险放最前面" }] });
  assert.deepEqual(invented, [], "fabricated evidence is rejected before any candidate write");
  assert.deepEqual(await service.candidates(person, { scope: "project" }), []);
  // An inferred one said "again" elsewhere is still not repeated explicit wishes.
  const again = await learn(inWork("work-2", "周报"), { said: ["以后周报用表格吧"], proposals: [{ ...riskFirst, quote: "风险放最前面" }] });
  assert.deepEqual(again, []);
  assert.equal((await service.list(person)).items.length, 0);

  // A background fact said in two works stays a suggestion (facts belong to the data they come from).
  const fact = { text: "记住 Q4 plan 的预算上限是 50 万", kind: "fact" as const, scope: "project" as const, basis: "explicit" as const };
  await learn(inWork("work-3", "预算"), { said: ["记住这个预算约束", fact.text], sources: [sources.add("budget-1", fact.text)], proposals: [{ ...fact, quote: fact.text }] });
  const factCandidate = (await service.candidates(person, { scope: "project" })).find(item => item.kind === "fact")!;
  const repeated = await learn(inWork("work-4", "预算"), { said: ["记住这个预算约束", fact.text], sources: [sources.add("budget-2", fact.text)], proposals: [{ ...fact, quote: fact.text, same_as: factCandidate.candidate_id }] });
  assert.equal(repeated[0]!.outcome, "candidate");
  assert.match(repeated[0]!.reason, /背景事实以原资料为准/);
  assert.equal((await service.list(person)).items.length, 0);

  // “Don't remember this”: nothing is formed at all.
  assert.equal(service.worthLearning(inWork("work-5", "x"), ["以后都用英文回复，这条不要记"]), false);
  assert.deepEqual(await learn(inWork("work-5", "x"), { said: ["以后都用英文回复，这条不要记"], proposals: [{ ...riskFirst, text: "都用英文回复", quote: "以后都用英文回复" }] }), []);
  // A round without a standing wish costs no model call.
  assert.equal(service.worthLearning(inWork("work-6", "x"), ["帮我总结一下这份材料"]), false);
  // Learning from work switched off.
  service.savePrefs(person, "project", { learn_from_work: false });
  service.savePrefs(person, "personal", { learn_from_work: false });
  assert.equal(service.worthLearning(inWork("work-7", "x"), ["以后周报都用要点"]), false);
});

// MEM-12: independent repetition verifies a source; it does not make an experience eligible for automatic approval.
test("an experience repeated in independent originals remains pending until the person accepts it", { timeout: 60_000 }, async t => {
  const { service, sources, learn } = await memoryHome(t);
  const proposal = { text: "记住预热缓存后发布告警通常更少", kind: "experience" as const, scope: "project" as const, basis: "explicit" as const, quote: "记住预热缓存后发布告警通常更少" };
  const first = await learn(inWork("experience-1", "首次复盘"), { said: [proposal.text], sources: [sources.add("experience-1", proposal.text)], proposals: [proposal] });
  assert.equal(first[0]!.outcome, "candidate");
  assert.match(first[0]!.reason, /经验.*认可/);
  assert.doesNotMatch(first[0]!.reason, /会自动记住/);
  const second = await learn(inWork("experience-2", "第二次复盘"), { said: [proposal.text], sources: [sources.add("experience-2", proposal.text)], proposals: [proposal] });
  assert.equal(second[0]!.outcome, "candidate");
  assert.notEqual(second[0]!.candidate_id, first[0]!.candidate_id, "a combined-source candidate cannot mutate the first original");
  assert.match(second[0]!.reason, /经验.*认可/);
  assert.deepEqual((await service.list(person, { scope: "project" })).items, []);
  const waiting = await service.candidates(person, { scope: "project" });
  assert.equal(waiting.length, 2);
  assert.ok(waiting.every(item => item.state === "pending"));
  const accepted = await service.accept(person, second[0]!.candidate_id!);
  assert.equal(accepted.memory!.kind, "experience");
  assert.deepEqual(accepted.memory!.approved_by, { by: "person" });
});

test("the drawing-out sends one registered instruction and the person's originals; malformed output writes nothing", { timeout: 60_000 }, async t => {
  const { service, sources, setGeneration } = await memoryHome(t);
  const sent: Array<{ prompt: string; options?: Parameters<HostTextGeneration>[1] }> = [];
  const reply = (structured: unknown): HostTextGeneration => async (prompt, options) => {
    sent.push({ prompt, options }); await options?.beforeDispatch?.();
    return { value: "{}", structured: typeof structured === "function" ? structured(prompt) : structured, run_ref: { kind: "run", id: "r", revision: 1 } as never,
      state: "completed", configuredModel: "m", reportedModels: [], usage: [], validateResult() {} };
  };
  const text = "以后周报都把风险放最前面";
  const request = { caller: inWork("work-1", "周报 9/23"), said: [text], sources: [sources.add("instruction-original", text)] };
  setGeneration(reply((prompt: string) => ({ drafts: [{ slot_id: newProjectConvention(prompt), text, suggested_basis: "explicit", evidence: [{ source_id: "s0", quote: text }] }] })));
  const outcome = await learnFromWork(service, request);
  assert.equal(outcome.ran, true); assert.deepEqual(outcome.learned.map(item => item.outcome), ["candidate"]);
  assert.ok(sent[0]!.prompt.startsWith(MEMORY_EXTRACT.body.slice(0, 20))); assert.match(sent[0]!.prompt, /以后周报都把风险放最前面/);
  assert.equal(sent[0]!.options?.structured?.mode, "local");
  setGeneration(reply({ nope: true }));
  const bad = await learnFromWork(service, { caller: inWork("work-2", "x"), said: ["以后都用要点列表"], sources: [sources.add("bad-original", "以后都用要点列表")] });
  assert.equal(bad.ran, true); assert.equal(bad.formation?.outcome, "failed"); assert.deepEqual(bad.learned, []);
  assert.equal((await service.candidates(person, { scope: "all" })).length, 1);
  const before = sent.length;
  assert.equal((await learnFromWork(service, { caller: inWork("work-3", "x"), said: ["帮我读一下这份材料"] })).ran, false);
  assert.equal(sent.length, before);
});

test("a personal wish learned in a project's works never names those works: not in the suggestion, the memory's provenance or the recent change", { timeout: 60_000 }, async t => {
  const { service, sources, learn } = await memoryHome(t);
  const unit = { text: "汇报里的金额统一用万元做单位", kind: "preference" as const, scope: "personal" as const, basis: "explicit" as const };
  await learn(inWork("work-1", "差旅费用 机票 18600 元"), { said: [unit.text], sources: [sources.add("unit-1", unit.text)], proposals: [{ ...unit, quote: unit.text }] });
  const [waiting] = await service.candidates(person, { scope: "personal" });
  assert.doesNotMatch(waiting!.why, /差旅费用|18600/);
  const second = await learn(inWork("work-2", "内容预算 视频制作 275000 元"), { said: [unit.text], sources: [sources.add("unit-2", unit.text)],
    proposals: [{ ...unit, quote: unit.text, same_as: waiting!.candidate_id }] });
  assert.deepEqual(second.map(item => item.outcome), ["written"]);
  const [kept] = (await service.list(person, { scope: "personal" })).items;
  assert.equal(kept!.scope, "personal");
  assert.match(kept!.origin, /两份独立的原始输入/);
  assert.doesNotMatch(kept!.origin, /差旅费用|内容预算|18600|275000/);
  const [change] = service.changes(person, { scope: "personal" });
  assert.doesNotMatch(change!.reason ?? "", /差旅费用|内容预算/);
});

test("the model's same_as is only a pointer: the gate ties by the words, so a different wish is never auto-kept for it, and a restatement it cannot be sure of waits beside the old one", { timeout: 60_000 }, async t => {
  const { service, learn } = await memoryHome(t);
  await learn(inWork("work-1", "周报 9/23"), { said: ["以后周报都把风险放最前面，别放最后"], proposals: [{ ...riskFirst, quote: "以后周报都把风险放最前面" }] });
  const [waiting] = await service.candidates(person, { scope: "project" });

  // Another work, an unrelated wish the model calls "the same": nothing ties the two, so it is its own suggestion and the old one keeps waiting.
  const unrelated = await learn(inWork("work-2", "翻译"), { said: ["以后回答都用中文"],
    proposals: [{ text: "回答用中文", kind: "preference", scope: "project", basis: "explicit", quote: "回答都用中文", same_as: waiting!.candidate_id }] });
  assert.deepEqual(unrelated.map(item => [item.outcome, item.text]), [["candidate", "回答用中文"]], "the new wish is not dropped and not written");
  assert.equal((await service.list(person)).items.length, 0, "the model's claim wrote nothing");
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => [item.text, item.work!.work_id]).sort(), [[riskFirst.text, "work-1"], ["回答用中文", "work-2"]]);

  // The person may have said the first wish again in other words, but the gate cannot be sure it is the same wish: both wait for the person, nothing is kept.
  const restated = await learn(inWork("work-3", "周报 9/30"), { said: ["以后周报还是把风险放在最前面"],
    proposals: [{ ...riskFirst, text: "周报把风险放在最前面", quote: "以后周报还是把风险放在最前面", same_as: waiting!.candidate_id }] });
  assert.deepEqual(restated.map(item => [item.outcome, item.text]), [["candidate", "周报把风险放在最前面"]]);
  assert.equal((await service.list(person)).items.length, 0);
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => item.work!.work_id).sort(), ["work-1", "work-2", "work-3"]);
});

test("wishes that share wording are different wishes: the model's same_as never makes the gate keep the old one and drop the new one", { timeout: 60_000 }, async t => {
  const { service, learn } = await memoryHome(t);
  const standing = { kind: "preference" as const, scope: "personal" as const, basis: "explicit" as const };
  const waitingTexts = async () => (await service.candidates(person, { scope: "personal" })).map(item => item.text).sort();
  for (const [first, second] of [
    [{ text: "回答都用要点列表", said: "以后回答都用要点列表" }, { text: "回答都用中文", said: "以后回答都用中文" }],
    [{ text: "Always reply in bullet points", said: "Always reply in bullet points" }, { text: "Always reply in Chinese", said: "Always reply in Chinese" }],
  ] as const) {
    await learn(inWork(`${first.text}-1`, "整理"), { said: [first.said], proposals: [{ ...standing, text: first.text, quote: first.said }] });
    const [old] = (await service.candidates(person, { scope: "personal" })).filter(item => item.text === first.text);
    const later = await learn(inWork(`${second.text}-2`, "翻译"), { said: [second.said], proposals: [{ ...standing, text: second.text, quote: second.said, same_as: old!.candidate_id }] });
    assert.deepEqual(later.map(item => [item.outcome, item.text]), [["candidate", second.text]], "the new wish is its own suggestion, not dropped");
    assert.equal((await service.list(person, { scope: "personal" })).items.length, 0, "and nothing was kept for the old one");
    assert.deepEqual((await waitingTexts()).filter(text => text === first.text || text === second.text), [first.text, second.text].sort(), "both wait for the person");
  }
});

test("a wish drawn out of work that is the same words as a memory already kept is skipped; one that differs by a symbol or a comma says something else, so it waits for the person", { timeout: 60_000 }, async t => {
  const { service, learn } = await memoryHome(t);
  await service.write(person, { scope: "project", text: "金额>1000要先问我" });
  const said = ["以后金额<1000要先问我"];
  const same = await learn(inWork("work-1", "报销"), { said, proposals: [{ ...riskFirst, text: "金额>1000要先问我。", quote: "金额<1000要先问我" }] });
  assert.deepEqual(same, [], "an already-kept statement is filtered before any candidate write");
  const flipped = await learn(inWork("work-2", "报销"), { said, proposals: [{ ...riskFirst, text: "金额<1000要先问我", quote: "金额<1000要先问我" }] });
  assert.deepEqual(flipped.map(item => item.outcome), ["candidate"]);
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => item.text), ["金额<1000要先问我"]);
});

test("deleted project sources are checked before the model and again before the candidate write", { timeout: 60_000 }, async t => {
  const { service, sources, model, setGeneration } = await memoryHome(t);
  const text = "以后周报都把风险放最前面";
  let asked = 0, exists = true, during: () => void = () => {};
  const check = sources.port.check;
  t.mock.method(sources.port, "check", (caller: Parameters<typeof check>[0], request: Parameters<typeof check>[1]) =>
    exists ? check(caller, request) : Promise.resolve(false));
  model.set([{ ...riskFirst, text, quote: text }]);
  setGeneration(async (prompt, options) => { asked++; during(); return model.generate(prompt, options); });
  const request = { caller: inWork("work-1", "周报 9/23"), said: [text], sources: [sources.add("project-original", text)] };
  const kept = async () => (await service.candidates(person, { scope: "all" })).length + (await service.list(person)).items.length;
  const early = await learnFromWork(service, request, async () => false);
  assert.equal(early.ran, false); assert.deepEqual(early.learned, []); assert.equal(asked, 0);
  during = () => { exists = false; };
  const late = await learnFromWork(service, request, async () => exists);
  assert.equal(asked, 1); assert.equal(late.ran, true); assert.equal(late.formation?.outcome, "failed");
  assert.deepEqual(late.learned, []); assert.equal(await kept(), 0);
  exists = true; during = () => {};
  const there = await learnFromWork(service, { ...request, caller: inWork("work-2", "周报") }, async () => true);
  assert.deepEqual(there.learned.map(item => item.outcome), ["candidate"]); assert.equal(await kept(), 1);
});

async function reached<T>(read: () => Promise<T> | T): Promise<Exclude<T, false | null | undefined>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as Exclude<T, false | null | undefined>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("The real learning queue did not settle");
}

/** Real source stores, Runtime queue and SDK writes; only the provider's answer is controlled. */
async function queuedLearning(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-originals-"));
  let roundGate: Promise<void> | null = null, modelCalls = 0, alive = true;
  const asked = Promise.withResolvers<void>();
  t.mock.method(globalThis, "fetch", async () => { asked.resolve(); await roundGate; return cogniaModelResponse("完成。"); });
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME), originals = new AssistantStore(db), ledger = openMemoryLedger({ homeDirectory: home });
  let service: MemoryService, memoryAlive = true, beforeCandidateWrite: (() => void) | undefined;
  let formed = false, afterCandidateRead: (() => Promise<void>) | undefined, afterCandidateCheck: (() => void) | undefined;
  // Queue invalidation below is injected through its existing Host ports. This real policy owner keeps the
  // declared scratch project available for independent persisted-state inspection after that invocation ends.
  const policyOwner = {
    alive: () => memoryAlive, prefsFor: (scope: Parameters<MemoryService["prefsFor"]>[1], owner: string | null) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, owner),
    owners: (project: string) => ledger.owners(project), candidateOwners: (project: string) => ledger.candidateOwners(project),
    projectExists: async (project: string) => project === "project-q4", deletingProject: () => undefined,
  };
  // Observe the capability actually bound by production backend.withCaller/withExecution, preserving every guard.
  const observe = (memory: AgentMemoryCapability): AgentMemoryCapability => ({ ...memory,
    candidates: { ...memory.candidates,
      form: async input => { const result = await memory.candidates.form(input); formed = result.items.some(item => !!item.candidate); return result; },
      get: async (...args) => {
        const result = await memory.candidates.get(...args);
        if (formed) { const after = afterCandidateRead; afterCandidateRead = undefined; await after?.(); }
        return result;
      },
    },
    withCaller: caller => observe(memory.withCaller(caller)),
    ...(memory.withExecution ? { withExecution: (control: Parameters<NonNullable<AgentMemoryCapability["withExecution"]>>[0]) => observe(memory.withExecution!({
      beforeEffect: async () => {
        await control.beforeEffect();
        if (extracted) { const after = afterCandidateCheck; afterCandidateCheck = undefined; after?.(); }
      },
      assert_current: () => control.assert_current(),
    })) } : {}),
  });
  let extracted = false;
  const observedSources = (sources: ReturnType<typeof memorySources>): ReturnType<typeof memorySources> => ({ ...sources,
    check: async (caller, request) => { if (extracted) { const before = beforeCandidateWrite; beforeCandidateWrite = undefined; before?.(); } return sources.check(caller, request); } });
  const open = async () => {
    const value = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: { ...memoryRuntimePolicy(() => policyOwner, memoryExtractor(home, () => generate)), sources: observedSources(memorySources(home, () => ({ adapter, policy: policyOwner,
        sourceAllowed: (actor, scope, owner, refs) => service.sourceAllowed(actor, scope, owner, refs),
        sessionAllowed: async owner => owner.actor_id === LOCAL_PERSON_ACTOR_ID && owner.project_id === "project-q4"
          && owner.plugin_id === ASSISTANT_PLUGIN_ID && owner.install_id === ASSISTANT_INSTALL_ID,
      }))), promotion: { policy: "memory.write-gate", version: 3, decide: (caller, request) => service.promotion.decide(caller, request),
        undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } },
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
    const withCaller = value.memory!.withCaller.bind(value.memory!);
    t.mock.method(value.memory!, "withCaller", (caller: Parameters<AgentMemoryCapability["withCaller"]>[0]) => observe(withCaller(caller)));
    memoryAlive = true;
    return value;
  };
  let adapter = await open();
  const backend = prologueMemoryBackend(async () => adapter.memory!), ports = { backend, ledger, projectTitle: async () => "Q4 plan" };
  service = new MemoryService(ports);
  const outcomes: Awaited<ReturnType<typeof learnFromQueuedWork>>[] = [];
  const failures: Array<{ formation?: AgentMemoryFormationResult; recording_error?: { code: string } }> = [];
  const failed = Promise.withResolvers<void>();
  let inModel: () => Promise<void> = async () => {}, afterLearning: () => void = () => {}, projectExists = true;
  const generate: HostTextGeneration = async (prompt, options) => {
    await options?.beforeDispatch?.(); modelCalls++; await inModel(); extracted = true;
    return { value: "{}", structured: { drafts: [{ slot_id: newProjectConvention(prompt), text: "以后周报都把风险放最前面", suggested_basis: "explicit", evidence: [{ source_id: "s0", quote: "以后周报都把风险放最前面" }] }] }, run_ref: { kind: "run", id: "fixture", revision: 1 } as never,
      state: "completed" as const, configuredModel: "fixture", reportedModels: [], usage: [], validateResult: () => undefined };
  };
  const attach = () => adapter.schedule!.handle("memory.learn", async task => {
    try {
      outcomes.push(await learnFromQueuedWork(home, task,
        { adapter, service, ports, backend: (control: AgentMemoryExecutionControl) => prologueMemoryBackend(async () => adapter.memory!, control), alive: () => alive, projectExists: async () => projectExists }));
      afterLearning();
    } catch (error) {
      if (error instanceof ActionError) failures.push(error.details ?? {});
      failed.resolve(); throw error;
    }
  });
  const start = async (text = "以后周报都把风险放最前面", written_by?: "page", options: {
    previous?: { work: ReturnType<AssistantStore["create"]>; ref: AgentRunRef }; withoutMemory?: boolean;
  } = {}) => {
    const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
    const session = options.previous ? (await adapter.readSession({ session_id: options.previous.ref.session_id, runtime_id: adapter.descriptor.runtime_id })).session
      : await adapter.createSession({ ...owner, workspace: "none", role_id: "assistant", title: "周报" });
    const work = options.previous?.work ?? originals.create({ actor_id: owner.actor_id, title: "周报", scope: { kind: "project", project_id: owner.project_id }, project_ref: { project_id: owner.project_id, storage_key: "memory:project-q4" }, origin: null });
    originals.update(owner.actor_id, work.work_id, null, { session_id: session.session_id });
    const original_input = { input_id: crypto.randomUUID(), text, written_by: written_by ? "host" as const : "person" as const, occurred_at: new Date().toISOString() };
    const memory = options.withoutMemory ? null : await service.forRun({ actor_id: owner.actor_id, project_id: owner.project_id,
      consumer: "assistant", session_id: session.session_id, work: { work_id: work.work_id, title: work.title } }, { query: text });
    const handle = await adapter.start({ ...owner, session, workspace: "none", task: text, role_id: "assistant", original_input,
      role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [], ...(memory ? { memory } : {}) } });
    originals.addRound(work.work_id, { run_id: handle.ref.run_id, text, ...(written_by ? { written_by } : {}), materials: [], context: null, started_at: new Date().toISOString() });
    const task = { key: `memory-learn:${work.work_id}:${handle.ref.run_id}`, session_id: session.session_id,
      payload: { actor_id: owner.actor_id, work_id: work.work_id, session_id: session.session_id, run_id: handle.ref.run_id,
        sources: [{ run_id: handle.ref.run_id, input_id: null as string | null, version: "1", original: { session_id: session.session_id, input_id: original_input.input_id, version: 1 } }] } };
    return { work, ref: handle.ref, task };
  };
  const ended = (ref: AgentRunRef) => reached(async () => { const run = await adapter.read(ref); return ["completed", "cancelled"].includes(run.phase) && run; });
  const enqueue = (task: Pick<AgentScheduledTask, "key" | "session_id" | "payload">, due = Date.now(), max_attempts = 1) => adapter.schedule!.enqueue({ ...task, kind: "memory.learn", due_at: new Date(due).toISOString(), max_attempts });
  const settled = (key: string) => reached(() => { const task = adapter.schedule!.find(key); return task && ["done", "failed"].includes(task.state) && task; });
  const empty = async () => {
    assert.deepEqual(await service.candidates(person, { scope: "all", anywhere: true }), []);
    assert.deepEqual((await service.list(person)).items, []);
    assert.deepEqual(service.changes(person), [], "no application history was left behind");
  };
  t.after(async () => { alive = false; memoryAlive = false; await adapter.close(); ledger.close(); db.close(); await rm(home, { recursive: true, force: true }); });
  return { home, originals, service, start, ended, enqueue, settled, empty, attach, outcomes, asked, failures, failed,
    notes: () => ledger.candidates(LOCAL_PERSON_ACTOR_ID),
    get adapter() { return adapter; }, get modelCalls() { return modelCalls; },
    holdRound: (gate: Promise<void>) => { roundGate = gate; }, duringModel: (fn: () => Promise<void>) => { inModel = fn; },
    afterLearning: (fn: () => void) => { afterLearning = fn; },
    projectRemoved: () => { projectExists = false; }, stopHost: () => { alive = false; },
    beforeCandidateWrite: (fn: () => void) => { beforeCandidateWrite = fn; },
    afterCandidateCheck: (fn: () => void) => { afterCandidateCheck = fn; },
    afterCandidateRead: (fn: () => Promise<void>) => { afterCandidateRead = fn; },
    restart: async () => { memoryAlive = false; await adapter.close(); adapter = await open(); },
  };
}

test("MEM-SOURCE-01: a references-only learning task survives restart, learns once, and preserves candidate accept/history/delete", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start();
  assert.equal((await fixture.ended(first.ref)).phase, "completed");
  const queued = await fixture.enqueue(first.task, Date.now() + 250);
  assert.equal(JSON.stringify(queued.payload).includes("以后周报"), false, "the queue does not duplicate original text");
  await fixture.restart(); fixture.attach();
  assert.equal((await fixture.settled(first.task.key)).state, "done");
  assert.equal(fixture.modelCalls, 1);
  const [candidate] = await fixture.service.candidates(person, { scope: "project" });
  assert.equal(candidate!.basis, "explicit");
  assert.equal(candidate!.work?.work_id, first.work.work_id);
  await fixture.enqueue(first.task);
  assert.equal(fixture.adapter.schedule!.find(first.task.key)!.runs, 1, "replay names the same task");
  await fixture.restart(); fixture.attach();
  assert.deepEqual((await fixture.service.candidates(person, { scope: "project" })).map(item => item.candidate_id), [candidate!.candidate_id]);
  assert.equal(fixture.modelCalls, 1, "a completed task is not modeled again after restart");
  const accepted = await fixture.service.accept(person, candidate!.candidate_id, { expected_version: candidate!.version });
  assert.equal((await fixture.service.history(person, accepted.memory!.memory_id)).revisions.length, 1);
  const [change] = fixture.service.changes(person);
  await assert.rejects(fixture.service.undo(person, change!.change_id), { code: "memory.invalid" }, "manual acceptance retains its existing non-undoable contract");
  await fixture.service.change(person, { memory_id: accepted.memory!.memory_id, expected_version: accepted.memory!.version, action: "remove" });
  assert.deepEqual((await fixture.service.list(person)).items, []);
});

test("MEM-SOURCE-07: a real queue retry after candidate commit remains one source, and a renamed job cannot make it independent", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  let attempts = 0;
  fixture.afterLearning(() => { if (++attempts === 1) throw new Error("fixture: reply lost after learning committed"); });
  fixture.attach(); await fixture.enqueue(first.task, Date.now(), 2);
  assert.equal((await fixture.settled(first.task.key)).state, "done");
  assert.equal(fixture.modelCalls, 2, "the Runtime really retried the callback");
  assert.deepEqual(fixture.outcomes.map(item => item.learned.map(one => one.outcome)), [["candidate"], ["candidate"]], "the same operation replays its committed result");
  const [candidate] = await fixture.service.candidates(person, { scope: "project" });
  assert.equal(candidate!.basis, "explicit");
  const sdkCandidates = await fixture.adapter.memory!.withCaller({ ...person, current_scene: "common", purpose: "management" }).candidates.list("project", "project-q4");
  assert.equal(sdkCandidates.length, 1);
  assert.equal(sdkCandidates[0]!.version, 1, "the retry did not update the original candidate");
  assert.equal(sdkCandidates[0]!.sources?.length, 1, "one original remains one source");
  assert.deepEqual(fixture.outcomes.flatMap(item => item.learned.map(one => one.candidate_id)), [candidate!.candidate_id, candidate!.candidate_id]);
  assert.equal(sdkCandidates[0]!.meta?.evidence?.length, 1, "replay did not add a second occurrence");
  assert.deepEqual((await fixture.service.list(person)).items, []); assert.deepEqual(fixture.service.changes(person), []);
  const renamed = { ...first.task, key: `${first.task.key}:different-job` };
  await fixture.enqueue(renamed); assert.equal((await fixture.settled(renamed.key)).state, "done");
  assert.equal(fixture.modelCalls, 2, "renaming the job loses its original work/run binding and cannot trigger another extraction");
  assert.equal(fixture.outcomes.at(-1)!.ran, false);
  assert.deepEqual((await fixture.service.candidates(person, { scope: "project" })).map(item => item.candidate_id), [candidate!.candidate_id]);
});

test("MEM-SOURCE-08: a completed supplementary source without its original time never starts extraction", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  const text = "以后周报都把风险放最前面";
  const sent = await fixture.adapter.inputs!.send(first.ref, { text, key: "learning.unknown-time", mode: "after-run" });
  const session = (await fixture.adapter.readSession({ session_id: first.ref.session_id, runtime_id: fixture.adapter.descriptor.runtime_id })).session;
  const memory = await fixture.service.forRun({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", consumer: "assistant", session_id: session.session_id }, { query: text });
  assert.ok(memory);
  const next = await fixture.adapter.start({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", plugin_id: ASSISTANT_PLUGIN_ID,
    install_id: ASSISTANT_INSTALL_ID, session, workspace: "none", task: "继续处理排队的输入", role_id: "assistant", queued: "carry",
    role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [], memory } });
  fixture.originals.addRound(first.work.work_id, { run_id: next.ref.run_id, text: "继续处理排队的输入", written_by: "host",
    materials: [], context: null, started_at: new Date().toISOString() });
  const completed = await fixture.ended(next.ref), receipt = completed.turns.find(turn => turn.steer?.id === sent.input_id)?.steer;
  assert.equal(receipt?.source, "person"); assert.ok(receipt && ["applied", "read"].includes(receipt.state));
  assert.equal(typeof receipt.accepted_at_ms, "number", "the real queue/carry path first proves the original receipt");
  const read = fixture.adapter.read.bind(fixture.adapter);
  // Old public receipts may lack this optional fact. Preserve their real text, identity, author and state;
  // the source owner must not substitute a current time or extract an unbound inferred suggestion.
  t.mock.method(fixture.adapter, "read", async (...args: Parameters<typeof read>) => {
    const view = await read(...args);
    return { ...view, turns: view.turns.map(turn => {
      if (turn.steer?.id !== sent.input_id) return turn;
      const { accepted_at_ms: _unknown, ...steer } = turn.steer;
      return { ...turn, steer };
    }) };
  });
  const task = { key: `memory-learn:${first.work.work_id}:${next.ref.run_id}`, session_id: session.session_id,
    payload: { actor_id: LOCAL_PERSON_ACTOR_ID, work_id: first.work.work_id, session_id: session.session_id, run_id: next.ref.run_id,
      sources: [{ run_id: next.ref.run_id, input_id: sent.input_id, version: "1" }] } };
  fixture.attach(); await fixture.enqueue(task);
  assert.equal((await fixture.settled(task.key)).state, "done");
  assert.equal(fixture.outcomes[0]!.ran, false); assert.equal(fixture.modelCalls, 0);
  await fixture.empty(); await fixture.restart(); await fixture.empty();
});

test("MEM-FORM queue preserves committed SDK facts when authority closes during canonical reread, then retries the same candidate", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  fixture.afterCandidateRead(async () => { entered.resolve(); await release.promise; });
  fixture.attach(); await fixture.enqueue(first.task, Date.now(), 2);
  await entered.promise;
  fixture.service.savePrefs(person, "project", { learn_from_work: false });
  fixture.service.savePrefs(person, "personal", { learn_from_work: false });
  release.resolve(); await fixture.failed.promise;
  assert.deepEqual(fixture.notes(), [], "the controlled ledger does not save a candidate after authority closes");
  assert.deepEqual(fixture.service.changes(person), []);
  const failure = fixture.failures[0]!;
  assert.equal(failure.formation?.outcome, "completed");
  assert.equal(failure.formation?.extraction.calls, 1);
  assert.deepEqual([failure.formation?.extraction.usage?.input_tokens, failure.formation?.extraction.usage?.output_tokens,
    failure.formation?.extraction.usage?.cached_input_tokens], [undefined, undefined, undefined], "unreported token use stays unknown, never zero");
  assert.equal(failure.recording_error?.code, "memory.forbidden");
  const committed = failure.formation!.items[0]!.candidate!;
  assert.equal(committed.version, 1);
  fixture.service.savePrefs(person, "project", { learn_from_work: true });
  fixture.service.savePrefs(person, "personal", { learn_from_work: true });
  assert.equal((await fixture.settled(first.task.key)).state, "done");
  assert.equal(fixture.failures.length, 1);
  assert.equal(fixture.modelCalls, 2, "retry extraction is a real additional call, not an exactly-once claim");
  assert.equal(fixture.outcomes[0]!.formation?.items[0]?.outcome, "replayed");
  assert.deepEqual(fixture.notes().map(note => [note.candidate_id, note.version]), [[committed.candidate_id, 1]]);
  await fixture.restart();
  const raw = await fixture.adapter.memory!.withCaller({ ...person, current_scene: "common", purpose: "management" }).candidates.list("project", "project-q4");
  assert.deepEqual(raw.map(entry => [entry.candidate_id, entry.version]), [[committed.candidate_id, 1]]);
});

test("MEM-SOURCE-02: old queued text is usable only with matching original identity and full text", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t); fixture.attach();
  for (const mode of ["missing", "wrong-owner", "changed", "page", "valid"] as const) {
    const first = await fixture.start("以后周报都把风险放最前面", mode === "page" ? "page" : undefined); await fixture.ended(first.ref);
    const task = { ...first.task, payload: { caller: { ...inWork(first.work.work_id, "周报"), actor_id: mode === "wrong-owner" ? "someone-else" : LOCAL_PERSON_ACTOR_ID,
      work: { work_id: mode === "missing" ? "no-original-work" : first.work.work_id, title: "周报" } }, said: [mode === "changed" ? "以后周报" : "以后周报都把风险放最前面"] } };
    await fixture.enqueue(task); assert.equal((await fixture.settled(task.key)).state, "done");
    if (mode !== "valid") { assert.equal(fixture.modelCalls, 0, mode); await fixture.empty(); }
  }
  assert.equal(fixture.modelCalls, 1);
  assert.equal((await fixture.service.candidates(person, { scope: "project" })).length, 1);
});

test("MEM-SOURCE-03: a queued cancelled run or withdrawn input costs no extraction and writes no candidate/history", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), gate = Promise.withResolvers<void>(); fixture.holdRound(gate.promise);
  const first = await fixture.start(); await fixture.asked.promise;
  const input = await fixture.adapter.inputs!.send(first.ref, { text: "以后周报都把风险放最前面", key: "learning.withdraw" });
  const task = { ...first.task, payload: { ...first.task.payload, sources: [{ run_id: first.ref.run_id, input_id: input.input_id, version: "1" }] } };
  await fixture.enqueue(task, Date.now() + 100);
  await fixture.adapter.inputs!.withdraw!(first.ref, input.input_id);
  gate.resolve(); await fixture.ended(first.ref); fixture.attach();
  assert.equal((await fixture.settled(task.key)).state, "done"); assert.equal(fixture.modelCalls, 0); await fixture.empty();
  const held = Promise.withResolvers<void>(); fixture.holdRound(held.promise);
  const cancelled = await fixture.start();
  await fixture.enqueue(cancelled.task, Date.now() + 100);
  await fixture.adapter.control(cancelled.ref, { kind: "cancel" }); held.resolve();
  assert.equal((await fixture.ended(cancelled.ref)).phase, "cancelled");
  assert.equal((await fixture.settled(cancelled.task.key)).state, "done"); assert.equal(fixture.modelCalls, 0); await fixture.empty();
});

for (const when of ["before-model", "during-model", "sdk-write"] as const) test(`MEM-SOURCE-04: formation disabled ${when} leaves no candidate, formal memory or history`, { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  let intercepted = false;
  const off = () => { fixture.service.savePrefs(person, "project", { learn_from_work: false }); fixture.service.savePrefs(person, "personal", { learn_from_work: false }); };
  if (when === "before-model") off();
  if (when === "during-model") fixture.duringModel(async () => { off(); });
  if (when === "sdk-write") {
    fixture.beforeCandidateWrite(() => { intercepted = true; off(); });
  }
  fixture.attach(); await fixture.enqueue(first.task);
  const settled = await fixture.settled(first.task.key);
  assert.equal(settled.state, when === "before-model" ? "done" : "failed");
  if (when === "sdk-write") {
    assert.equal(intercepted, true);
    assert.equal(settled.last_failure, "记忆形成尚未全部记账，请携原操作重试");
    assert.deepEqual(fixture.outcomes, [], "the SDK source gate refused before a candidate result existed");
  }
  assert.equal(fixture.modelCalls, when === "before-model" ? 0 : 1); await fixture.empty();
  await fixture.restart(); await fixture.empty();
});

for (const stop of ["archive", "project-deleted", "host-closed"] as const) test(`MEM-SOURCE-05: ${stop} while extraction waits cannot restore learning on return`, { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  fixture.duringModel(async () => {
    if (stop === "archive") fixture.originals.update(LOCAL_PERSON_ACTOR_ID, first.work.work_id, null, { archived: true });
    if (stop === "project-deleted") fixture.projectRemoved();
    if (stop === "host-closed") fixture.stopHost();
  });
  fixture.attach(); await fixture.enqueue(first.task);
  const settled = await fixture.settled(first.task.key);
  const diagnostic = JSON.stringify({ settled, failures: fixture.failures, outcomes: fixture.outcomes,
    run: await fixture.adapter.read(first.ref) });
  assert.equal(settled.state, "failed", diagnostic);
  assert.equal(fixture.modelCalls, 1, diagnostic); await fixture.empty();
});

test("MEM-SOURCE-06: an original archived after model checks is re-read at the actual SDK candidate commit", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  let intercepted = false;
  fixture.beforeCandidateWrite(() => {
    intercepted = true; fixture.originals.update(LOCAL_PERSON_ACTOR_ID, first.work.work_id, null, { archived: true });
  });
  fixture.attach(); await fixture.enqueue(first.task);
  const settled = await fixture.settled(first.task.key);
  assert.equal(settled.state, "failed"); assert.equal(fixture.modelCalls, 1); assert.equal(intercepted, true);
  assert.equal(settled.last_failure, "记忆形成尚未全部记账，请携原操作重试");
  assert.deepEqual(fixture.outcomes, [], "archive invalidation reaches the SDK source gate before its commit");
  await fixture.empty(); await fixture.restart(); await fixture.empty();
});


test("MEM-CLASS-02: queued learning keeps its trigger Run restriction after another Run and restart", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t);
  const rows = [{ selector: { consumer: "assistant" as const, current_scene: "assistant" as const }, read: "inherit" as const, form: "off" as const }];
  for (const scope of ["personal", "project"] as const) fixture.service.savePrefs(person, scope, { class_restrictions: rows });
  const first = await fixture.start(); await fixture.ended(first.ref);
  for (const scope of ["personal", "project"] as const) fixture.service.savePrefs(person, scope, { class_restrictions: [] });
  const next = await fixture.start(undefined, undefined, { previous: first }); await fixture.ended(next.ref);
  await fixture.restart();
  assert.deepEqual((await fixture.adapter.read(first.ref)).class_restrictions?.project, rows);
  assert.deepEqual((await fixture.adapter.read(next.ref)).class_restrictions?.project, []);
  fixture.attach(); await fixture.enqueue(first.task); await fixture.settled(first.task.key);
  assert.equal(fixture.outcomes[0]!.ran, false); assert.equal(fixture.modelCalls, 0);
  await fixture.empty();
  await fixture.enqueue(next.task); await fixture.settled(next.task.key);
  assert.equal(fixture.outcomes[1]!.ran, true); assert.equal(fixture.modelCalls, 1);
  assert.equal((await fixture.service.candidates(person, { scope: "project" })).length, 1);
});

test("MEM-CLASS-02: a trigger Run without policy cannot borrow a newer Run snapshot", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(undefined, undefined, { withoutMemory: true });
  await fixture.ended(first.ref);
  const next = await fixture.start(undefined, undefined, { previous: first }); await fixture.ended(next.ref);
  await fixture.restart(); fixture.attach();
  assert.equal((await fixture.adapter.read(first.ref)).class_restrictions, undefined);
  assert.ok((await fixture.adapter.read(next.ref)).class_restrictions);
  await fixture.enqueue(first.task); await fixture.settled(first.task.key);
  assert.equal(fixture.outcomes[0]!.ran, false); assert.equal(fixture.modelCalls, 0);
  await fixture.empty();
});

test("MEM-SOURCE-06: a new input after the final async learning check prevents the actual candidate commit", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  let intercepted = false;
  fixture.afterCandidateCheck(() => {
    // The real source check has returned. Change the durable work before the Host's synchronous commit guard.
    intercepted = true;
    fixture.originals.update(LOCAL_PERSON_ACTOR_ID, first.work.work_id, null, { continuation_hold: "input", draft: "先不要学习，等我补充" }, false);
  });
  fixture.attach(); await fixture.enqueue(first.task);
  const settled = await fixture.settled(first.task.key);
  assert.equal(intercepted, true); assert.equal(fixture.modelCalls, 1);
  assert.equal(settled.state, "failed");
  assert.equal(settled.last_failure, "记忆形成尚未全部记账，请携原操作重试");
  assert.deepEqual(fixture.outcomes, [], "the final guard refuses the candidate rather than reporting learning success");
  assert.deepEqual(fixture.notes(), []);
  await fixture.empty(); await fixture.restart(); await fixture.empty();
  const saved = fixture.originals.get(LOCAL_PERSON_ACTOR_ID, first.work.work_id);
  assert.equal(saved.continuation_hold, "input"); assert.equal(saved.draft, "先不要学习，等我补充");
});
