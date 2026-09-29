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
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
    projectTitle: async id => id === "project-a" ? "项目甲" : "项目乙", timeZone: "Asia/Shanghai" }, "web-user");
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
    assert.ok(first.first.tools.some((tool: { name: string }) => tool.name === "remember"), "the round may remember");
    const kept = await service.memories("project-a");
    assert.deepEqual(kept.map(item => [item.scope, item.text, item.disabled]), [["personal", "回答用要点列表", false], ["project", "项目甲里 NSM 指北极星指标", false]]);
    assert.match(kept[0]!.origin, /^.* · 你说：“以后回答都用要点列表”$/);
    assert.doesNotMatch(kept[0]!.origin, /工作「/, "a personal memory's origin carries nothing of the project it was said in");
    assert.match(kept[1]!.origin, /工作「以后回答都用要点列表；另外记住：NSM 是北极星指标」/);

    // Another project sees the personal preference, never project A's convention.
    const inB = await round("总结一下本周进展", projectB, "req-memory-002");
    assert.match(recalled(inB.first), /记住的偏好与背景[\s\S]*回答用要点列表/);
    assert.doesNotMatch(recalled(inB.first), /NSM/);
    assert.deepEqual((await service.memories("project-b")).map(item => item.text), ["回答用要点列表"]);
    // Project A's work sees both.
    const inA = await round("NSM 这周怎么样", projectA, "req-memory-003");
    assert.match(recalled(inA.first), /\[本项目\] 项目甲里 NSM 指北极星指标/);

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
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, service.memoryTools(work)),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai" }, "web-user");
  const tools = (body: any) => (body.tools as Array<{ name: string }>).map(tool => tool.name);
  const lesson = { text: "项目甲的周报先写风险，再写进展", scope: "project", why: "这次和上次你都把风险挪到了最前面", applies: "写项目甲的周报时" };
  try {
    // Off by default: the tool is not offered, and nothing can be suggested.
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
    service.discardMemoryCandidate(third.memory_candidates![0]!.candidate_id);
    script.push(() => reply({ name: "suggest-memory", input: { ...lesson, text: "项目甲的周报用表格" } }), () => reply(undefined, "好的。"));
    await service.send({ work_id: first.work.work_id, text: "再用表格", request_id: "req-candidate-4" }, {});
    await until(async () => { const v = await service.read(first.work.work_id); return v.rounds.length === 4 && v.work.state === "completed"; }, "fourth");
    assert.match(JSON.stringify(requests.at(-1)), /已经建议过了/);
    assert.equal(service.memoryCandidates().length, 0);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
