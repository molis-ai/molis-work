import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, MEMORY_GATE_RULE, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_NAME, AssistantStore, memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryCapability, AgentMemoryExecutionControl, AgentRunRef, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";
import { learnFromQueuedWork, learnFromWork } from "../apps/local-host/dist/memory/memory-learning.js";
import { MEMORY_EXTRACT } from "../apps/local-host/dist/agent-definitions/system-prompts.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

async function memoryHome(t: Parameters<typeof memoryServiceHome>[0]) {
  const env = await memoryServiceHome(t, { projects: ["project-q4"], projectTitle: async () => "Q4 plan" });
  return { home: env.home, service: await env.open() };
}

const inWork = (work_id: string, title: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", consumer: "assistant", work: { work_id, title } });
const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", consumer: "ui", person: true };
const riskFirst = { text: "Q4 plan 的周报把风险放在最前面", kind: "convention" as const, scope: "project" as const, applies_when: "写 Q4 plan 的周报时", basis: "explicit" as const };

test("a wish said once is only suggested; said again in another work it is kept automatically by the gate, shows as a recent change, and undo removes it from the store and from recall", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  const firstSaid = ["帮我写这周的周报", "以后周报都把风险放最前面，别放最后"];
  assert.equal(service.worthLearning(inWork("work-1", "周报 9/23"), firstSaid), true);
  const first = await service.learnFromWork(inWork("work-1", "周报 9/23"), { said: firstSaid, proposals: [{ ...riskFirst, quote: "以后周报都把风险放最前面" }] });
  assert.deepEqual(first.map(item => item.outcome), ["candidate"], "once is not repeated: it waits for the person");
  const [waiting] = await service.candidates(person, { scope: "project" });
  assert.equal(waiting!.basis, "explicit");
  assert.match(waiting!.hold_reason!, /只在一项工作里出现过/);
  assert.equal((await service.list(person)).items.length, 0, "nothing kept yet");

  // A second work, the person says it again in their own words: repeated → kept automatically (preferences and conventions only).
  const secondSaid = ["周报草稿", "风险还是要放在最前面，上次也是这么说的"];
  const second = await service.learnFromWork(inWork("work-2", "周报 9/30"), { said: secondSaid,
    proposals: [{ ...riskFirst, quote: "风险还是要放在最前面", same_as: waiting!.candidate_id }] });
  assert.deepEqual(second.map(item => item.outcome), ["written"]);
  const [kept] = (await service.list(person)).items;
  assert.equal(kept!.source, "auto");
  assert.equal(kept!.basis, "repeated");
  assert.deepEqual(kept!.approved_by, { by: "policy", policy: "memory.write-gate", version: 2 });
  assert.match(kept!.origin, new RegExp(`^${MEMORY_GATE_RULE}`));
  assert.equal((await service.candidates(person, { scope: "project" })).length, 0, "the suggestion was settled by the promotion");
  const [change] = service.changes(person, { scope: "project" });
  assert.equal(change!.kind, "auto_kept");
  assert.match(change!.reason!, /你在工作「周报 9\/23」和「周报 9\/30」里都这样要求/);
  assert.ok((await service.recall(inWork("work-3", "周报 10/7"), { query: "写周报" })).items.some(item => item.memory_id === kept!.memory_id));

  // Undo: gone from the store, never recalled again.
  await service.undo(person, change!.change_id);
  assert.equal((await service.list(person)).items.length, 0);
  assert.equal((await service.recall(inWork("work-3", "周报 10/7"), { query: "写周报 风险" })).items.length, 0);
});

test("only once, only inferred, a background fact, words the person never said, or 'don't remember' — none is written automatically", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  // Words not in what the person said: an inference, however the model labelled it.
  const invented = await service.learnFromWork(inWork("work-1", "周报"), { said: ["以后周报用表格吧"], proposals: [{ ...riskFirst, quote: "风险放最前面" }] });
  assert.deepEqual(invented.map(item => item.outcome), ["candidate"]);
  assert.equal((await service.candidates(person, { scope: "project" }))[0]!.basis, "inferred");
  // An inferred one said "again" elsewhere is still not repeated explicit wishes.
  const again = await service.learnFromWork(inWork("work-2", "周报"), { said: ["以后周报用表格吧"], proposals: [{ ...riskFirst, quote: "风险放最前面" }] });
  assert.equal(again[0]!.outcome, "skipped");
  assert.equal((await service.list(person)).items.length, 0);

  // A background fact said in two works stays a suggestion (facts belong to the data they come from).
  const fact = { text: "Q4 plan 的预算上限是 50 万", kind: "fact" as const, scope: "project" as const, basis: "explicit" as const };
  await service.learnFromWork(inWork("work-3", "预算"), { said: ["记住以后都按预算上限 50 万算"], proposals: [{ ...fact, quote: "预算上限 50 万" }] });
  const factCandidate = (await service.candidates(person, { scope: "project" })).find(item => item.kind === "fact")!;
  const repeated = await service.learnFromWork(inWork("work-4", "预算"), { said: ["以后预算上限 50 万"], proposals: [{ ...fact, quote: "预算上限 50 万", same_as: factCandidate.candidate_id }] });
  assert.equal(repeated[0]!.outcome, "candidate");
  assert.match(repeated[0]!.reason, /背景事实以原资料为准/);
  assert.equal((await service.list(person)).items.length, 0);

  // “Don't remember this”: nothing is formed at all.
  assert.equal(service.worthLearning(inWork("work-5", "x"), ["以后都用英文回复，这条不要记"]), false);
  assert.deepEqual(await service.learnFromWork(inWork("work-5", "x"), { said: ["以后都用英文回复，这条不要记"], proposals: [{ ...riskFirst, text: "都用英文回复", quote: "以后都用英文回复" }] }), []);
  // A round without a standing wish costs no model call.
  assert.equal(service.worthLearning(inWork("work-6", "x"), ["帮我总结一下这份材料"]), false);
  // Learning from work switched off.
  service.savePrefs(person, "project", { learn_from_work: false });
  service.savePrefs(person, "personal", { learn_from_work: false });
  assert.equal(service.worthLearning(inWork("work-7", "x"), ["以后周报都用要点"]), false);
});

// MEM-12: independent repetition verifies a source; it does not make an experience eligible for automatic approval.
test("an experience repeated in two works stays the same pending candidate until the person accepts it", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  const proposal = { text: "预热缓存后发布告警通常更少", kind: "experience" as const, scope: "project" as const, basis: "explicit" as const, quote: "预热缓存后发布告警通常更少" };
  const first = await service.learnFromWork(inWork("experience-1", "首次复盘"), { said: ["记住这个经验：预热缓存后发布告警通常更少"], proposals: [proposal] });
  assert.equal(first[0]!.outcome, "candidate");
  assert.match(first[0]!.reason, /经验.*认可/);
  assert.doesNotMatch(first[0]!.reason, /会自动记住/);
  const second = await service.learnFromWork(inWork("experience-2", "第二次复盘"), { said: ["下次也参考这个经验，预热缓存后发布告警通常更少"], proposals: [proposal] });
  assert.equal(second[0]!.outcome, "candidate");
  assert.equal(second[0]!.candidate_id, first[0]!.candidate_id);
  assert.match(second[0]!.reason, /经验.*认可/);
  assert.deepEqual((await service.list(person, { scope: "project" })).items, []);
  const waiting = await service.candidates(person, { scope: "project" });
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0]!.state, "pending");
  const accepted = await service.accept(person, waiting[0]!.candidate_id);
  assert.equal(accepted.memory!.kind, "experience");
  assert.deepEqual(accepted.memory!.approved_by, { by: "person" });
});

test("the drawing-out sends the registered instruction and the person's words, reads the checked structure, and hands it to the gate; a malformed answer writes nothing", { timeout: 60_000 }, async t => {
  const { home, service } = await memoryHome(t);
  const sent: Array<{ prompt: string; options: any }> = [];
  const reply = (structured: unknown) => async (prompt: string, options?: any) => {
    sent.push({ prompt, options });
    return { value: "{}", structured, run_ref: { kind: "run", id: "r", revision: 1 } as never, state: "completed" as const, configuredModel: "m", reportedModels: [], usage: [], validateResult: () => undefined };
  };
  const request = { caller: inWork("work-1", "周报 9/23"), said: ["以后周报都把风险放最前面"] };
  const outcome = await learnFromWork(service, home, request, reply({ candidates: [{ ...riskFirst, quote: "以后周报都把风险放最前面", same_as: null, supersedes: null }] }));
  assert.equal(outcome.ran, true);
  assert.deepEqual(outcome.learned.map(item => item.outcome), ["candidate"]);
  assert.ok(sent[0]!.prompt.startsWith(MEMORY_EXTRACT.body.slice(0, 20)), "the registered instruction goes first");
  assert.match(sent[0]!.prompt, /以后周报都把风险放最前面/);
  assert.equal(sent[0]!.options.structured.mode, "local");
  // A malformed answer: nothing.
  const bad = await learnFromWork(service, home, { caller: inWork("work-2", "x"), said: ["以后都用要点列表"] }, reply({ nope: true }));
  assert.equal(bad.ran, true);
  assert.deepEqual(bad.learned, []);
  assert.equal((await service.candidates(person, { scope: "all" })).length, 1);
  // Nothing worth learning: no model call at all.
  const before = sent.length;
  assert.equal((await learnFromWork(service, home, { caller: inWork("work-3", "x"), said: ["帮我读一下这份材料"] }, reply({ candidates: [] }))).ran, false);
  assert.equal(sent.length, before);
});

test("a personal wish learned in a project's works never names those works: not in the suggestion, the memory's provenance or the recent change", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  const unit = { text: "汇报里的金额统一用万元做单位", kind: "preference" as const, scope: "personal" as const, basis: "explicit" as const };
  await service.learnFromWork(inWork("work-1", "差旅费用 机票 18600 元"), { said: ["我习惯汇报里的金额都用万元做单位"], proposals: [{ ...unit, quote: "我习惯汇报里的金额都用万元做单位" }] });
  const [waiting] = await service.candidates(person, { scope: "personal" });
  assert.doesNotMatch(waiting!.why, /差旅费用|18600/);
  const second = await service.learnFromWork(inWork("work-2", "内容预算 视频制作 275000 元"), { said: ["金额还是用万元，我一直这么要求"],
    proposals: [{ ...unit, quote: "金额还是用万元", same_as: waiting!.candidate_id }] });
  assert.deepEqual(second.map(item => item.outcome), ["written"]);
  const [kept] = (await service.list(person, { scope: "personal" })).items;
  assert.equal(kept!.scope, "personal");
  assert.match(kept!.origin, /两项不同的工作/);
  assert.doesNotMatch(kept!.origin, /差旅费用|内容预算|18600|275000/);
  const [change] = service.changes(person, { scope: "personal" });
  assert.doesNotMatch(change!.reason ?? "", /差旅费用|内容预算/);
});

test("the model's same_as is only a pointer: the gate ties by the words, so a different wish is never auto-kept for it, and a restatement it cannot be sure of waits beside the old one", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  await service.learnFromWork(inWork("work-1", "周报 9/23"), { said: ["以后周报都把风险放最前面，别放最后"], proposals: [{ ...riskFirst, quote: "以后周报都把风险放最前面" }] });
  const [waiting] = await service.candidates(person, { scope: "project" });

  // Another work, an unrelated wish the model calls "the same": nothing ties the two, so it is its own suggestion and the old one keeps waiting.
  const unrelated = await service.learnFromWork(inWork("work-2", "翻译"), { said: ["以后回答都用中文"],
    proposals: [{ text: "回答用中文", kind: "preference", scope: "project", basis: "explicit", quote: "回答都用中文", same_as: waiting!.candidate_id }] });
  assert.deepEqual(unrelated.map(item => [item.outcome, item.text]), [["candidate", "回答用中文"]], "the new wish is not dropped and not written");
  assert.equal((await service.list(person)).items.length, 0, "the model's claim wrote nothing");
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => [item.text, item.work!.work_id]).sort(), [[riskFirst.text, "work-1"], ["回答用中文", "work-2"]]);

  // The person may have said the first wish again in other words, but the gate cannot be sure it is the same wish: both wait for the person, nothing is kept.
  const restated = await service.learnFromWork(inWork("work-3", "周报 9/30"), { said: ["周报还是把风险放在最前面"],
    proposals: [{ ...riskFirst, text: "周报把风险放在最前面", quote: "周报还是把风险放在最前面", same_as: waiting!.candidate_id }] });
  assert.deepEqual(restated.map(item => [item.outcome, item.text]), [["candidate", "周报把风险放在最前面"]]);
  assert.equal((await service.list(person)).items.length, 0);
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => item.work!.work_id).sort(), ["work-1", "work-2", "work-3"]);
});

test("wishes that share wording are different wishes: the model's same_as never makes the gate keep the old one and drop the new one", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  const standing = { kind: "preference" as const, scope: "personal" as const, basis: "explicit" as const };
  const waitingTexts = async () => (await service.candidates(person, { scope: "personal" })).map(item => item.text).sort();
  for (const [first, second] of [
    [{ text: "回答都用要点列表", said: "以后回答都用要点列表" }, { text: "回答都用中文", said: "以后回答都用中文" }],
    [{ text: "Always reply in bullet points", said: "Always reply in bullet points" }, { text: "Always reply in Chinese", said: "Always reply in Chinese" }],
  ] as const) {
    await service.learnFromWork(inWork(`${first.text}-1`, "整理"), { said: [first.said], proposals: [{ ...standing, text: first.text, quote: first.said }] });
    const [old] = (await service.candidates(person, { scope: "personal" })).filter(item => item.text === first.text);
    const later = await service.learnFromWork(inWork(`${second.text}-2`, "翻译"), { said: [second.said], proposals: [{ ...standing, text: second.text, quote: second.said, same_as: old!.candidate_id }] });
    assert.deepEqual(later.map(item => [item.outcome, item.text]), [["candidate", second.text]], "the new wish is its own suggestion, not dropped");
    assert.equal((await service.list(person, { scope: "personal" })).items.length, 0, "and nothing was kept for the old one");
    assert.deepEqual((await waitingTexts()).filter(text => text === first.text || text === second.text), [first.text, second.text].sort(), "both wait for the person");
  }
});

test("a wish drawn out of work that is the same words as a memory already kept is skipped; one that differs by a symbol or a comma says something else, so it waits for the person", { timeout: 60_000 }, async t => {
  const { service } = await memoryHome(t);
  await service.write(person, { scope: "project", text: "金额>1000要先问我" });
  const said = ["以后金额<1000要先问我"];
  const same = await service.learnFromWork(inWork("work-1", "报销"), { said, proposals: [{ ...riskFirst, text: "金额>1000要先问我。", quote: "金额<1000要先问我" }] });
  assert.deepEqual(same.map(item => [item.outcome, item.reason]), [["skipped", "已经记着这一条了"]]);
  const flipped = await service.learnFromWork(inWork("work-2", "报销"), { said, proposals: [{ ...riskFirst, text: "金额<1000要先问我", quote: "金额<1000要先问我" }] });
  assert.deepEqual(flipped.map(item => item.outcome), ["candidate"]);
  assert.deepEqual((await service.candidates(person, { scope: "project" })).map(item => item.text), ["金额<1000要先问我"]);
});

test("what the person said in a deleted project's work is not learned: the project is asked about before the model is and again before anything is written", { timeout: 60_000 }, async t => {
  const { home, service } = await memoryHome(t);
  let asked = 0;
  const reply = (structured: unknown, during?: () => void) => async () => {
    asked += 1; during?.();
    return { value: "{}", structured, run_ref: { kind: "run", id: "r", revision: 1 } as never, state: "completed" as const, configuredModel: "m", reportedModels: [], usage: [], validateResult: () => undefined };
  };
  const proposals = { candidates: [{ ...riskFirst, quote: "以后周报都把风险放最前面", same_as: null, supersedes: null }] };
  const request = { caller: inWork("work-1", "周报 9/23"), said: ["以后周报都把风险放最前面"] };
  const kept = async () => (await service.candidates(person, { scope: "all" })).length + (await service.list(person)).items.length;

  // The project was deleted before the queued round started: no model call, nothing written.
  const early = await learnFromWork(service, home, request, reply(proposals), async () => false);
  assert.equal(early.ran, false);
  assert.deepEqual(early.learned, []);
  assert.equal(asked, 0);

  // It is deleted while the model is thinking (up to two minutes): what comes back is dropped, so the deletion's purge is not undone.
  let exists = true;
  const late = await learnFromWork(service, home, request, reply(proposals, () => { exists = false; }), async () => exists);
  assert.equal(asked, 1);
  assert.equal(late.ran, true);
  assert.deepEqual(late.learned, []);
  assert.equal(await kept(), 0, "no suggestion and no memory for the deleted project");

  // A project that is still there, or one this process cannot ask about, learns as before.
  const there = await learnFromWork(service, home, request, reply(proposals), async () => true);
  assert.deepEqual(there.learned.map(item => item.outcome), ["candidate"]);
  assert.equal(await kept(), 1);
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
  // Queue invalidation below is injected through its existing Host ports. This real policy owner keeps the
  // declared scratch project available for independent persisted-state inspection after that invocation ends.
  const policyOwner = {
    alive: () => memoryAlive, prefsFor: (scope: Parameters<MemoryService["prefsFor"]>[1], owner: string | null) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, owner),
    owners: (project: string) => ledger.owners(project), candidateOwners: (project: string) => ledger.candidateOwners(project),
    projectExists: async (project: string) => project === "project-q4", deletingProject: () => undefined,
  };
  // Observe the capability actually bound by production backend.withCaller/withExecution, preserving every guard.
  const observe = (memory: AgentMemoryCapability): AgentMemoryCapability => ({ ...memory,
    candidates: { ...memory.candidates, propose: async (...args) => { beforeCandidateWrite?.(); return memory.candidates.propose(...args); } },
    withCaller: caller => observe(memory.withCaller(caller)),
    ...(memory.withExecution ? { withExecution: (control: Parameters<NonNullable<AgentMemoryCapability["withExecution"]>>[0]) => observe(memory.withExecution!(control)) } : {}),
  });
  const open = async () => {
    const value = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: memoryRuntimePolicy(() => policyOwner),
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
  let inModel: () => Promise<void> = async () => {}, afterLearning: () => void = () => {}, projectExists = true;
  const generate = async () => {
    modelCalls++; await inModel();
    return { value: "{}", structured: { candidates: [{ ...riskFirst, quote: "以后周报都把风险放最前面" }] }, run_ref: { kind: "run", id: "fixture", revision: 1 } as never,
      state: "completed" as const, configuredModel: "fixture", reportedModels: [], usage: [], validateResult: () => undefined };
  };
  const attach = () => adapter.schedule!.handle("memory.learn", async task => { outcomes.push(await learnFromQueuedWork(home, task,
    { adapter, service, ports, backend: (control: AgentMemoryExecutionControl) => prologueMemoryBackend(async () => adapter.memory!, control), alive: () => alive, projectExists: async () => projectExists }, generate)); afterLearning(); });
  const start = async (text = "以后周报都把风险放最前面", written_by?: "page") => {
    const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_PLUGIN_ID };
    const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "assistant", title: "周报" });
    const work = originals.create({ actor_id: owner.actor_id, title: "周报", scope: { kind: "project", project_id: owner.project_id }, project_ref: { project_id: owner.project_id, storage_key: "memory:project-q4" }, origin: null });
    originals.update(owner.actor_id, work.work_id, null, { session_id: session.session_id });
    const handle = await adapter.start({ ...owner, session, workspace: "none", task: text, role_id: "assistant",
      role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
    originals.addRound(work.work_id, { run_id: handle.ref.run_id, text, ...(written_by ? { written_by } : {}), materials: [], context: null, started_at: new Date().toISOString() });
    const task = { key: `memory-learn:${work.work_id}:${handle.ref.run_id}`, session_id: session.session_id,
      payload: { actor_id: owner.actor_id, work_id: work.work_id, session_id: session.session_id, run_id: handle.ref.run_id,
        sources: [{ run_id: handle.ref.run_id, input_id: null as string | null, version: "1" }] } };
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
  return { home, originals, service, start, ended, enqueue, settled, empty, attach, outcomes, asked,
    get adapter() { return adapter; }, get modelCalls() { return modelCalls; },
    holdRound: (gate: Promise<void>) => { roundGate = gate; }, duringModel: (fn: () => Promise<void>) => { inModel = fn; },
    afterLearning: (fn: () => void) => { afterLearning = fn; },
    projectRemoved: () => { projectExists = false; }, stopHost: () => { alive = false; },
    beforeCandidateWrite: (fn: () => void) => { beforeCandidateWrite = fn; },
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
  assert.deepEqual(fixture.outcomes.map(item => item.learned.map(one => one.outcome)), [["candidate"], ["skipped"]]);
  const [candidate] = await fixture.service.candidates(person, { scope: "project" });
  assert.equal(candidate!.basis, "explicit");
  const sdkCandidates = await fixture.adapter.memory!.withCaller({ ...person, current_scene: "common", purpose: "management" }).candidates.list("project", "project-q4");
  assert.equal(sdkCandidates.length, 1);
  assert.equal(sdkCandidates[0]!.meta?.evidence?.length, 1, "replay did not add a second occurrence");
  assert.deepEqual((await fixture.service.list(person)).items, []); assert.deepEqual(fixture.service.changes(person), []);
  const renamed = { ...first.task, key: `${first.task.key}:different-job` };
  await fixture.enqueue(renamed); assert.equal((await fixture.settled(renamed.key)).state, "done");
  assert.equal(fixture.modelCalls, 2, "a new job label cannot stand in for a new original round");
  assert.deepEqual((await fixture.service.candidates(person, { scope: "project" })).map(item => item.candidate_id), [candidate!.candidate_id]);
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
  assert.equal((await fixture.settled(first.task.key)).state, "done");
  if (when === "sdk-write") { assert.equal(intercepted, true); assert.deepEqual(fixture.outcomes[0]!.learned.map(item => item.outcome), ["skipped"], "the existing per-proposal result reports the refused write"); }
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
  assert.equal((await fixture.settled(first.task.key)).state, "done"); assert.equal(fixture.modelCalls, 1); await fixture.empty();
});

test("MEM-SOURCE-06: an original archived after model checks is re-read at the actual SDK candidate commit", { timeout: 60_000 }, async t => {
  const fixture = await queuedLearning(t), first = await fixture.start(); await fixture.ended(first.ref);
  let intercepted = false;
  fixture.beforeCandidateWrite(() => {
    intercepted = true; fixture.originals.update(LOCAL_PERSON_ACTOR_ID, first.work.work_id, null, { archived: true });
  });
  fixture.attach(); await fixture.enqueue(first.task);
  assert.equal((await fixture.settled(first.task.key)).state, "done"); assert.equal(fixture.modelCalls, 1); assert.equal(intercepted, true);
  assert.deepEqual(fixture.outcomes[0]!.learned.map(item => item.outcome), ["skipped"]);
  await fixture.empty(); await fixture.restart(); await fixture.empty();
});
