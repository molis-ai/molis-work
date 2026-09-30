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

/** The platform memory over the test's own runtime (Prologue Memory) and a ledger in its Home, as the Host wires it. */
function platformMemory(host: AgentHost, home: string, t: { after(fn: () => void): void }): MemoryService {
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(() => ledger.close());
  return new MemoryService({ backend: prologueMemoryBackend(async () => host.adapter("prologue").memory!), ledger, timeZone: "Asia/Shanghai" });
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
  const projectA = { project_id: "project-a", board_id: "board-a", storage_key: "memory:a" };
  const projectB = { project_id: "project-b", board_id: "board-b", storage_key: "memory:b" };
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
    // Asked to keep two things: a personal preference and a project convention.
    script.push(
      () => reply({ name: "remember", input: { text: "回答用要点列表", scope: "personal", said: "以后回答都用要点列表" } }),
      () => reply({ name: "remember", input: { text: "项目甲里 NSM 指北极星指标", scope: "project", said: "记住：NSM 是北极星指标" } }),
      () => reply(undefined, "记下了：回答用要点列表（个人）；NSM 指北极星指标（项目甲）。"));
    const first = await round("以后回答都用要点列表；另外记住：NSM 是北极星指标", projectA, "req-memory-001");
    // A finished round hands the person's own words to the platform memory's learning (once per round).
    await until(async () => { await service.list(); return learned.find(item => item.work === first.work.work_id); }, "learning handed over");
    assert.deepEqual(learned.find(item => item.work === first.work.work_id)!.said, ["以后回答都用要点列表；另外记住：NSM 是北极星指标"]);
    assert.ok(first.first.tools.some((tool: { name: string }) => tool.name === "remember"), "the round may remember");
    const kept = await service.memories("project-a");
    assert.deepEqual(kept.map(item => [item.scope, item.text, item.disabled]), [["personal", "回答用要点列表", false], ["project", "项目甲里 NSM 指北极星指标", false]]);
    assert.match(kept[0]!.origin, /^.* · 你说：“以后回答都用要点列表”$/);
    assert.doesNotMatch(kept[0]!.origin, /工作「/, "a personal memory's origin carries nothing of the project it was said in");
    assert.match(kept[1]!.origin, /工作「以后回答都用要点列表；另外记住：NSM 是北极星指标」/);

    // Another project sees the personal preference, never project A's convention.
    const inB = await round("总结一下本周进展", projectB, "req-memory-002");
    assert.match(recalled(inB.first), /memory-recall[\s\S]{0,400}回答用要点列表/, "the personal memory reaches the round as Prologue memory-recall data");
    assert.doesNotMatch(recalled(inB.first), /NSM/);
    assert.deepEqual((await service.memories("project-b")).map(item => item.text), ["回答用要点列表"]);
    // The panel sees what each round was given, and what the work kept (specs/memory-system §7.3, §10.3).
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

    // Forgotten through the round's own tool: gone from the store and never recalled again.
    script.push(() => reply({ name: "forget-memory", input: { memory_id: kept[1]!.memory_id } }), () => reply(undefined, "已删掉那条。"));
    await round("忘掉 NSM 那条", projectA, "req-memory-005");
    assert.deepEqual((await service.memories("project-a")).map(item => item.text), ["回答用要点列表"]);
    const after = await round("NSM 是什么", projectA, "req-memory-006");
    assert.doesNotMatch(recalled(after.first), /北极星/);

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
      body => { assert.match(JSON.stringify(body.messages), /no remember call succeeded/); return reply({ name: "remember", input: { text: "周会在周三下午两点", scope: "project", said: "记住：周会在周三下午两点" } }); },
      () => reply(undefined, "记下了：周会在周三下午两点（只在项目甲里生效）。"));
    await round("记住：周会在周三下午两点", projectA, "req-memory-010");
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
  const project = { project_id: "project-a", board_id: "board-a", storage_key: "memory:a" };
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
    // The platform default is on (specs/memory-system §10.1); switched off, the tool is not offered and nothing can be suggested.
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
  const project = { project_id: "project-a", board_id: "board-a", storage_key: "memory:a" };
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
    source: { owner_actor_id: "web-user", draft_revision: 2 }, reference: { artifact_id: "character:board-a:editor", version: 2 }, board_id: "board-a",
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
    script.push(() => reply({ name: "remember", input: { text: "回答用要点列表", scope: "personal", said: "以后回答都用要点列表" } }), () => reply(undefined, "记下了。"));
    await round({ text: "以后回答都用要点列表", request_id: "req-mc-1" }, 1);
    assert.deepEqual((await service.memories("project-a")).map(item => item.text), ["回答用要点列表"]);

    // With a Character: while the switches allow it, the same memory and tools reach its round.
    const on = await round({ text: "看看这段说明", request_id: "req-mc-2", character: { artifact_id: editor.reference.artifact_id, version: 2 } }, 1);
    assert.match(JSON.stringify(on.first), /每次回答先列出三处可改进的地方/, "the Character carries the round");
    assert.ok(tools(on.first).includes("remember"));
    assert.match(JSON.stringify(on.first.messages), /回答用要点列表/);

    // The Character keeps something of its own: used in work it carries, never in work without it (spec M5).
    script.push(() => reply({ name: "remember", input: { text: "先列问题再给改法", scope: "character", said: "你以后都先列问题再给改法" } }), () => reply(undefined, "记下了。"));
    await round({ text: "你以后都先列问题再给改法", request_id: "req-mc-2b", work_id: on.work.work_id }, 2);
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
