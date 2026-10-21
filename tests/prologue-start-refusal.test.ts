import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

test("a round the runtime refuses while packing its context leaves the session usable, across a restart; the window and context use are recorded", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-start-refusal-"));
  t.mock.method(globalThis, "fetch", async () => {
    const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 1234, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done." } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  let window: number | undefined = 200;
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.refusal-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture", ...(window ? { context_tokens: window } : {}) }),
    resolveCredential: () => "test-only" });
  let adapter = await make();
  const directory = { canonical_path: root, realpath_verified: true };
  const role = { role_id: "reader", version: 1, execution: "read-only" as const, host_tools: ["read-file"],
    prompts: [{ prompt_id: "base", version: 1, layer: "base" as const, body: "Keep this instruction. ".repeat(200) }] };
  const start = (history?: "digest") => adapter.start({ plugin_id: "io.molis.work.coding", session, directory, role_id: "reader", task: "Say done.", role, ...(history ? { history } : {}) } as never);
  const settle = async (ref: { session_id: string; run_id: string }) => {
    for (const until = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) return view;
      if (Date.now() > until) throw new Error("run did not finish");
    }
  };
  const session = await adapter.createSession({ title: "Refusal", project_id: "test", plugin_id: "io.molis.work.coding", install_id: "test", actor_id: "test", directory });
  try {
    // A 200-token window cannot hold the role's instructions: refused before any run exists.
    await assert.rejects(start(), (error: { code?: string }) => error.code === "CONTEXT_BUDGET_EXCEEDED");
    assert.equal((await adapter.readSession(session)).recovery, undefined, "a refusal is not an unknown outcome");
    assert.deepEqual((await adapter.recovery!.inspect(session)).blockers, [], "nor does it block closing a later interrupted round");

    window = undefined;
    const first = await settle((await start()).ref);
    assert.equal(first.phase, "completed");
    assert.deepEqual(first.frozen.model_context, { window_tokens: 120_000, prompt_includes_cache: false }, "no stated window: the runtime default");
    assert.deepEqual(first.usage.context, { tokens: 1234, coverage: "partial" }, "Anthropic-style cache fields were not reported, so the prompt is at least this");

    window = 64_000;
    const digest = await settle((await start("digest")).ref);
    assert.equal(digest.frozen.history, "digest");
    assert.equal(digest.frozen.model_context?.window_tokens, 64_000, "a model's smaller window is the one packed against");

    await adapter.close(); adapter = await make();
    const restored = await adapter.readSession(session);
    assert.equal(restored.recovery, undefined, "after a restart the refused attempt still does not block the session");
    assert.equal(restored.runs.length, 2);
    assert.equal((await settle((await start()).ref)).phase, "completed");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

// prologue#40 (BL-156): a normal shutdown parks a round whose only wait is the person's answer instead of cancelling it. It
// comes back with its question open and answerable; a new round before the answer is refused by the Host's own check of the
// restored session, so the runtime's SESSION_RUN_PARKED is not reached. Answered, the round ends with it and the next one
// carries the answer from the session's queue (AC-07).
test("AC-07 AC-11 a round parked on its question at shutdown comes back with that question to answer; answered, the next round carries the answer", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-parked-round-"));
  let requests = 0; const bodies: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => (bodies.push(await new Request(input, init).text()), ++requests === 1)
    ? cogniaScriptedResponse({ name: "ask-user", input: { why: "确认安排", questions: [{ id: "when", prompt: "什么时候开会", options: [{ label: "今天" }, { label: "明天" }] }] } })
    : cogniaModelResponse("好的。"));
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.parked-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), questionTypes: ["choice"], reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  let adapter = await make();
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "parked", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Parked" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
  const start = () => adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "安排会议" });
  const until = async <T>(read: () => Promise<T | undefined>, what: string) => {
    for (const deadline = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
      const found = await read();
      if (found !== undefined) return found;
      assert.ok(Date.now() < deadline, what);
    }
  };
  const asked = await start();
  const question = await until(async () => (await adapter.read(asked.ref)).awaiting_input.find(item => item.answerable && item.kind === "questionnaire"), "the round did not reach its question");

  await adapter.close(); adapter = await make();
  const restored = await adapter.readSession(session);
  assert.equal(restored.recovery?.required, true, "the parked round is not taken for a finished one");
  const view = await adapter.read(asked.ref);
  assert.equal(view.phase, "reconcile-required");
  assert.deepEqual(view.awaiting_input.map(item => item.pending_id), [question.pending_id], "its question is still the one it asked");
  await assert.rejects(start(), (error: { code?: string }) => error.code === "agent.session_busy", "no new round before it is answered or closed: the Host refuses it, the runtime is not asked");

  const report = await adapter.recovery!.inspect(session);
  assert.deepEqual(report.blockers, [], "a refused start and the parked round leave nothing unexplained");
  const parked = report.runs.find(run => run.run_id === asked.ref.run_id);
  assert.equal(parked?.can_answer, true, "parked on an open question, it can be answered");
  assert.equal(parked?.can_close, true, "or closed instead");
  assert.deepEqual(parked?.questions?.map(item => item.pending_id), [question.pending_id]);
  const reread = (await adapter.read(asked.ref)).awaiting_input.find(item => item.pending_id === question.pending_id);
  assert.equal(reread?.parked, true);
  assert.equal(reread?.answerable, true);
  await adapter.control(asked.ref, { kind: "answer", pending_id: question.pending_id, pending_revision: question.pending_revision!, answers: [{ question: 0, indexes: [1] }] });
  assert.equal((await adapter.readSession(session)).recovery, undefined, "answered, the session no longer waits for checking");
  assert.ok((await adapter.readSession(session)).queued_inputs?.some(input => input.key === `answer.${question.pending_id}`), "the answer waits for the next round");
  const heard = bodies.length;
  const next = await start();
  const ended = await until(async () => { const read = await adapter.read(next.ref); return ["completed", "failed", "stopped", "cancelled"].includes(read.phase) ? read : undefined; }, "the next round did not end");
  assert.equal(ended.phase, "completed");
  assert.match(bodies[heard]!, /answered-after-interruption/, "the next round is told the question was answered after the interruption");
  assert.match(bodies[heard]!, /明天/, "and gets the answer");
});

// specs/ai-input-receipts 3e-0: business roles now also name acknowledge-inputs. That adds no reach: a business role naming
// a tool that touches a directory or runs a command is still refused before any run exists, and the model is never asked.
test("RCPT-363, 3e-0: a business role still gets no directory or command tool; acknowledge-inputs alone starts", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-business-tools-"));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => (requests++, cogniaModelResponse("好的。")));
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.business-tools-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "business", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Business tools" });
  const start = (host_tools: string[]) => adapter.start({ ...owner, session, workspace: "business", role_id: "helper", task: "安排会议",
    role: { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools } });
  for (const tool of ["read-file", "list", "search", "write", "edit-file", "run-command"]) {
    await assert.rejects(start(["acknowledge-inputs", tool]), (error: { code?: string }) => error.code === "agent.capability_unavailable", `RCPT-363 ${tool} is refused`);
  }
  assert.equal(requests, 0, "RCPT-363 refused before the model is asked");
  const started = await start(["acknowledge-inputs"]);
  assert.ok(started.ref.run_id, "RCPT-363 the business set itself starts");
});
