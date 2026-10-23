import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AssistantService, AssistantStore, assistantAuthority, assistantServiceFor, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, memoryErrors } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

const memoryToolControl = () => ({ operation_id: crypto.randomUUID(), signal: new AbortController().signal });

async function answer(home: TestHome, path: string, body?: object | string) {
  const response = await fetch(home.origin + path, body === undefined ? {} : {
    method: "POST", headers: { origin: home.origin, "content-type": "application/json", "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const value: Record<string, unknown> = await response.json();
  return { status: response.status, body: value };
}

// W3-02-G3-01/02: real management routes, including the Assistant's actually reachable Memory operations.
test("Memory's scope and stale preview keep their owner codes; Assistant management does not rewrite a missing memory", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const scope = await answer(home, "/api/memory/items", { scope: "project", text: "周报先写风险" });
  assert.deepEqual([scope.status, scope.body.code], [403, "memory.scope"]);
  assert.match(String(scope.body.error), /没有项目/);
  const missing = await answer(home, "/api/assistant/memories", { action: "disable", memory_id: "not-kept" });
  assert.deepEqual([missing.status, missing.body.code], [404, "memory.not_found"]);
  const candidate = await answer(home, "/api/assistant/memory-candidates/not-proposed/accept", {});
  assert.deepEqual([candidate.status, candidate.body.code], [404, "memory.not_found"]);
  const invalid = await answer(home, "/api/assistant/memories", { action: "unknown" });
  assert.deepEqual([invalid.status, invalid.body.code, invalid.body.error], [400, "assistant.invalid", "不支持的操作"]);
  assert.deepEqual(await answer(home, "/api/assistant/related"), { status: 400, body: { error: "需要对象种类与标识", code: "assistant.invalid" } });

  assert.equal((await answer(home, "/api/memory/items", { scope: "personal", text: "回答用编号列表" })).status, 200);
  const preview = await answer(home, "/api/memory/preview", { scope: "personal" });
  assert.equal(preview.status, 200); assert.equal(preview.body.count, 1);
  assert.equal((await answer(home, "/api/memory/items", { scope: "personal", text: "邮件保持正式语气" })).status, 200);
  const stale = await answer(home, "/api/memory/clear", { scope: "personal", fingerprint: preview.body.fingerprint });
  assert.deepEqual([stale.status, stale.body.code], [409, "memory.conflict"]);
  assert.match(String(stale.body.error), /重新预览/);
  const overview = await answer(home, "/api/memory/overview?scope=personal");
  assert.equal(overview.status, 200); assert.ok(Array.isArray(overview.body.items));
  assert.deepEqual(overview.body.items.map(item => item.text).sort(), ["回答用编号列表", "邮件保持正式语气"].sort(), "a stale confirmation deleted neither fact");

  const prompt = await answer(home, "/api/agent-definitions/prompt?key=not-registered");
  assert.deepEqual([prompt.status, prompt.body.code], [404, "agent_definitions.not_found"]);
  for (const path of ["/api/assistant/budget", "/api/memory/items", "/api/agent-definitions/prompt"]) {
    const malformed = await answer(home, path, "{");
    assert.deepEqual([malformed.status, malformed.body.code, malformed.body.error], [400, "actions.input_invalid", "请求不是有效 JSON"]);
  }
  for (const [path, limit] of [["/api/assistant/budget", 400_000], ["/api/memory/items", 400_000], ["/api/agent-definitions/prompt", 200_000]] as const) {
    const large = await answer(home, path, "x".repeat(limit + 1));
    assert.deepEqual([large.status, large.body.code, large.body.error], [413, "actions.input_too_large", "请求内容过大"]);
  }
});

// W3-02-G3-01: an actual SQLite read failure, not a fabricated owner error or a test-only HTTP handler.
test("an unreadable Assistant store answers the common internal failure and retains SQLite's message", async t => {
  const home = await openTestHome(t);
  const directory = join(home.home, "assistant"), path = join(directory, "assistant.db");
  await mkdir(directory, { recursive: true });
  const badDatabase = Buffer.from("not a SQLite database");
  await writeFile(path, badDatabase);
  const result = await answer(home, "/api/assistant/works");
  assert.deepEqual([result.status, result.body.code, result.body.error], [500, "actions.execution_failed", "file is not a database"]);
  assert.deepEqual(await readFile(path), badDatabase, "a read failure does not replace the person's facts");
});

// W3-02-G3-01/03: inject at the existing public Host port, with a real Store/full Send and a real model for recovery.
// The forged details.work is adversarial input here; Memory's own production refusals do not currently carry one.
test("Send keeps uncoded and owner failures correctly, overrides a forged work, and releases its request for one successful retry", { timeout: 60_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const home = await openTestHome(t), model = await startModelStandIn("send-fault-fixture-key", "已完成");
  t.after(() => model.close());
  assert.equal((await answer(home, "/api/settings/models/send-fault", { display_name: "发送恢复模型", base_url: model.baseUrl, api_format: "openai-chat-completions",
    enabled: true, prompt_cache: "off", api_key: "send-fault-fixture-key", models: [{ model_id: "send-model", enabled: true }] })).status, 200);
  const agent = home.host.ensureAgentService(home.home, () => { throw new Error("the served Host already owns its Agent service"); });
  await agent.ready;
  const db = new DatabaseSync(":memory:");
  let service: AssistantService | undefined;
  try {
    const store = new AssistantStore(db);
    let fault: unknown = new Error("decoder lost its resource");
    service = new AssistantService(store, { pages: async () => ["home"], host: async () => { if (fault) throw fault; return agent.agentHost; },
      authority: async work => assistantAuthority(home.host, work, () => new Set()) }, LOCAL_PERSON_ACTOR_ID);
    const input = { text: "保留我发送的原话", request_id: "g3-send-recovery-001" };
    await assert.rejects(service.send(input, {}), error => {
      assert.ok(error instanceof ActionError);
      assert.deepEqual([error.code, error.kind, error.message], ["actions.execution_failed", "internal", "decoder lost its resource"]);
      return true;
    });
    const [work] = store.list(LOCAL_PERSON_ACTOR_ID); assert.ok(work); assert.equal(work.draft, input.text);
    fault = memoryErrors.conflict("主人拒绝这次变动", { owner_fact: 17, action: "主人给出的修复提示", work: { work_id: "forged-work", draft: "forged-draft" } });
    await assert.rejects(service.send({ ...input, work_id: work.work_id }, {}), error => {
      assert.ok(error instanceof ActionError);
      assert.deepEqual([error.code, error.kind, error.message, error.details?.owner_fact, error.details?.action],
        ["memory.conflict", "conflict", "主人拒绝这次变动", 17, "主人给出的修复提示"]);
      const kept = error.details?.work; assert.ok(kept && typeof kept === "object" && "work_id" in kept && "draft" in kept);
      assert.deepEqual([kept.work_id, kept.draft], [work.work_id, input.text], "the Store's actual work wins over the injected details");
      return true;
    });
    assert.equal(store.list(LOCAL_PERSON_ACTOR_ID).length, 1); assert.equal(store.rounds(work.work_id).length, 0);
    fault = undefined;
    const continued = await service.send({ ...input, work_id: work.work_id }, {});
    assert.deepEqual([continued.outcome, continued.work.work_id], ["started", work.work_id]);
    const repeated = await service.send({ ...input, work_id: work.work_id }, {});
    assert.deepEqual([repeated.outcome, repeated.work.work_id, repeated.run_id], ["repeated", work.work_id, continued.run_id]);
    const deadline = Date.now() + 10_000;
    while ((await service.read(work.work_id)).work.state !== "completed" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const done = await service.read(work.work_id); assert.equal(done.work.state, "completed");
    assert.equal(done.work.draft, ""); assert.deepEqual(done.rounds.map(round => round.text), [input.text]);
    assert.equal(store.list(LOCAL_PERSON_ACTOR_ID).length, 1, "failed Send and retry did not create another work");
  } finally { service?.continuations.close(); db.close(); }
});

// W3-02-G3-02: the real public memoryTools seam, with a Prologue-backed store and the owner's switches/limit.
test("Assistant memory tools keep Memory's forbidden and pending-limit kinds without writing a fourth candidate", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const agent = home.host.ensureAgentService(home.home, () => { throw new Error("the served Host already owns its Agent service"); });
  await agent.ready;
  const ledger = openMemoryLedger({ homeDirectory: home.home });
  try {
    const memory = new MemoryService({ backend: prologueMemoryBackend(async () => agent.agentHost.adapter("prologue").memory!), ledger });
    const { service, store } = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: agent.agentHost,
      agentReady: () => agent.ready, projectTitle: async () => null, pages: async () => ["home"] });
    const project = await home.createProject("记忆错误分类");
    const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: "写周报", scope: { kind: "project", project_id: project.project_id }, origin: null, project_ref: project.reference });
    const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui" as const, person: true };
    memory.savePrefs(person, "personal", { learn_from_work: true });
    memory.savePrefs(person, "project", { learn_from_work: false });
    const tools = service.memoryTools(work); assert.ok(tools?.propose);
    const propose = (text: string) => tools.propose!({ scope: "project", text, applies: "", why: "工作里的偏好" }, memoryToolControl());
    await assert.rejects(propose("项目周报先列风险"), error => error instanceof ActionError && error.code === "memory.forbidden" && error.kind === "forbidden" && /没有允许/.test(error.message));
    assert.deepEqual(await memory.candidates(person), []);
    memory.savePrefs(person, "project", { learn_from_work: true });
    for (const text of ["周报先列风险", "邮件保持正式语气", "表格金额保留两位小数"]) await propose(text);
    const before = await memory.candidates(person);
    await assert.rejects(propose("发布总结用英文"), error => error instanceof ActionError && error.code === "memory.limit" && error.kind === "conflict" && /3 条建议/.test(error.message));
    assert.deepEqual(await memory.candidates(person), before);
    assert.deepEqual((await memory.list(person)).items, [], "candidates remain proposals, never remembered facts");
    assert.deepEqual(await tools.forget!("not-kept", memoryToolControl()), { forgotten: false }, "a missing memory is still harmless to forget");
  } finally { ledger.close(); }
});
