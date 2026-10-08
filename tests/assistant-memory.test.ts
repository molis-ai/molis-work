import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService, recallKeywords } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { prologueMemoryBackend } from "../apps/local-host/src/memory/memory-host.js";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { NOT_THEIRS, THEIRS } from "./fixtures/memory-said-cases.js";

/** The platform memory over the test's own runtime (Prologue Memory) and a ledger in its Home, as the Host wires it (the projects' names included: a project memory may carry its project's name). */
function platformMemory(host: AgentHost, home: string, t: { after(fn: () => void): void }): MemoryService {
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(() => ledger.close());
  return new MemoryService({ backend: prologueMemoryBackend(async () => host.adapter("prologue").memory!), ledger, timeZone: "Asia/Shanghai", projectTitle: async id => id === "project-a" ? "项目甲" : "项目乙" });
}

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
function reply(tool?: { name: string; input: unknown }, text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("what the person asks to keep is remembered in Prologue Memory, recalled only where it applies, and switched off or forgotten exactly as asked", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-"));
  const learned: Array<{ work: string; said: string[] }> = [];
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const projectA = { project_id: "project-a", storage_key: "memory:a" };
  const projectB = { project_id: "project-b", storage_key: "memory:b" };
  const requests: any[] = [];
  const script: Array<(body: any) => Response> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script.shift() ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async id => id === "project-a" ? "项目甲" : "项目乙", timeZone: "Asia/Shanghai", memory: () => memory,
    learnFromRound: input => learned.push({ work: input.work.work_id, said: input.said }) }, "web-user");
  const round = async (text: string, project: typeof projectA | null, request: string, workId?: string) => {
    const before = requests.length;
    const sent = await service.send({ text, request_id: request, ...(workId ? { work_id: workId } : {}) }, project ? { project_ref: project } : {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && requests.length > before ? view : undefined; }, request);
    return { work: sent.work, first: requests[before] };
  };
  const recalled = (body: any) => JSON.stringify(body.messages);
  try {
    // Asked to keep two things, in two messages, each of them the whole of what is kept: a project convention and a personal preference.
    script.push(
      () => reply({ name: "remember", input: { text: "项目甲里 NSM 指北极星指标", scope: "project", said: "项目甲里 NSM 指北极星指标" } }),
      () => reply(undefined, "记下了：NSM 指北极星指标（项目甲）。"));
    const first = await round("项目甲里 NSM 指北极星指标", projectA, "req-memory-001");
    // A finished round hands the person's own words to the platform memory's learning (once per round).
    await until(async () => { await service.list(); return learned.find(item => item.work === first.work.work_id); }, "learning handed over");
    assert.deepEqual(learned.find(item => item.work === first.work.work_id)!.said, ["项目甲里 NSM 指北极星指标"]);
    assert.ok(first.first.tools.some((tool: { name: string }) => tool.name === "remember"), "the round may remember");
    script.push(
      () => reply({ name: "remember", input: { text: "回答用要点列表", scope: "personal", said: "回答用要点列表" } }),
      () => reply(undefined, "记下了：回答用要点列表（个人）。"));
    await round("回答用要点列表", projectA, "req-memory-001b", first.work.work_id);
    const kept = await service.memories("project-a");
    assert.deepEqual(kept.map(item => [item.scope, item.text, item.disabled]), [["personal", "回答用要点列表", false], ["project", "项目甲里 NSM 指北极星指标", false]]);
    assert.match(kept[0]!.origin, /^.* · 你说：“回答用要点列表”$/);
    assert.doesNotMatch(kept[0]!.origin, /工作「/, "a personal memory's origin carries nothing of the project it was said in");
    assert.match(kept[1]!.origin, /工作「项目甲里 NSM 指北极星指标」/);

    // Another project sees the personal preference, never project A's convention.
    const inB = await round("总结一下本周进展", projectB, "req-memory-002");
    assert.match(recalled(inB.first), /memory-recall[\s\S]{0,400}回答用要点列表/, "the personal memory reaches the round as Prologue memory-recall data");
    assert.doesNotMatch(recalled(inB.first), /NSM/);
    assert.deepEqual((await service.memories("project-b")).map(item => item.text), ["回答用要点列表"]);
    // The panel sees what each round was given, and what the work kept (specs/archive/memory-system §7.3, §10.3).
    const inBView = await service.read(inB.work.work_id);
    assert.deepEqual(inBView.rounds[0]!.memories_used?.used.map(item => [item.scope, item.text]), [["personal", "回答用要点列表"]]);
    const firstView = await service.read(first.work.work_id);
    assert.deepEqual(firstView.memory_changes?.map(change => [change.kind, change.text, change.undoable]).sort(),
      [["kept", "回答用要点列表", false], ["kept", "项目甲里 NSM 指北极星指标", false]]);
    // Project A's work sees both.
    const inA = await round("NSM 这周怎么样", projectA, "req-memory-003");
    assert.match(recalled(inA.first), /memory-recall[\s\S]{0,400}项目甲里 NSM 指北极星指标/);

    // Switched off: kept, but not used; switched on again: used again.
    await service.changeMemory({ memory_id: kept[0]!.memory_id, action: "disable" }, "project-a");
    const off = await round("再总结一次", projectA, "req-memory-004");
    assert.doesNotMatch(recalled(off.first), /回答用要点列表/);
    assert.equal((await service.memories("project-a"))[0]!.disabled, true);
    await service.changeMemory({ memory_id: kept[0]!.memory_id, action: "enable" }, "project-a");

    // Forgotten through the round's own tool: switched off for good as far as the work goes (never recalled again), but not deleted —
    // it stays the person's to switch on again or delete in settings, and the change is the Assistant's own, takeable back.
    script.push(() => reply({ name: "forget-memory", input: { memory_id: kept[1]!.memory_id } }), () => reply(undefined, "已停用那条，以后不会再用到；想彻底删除可以在记忆设置里删。"));
    const forgetting = await round("忘掉 NSM 那条", projectA, "req-memory-005");
    assert.deepEqual((await service.memories("project-a")).map(item => [item.text, item.disabled]), [["回答用要点列表", false], ["项目甲里 NSM 指北极星指标", true]]);
    const forgot = (await service.read(forgetting.work.work_id)).memory_changes!.find(change => change.kind === "disabled")!;
    assert.deepEqual([forgot.by, forgot.undoable, forgot.work?.work_id], ["assistant", true, forgetting.work.work_id]);
    const after = await round("NSM 是什么", projectA, "req-memory-006");
    assert.doesNotMatch(recalled(after.first), /北极星/);
    // Taking it back is the person's: the memory is used again.
    await memory.undo({ actor_id: "web-user", project_id: "project-a", consumer: "ui", person: true }, forgot.change_id);
    assert.deepEqual((await service.memories("project-a")).map(item => item.disabled), [false, false]);

    // A personal work has no project to keep things for.
    script.push(() => reply({ name: "remember", input: { text: "x", scope: "project", said: "记住 x" } }), () => reply(undefined, "这是个人工作，只能记为个人偏好。"));
    const personal = await round("记住 x", null, "req-memory-007");
    const refused = (await service.read(personal.work.work_id)).rounds[0]!.activity.find(item => item.verb === "memory-keep");
    assert.equal(refused?.state, "failed");
    assert.equal((await service.memories(null)).length, 1);

    // A reply that claims it kept something no call kept is held once; the round then really keeps it.
    script.push(
      () => reply({ name: "list-memories", input: {} }),
      () => reply(undefined, "记下了：周会在周三下午两点，以后在本项目里都按这个来。"),
      body => { assert.match(JSON.stringify(body.messages), /no remember call succeeded/); return reply({ name: "remember", input: { text: "周会在周三下午两点", scope: "project", said: "周会在周三下午两点" } }); },
      () => reply(undefined, "记下了：周会在周三下午两点（只在项目甲里生效）。"));
    await round("周会在周三下午两点", projectA, "req-memory-010");
    assert.ok((await service.memories("project-a")).some(item => item.text === "周会在周三下午两点"), "held once, then kept for real");

    // Forming memories switched off: the round is not given the tools at all; what is kept is still used.
    service.saveMemoryPrefs({ form: false });
    const noForm = await round("以后都用英文回答", projectA, "req-memory-008");
    assert.ok(!noForm.first.tools.some((tool: { name: string }) => tool.name === "remember"));
    assert.match(recalled(noForm.first), /回答用要点列表/);
    // Personal memories not used here: nothing personal comes back.
    service.saveMemoryPrefs({ form: true, use_personal: false });
    const noPersonal = await round("再来一次", projectA, "req-memory-009");
    assert.doesNotMatch(recalled(noPersonal.first), /回答用要点列表/);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("recall words cover Chinese two-character pieces and Latin words", () => {
  assert.deepEqual(recallKeywords("NSM 这周"), ["nsm", "这周"]);
  assert.ok(recallKeywords("北极星指标").includes("星指"));
});

test("a work suggests keeping a lesson only where the person allows it; nothing is kept until they accept, and a declined one is not suggested again", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-candidates-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project-a", storage_key: "memory:a" };
  const requests: any[] = [];
  const script: Array<(body: any) => Response> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script.shift() ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-candidates-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const tools = (body: any) => (body.tools as Array<{ name: string }>).map(tool => tool.name);
  const lesson = { text: "项目甲的周报先写风险，再写进展", scope: "project", why: "这次和上次你都把风险挪到了最前面", applies: "写项目甲的周报时" };
  try {
    // The platform default is on (specs/archive/memory-system §10.1); switched off, the tool is not offered and nothing can be suggested.
    assert.deepEqual([service.memoryPrefs().learn_personal, service.memoryPrefs().learn_project], [true, true]);
    service.saveMemoryPrefs({ learn_personal: false, learn_project: false });
    const first = await service.send({ text: "写周报", request_id: "req-candidate-1" }, { project_ref: project });
    await until(async () => (await service.read(first.work.work_id)).work.state === "completed", "first");
    assert.ok(!tools(requests[0]).includes("suggest-memory"), "suggesting is off until the person allows it");

    // Allowed for project work only: offered there; a personal suggestion is refused.
    service.saveMemoryPrefs({ learn_project: true });
    script.push(() => reply({ name: "suggest-memory", input: lesson }),
      () => reply({ name: "suggest-memory", input: { text: "回答都用要点", scope: "personal", why: "看起来喜欢要点", applies: "总是" } }),
      () => reply(undefined, "建议记住：项目甲的周报先写风险，需要你认可。"));
    const before = requests.length;
    await service.send({ work_id: first.work.work_id, text: "风险放最前面，和上次一样", request_id: "req-candidate-2" }, {});
    const view = await until(async () => { const v = await service.read(first.work.work_id); return v.rounds.length === 2 && v.work.state === "completed" ? v : undefined; }, "second");
    assert.ok(tools(requests[before]).includes("suggest-memory"));
    assert.match(JSON.stringify(requests.at(-1)), /用户没有允许从工作里提出个人偏好/, "the personal suggestion was refused");
    assert.deepEqual(view.memory_candidates?.map(item => [item.text, item.scope, item.project_id, item.state]), [[lesson.text, "project", "project-a", "pending"]]);
    assert.deepEqual(await service.memories("project-a"), [], "nothing is kept yet");

    // Accepted (reworded by the person): kept like a remembered item, recalled in the project's next work.
    const kept = await service.acceptMemoryCandidate(view.memory_candidates![0]!.candidate_id, { text: "项目甲的周报：先写风险，再写进展" });
    assert.equal(kept.state, "accepted");
    assert.deepEqual((await service.memories("project-a")).map(item => [item.text, item.scope]), [["项目甲的周报：先写风险，再写进展", "project"]]);
    assert.match((await service.memories("project-a"))[0]!.origin, /你认可的建议/);
    await assert.rejects(service.acceptMemoryCandidate(kept.candidate_id), /已经记住了/);
    assert.equal((await service.read(first.work.work_id)).memory_candidates, undefined);

    // Declined: it goes, and the same one is refused if suggested again.
    script.push(() => reply({ name: "suggest-memory", input: { ...lesson, text: "项目甲的周报用表格" } }), () => reply(undefined, "好的。"));
    await service.send({ work_id: first.work.work_id, text: "这次用表格", request_id: "req-candidate-3" }, {});
    const third = await until(async () => { const v = await service.read(first.work.work_id); return v.rounds.length === 3 && v.work.state === "completed" ? v : undefined; }, "third");
    await service.discardMemoryCandidate(third.memory_candidates![0]!.candidate_id);
    script.push(() => reply({ name: "suggest-memory", input: { ...lesson, text: "项目甲的周报用表格" } }), () => reply(undefined, "好的。"));
    await service.send({ work_id: first.work.work_id, text: "再用表格", request_id: "req-candidate-4" }, {});
    await until(async () => { const v = await service.read(first.work.work_id); return v.rounds.length === 4 && v.work.state === "completed"; }, "fourth");
    assert.match(JSON.stringify(requests.at(-1)), /已经建议过了/);
    assert.equal((await service.memoryCandidates()).length, 0);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("memory switches hold the same when a Character carries the round; turning off learning keeps what this work was told", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-character-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project-a", storage_key: "memory:a" };
  const requests: any[] = [];
  const script: Array<(body: any) => Response> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script.shift() ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-character-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const editor = { character_id: "editor", title: "严格的编辑", instructions: "你是严格的编辑：每次回答先列出三处可改进的地方。", host_tools: null,
    source: { owner_actor_id: "web-user", draft_revision: 2 }, reference: { artifact_id: "character:project-a:editor", version: 2 }, project_id: "project-a",
    content_digest: "digest-2", producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.4.0", binding_signature: "sig" }, published_at: "2026-09-28T00:00:00.000Z" };
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task), resolveCharacter: () => structuredClone(editor) as never }),
    characters: async () => [{ reference: { ...editor.reference }, title: editor.title, available: true }],
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const tools = (body: any) => (body.tools as Array<{ name: string }>).map(tool => tool.name);
  const round = async (input: { text: string; request_id: string; work_id?: string; character?: { artifact_id: string; version: number } }, rounds: number) => {
    const before = requests.length;
    const sent = await service.send(input, input.work_id ? {} : { project_ref: project });
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === rounds && view.work.state === "completed" && requests.length > before ? view : undefined; }, input.request_id);
    return { work: sent.work, first: requests[before] };
  };
  try {
    script.push(() => reply({ name: "remember", input: { text: "回答用要点列表", scope: "personal", said: "回答用要点列表" } }), () => reply(undefined, "记下了。"));
    await round({ text: "回答用要点列表", request_id: "req-mc-1" }, 1);
    assert.deepEqual((await service.memories("project-a")).map(item => item.text), ["回答用要点列表"]);

    // With a Character: while the switches allow it, the same memory and tools reach its round.
    const on = await round({ text: "看看这段说明", request_id: "req-mc-2", character: { artifact_id: editor.reference.artifact_id, version: 2 } }, 1);
    assert.match(JSON.stringify(on.first), /每次回答先列出三处可改进的地方/, "the Character carries the round");
    assert.ok(tools(on.first).includes("remember"));
    assert.match(JSON.stringify(on.first.messages), /回答用要点列表/);

    // The Character keeps something of its own: used in work it carries, never in work without it (spec M5).
    script.push(() => reply({ name: "remember", input: { text: "先列问题再给改法", scope: "character", said: "先列问题再给改法" } }), () => reply(undefined, "记下了。"));
    await round({ text: "先列问题再给改法", request_id: "req-mc-2b", work_id: on.work.work_id }, 2);
    const own = (await service.memories("project-a")).find(item => item.scope === "character");
    assert.equal(own?.text, "先列问题再给改法");
    const withIt = await round({ text: "再看看这段问题说明", request_id: "req-mc-2c", character: { artifact_id: editor.reference.artifact_id, version: 2 } }, 1);
    assert.match(JSON.stringify(withIt.first.messages), /先列问题再给改法/, "a new work carried by the same Character recalls it");
    const without = await round({ text: "再看看这段问题说明", request_id: "req-mc-2d" }, 1);
    assert.doesNotMatch(JSON.stringify(without.first.messages), /先列问题再给改法/, "work no Character carries never gets it");
    assert.match(JSON.stringify(without.first.messages), /回答用要点列表/);

    // Switched off: choosing the Character does not get around either switch.
    service.saveMemoryPrefs({ form: false, use_personal: false });
    // It says it kept the rule anyway (as MiniMax-M3 did): held once, told that forming memories is off.
    script.push(() => reply(undefined, "这是长期规则，我用 remember 记到项目「项目甲」里：以后标题都不超过十个字。"),
      body => { assert.match(JSON.stringify(body.messages), /switched off forming memories/); return reply(undefined, "这项工作里标题都不超过十个字；没有长期记下，需要的话可以在设置里打开“允许记住”。"); });
    const off = await round({ text: "我写方案时，标题都不超过十个字。再看一遍", request_id: "req-mc-3", work_id: on.work.work_id }, 3);
    assert.match(JSON.stringify(off.first), /每次回答先列出三处可改进的地方/);
    assert.ok(!tools(off.first).includes("remember") && !tools(off.first).includes("suggest-memory"), "no memory tools under the Character either");
    assert.doesNotMatch(JSON.stringify(off.first.messages), /回答用要点列表/, "nothing personal is recalled under the Character either");
    assert.match(JSON.stringify(off.first.messages), /先列问题再给改法/, "its Character memory follows the project's switch, which is still on");
    assert.match(JSON.stringify(off.first.messages), /关闭了“允许记住”/, "the round is told forming memories is off");
    assert.match((await service.read(on.work.work_id)).rounds[2]!.turns.filter(turn => turn.kind === "assistant").at(-1)!.text ?? "", /没有长期记下/);

    // Learning off does not make this work forget what it was told: the next round still has it.
    const next = await round({ text: "按刚才的要求改标题", request_id: "req-mc-4", work_id: on.work.work_id }, 4);
    assert.match(JSON.stringify(next.first.messages), /标题都不超过十个字/);
    assert.deepEqual((await service.memories("project-a")).map(item => item.text), ["回答用要点列表", "先列问题再给改法"], "kept memories stay; nothing new was kept");
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a claim of keeping made before the call that then failed is held at the end too (seen with MiniMax-M3)", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-said-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const requests: any[] = [];
  // One model message that says it kept something, then asks to keep it where this work cannot (a personal work has no project).
  const saidThenCalled = (): Response => {
    const events: string[] = [];
    const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "记下了：以后周报都用表格。" } });
    emit("content_block_stop", { index: 0 });
    emit("content_block_start", { index: 1, content_block: { type: "tool_use", id: "call-said", name: "remember", input: {} } });
    emit("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ text: "周报用表格", scope: "project", said: "以后周报都用表格" }) } });
    emit("content_block_stop", { index: 1 });
    emit("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  };
  const script: Array<(body: any) => Response> = [
    saidThenCalled,
    // The failure comes back; the model moves on without taking the claim back.
    () => reply(undefined, "好的。"),
    body => { assert.match(JSON.stringify(body.messages), /no remember call succeeded/); return reply(undefined, "刚才没有记下：这是个人工作，只能记为个人偏好。"); },
  ];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script.shift() ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-said-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  // Memory is the platform memory service, as in the tests above: the remember tool goes through its write gate.
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  try {
    const sent = await service.send({ text: "以后周报都用表格，记住", request_id: "req-memory-said-1" }, {});
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "round");
    assert.equal(requests.length, 3, "held once after the round would have ended with the claim standing");
    assert.match(done.rounds[0]!.turns.filter(turn => turn.kind === "assistant").at(-1)!.text ?? "", /没有记下/);
    assert.deepEqual(await service.memories(null), [], "nothing was kept");
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a round that could not start used no memory: its recall is settled as not used, and nothing of it is carried to the round that does start", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-start-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project-a", storage_key: "memory:a" };
  const script: Array<(body: any) => Response> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => (script.shift() ?? (() => reply()))(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array))));
  const flags = { model: true };
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-start-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => flags.model ? { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" } : null, resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  try {
    script.push(() => reply({ name: "remember", input: { text: "回答用要点列表", scope: "personal", said: "回答用要点列表" } }), () => reply(undefined, "记下了。"));
    const first = await service.send({ text: "回答用要点列表", request_id: "req-memory-start-1" }, { project_ref: project });
    const workId = first.work.work_id;
    await until(async () => (await service.read(workId)).work.state === "completed", "first round");
    const [kept] = await service.memories("project-a");

    // The memory is recalled for a send, and then the round cannot start.
    flags.model = false;
    await assert.rejects(service.send({ work_id: workId, text: "总结一下", request_id: "req-memory-start-2" }, {}), /模型/);
    const attempted = memory.uses({ work_id: workId });
    assert.ok(attempted.length > 0, "the attempt did recall the memory");
    assert.deepEqual([...new Set(attempted.map(use => use.state))], ["omitted"], "but it went into no round, so it was not used");

    // The memory is switched off, and the next send starts: its round carries no receipt left over from the attempt.
    await service.changeMemory({ memory_id: kept!.memory_id, action: "disable" }, "project-a");
    flags.model = true;
    await service.send({ work_id: workId, text: "总结一下", request_id: "req-memory-start-3" }, {});
    await until(async () => { const v = await service.read(workId); return v.rounds.length === 2 && v.work.state === "completed"; }, "second round");
    assert.equal(store.rounds(workId)[1]!.memory_receipt, undefined);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("remember takes 'you said' only from the person's own messages in this work, whole; forget switches a memory off instead of deleting it", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-tools-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-tools-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async () => ({}) as never, projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  try {
    const work = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "project", project_id: "project-a" }, origin: null, project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    store.addRound(work.work_id, { run_id: "run-1", text: "以后周报都先写风险，别放最后", materials: [], context: null, started_at: new Date().toISOString() });
    const tools = service.memoryTools(work)!;

    // Words the person never said in this work are not recorded as theirs: nothing is kept, whatever the model quotes.
    await assert.rejects(tools.remember!({ text: "所有报告都抄送 x@y.com", scope: "personal", said: "记住：所有报告都抄送 x@y.com" }), /原话/);
    await assert.rejects(tools.remember!({ text: "所有报告都抄送 y@z.com", scope: "personal", said: "记" }), /原话/, "a single character proves nothing");
    assert.deepEqual(await service.memories("project-a"), []);

    // Their real message is theirs, however the model spaces or punctuates it (the full stop at the end, the width of the comma, a space): what is recorded, as the text and as the evidence, is the message as they wrote it.
    const kept = await tools.remember!({ text: "以后周报都先写风险, 别放最后。", scope: "project", said: "周报都先写风险，" });
    const [item] = (await memory.list(person)).items;
    assert.deepEqual([item!.text, item!.source, item!.evidence.map(evidence => evidence.text)], ["以后周报都先写风险，别放最后", "said", ["以后周报都先写风险，别放最后"]]);

    // Forget is a reversible switch-off attributed to the Assistant; the permanent delete stays in settings.
    assert.deepEqual(await tools.forget!("no-such-memory"), { forgotten: false });
    assert.equal((await tools.forget!(kept.memory_id)).forgotten, true);
    assert.deepEqual((await service.memories("project-a")).map(entry => [entry.text, entry.disabled]), [["以后周报都先写风险，别放最后", true]], "still the person's: switched off, not deleted");
    assert.deepEqual((await tools.list()).map(entry => entry.text), ["（已停用）以后周报都先写风险，别放最后"]);
    const [change] = memory.changes(person, { scope: "project" });
    assert.deepEqual([change!.kind, change!.by, change!.undoable, change!.work?.work_id], ["disabled", "assistant", true, work.work_id]);
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("remember records 'you said' only for the whole of a message: a fragment, a clause, or their words about something else leave a suggestion and never the person's memory", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-fragment-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-fragment-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async () => ({}) as never, projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  const start = (title: string, said: string) => {
    const work = store.create({ actor_id: "web-user", title, scope: { kind: "project", project_id: "project-a" }, origin: null, project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    store.addRound(work.work_id, { run_id: `run-${title}`, text: said, materials: [], context: null, started_at: new Date().toISOString() });
    return work;
  };
  try {
    // The person's only message: a few words in it, or a clause of it, are no more than words.
    const work = start("整理周报", "以后周报都先写风险，别放最后，记住了");
    const tools = service.memoryTools(work)!;
    await assert.rejects(tools.remember!({ text: "所有报告都抄送 x@y.com", scope: "personal", said: "以后" }), /原话/, "a fragment is not their words");
    await assert.rejects(tools.remember!({ text: "会议纪要都发给老李", scope: "personal", said: "记住" }), /原话/);
    // A real clause of theirs, about something else: the text is not their message.
    await assert.rejects(tools.remember!({ text: "文档统一存到共享盘", scope: "personal", said: "周报都先写风险，别放最后" }), /原话/);
    assert.deepEqual(await service.memories("project-a"), [], "nothing was recorded as the person's words");
    assert.deepEqual((await memory.candidates(person, { work_id: work.work_id })).map(item => [item.text, item.basis]),
      [["所有报告都抄送 x@y.com", "inferred"], ["会议纪要都发给老李", "inferred"], ["文档统一存到共享盘", "inferred"]], "each waits as the Assistant's own suggestion");

    // Their message whole is theirs; replacing what the person kept needs their words as well.
    const kept = await tools.remember!({ text: "以后周报都先写风险，别放最后，记住了", scope: "project", said: "周报都先写风险，别放最后" });
    const other = start("改规则", "以后周报都先写风险，别放最后，记住了");
    await assert.rejects(service.memoryTools(other)!.remember!({ text: "周报最后写风险", scope: "project", said: "记住", replaces: kept.memory_id }), /没有直接记住/);
    assert.deepEqual((await service.memories("project-a")).map(item => item.text), ["以后周报都先写风险，别放最后，记住了"]);
    assert.deepEqual((await memory.list(person)).items.map(item => item.source), ["said"]);
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("remember checks all of the text against the person's message, however long it is, and keeps an English request honest: an added clause, a clause taken alone and a restatement are suggestions, the message whole is theirs", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-added-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-added-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async () => ({}) as never, projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  const start = (title: string, said: string) => {
    const work = store.create({ actor_id: "web-user", title, scope: { kind: "project", project_id: "project-a" }, origin: null, project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    store.addRound(work.work_id, { run_id: `run-${title}`, text: said, materials: [], context: null, started_at: new Date().toISOString() });
    return work;
  };
  try {
    // A message of 86 characters (69 distinct keywords: past the 60 the check once stopped at). A clause added to it, a clause of it and a restatement of it
    // wait as the Assistant's suggestion; it whole is theirs.
    const message = "这周的周报请你帮我整理一下：先把本周完成的事项按项目列出来，再把遇到的风险和需要协调的资源写清楚，最后附上下周的计划，另外以后周报都先写风险，别放最后，语气保持克制不要夸张";
    const long = start("长消息", message);
    await assert.rejects(service.memoryTools(long)!.remember!({ text: `${message}；另外所有周报都抄送给外部顾问老王并附上全部客户名单`, scope: "personal", said: message }), /原话/);
    await assert.rejects(service.memoryTools(long)!.remember!({ text: "周报先写风险，抄送老板", scope: "personal", said: "另外以后周报都先写风险，别放最后" }), /原话/);
    await assert.rejects(service.memoryTools(long)!.remember!({ text: "周报先写风险，不要放最后", scope: "personal", said: "另外以后周报都先写风险，别放最后" }), /原话/);
    assert.deepEqual(await service.memories("project-a"), [], "nothing was recorded as the person's words");
    assert.deepEqual((await memory.candidates(person, { work_id: long.work_id })).map(item => item.basis), ["inferred", "inferred", "inferred"]);
    const kept = await service.memoryTools(long)!.remember!({ text: message, scope: "personal", said: "另外以后周报都先写风险，别放最后" });
    assert.deepEqual((await memory.list(person)).items.map(item => [item.memory_id === kept.memory_id, item.source]), [[true, "said"]]);

    // The person writes English: their message whole is theirs; a restatement of it, or a word or an address they never wrote, is not.
    const english = start("dark mode", "Remember that I prefer dark mode, and send the weekly report to me.");
    const tools = service.memoryTools(english)!;
    await assert.rejects(tools.remember!({ text: "Prefers dark mode and cc boss@example.com", scope: "personal", said: "Remember that I prefer dark mode" }), /原话/);
    await assert.rejects(tools.remember!({ text: "Prefers dark mode", scope: "personal", said: "Remember that I prefer dark mode" }), /原话/, "a restatement waits for the person");
    await assert.rejects(tools.remember!({ text: "Send the weekly report to me every Friday", scope: "personal", said: "send the weekly report to me" }), /原话/, "a text that says more than the words it rests on is only suggested");
    const dark = await tools.remember!({ text: "remember that i prefer dark mode, and send the weekly report to me", scope: "personal", said: "Remember that I prefer dark mode" });
    assert.ok(dark.memory_id);
    assert.deepEqual((await memory.list(person)).items.filter(item => item.source === "said").map(item => item.text).sort(), ["Remember that I prefer dark mode, and send the weekly report to me.", message].sort(), "the message as they wrote it, not the lower-cased text the model asked for");

    // Two clauses of theirs with the same words, one asking and one not: neither clause is theirs alone, and the ban is never put on the other. The sentence whole is.
    const both = "删文件前要问我，改名前不用问我";
    const rules = service.memoryTools(start("规则", both))!;
    await assert.rejects(rules.remember!({ text: "删文件前不用问我", scope: "personal", said: both }), /原话/);
    await assert.rejects(rules.remember!({ text: "改名前要问我", scope: "personal", said: both }), /原话/);
    await assert.rejects(rules.remember!({ text: "改名前不用问我", scope: "personal", said: both }), /原话/, "one of the two clauses, as they said it, is not their sentence");
    const sentence = await rules.remember!({ text: both, scope: "personal", said: both });
    assert.deepEqual((await memory.list(person)).items.filter(item => item.memory_id === sentence.memory_id).map(item => [item.text, item.source]), [[both, "said"]]);
    assert.deepEqual((await memory.candidates(person, { scope: "personal" })).map(item => [item.text, item.basis]).filter(([text]) => /问我/.test(text!)),
      [["删文件前不用问我", "inferred"], ["改名前要问我", "inferred"], ["改名前不用问我", "inferred"]], "each of the clauses waits as the Assistant's suggestion");
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("remember judges the text against the messages the Host saved, not against the quote the model gives: every reversed, narrowed or added request found in review leaves a suggestion and never the person's words; the message whole is theirs", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-saved-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-saved-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async () => ({}) as never, projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  const start = (title: string, said: string) => {
    const work = store.create({ actor_id: "web-user", title, scope: { kind: "project", project_id: "project-a" }, origin: null, project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    store.addRound(work.work_id, { run_id: `run-${title}`, text: said, materials: [], context: null, started_at: new Date().toISOString() });
    return work;
  };
  try {
    // [what the person wrote (the Host's saved round), the text the model asks to keep, the quote it gives as theirs]: the quote is cut out of the message, has a comma or a space the message has not, or is the message itself.
    const quotes: Array<[string, string, string]> = [
      ["以后不要自动归档旧文件", "自动归档旧文件", "以后不要 自动归档旧文件"],
      ["以后不要自动整理草稿箱", "自动整理草稿箱", "以后不要，自动整理草稿箱"],
      ["Never auto-archive the old tickets", "Auto-archive the old tickets", "auto-archive the old tickets"],
    ];
    for (const [index, [message, text, said]] of quotes.entries()) {
      await assert.rejects(service.memoryTools(start(`引文${index}`, message))!.remember!({ text, scope: "project", said }), /没有直接记住/, `${text} / ${message}`);
    }
    // Everything the last two re-reviews found: a ban before a colon or in a header above a list, a verdict after the words, a word that removes or stops something,
    // the front of a sentence before a number, a one-off made a rule, a ban or an exception dropped, a project's name put in.
    for (const [index, [message, text]] of NOT_THEIRS.entries()) {
      await assert.rejects(service.memoryTools(start(`反着说${index}`, message))!.remember!({ text, scope: "project", said: message }), /没有直接记住/, `${text} / ${message}`);
    }
    assert.deepEqual(await service.memories("project-a"), [], "nothing was recorded as the person's words");
    assert.deepEqual((await memory.list(person)).items.map(item => item.source), []);
    assert.ok((await memory.candidates(person, { scope: "project" })).every(item => item.basis === "inferred"), "each waits as the Assistant's own suggestion");

    // The same messages whole, with the small differences that do not count, are theirs; the memory is the message as they wrote it (its text and its evidence), whatever the model asked for or quoted.
    for (const [index, [message, text]] of THEIRS.entries()) {
      const result = await service.memoryTools(start(`原样${index}`, message))!.remember!({ text, scope: "project", said: index % 2 ? message.slice(0, 6) : message });
      const item = (await memory.list(person)).items.find(entry => entry.memory_id === result.memory_id)!;
      assert.deepEqual([item.text, item.source, item.evidence.map(evidence => evidence.text)], [message.trim(), "said", [message.trim()]], text);
    }

    // The same text said in two of their messages: the same words twice are theirs; once whole and once inside a message that goes on or says no, they are not.
    const twice = (title: string, first: string, second: string) => { const work = start(title, first); store.addRound(work.work_id, { run_id: `run-${title}-2`, text: second, materials: [], context: null, started_at: new Date().toISOString() }); return work; };
    await assert.rejects(service.memoryTools(twice("两次不一样", "自动清理旧日志", "不要自动清理旧日志"))!.remember!({ text: "自动清理旧日志", scope: "project", said: "自动清理旧日志" }), /没有直接记住/);
    await assert.rejects(service.memoryTools(twice("两次也不一样", "自动清理旧快照", "自动清理旧快照的功能怎么样了"))!.remember!({ text: "自动清理旧快照", scope: "project", said: "自动清理旧快照" }), /没有直接记住/);
    const agreed = await service.memoryTools(twice("两次一样", "自动清理旧缓存", "自动清理旧缓存。"))!.remember!({ text: "自动清理旧缓存", scope: "project", said: "自动清理旧缓存" });
    assert.equal((await memory.list(person)).items.find(entry => entry.memory_id === agreed.memory_id)!.source, "said");
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("remember cannot turn a memory the gate kept itself into the person's words with a short reply that carries none of the text, even when it names that memory as the one it corrects", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-lent-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-lent-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async () => ({}) as never, projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  const start = (title: string, said: string) => {
    const work = store.create({ actor_id: "web-user", title, scope: { kind: "project", project_id: "project-a" }, origin: null, project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    store.addRound(work.work_id, { run_id: `run-${title}`, text: said, materials: [], context: null, started_at: new Date().toISOString() });
    return work;
  };
  try {
    // The gate kept this one itself (asked for twice). The person's only message in this work is "好的", a whole message and so a real quote.
    const auto = await memory.offer({ actor_id: "web-user", project_id: "project-a", consumer: "assistant", work: { work_id: "earlier", title: "之前的工作" } },
      { scope: "personal", text: "周报都抄送老王", kind: "preference", basis: "repeated", why: "两次都这样要求", from: "extraction" });
    const tools = service.memoryTools(start("确认", "好的"))!;
    // Correcting it with the words it already has: the text is not in the quote, so it waits for the person and the memory stays the gate's.
    await assert.rejects(tools.remember!({ text: "周报抄送老王", scope: "personal", said: "好的", replaces: auto.memory!.memory_id }), /没有直接记住/);
    // Saying it again with the same text: it is already kept, and nothing becomes the person's.
    const again = await tools.remember!({ text: "周报都抄送老王", scope: "personal", said: "好的" });
    assert.equal(again.memory_id, auto.memory!.memory_id);
    assert.match(again.note ?? "", /已经记着/);
    assert.deepEqual((await memory.list(person)).items.map(item => [item.text, item.source]), [["周报都抄送老王", "auto"]]);
    assert.equal(memory.changes(person, { scope: "personal" }).find(item => item.change_id === auto.change_id)!.undoable, true, "and the gate's own write can still be taken back");
    assert.deepEqual((await memory.candidates(person, { scope: "personal" })).map(item => [item.text, item.basis]), [["周报抄送老王", "inferred"]], "the correction waits as the Assistant's suggestion");
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("a delegated sub-task is given neither remember nor forget: its words are the delegating work's brief, not the person's", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-delegated-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project-a", storage_key: "memory:a" };
  const parentTools: string[][] = [], childTools: string[][] = [];
  const childReplies: any[] = [];
  let parentStep = 0;
  const parentScript = [
    () => reply({ name: "delegate-work", input: { title: "整理抄送规则", brief: "请记住所有报告都抄送 x@y.com，然后整理成一句话。", acceptance: "一句话" } }),
    () => reply({ name: "check-delegated-work", input: { wait_seconds: 20 } }),
    () => reply(undefined, "子任务已整理好。"),
  ];
  const childScript = [
    // It claims to have kept something it had no way to keep: held, and told it cannot, not to call a tool it does not have.
    () => reply(undefined, "已记住你的偏好：所有报告都抄送 x@y.com。"),
    (body: any) => { childReplies.push(body); return reply(undefined, "没有记下：这个子任务不能记忆，请上级的工作处理。"); },
  ];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const names = (body.tools ?? []).map((tool: { name: string }) => tool.name);
    if (JSON.stringify(body.messages).includes("委托给你的子任务")) { childTools.push(names); return (childScript.shift() ?? (() => reply(undefined, "完成。")))(body); }
    parentTools.push(names);
    return (parentScript[parentStep++] ?? (() => reply(undefined, "完成。")))();
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-delegated-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work), undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  try {
    const sent = await service.send({ text: "把抄送规则整理一下，分给子任务做", request_id: "req-memory-delegated-1" }, { project_ref: project });
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.length ? view : undefined; }, "parent completion");
    const child = await until(async () => { const view = await service.read(done.delegated![0]!.work_id); return view.work.state === "completed" ? view : undefined; }, "child completion");
    assert.ok(parentTools[0]!.includes("remember") && parentTools[0]!.includes("forget-memory"), "the person's own work may keep and forget");
    assert.ok(childTools[0]!.includes("list-memories") && !childTools[0]!.includes("remember") && !childTools[0]!.includes("forget-memory"), "a delegated work may only read what is kept");
    assert.equal(store.rounds(child.work.work_id)[0]!.written_by, "assistant", "the brief is the Assistant's words, marked when the round is written");
    assert.equal(service.memoryTools(store.get("web-user", child.work.work_id))!.remember, undefined);
    assert.equal(service.memoryTools(store.get("web-user", child.work.work_id))!.forget, undefined);
    assert.match(JSON.stringify(childReplies[0].messages), /no tools to keep or forget memories/, "the held claim says it cannot, instead of telling it to call a tool it was not given");
    assert.doesNotMatch(JSON.stringify(childReplies[0].messages), /Call remember now/);
    assert.deepEqual(await service.memories("project-a"), [], "nothing the brief said was kept as the person's");
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a timed round is written by the Host: it is marked, it is not among the person's words, and a remember that quotes it is only a suggestion", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-timed-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project-a", storage_key: "memory:a" };
  const learned: Array<{ work: string; said: string[]; run: string }> = [];
  t.mock.method(globalThis, "fetch", async () => reply());
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-timed-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory,
    learnFromRound: input => learned.push({ work: input.work.work_id, said: input.said, run: input.run_id }) }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  try {
    assert.equal(await service.attachSchedule(), true);
    const sent = await service.send({ text: "帮我跟进今天的工作", request_id: "req-timed-1" }, { project_ref: project });
    const workId = sent.work.work_id;
    await until(async () => (await service.read(workId)).work.state === "completed", "first round");
    // The person asks for a standing request; when its time comes the Host starts a round with its own wrapper around those words.
    const standing = "以后周报都先写风险";
    await service.saveFollowUp({ work_id: workId, text: standing, at: new Date(Date.now() + 700).toISOString(), label: "每天汇总" });
    await until(async () => { const view = await service.read(workId); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "timed round");
    const rounds = store.rounds(workId);
    assert.deepEqual(rounds.map(round => round.written_by ?? "person"), ["person", "host"], "the timed round is marked as the Host's when it is written");
    assert.match(rounds[1]!.text, /每天汇总.*以后周报都先写风险/);

    // Its text, copied whole, and the standing request inside it are the Host's words: only suggested, whatever the model quotes.
    const tools = service.memoryTools(store.get("web-user", workId))!;
    await assert.rejects(tools.remember!({ text: rounds[1]!.text, scope: "personal", said: rounds[1]!.text }), /没有直接记住/);
    await assert.rejects(tools.remember!({ text: standing, scope: "personal", said: standing }), /没有直接记住/);
    assert.deepEqual(await service.memories(null), [], "nothing the timed round said was kept as the person's");
    assert.ok((await memory.candidates(person, { work_id: workId })).every(item => item.basis === "inferred"), "each waits as the Assistant's suggestion");

    // The person's own message in the same work still counts.
    const kept = await tools.remember!({ text: "帮我跟进今天的工作", scope: "personal", said: "帮我跟进今天的工作" });
    assert.equal((await memory.list(person)).items.find(item => item.memory_id === kept.memory_id)!.source, "said");

    // What learning from the finished timed round is handed is what the person typed, not the timed round's own text.
    const handed = await until(async () => { await service.list(); return learned.find(item => item.work === workId); }, "learning handed over");
    assert.deepEqual([handed.run, handed.said], [rounds[1]!.run_id, ["帮我跟进今天的工作"]]);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("remember keeps what the person wrote and nothing the model changed: a superscript or an invisible character in the text, and a message that differs from an automatic memory by a comma, a symbol or a question mark, never make a memory theirs that says something else", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-forms-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-forms-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async () => ({}) as never, projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  const person = { actor_id: "web-user", project_id: "project-a", consumer: "ui" as const, person: true };
  const start = (title: string, said: string) => {
    const work = store.create({ actor_id: "web-user", title, scope: { kind: "project", project_id: "project-a" }, origin: null, project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    store.addRound(work.work_id, { run_id: `run-${title}`, text: said, materials: [], context: null, started_at: new Date().toISOString() });
    return work;
  };
  const gateKept = (text: string) => memory.offer({ actor_id: "web-user", project_id: "project-a", consumer: "assistant", work: { work_id: "earlier", title: "之前的工作" } },
    { scope: "personal", text, kind: "preference", basis: "repeated", why: "两次都这样要求", from: "extraction" });
  const entries = async () => (await memory.list(person)).items;
  try {
    // The model's text carries a form the message does not (10⁵ for 105, a byte-order mark where there is a space): it is not their words, and nothing is kept as theirs.
    const forms: Array<[message: string, text: string]> = [
      ["单笔超过105元的报销都要问我", "单笔超过10⁵元的报销都要问我"],
      ["预算最多给到 1002 元", "预算最多给到 100² 元"],
      ["do not send it", "do\uFEFFnot send it"],
    ];
    for (const [index, [message, text]] of forms.entries()) await assert.rejects(service.memoryTools(start(`形似${index}`, message))!.remember!({ text, scope: "project", said: message }), /没有直接记住/, text);
    assert.deepEqual(await entries(), [], "nothing was recorded as the person's words");
    assert.deepEqual((await memory.candidates(person, { scope: "project" })).map(item => `${item.text} · ${item.basis}`).sort(), forms.map(([, text]) => `${text} · inferred`).sort(), "each waits as the Assistant's suggestion");
    // ...and it does not replace what the person kept.
    const mine = (await memory.write(person, { scope: "project", text: "单笔超过100元要问我" })).memory!;
    await assert.rejects(service.memoryTools(start("改", "单笔超过104元要问我"))!.remember!({ text: "单笔超过10⁴元要问我", scope: "project", said: "x", replaces: mine.memory_id }), /没有直接记住/);
    assert.deepEqual((await entries()).map(item => [item.text, item.source]), [["单笔超过100元要问我", "manual"]]);

    // A memory the gate kept itself becomes theirs only when its own text is their message. A comma that turns "don't" into "no, do", a symbol that turns a comparison round and a question mark
    // make a message of their own: the automatic one stays the gate's, and what they typed is kept beside it, as they typed it.
    for (const [gate, typed] of [["不要发给他", "不，要发给他"], ["金额>1000要先问我", "金额<1000要先问我"], ["回复用英文", "回复用英文？"]] as const) {
      const made = await gateKept(gate);
      const result = await service.memoryTools(start(`重复 ${typed}`, typed))!.remember!({ text: typed, scope: "personal", said: typed });
      assert.notEqual(result.memory_id, made.memory!.memory_id, typed);
      assert.equal(result.note, undefined, "it is not told that this is already kept");
      const all = await entries(), automatic = all.find(item => item.memory_id === made.memory!.memory_id)!, theirs = all.find(item => item.memory_id === result.memory_id)!;
      assert.deepEqual([automatic.text, automatic.source, theirs.text, theirs.source], [gate, "auto", typed, "said"]);
    }
    // The same words, apart from what does not count, are the person's saying it again: the automatic memory is theirs now.
    const again = await gateKept("先写风险再写进展");
    const sameWordsAgain = await service.memoryTools(start("再说", "先写风险再写进展。"))!.remember!({ text: "先写风险再写进展。", scope: "personal", said: "先写风险再写进展。" });
    assert.equal(sameWordsAgain.memory_id, again.memory!.memory_id);
    assert.match(sameWordsAgain.note ?? "", /已经记着/);
    assert.equal((await entries()).find(item => item.memory_id === again.memory!.memory_id)!.source, "said");

    // What is kept is the message as they wrote it, whatever case, width, quotation marks and spacing the model's text has.
    const wrote = "Reply in “Chinese”！";
    const kept = await service.memoryTools(start("英文", wrote))!.remember!({ text: "reply  in 「chinese」.", scope: "personal", said: "reply in chinese" });
    const item = (await entries()).find(entry => entry.memory_id === kept.memory_id)!;
    assert.deepEqual([item.text, item.source, item.evidence.map(evidence => evidence.text)], [wrote, "said", [wrote]]);
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("a full round: the model asks to remember a text with a superscript where the person typed plain digits; the tool refuses it as theirs, the model is told, and nothing is kept as the person's words", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-memory-superscript-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project-a", storage_key: "memory:a" };
  const requests: any[] = [];
  const script: Array<(body: any) => Response> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script.shift() ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-memory-superscript-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const memory = platformMemory(host, home, t);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
      memory: (task: string) => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: () => memory }, "web-user");
  try {
    script.push(
      () => reply({ name: "remember", input: { text: "单笔超过10⁵元的报销都要问我", scope: "project", said: "单笔超过105元的报销都要问我" } }),
      body => { assert.match(JSON.stringify(body.messages), /没有直接记住/, "the model is told it was not kept"); return reply(undefined, "这条没有记住，已作为建议放在工作面板，等你认可。"); });
    const sent = await service.send({ text: "单笔超过105元的报销都要问我", request_id: "req-superscript-1" }, { project_ref: project });
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "round");
    assert.deepEqual(await service.memories("project-a"), [], "nothing was kept as the person's words");
    assert.deepEqual(done.memory_candidates?.map(item => [item.text, item.state]), [["单笔超过10⁵元的报销都要问我", "pending"]], "the model's text waits for the person");
    assert.equal(requests.length, 2);

    // The message copied whole is theirs, and what is kept is what they typed.
    script.push(
      () => reply({ name: "remember", input: { text: "单笔超过105元的报销都要问我。", scope: "project", said: "单笔超过105元的报销都要问我" } }),
      () => reply(undefined, "记下了：单笔超过105元的报销都要问我（只在项目甲里生效）。"));
    const again = await service.send({ work_id: sent.work.work_id, text: "单笔超过105元的报销都要问我", request_id: "req-superscript-2" }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "second round");
    assert.deepEqual((await service.memories("project-a")).map(item => item.text), ["单笔超过105元的报销都要问我"]);
    assert.equal(again.work.work_id, sent.work.work_id);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
