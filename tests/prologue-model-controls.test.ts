import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter, type PrologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";

/**
 * The person's model controls on a round (specs/prologue-adoption §4.3): a reasoning effort goes out on every model call
 * of the round, only for a model marked as taking one; a running round can be switched to another configured model from
 * its next model call, with the new key, and is refused — changing nothing — when the model cannot carry what the round
 * was started with.
 */
const sse = (text: string, tool?: { name: string; input: object }) => {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 5, output_tokens: 0 } } });
  if (tool) {
    emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-1", name: tool.name, input: {} } });
    emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } });
  } else {
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  }
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 2 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};

type ModelRequestBody = { model?: string; output_config?: { effort?: string }; messages?: unknown };

async function fixture(t: import("node:test").TestContext, models: Record<string, PrologueModelConfiguration>, reply: (body: ModelRequestBody, nth: number) => Promise<Response> | Response) {
  const root = await mkdtemp(join(tmpdir(), "molis-model-controls-"));
  await writeFile(join(root, "notes.md"), "release notes go in CHANGELOG.md\n");
  const requests: Array<{ body: ModelRequestBody; key: string | null; endpoint: string }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const headers = new Headers(init.headers);
    requests.push({ body, key: headers.get("x-api-key") ?? headers.get("authorization"), endpoint: url instanceof Request ? url.url : String(url) });
    return reply(body, requests.length);
  });
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.model-controls-test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async selection => models[selection?.model_id ?? "small"] ?? null,
    resolveCredential: ref => `secret-of-${ref}` });
  const adapter = await open();
  const owner = { project_id: "test", plugin_id: "io.molis.work.coding", install_id: "test", actor_id: "web-user" };
  const directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Model controls" });
  const role = { role_id: "reader", version: 1, execution: "read-only" as const, host_tools: ["read-file"], prompts: [] };
  const startOn = (target: typeof adapter, extra: object = {}) => target.start({ ...owner, session, directory, role_id: "reader", task: "Where do release notes go?", role, model_selection: { provider_id: "p", model_id: "small" }, ...extra } as never);
  const start = (extra: object = {}) => startOn(adapter, extra);
  const settle = async (ref: { session_id: string; run_id: string }, on = adapter) => {
    for (const until = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
      const view = await on.read(ref);
      if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) return view;
      if (Date.now() > until) throw new Error("run did not finish");
    }
  };
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  return { adapter, session, requests, start, startOn, settle, reopen: open };
}

const model = (name: string, extra: Partial<PrologueModelConfiguration> = {}): PrologueModelConfiguration =>
  ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: name, credential_ref: `key-${name}`, ...extra });

test("PA-24: a reasoning effort reaches every model call of the round and is recorded; a model not marked for it is refused before anything is sent", { timeout: 30_000 }, async t => {
  const f = await fixture(t, { small: model("small", { reasoning_effort: true }), plain: model("plain") }, () => sse("CHANGELOG.md"));
  const view = await f.settle((await f.start({ reasoning_effort: "high" })).ref);
  assert.equal(view.phase, "completed");
  assert.deepEqual(f.requests[0]!.body.output_config, { effort: "high" }, "the Anthropic-format request carries the effort");
  assert.equal(view.frozen.reasoning_effort, "high", "the round records what it was sent with");
  const before = f.requests.length;
  await assert.rejects(f.start({ reasoning_effort: "high", model_selection: { provider_id: "p", model_id: "plain" } }), /没有标注「plain」可调思考力度/);
  await assert.rejects(f.start({ reasoning_effort: "extreme" }), /快速、平衡或深入/);
  assert.equal(f.requests.length, before, "a refused effort sends nothing");
  const none = await f.settle((await f.start()).ref);
  assert.equal("output_config" in f.requests.at(-1)!.body, false, "no effort chosen, no field");
  assert.equal(none.frozen.reasoning_effort, undefined);
});

test("PA-24: a running round switches to another model from its next call, with that model's key; history stays, and the switch shows", { timeout: 30_000 }, async t => {
  const answered = Promise.withResolvers<void>();
  const f = await fixture(t, { small: model("small"), large: model("large", { endpoint: "https://1.1.1.2/v1/messages" }), tiny: model("tiny", { context_tokens: 1_000 }),
    chat: model("chat", { protocol: "openai-compatible", endpoint: "https://1.1.1.3/v1/chat/completions" }) },
  async (_body, nth) => {
    if (nth === 1) { await answered.promise; return sse("", { name: "read", input: { path: "notes.md" } }); }
    return sse("Release notes go in CHANGELOG.md.");
  });
  const handle = await f.start();
  for (let i = 0; i < 200 && f.requests.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
  // Refused, nothing changes: a model with a smaller window than the round was packed against.
  await assert.rejects(f.adapter.control(handle.ref, { kind: "switch-model", provider_id: "p", model_id: "tiny" }), /上下文窗口比这一轮整理上下文所按的窗口小/);
  assert.equal((await f.adapter.read(handle.ref)).model_switch, undefined);
  await f.adapter.control(handle.ref, { kind: "switch-model", provider_id: "p", model_id: "large" });
  assert.deepEqual((await f.adapter.read(handle.ref)).model_switch, { requested: "large" }, "asked for, not yet in effect");
  answered.resolve();
  const view = await f.settle(handle.ref);
  assert.equal(view.phase, "completed");
  assert.equal(f.requests[0]!.body.model, "small");
  assert.equal(f.requests[1]!.body.model, "large", "the next model call goes to the new model");
  assert.match(String(f.requests[1]!.key), /secret-of-key-large/, "with the new model's own key");
  assert.match(JSON.stringify(f.requests[1]!.body.messages), /CHANGELOG\.md/, "the tool result the first model asked for is still in the history");
  assert.deepEqual(view.model_switch, { now: "large" });
  assert.equal(view.frozen.model_id, "small", "the round still records what it started with");
  assert.ok(view.activity.some(item => item.name === "model-switch" && item.target === "small → large"));
  await assert.rejects(f.adapter.control(handle.ref, { kind: "switch-model", provider_id: "p", model_id: "chat" }), /已经结束/);
});

test("PA-24: a round that thinks cannot be switched to a format without thinking; nothing changes", { timeout: 30_000 }, async t => {
  const answered = Promise.withResolvers<void>();
  const f = await fixture(t, { small: model("small", { thinking: "adaptive" }), chat: model("chat", { protocol: "openai-compatible", endpoint: "https://1.1.1.3/v1/chat/completions" }) },
    async () => { await answered.promise; return sse("done"); });
  const handle = await f.start();
  for (let i = 0; i < 200 && f.requests.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
  await assert.rejects(f.adapter.control(handle.ref, { kind: "switch-model", provider_id: "p", model_id: "chat" }), /开着思考/);
  answered.resolve();
  const view = await f.settle(handle.ref);
  assert.equal(view.model_switch, undefined);
  assert.equal(f.requests.length, 1);
});

/** A round held at its first model call, so a switch can be asked for while it runs. */
async function heldRound(t: import("node:test").TestContext, models: Record<string, PrologueModelConfiguration>, startExtra: object = {}) {
  const answered = Promise.withResolvers<void>();
  const f = await fixture(t, models, async () => { await answered.promise; return sse("done"); });
  const handle = await f.start(startExtra);
  for (let i = 0; i < 200 && f.requests.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
  return { ...f, handle, release: () => answered.resolve() };
}

test("PA-24: a switch the round cannot carry is refused and changes nothing — prompt cache across formats, an effort the target is not marked for, a model that is not available", { timeout: 30_000 }, async t => {
  const chat = model("chat", { protocol: "openai-compatible", endpoint: "https://1.1.1.3/v1/chat/completions" });
  const cached = await heldRound(t, { small: model("small", { prompt_cache: "best-effort" }), chat });
  await assert.rejects(cached.adapter.control(cached.handle.ref, { kind: "switch-model", provider_id: "p", model_id: "chat" }), /开着提示缓存，只能换同一种接口格式/);
  await assert.rejects(cached.adapter.control(cached.handle.ref, { kind: "switch-model", provider_id: "p", model_id: "missing" }), /所选模型不可用/);
  assert.equal((await cached.adapter.read(cached.handle.ref)).model_switch, undefined);
  cached.release();
  assert.equal((await cached.settle(cached.handle.ref)).phase, "completed");
  assert.equal(cached.requests.length, 1, "nothing went to another model");

  const effort = await heldRound(t, { small: model("small", { reasoning_effort: true }), plain: model("plain") }, { reasoning_effort: "medium" });
  await assert.rejects(effort.adapter.control(effort.handle.ref, { kind: "switch-model", provider_id: "p", model_id: "plain" }), /没有标注「plain」可调思考力度/);
  assert.equal((await effort.adapter.read(effort.handle.ref)).model_switch, undefined);
  effort.release();
  await effort.settle(effort.handle.ref);
  assert.deepEqual(effort.requests.map(request => request.body.model), ["small"]);
});

test("PA-24: a round whose prompt cache is off may switch to another format", { timeout: 30_000 }, async t => {
  const f = await heldRound(t, { small: model("small", { prompt_cache: "off" }), chat: model("chat", { protocol: "openai-compatible", endpoint: "https://1.1.1.3/v1/chat/completions" }) });
  await f.adapter.control(f.handle.ref, { kind: "switch-model", provider_id: "p", model_id: "chat" });
  assert.deepEqual((await f.adapter.read(f.handle.ref)).model_switch, { requested: "chat" });
  await f.adapter.control(f.handle.ref, { kind: "stop" });
  f.release();
  await f.settle(f.handle.ref);
});

test("PA-24: stopping a round with a switch asked for sends nothing to the new model, and the ended round no longer shows the request", { timeout: 30_000 }, async t => {
  const f = await heldRound(t, { small: model("small"), large: model("large", { endpoint: "https://1.1.1.2/v1/messages" }) });
  await f.adapter.control(f.handle.ref, { kind: "switch-model", provider_id: "p", model_id: "large" });
  assert.deepEqual((await f.adapter.read(f.handle.ref)).model_switch, { requested: "large" });
  await f.adapter.control(f.handle.ref, { kind: "stop" });
  f.release();
  const view = await f.settle(f.handle.ref);
  assert.equal(view.phase, "stopped");
  assert.equal(view.model_switch, undefined, "a request that never took effect is not shown on the ended round");
  assert.deepEqual(f.requests.map(request => request.body.model), ["small"], "nothing went to the new model");
});

test("PA-24: after a restart the ended round still shows the model it switched to and the one it started with", { timeout: 30_000 }, async t => {
  const answered = Promise.withResolvers<void>();
  const f = await fixture(t, { small: model("small"), large: model("large", { endpoint: "https://1.1.1.2/v1/messages" }) },
    async (_body, nth) => {
      // The switch takes effect at the next model call, so the first call asks for a tool and the round makes a second one.
      if (nth === 1) { await answered.promise; return sse("", { name: "read", input: { path: "notes.md" } }); }
      return sse("Release notes go in CHANGELOG.md.");
    });
  const handle = await f.start();
  for (let i = 0; i < 200 && f.requests.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
  await f.adapter.control(handle.ref, { kind: "switch-model", provider_id: "p", model_id: "large" });
  answered.resolve();
  assert.deepEqual((await f.settle(handle.ref)).model_switch, { now: "large" });
  await f.adapter.close();
  const reopened = await f.reopen();
  try {
    const view = await reopened.read(handle.ref);
    assert.deepEqual(view.model_switch, { now: "large" }, "read cold from the ledger after a restart");
    assert.equal(view.frozen.model_id, "small", "and the round still records what it started with");
    assert.ok(view.activity.some(item => item.name === "model-switch" && item.target === "small → large"));
  } finally { await reopened.close(); }
});

test("PA-24 (§4.3): a round continued after a switched one resolves the model the person picks against the current settings — no carried-over switch, the current key, and no stand-in for a model that is gone", { timeout: 30_000 }, async t => {
  const answered = Promise.withResolvers<void>();
  const models: Record<string, PrologueModelConfiguration> = { small: model("small"), large: model("large", { endpoint: "https://1.1.1.2/v1/messages" }) };
  const f = await fixture(t, models, async (_body, nth) => {
    if (nth === 1) { await answered.promise; return sse("", { name: "read", input: { path: "notes.md" } }); }
    return sse("Release notes go in CHANGELOG.md.");
  });
  const first = await f.start();
  for (let i = 0; i < 200 && f.requests.length < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
  await f.adapter.control(first.ref, { kind: "switch-model", provider_id: "p", model_id: "large" });
  answered.resolve();
  assert.deepEqual((await f.settle(first.ref)).model_switch, { now: "large" });
  assert.deepEqual(f.requests.map(request => request.body.model), ["small", "large"]);
  // Continued right away in the same live session: the model the person picks, not the one the session last switched to.
  const again = await f.settle((await f.start()).ref);
  assert.equal(again.model_switch, undefined);
  assert.deepEqual(f.requests.slice(2).map(request => [request.body.model, request.endpoint]), [["small", "https://1.1.1.1/v1/messages"]]);
  assert.match(String(f.requests.at(-1)!.key), /secret-of-key-small$/);

  // Interrupted: the Host goes down; meanwhile the settings move small to another endpoint with a new key, and large is removed.
  await f.adapter.close();
  models.small = model("small", { endpoint: "https://1.1.1.4/v1/messages", credential_ref: "key-small-rotated" });
  delete models.large;
  const reopened = await f.reopen();
  t.after(() => reopened.close());
  const sent = f.requests.length;

  // Continuing on the model the person picks (small): the current endpoint and key, not the switch of the round before.
  const next = await f.settle((await f.startOn(reopened)).ref, reopened);
  assert.equal(next.phase, "completed");
  assert.deepEqual(f.requests.slice(sent).map(request => request.body.model), ["small"]);
  assert.equal(f.requests.at(-1)!.endpoint, "https://1.1.1.4/v1/messages", "the endpoint from the current settings");
  assert.match(String(f.requests.at(-1)!.key), /secret-of-key-small-rotated/, "the key the current settings name, not the one the earlier round used");
  assert.equal(next.frozen.model_id, "small");
  assert.equal(next.model_switch, undefined, "the earlier round's switch is not carried over");
  assert.match(JSON.stringify(f.requests.at(-1)!.body.messages), /CHANGELOG\.md/, "the session's history is still there");

  // Continuing on the model the earlier round switched to, now gone: refused before anything is sent, with no other model standing in.
  const before = f.requests.length;
  const rounds = (await reopened.readSession(f.session)).runs.length;
  assert.equal(rounds, 3, "every round is in the one session");
  await assert.rejects(f.startOn(reopened, { model_selection: { provider_id: "p", model_id: "large" } }), /还没有配置可用的模型/);
  assert.equal(f.requests.length, before, "nothing was sent to any model");
  assert.equal((await reopened.readSession(f.session)).runs.length, rounds, "and no round was started");
});
