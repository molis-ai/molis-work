import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AssistantService, AssistantStore, assistantAuthority, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

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

// W3-02-G3-02: the real public memoryTools seam, with a Prologue-backed store and the owner's switches/limit.
test("Assistant memory tools keep Memory's forbidden and pending-limit kinds without writing a fourth candidate", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const agent = home.host.ensureAgentService(home.home, () => { throw new Error("the served Host already owns its Agent service"); });
  await agent.ready;
  const ledger = openMemoryLedger({ homeDirectory: join(home.home, "tool-ledger") });
  const db = new DatabaseSync(":memory:");
  try {
    const memory = new MemoryService({ backend: prologueMemoryBackend(async () => agent.agentHost.adapter("prologue").memory!), ledger });
    const store = new AssistantStore(db);
    const service = new AssistantService(store, { host: async () => agent.agentHost,
      authority: async work => assistantAuthority(home.host, work, () => new Set()), memory: () => memory }, LOCAL_PERSON_ACTOR_ID);
    const project = await home.createProject("记忆错误分类");
    const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: "写周报", scope: { kind: "project", project_id: project.project_id }, origin: null, project_ref: project.reference });
    const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui" as const, person: true };
    memory.savePrefs(person, "personal", { learn_from_work: true });
    memory.savePrefs(person, "project", { learn_from_work: false });
    const tools = service.memoryTools(work); assert.ok(tools?.propose);
    const propose = (text: string) => tools.propose!({ scope: "project", text, applies: "", why: "工作里的偏好" });
    await assert.rejects(propose("项目周报先列风险"), error => error instanceof ActionError && error.code === "memory.forbidden" && error.kind === "forbidden" && /没有允许/.test(error.message));
    assert.deepEqual(await memory.candidates(person), []);
    memory.savePrefs(person, "project", { learn_from_work: true });
    for (const text of ["周报先列风险", "邮件保持正式语气", "表格金额保留两位小数"]) await propose(text);
    const before = await memory.candidates(person);
    await assert.rejects(propose("发布总结用英文"), error => error instanceof ActionError && error.code === "memory.limit" && error.kind === "conflict" && /3 条建议/.test(error.message));
    assert.deepEqual(await memory.candidates(person), before);
    assert.deepEqual((await memory.list(person)).items, [], "candidates remain proposals, never remembered facts");
    assert.deepEqual(await tools.forget!("not-kept"), { forgotten: false }, "a missing memory is still harmless to forget");
  } finally { try { db.close(); } finally { ledger.close(); } }
});
