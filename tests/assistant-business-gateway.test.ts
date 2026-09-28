import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService, presentActivity } from "../apps/local-host/src/assistant/assistant-service.js";
import { actionKey, assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { readableInput } from "../horizontal/agent-host/src/adapters/prologue-action-gateway.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

/** One Anthropic-style streamed reply: a tool call, or text. */
function reply(tool?: { name: string; input: unknown }, text = "Done."): Response {
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

const write: ActionDefinition = { capability_id: "fixture.notes.write", version: 1, operation: "command", action: {
  title: "Save a note", description: "Store a note in the project", kind: "operation", scope: "project", audiences: ["agent"],
  permissions: ["notes:write"], subject_kinds: [], input_schema: { type: "object", properties: { text: { type: "string", title: "内容" } }, required: ["text"], additionalProperties: false } } };
const count: ActionDefinition = { capability_id: "fixture.notes.count", version: 1, operation: "query", action: {
  title: "Count notes", description: "How many notes there are", kind: "query", scope: "project", audiences: ["agent"],
  permissions: ["notes:read"], subject_kinds: [], input_schema: { type: "object", properties: {}, additionalProperties: false } } };

async function fixture(t: import("node:test").TestContext, script: Array<(body: any) => Response>, options: { model?: boolean } = {}) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-"));
  const notes = new DatabaseSync(":memory:");
  notes.exec("CREATE TABLE notes (body TEXT NOT NULL, project TEXT NOT NULL, actor TEXT NOT NULL, audit TEXT)");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, definitions: [write, count],
    handlers: [{ ...write, handle(context, input) { notes.prepare("INSERT INTO notes VALUES (?, ?, ?, ?)").run((input as { text: string }).text, context.project_id, context.actor_id, context.audit_actor_id ?? null); return { saved: true }; } },
      { ...count, handle() { return Number(notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n); } }] });
  const requests: any[] = [];
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    const next = script[turn++] ?? (() => reply());
    return next(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => options.model === false ? null : ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")),
    projectTitle: async () => "Fixture project", timeZone: "Asia/Shanghai" }, "web-user");
  return { service, store, host, adapter, queue, notes, requests, project, async close() { await adapter.close(); await local.close(); notes.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a project work finds, reads and — after the person approves the exact input — changes through the gateway, with no directory", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "find-capabilities", input: { query: "Notes" } }),
    body => { assert.ok(JSON.stringify(body.messages).includes("fixture.notes.write")); return reply({ name: "read-capability", input: { capability_id: "fixture.notes.count", version: 1, provider_id: "fixture.notes", input: {} } }); },
    () => reply({ name: "change-capability", input: { capability_id: "fixture.notes.write", version: 1, provider_id: "fixture.notes", input: { text: "hello from the assistant" } } }),
    () => reply(undefined, "Saved the note."),
  ]);
  try {
    const sent = await f.service.send({ text: "Save a note saying hello", request_id: "req-00000001", context: { source: { surface: "pages", title: "Pages" }, captured_at: new Date().toISOString() } }, { project_ref: f.project });
    assert.equal(sent.outcome, "started");
    assert.deepEqual(sent.work.scope, { kind: "project", project_id: "project" });
    await until(() => f.requests[0], "first model request");
    // The model saw only the gateway and root-free tools: no file, command or per-action tools.
    const offered = f.requests[0].tools.map((tool: any) => tool.name).sort();
    assert.deepEqual(offered, ["ask-user", "change-capability", "context-remaining", "find-capabilities", "read-capability", "update-todo"]);
    assert.ok(JSON.stringify(f.requests[0]).includes("可用能力目录"), "the round carries the capability directory");
    const view = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.reviews.length ? v : undefined; }, "review");
    assert.equal(view.work.state, "waiting-review");
    assert.equal(view.reviews[0]!.summary, "Notes · Save a note");
    assert.deepEqual(view.reviews[0]!.fields.find(field => field.label === "内容"), { label: "内容", value: "hello from the assistant" });
    assert.equal(f.notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 0, "nothing is written before approval");
    await f.service.decide(sent.work.work_id, { review_id: view.reviews[0]!.review_id, decision: "approve" });
    const done = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.work.state === "completed" ? v : undefined; }, "completion");
    assert.deepEqual(JSON.parse(JSON.stringify(f.notes.prepare("SELECT * FROM notes").all())), [{ body: "hello from the assistant", project: "project", actor: "web-user", audit: `assistant:${sent.work.work_id}` }]);
    const verbs = done.rounds[0]!.activity.map(item => `${item.verb}:${item.state}`);
    assert.deepEqual(verbs, ["lookup:completed", "read:completed", "change:completed"]);
    assert.equal(done.rounds[0]!.activity[2]!.target, "Notes · Save a note");
  } finally { await f.close(); }
});

test("an action the person switched off for the Assistant is neither found nor run", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "find-capabilities", input: { query: "Save" } }),
    () => reply({ name: "change-capability", input: { capability_id: "fixture.notes.write", version: 1, provider_id: "fixture.notes", input: { text: "x" } } }),
    () => reply(undefined, "Could not save."),
  ]);
  try {
    f.store.setActionEnabled("web-user", actionKey({ capability_id: "fixture.notes.write", version: 1, provider_id: "fixture.notes" }), false);
    const sent = await f.service.send({ text: "Save x", request_id: "req-00000002" }, { project_ref: f.project });
    const done = await until(async () => { const v = await f.service.read(sent.work.work_id); return ["completed", "failed"].includes(v.work.state) ? v : undefined; }, "end");
    assert.ok(!JSON.stringify(f.requests[1].messages).includes("fixture.notes.write\""), "the switched-off action is not found");
    assert.equal(done.reviews.length, 0);
    assert.equal(done.rounds[0]!.activity.find(item => item.verb === "change")?.state, "failed");
    assert.equal(f.notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 0);
  } finally { await f.close(); }
});

test("a repeated Send starts nothing twice; a new Send while running reaches the same round", { timeout: 60_000 }, async t => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, [async () => { await hold; return reply(undefined, "Answer."); }, () => reply(undefined, "Answer with the addition.")] as never);
  try {
    const first = await f.service.send({ text: "Draft a plan", request_id: "req-00000003" }, {});
    assert.deepEqual(first.work.scope, { kind: "personal" }, "no project page means personal work");
    const again = await f.service.send({ text: "Draft a plan", request_id: "req-00000003" }, {});
    assert.equal(again.outcome, "repeated");
    assert.equal(again.work.work_id, first.work.work_id);
    const more = await f.service.send({ work_id: first.work.work_id, text: "Make it short", request_id: "req-00000004" }, {});
    assert.equal(more.outcome, "steered");
    assert.equal(more.run_id, first.run_id);
    release();
    const done = await until(async () => { const v = await f.service.read(first.work.work_id); return v.work.state === "completed" ? v : undefined; }, "completion");
    assert.equal(done.rounds.length, 1, "one round, one run");
  } finally { release(); await f.close(); }
});

test("without a model the work and its text are kept, with a next step", { timeout: 30_000 }, async t => {
  const f = await fixture(t, [], { model: false });
  try {
    await assert.rejects(f.service.send({ text: "Plan my week", request_id: "req-00000005" }, {}), (error: unknown) => {
      assert.ok(error instanceof AssistantError);
      assert.equal(error.code, "assistant.model_missing");
      assert.equal(error.action, "打开模型设置");
      assert.equal(error.work?.draft, "Plan my week");
      return true;
    });
    const [work] = await f.service.list();
    assert.equal(work!.draft, "Plan my week");
    // The failed Send released its id: trying again is a new attempt, not a replay of the failure.
    await assert.rejects(f.service.send({ work_id: work!.work_id, text: "Plan my week", request_id: "req-00000005" }, {}), /模型/);
  } finally { await f.close(); }
});

test("activity and review read in the person's terms", () => {
  const titles = new Map([["fixture.notes.write", { title: "Save a note", provider: "Notes" }]]);
  assert.deepEqual(presentActivity([
    { call_id: "r", name: "reasoning", target: "", state: "completed", summary: "推理", at: null },
    { call_id: "a", name: "change-capability", target: "fixture.notes.write", state: "failed", summary: "change-capability · EFFECT_NOT_AUTHORIZED", at: null },
    { call_id: "b", name: "find-capabilities", target: "Notes", state: "completed", summary: "find-capabilities", at: null },
  ], titles), [
    { call_id: "a", verb: "change", target: "Notes · Save a note", state: "failed", reason: "not-authorized" },
    { call_id: "b", verb: "lookup", target: "Notes", state: "completed" },
  ]);
  assert.deepEqual(readableInput({ properties: { title: { title: "标题" } } }, { title: "Q4", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Line one" }] }, { type: "paragraph", content: [{ type: "text", text: "Line two" }] }] } }),
    [{ label: "标题", value: "Q4" }, { label: "body", value: "Line one\nLine two" }]);
});

test("business roles are declared narrowly and the Host keeps directories, MCP and per-action tools out of them", { timeout: 30_000 }, async t => {
  const { inspectAgentDeclaration } = await import("@molis-ai/molis-work-contracts/platform/plugin-agent");
  const role = { role_id: "helper", version: 1, name: "Helper", workspace: "business" as const, execution: "operate" as const, prompts: ["base"], host_tools: ["ask-user"] };
  const declare = (roles: unknown[]) => inspectAgentDeclaration({ prompts: [{ prompt_id: "base", version: 1 }], roles } as never);
  assert.deepEqual(declare([role]), []);
  assert.ok(declare([{ ...role, host_tools: ["read-file"] }]).some(problem => /业务角色/.test(problem)), "a file tool is not a business tool");
  assert.ok(declare([{ ...role, workspace: undefined }]).some(problem => /operate/.test(problem)), "operate belongs to business roles only");
  assert.ok(declare([{ ...role, execution: "workspace-write" }]).some(problem => /业务角色/.test(problem)));
  const f = await fixture(t, []);
  try {
    const sent = await f.service.send({ text: "hello", request_id: "req-00000006" }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "first round");
    const [work] = await f.service.list();
    const session = { session_id: work!.session_id!, runtime_id: "prologue" };
    const base = { board_id: "board", plugin_id: "io.molis.work.assistant", install_id: "system", actor_id: "web-user", session, role_id: "assistant", workspace: "business" as const, task: "x" };
    const { ASSISTANT_AGENT, ASSISTANT_PROMPTS } = await import("../apps/local-host/src/assistant/assistant-agent.js");
    const authority = { manifest: ASSISTANT_AGENT, prompts: ASSISTANT_PROMPTS, authorizedDirectories: ["/tmp"], actions: async () => ({ discover: async () => [], invoke: async () => null }) };
    for (const extra of [{ directory: { canonical_path: "/tmp", realpath_verified: true } }, { mcp_tools: [{ server: "s", tool: "t", version: "1" }] },
      { action_gateway: true, action_tools: [{ capability_id: "fixture.notes.count", version: 1, provider_id: "fixture.notes" }] }]) {
      await assert.rejects(f.host.start("prologue", { ...base, ...extra } as never, authority as never), /业务|能力网关|directory|目录|MCP/);
    }
  } finally { await f.close(); }
});
