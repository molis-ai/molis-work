import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, MEMORY_GATE_RULE, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { prologueMemoryBackend } from "../apps/local-host/src/memory/memory-host.js";
import { learnFromWork } from "../apps/local-host/src/memory/memory-learning.js";
import { MEMORY_EXTRACT } from "../apps/local-host/src/agent-definitions/system-prompts.js";

async function memoryHome(t: { after(fn: () => Promise<void> | void): void }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-learning-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.memory-learning-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(async () => { ledger.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const service = new MemoryService({ backend: prologueMemoryBackend(async () => host.adapter("prologue").memory!), ledger, timeZone: "Asia/Shanghai",
    projectTitle: async () => "Q4 plan" });
  return { home, service };
}

const inWork = (work_id: string, title: string): MemoryCaller => ({ actor_id: "web-user", project_id: "project-q4", consumer: "assistant", work: { work_id, title } });
const person: MemoryCaller = { actor_id: "web-user", project_id: "project-q4", consumer: "ui", person: true };
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

  // A second work, the person says it again in their own words: repeated → kept automatically (preferences, conventions, lessons only).
  const secondSaid = ["周报草稿", "风险还是要放在最前面，上次也是这么说的"];
  const second = await service.learnFromWork(inWork("work-2", "周报 9/30"), { said: secondSaid,
    proposals: [{ ...riskFirst, quote: "风险还是要放在最前面", same_as: waiting!.candidate_id }] });
  assert.deepEqual(second.map(item => item.outcome), ["written"]);
  const [kept] = (await service.list(person)).items;
  assert.equal(kept!.source, "auto");
  assert.equal(kept!.basis, "repeated");
  assert.deepEqual(kept!.approved_by, { by: "policy", policy: "memory.write-gate", version: 1 });
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

test("the drawing-out sends the registered instruction and the person's words, reads the checked structure, and hands it to the gate; a malformed answer writes nothing", { timeout: 60_000 }, async t => {
  const { home, service } = await memoryHome(t);
  const sent: Array<{ prompt: string; options: any }> = [];
  const reply = (structured: unknown) => async (prompt: string, options?: any) => {
    sent.push({ prompt, options });
    return { value: "{}", structured, run_ref: { kind: "run", id: "r", revision: 1 } as never, state: "completed" as const, configuredModel: "m", reportedModels: [], usage: [] };
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
