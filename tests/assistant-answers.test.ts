import assert from "node:assert/strict";
import test from "node:test";

// The Assistant words every round's materials in the language it runs in (`format.date`): the process needs the
// Host's text context installed, as a running Host has it.
installHostUiText();
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { installHostUiText, LocalHost } from "@molis-ai/molis-work-app-local-host";
import { AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { AssistantService, presentActivity } from "../apps/local-host/dist/assistant/assistant-service.js";
import { stopOriginalRun } from "../apps/local-host/dist/assistant/assistant-work-permissions.js";
import { assistantAuthority } from "@molis-ai/molis-work-app-local-host";

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
const write: ActionDefinition = { capability_id: "fixture.notes.write", version: 1, operation: "command", action: {
  title: "写笔记", description: "在项目里保存一条笔记", kind: "operation", scope: "project", audiences: ["agent"], permissions: ["notes:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { text: { type: "string", title: "内容" } }, required: ["text"], additionalProperties: false } } };

// PWA-129 PWA-136: an answer goes to its own question; a late or misplaced one starts nothing.
test("an answer continues its own question; a rejection stays a rejection; a late or misplaced answer or approval starts nothing", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-answers-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  const written: string[] = [];
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.notes", kind: "plugin", title: "笔记" }, definitions: [write],
    handlers: [{ ...write, handle(_context, input) { written.push((input as { text: string }).text); return { saved: true }; } }] });
  const requests: any[] = [];
  const script = [
    () => reply({ name: "ask-user", input: { why: "要写成几段？" } }),
    (body: any) => { assert.match(JSON.stringify(body.messages), /两段/, "the answer reaches the round that asked"); return reply({ name: "change-capability", input: { capability_id: "fixture.notes.write", version: 1, provider_id: "fixture.notes", input: { text: "两段的笔记" } } }); },
    () => reply(undefined, "你拒绝了，我没有写。"),
  ];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script[requests.length - 1] ?? (() => reply(undefined, "再说一次。")))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-answers-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "帮我写一条笔记", request_id: "req-answers-1" }, { project_ref: project });
    const asking = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "waiting-input" ? view : undefined; }, "question");
    const round = asking.rounds[0]!, question = round.awaiting_input[0]!;
    await service.outcomes.answer(sent.work.work_id, { run_id: round.run_id, pending_id: question.pending_id, ...(question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}), text: "两段" });
    const reviewing = await until(async () => { const view = await service.read(sent.work.work_id); return view.reviews.length ? view : undefined; }, "review");
    const review = reviewing.reviews[0]!;
    await service.outcomes.decide(sent.work.work_id, { review_id: review.review_id, version: review.version, decision: "reject" });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "completion");
    assert.deepEqual(written, [], "a rejection is not an approval: nothing was written");

    const before = requests.length;
    await assert.rejects(service.outcomes.answer(sent.work.work_id, { run_id: round.run_id, pending_id: question.pending_id, text: "三段" }),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.stale" && error.kind === "conflict");
    await assert.rejects(service.outcomes.decide(sent.work.work_id, { review_id: review.review_id, version: review.version, decision: "approve" }));
    assert.equal(requests.length, before, "a late answer or approval starts no model call");
    assert.deepEqual(written, [], "and revives no old action");

    const other = await service.send({ text: "另一件事", request_id: "req-answers-2" }, { project_ref: project });
    await assert.rejects(service.outcomes.answer(other.work.work_id, { run_id: round.run_id, pending_id: question.pending_id, text: "两段" }),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.scope" && error.kind === "forbidden", "an answer from another work is refused");
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("an answered question shows what was asked and what the person answered, whether written or picked", () => {
  const [written, picked, open] = presentActivity([
    { call_id: "q1", name: "ask-user", target: "截止日期定在哪天？", state: "completed", summary: "ask-user", output: JSON.stringify({ kind: "text", value: "下周一" }), at: null },
    { call_id: "q2", name: "ask-user", target: "放在哪里？", state: "completed", summary: "ask-user", at: null,
      output: JSON.stringify({ kind: "questionnaire", picked: [{ question: 0, labels: ["本项目"], other: undefined }, { question: 1, labels: [], other: "等我回来再定" }] }) },
    { call_id: "q3", name: "ask-user", target: "还要补充什么？", state: "started", summary: "ask-user", at: null },
  ] as never, undefined);
  assert.deepEqual([written!.verb, written!.target, written!.answer], ["ask", "截止日期定在哪天？", "下周一"]);
  assert.equal(picked!.answer, "本项目；等我回来再定");
  assert.equal(open!.answer, undefined, "not answered yet");
});

test("stopOriginalRun holds the ending barrier past 50ms for running rounds and rejects when no terminal event arrives", async () => {
  const run = { session_id: "s-stop", run_id: "r-stop" };
  const control = { beforeEffect: async () => {}, assertCurrent() {} };
  const listeners = new Set<(view: { phase: string; ended_at: string | null }) => void>();
  let phase: "running" | "stopped" = "running";
  let endedAt: string | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const adapter = {
    read: async () => ({ ref: run, phase, ended_at: endedAt }),
    observe: (_ref: unknown, listener: (view: { phase: string; ended_at: string | null }) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    control: async () => {
      stopTimer = setTimeout(() => {
        phase = "stopped";
        endedAt = new Date().toISOString();
        for (const listener of listeners) listener({ phase, ended_at: endedAt });
      }, 150);
    },
  };
  const startedAt = Date.now();
  await stopOriginalRun(adapter as never, run, control, 2_000);
  const elapsed = Date.now() - startedAt;
  assert.equal(phase, "stopped", "stopOriginalRun only resolves after the run reaches a terminal phase");
  assert.ok(elapsed >= 120, `expected stopOriginalRun to wait for real stop (~150ms), not resolve at 50ms (got ${elapsed}ms)`);
  clearTimeout(stopTimer);

  // If the run never settles within timeoutMs, stopOriginalRun must reject rather than falsely resolve.
  phase = "running";
  endedAt = null;
  const hungAdapter = {
    read: async () => ({ ref: run, phase, ended_at: endedAt }),
    observe: () => () => {},
    control: async () => {},
  };
  await assert.rejects(
    stopOriginalRun(hungAdapter as never, run, control, 120),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.state",
    "a running round that never settles must reject stopOriginalRun",
  );
});

test("AssistantOutcomes.decide surfaces delivery_error instead of returning 200 or sending a false rejection steer", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }), host = new AgentHost({ reviews: queue });
  const run = { session_id: "session-deliv", run_id: "run-deliv" };
  const steers: string[] = [];
  host.register({
    descriptor: { runtime_id: "prologue", title: "Prologue", capabilities: { pause: true, stop: true, cancel: true, steer: true } },
    openSession: async () => ({ ref: { session_id: run.session_id }, title: "t", workspace: "none", owner: { project_id: "home", plugin_id: "assistant" }, runs: [run] }),
    start: async () => { throw new Error("unused"); },
    read: async () => ({ ref: run, phase: "awaiting-review", turns: [], activity: [], awaiting_input: [], command_outputs: [], usage: { tokens: { input: 0, output: 0, cached_input: 0, cache_creation: 0 } }, frozen: { title: "t", role_id: "assistant", directory: null }, started_at: new Date().toISOString(), ended_at: null }),
    observe: () => () => {},
    control: async () => {},
    inputs: { send: async (_ref, input) => { steers.push(input.text); return { input_id: "i-1", accepted_at: new Date().toISOString() }; } },
    close: async () => {},
  } as never);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const created = store.create({ actor_id: "web-user", title: "Deliv", scope: { kind: "personal" }, origin: null });
  const work = store.update("web-user", created.work_id, null, { session_id: run.session_id }, false);
  store.addRound(work.work_id, { run_id: run.run_id, text: "do", materials: [], context: null, started_at: new Date().toISOString() });
  const review = queue.request({
    review_id: "rev-deliv",
    reference: { owner: { kind: "agent-review", project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: "assistant", install_id: "assistant" }, id: "rev-deliv", version: "v1" },
    project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: "assistant", kind: "text-edit", run,
    requested_at: new Date().toISOString(), expires_at: null,
    document: { kind: "text-edit", target_path: "a.md", exists: true, before_text: "a", after_text: "b" },
  });
  queue.registerDecisionHandler(review.review_id, async (_input, commit) => {
    await commit();
    return queue.deliveryFailed(review.review_id, "执行方连接中断");
  });
  const service = new AssistantService(store, {
    pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("unused"); }, projectTitle: async () => null,
  }, "web-user");
  try {
    await assert.rejects(
      service.outcomes.decide(work.work_id, { review_id: review.review_id, version: "v1", decision: "reject", note: "别改" }),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.state" && error.message.includes("执行方连接中断"),
    );
    assert.deepEqual(steers, [], "delivery_error must not emit a false rejection steer");
  } finally {
    service.continuations.close();
  }
});
