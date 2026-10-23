import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { scriptedModelServer } from "./fixtures/connector-assistant-model.js";
import { platformMemory, sendAsPerson, until } from "./fixtures/assistant-memory.js";

const memoryToolControl = () => ({ operation_id: crypto.randomUUID(), signal: new AbortController().signal });

test("Assistant list and suggest tools keep their own Run's class policy when settings reopen and a later Run starts", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-frozen-tools-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const { memory, memoryPolicy, store, memoryForCall } = platformMemory(host, home, t);
  let observeControlled: ((controlled: ReturnType<typeof memoryForCall>) => void) | undefined;
  const observedMemoryForCall: typeof memoryForCall = (...execution) => {
    const controlled = memoryForCall(...execution);
    if (execution.length) observeControlled?.(controlled);
    return controlled;
  };
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui" as const, person: true };
  const restriction = { selector: { consumer: "assistant" as const, current_scene: "assistant" as const, kind: "convention" as const }, read: "off" as const, form: "off" as const };
  const keptText = "项目报告必须带上核验日期";
  const suggestion = { text: "项目周报先列风险", scope: "project", why: "这次工作中的建议", applies: "写项目周报时" };
  const results: string[] = [];
  const latestResult = (body: Record<string, unknown>) => {
    const messages = body.messages as Array<{ content?: unknown }>;
    const blocks = messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
    const result = blocks.filter(block => block.type === "tool_result").at(-1);
    assert.ok(result, "the next HTTP request contains the real tool result");
    return JSON.stringify(result);
  };
  const model = await scriptedModelServer(t, (body, turn) => {
    if (turn === 1) {
      // The request is already on the real HTTP transport: its recipe and tools must both be frozen.
      memory.savePrefs(person, "project", { class_restrictions: [] });
      return { name: "list-memories", input: {} };
    }
    if (turn === 2 || turn === 5) { results.push(latestResult(body)); return { name: "suggest-memory", input: suggestion }; }
    if (turn === 3 || turn === 6) { results.push(latestResult(body)); return "已检查。"; }
    if (turn === 4) return { name: "list-memories", input: {} };
    throw new Error(`Unexpected model turn ${turn}`);
  });
  const adapter = await createPrologueNodeAdapter({ memory: memoryPolicy, app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: model.base + "/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const captured: NonNullable<ReturnType<AssistantService["memoryTools"]>>[] = [];
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, undefined, undefined, () => {
      const tools = service.memoryTools(work); if (tools) captured.push(tools); return tools;
    }), memory: task => service.memoryForRound(work, task) }),
    projectTitle: async () => "项目甲", timeZone: "Asia/Shanghai", memory: observedMemoryForCall, memorySources: memoryPolicy.sources }, LOCAL_PERSON_ACTOR_ID);
  try {
    const seed = await memory.write(person, { scope: "project", text: keptText, kind: "convention" });
    assert.equal(seed.outcome, "written");
    memory.savePrefs(person, "project", { class_restrictions: [restriction], learn_from_work: true });
    const first = await sendAsPerson(service, { text: "检查已有记忆并建议周报格式", request_id: "frozen-tools-1" }, { project_ref: { project_id: "project-a", storage_key: "memory:a" } });
    await until(async () => (await service.read(first.work.work_id)).work.state === "completed", "restricted tool round");
    assert.equal(results.length, 2);
    assert.doesNotMatch(results[0]!, new RegExp(keptText));
    assert.match(results[1]!, /MEMORY_SCOPE_DENIED/);
    assert.deepEqual(await memory.candidates(person), [], "the frozen form restriction leaves no candidate");
    const oldTools = captured[0]!; assert.ok(oldTools);
    const oldRun = await adapter.read({ session_id: first.work.session_id!, run_id: store.rounds(first.work.work_id)[0]!.run_id });
    assert.deepEqual(oldRun.class_restrictions?.project, [restriction]);
    assert.equal(service.memoryTools(store.get(LOCAL_PERSON_ACTOR_ID, first.work.work_id)), undefined, "outside a prepared round there is no snapshot to borrow");

    await sendAsPerson(service, { work_id: first.work.work_id, text: "再检查一次并提出建议", request_id: "frozen-tools-2" }, {});
    await until(async () => { const view = await service.read(first.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "reopened tool round");
    assert.equal(results.length, 4);
    assert.match(results[2]!, new RegExp(keptText));
    assert.doesNotMatch(results[3]!, /MEMORY_SCOPE_DENIED/);
    assert.deepEqual((await memory.candidates(person)).map(candidate => candidate.text), [suggestion.text]);
    assert.deepEqual(await oldTools.list(memoryToolControl()), [], "an old bound tool cannot borrow the later Run's unrestricted snapshot");
    await assert.rejects(oldTools.propose!({ ...suggestion, scope: "project", text: "项目周报改为先列进度" }, memoryToolControl()));
    assert.deepEqual((await memory.candidates(person)).map(candidate => candidate.text), [suggestion.text]);

    // Both real proposals commit before either tool returns: selecting the latest candidate would give both tools one ID.
    const currentTools = captured.at(-1)!; assert.ok(currentTools.propose);
    memory.savePrefs(person, "personal", { class_restrictions: [{ ...restriction,
      selector: { ...restriction.selector, kind: "preference" }, form: "inherit" }] });
    const inputs = [{ ...suggestion, scope: "personal" as const, text: "旅行时偏好靠窗座位" },
      { ...suggestion, scope: "personal" as const, text: "技术说明请附完整示例" }];
    const committed = new Map<string, string>();
    const restoreObserved: Array<() => void> = [];
    let release!: () => void;
    const bothCommitted = new Promise<void>(resolve => { release = resolve; });
    observeControlled = controlled => {
      const propose = controlled.propose.bind(controlled);
      const observed = t.mock.method(controlled, "propose", async (...args: Parameters<typeof controlled.propose>) => {
        const candidate = await propose(...args);
        committed.set(candidate.text, candidate.candidate_id);
        if (committed.size === 2) release();
        await bothCommitted;
        return candidate;
      });
      restoreObserved.push(() => observed.mock.restore());
    };
    try {
      const returned = await Promise.all(inputs.map(input => currentTools.propose!(input, memoryToolControl())));
      assert.equal(committed.size, 2);
      assert.deepEqual(returned.map(item => item.candidate_id), inputs.map(input => committed.get(input.text)));
      assert.equal(new Set(returned.map(item => item.candidate_id)).size, 2);
    } finally { observeControlled = undefined; release(); for (const restore of restoreObserved) restore(); }
    const persisted = await memory.candidates(person);
    for (const input of inputs) assert.equal(persisted.find(candidate => candidate.text === input.text)?.candidate_id, committed.get(input.text));
    assert.deepEqual(await currentTools.list(memoryToolControl()), [{ memory_id: seed.memory!.memory_id, scope: "project", text: keptText,
      origin: seed.memory!.origin }], "the read-off personal class stays hidden after its proposals commit");
    memory.savePrefs(person, "personal", { class_restrictions: [{ ...restriction,
      selector: { ...restriction.selector, kind: "preference" } }] });
    await assert.rejects(currentTools.propose!({ ...suggestion, scope: "personal", text: "账单按月份汇总" }, memoryToolControl()));
    assert.deepEqual(await memory.candidates(person), persisted, "closing formation leaves all committed candidates unchanged");
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
