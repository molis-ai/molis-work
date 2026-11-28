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
import { ActionError, SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantAuthority, AssistantStore, installHostUiText, LocalHost, stopOriginalRun, stopOriginalRunWithSettlement } from "@molis-ai/molis-work-app-local-host";
import { AssistantService, presentActivity } from "../apps/local-host/dist/assistant/assistant-service.js";

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
  const adapter = await createPrologueNodeAdapter({ app: { appId: "system.assistant-answers-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
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

test("stopOriginalRunWithSettlement guarantees exact-once handoff across post-timeout read races and read failures", async () => {
  const run = { session_id: "s-race", run_id: "r-race" };
  const control = { beforeEffect: async () => {}, assertCurrent() {} };

  // Case 1: terminal event arrives while the post-timeout adapter.read(run) is pending -> must return true, call onSettled 0 times, and unsubscribe.
  {
    let reads = 0;
    let unsubscribed = 0;
    let onSettledCalls = 0;
    const listeners = new Set<(view: { phase: string; ended_at: string | null }) => void>();
    const thirdReadEntered = Promise.withResolvers<void>();
    const releaseThirdRead = Promise.withResolvers<void>();
    const adapter = {
      read: async () => {
        reads += 1;
        if (reads <= 2) return { ref: run, phase: "running", ended_at: null };
        thirdReadEntered.resolve();
        await releaseThirdRead.promise;
        return { ref: run, phase: "stopped", ended_at: new Date().toISOString() };
      },
      observe: (_ref: unknown, listener: (view: { phase: string; ended_at: string | null }) => void) => {
        listeners.add(listener);
        return () => {
          if (listeners.delete(listener)) unsubscribed += 1;
        };
      },
      control: async () => {},
    };
    const stopping = stopOriginalRunWithSettlement(adapter as never, run, control, {
      deferRunningSettlement: true,
      runningWaitMs: 20,
      onSettled: () => { onSettledCalls += 1; },
    });
    await thirdReadEntered.promise;
    for (const listener of [...listeners]) listener({ phase: "stopped", ended_at: new Date().toISOString() });
    releaseThirdRead.resolve();
    const settled = await stopping;
    assert.equal(settled, true, "event during pending post-timeout read resolves synchronously as settled");
    assert.equal(onSettledCalls, 0, "onSettled must never fire when returning settled=true");
    assert.equal(unsubscribed, 1, "observer is unsubscribed exactly once");
  }

  // Case 2: post-timeout adapter.read(run) throws -> must reject, unsubscribe observer, and never invoke onSettled.
  {
    let reads = 0;
    let unsubscribed = 0;
    let onSettledCalls = 0;
    const listeners = new Set<(view: { phase: string; ended_at: string | null }) => void>();
    const adapter = {
      read: async () => {
        reads += 1;
        if (reads <= 2) return { ref: run, phase: "running", ended_at: null };
        throw new Error("read failed after timeout");
      },
      observe: (_ref: unknown, listener: (view: { phase: string; ended_at: string | null }) => void) => {
        listeners.add(listener);
        return () => {
          if (listeners.delete(listener)) unsubscribed += 1;
        };
      },
      control: async () => {},
    };
    await assert.rejects(
      stopOriginalRunWithSettlement(adapter as never, run, control, {
        deferRunningSettlement: true,
        runningWaitMs: 20,
        onSettled: () => { onSettledCalls += 1; },
      }),
      /read failed after timeout/,
    );
    assert.equal(unsubscribed, 1, "observer is unsubscribed on post-timeout read error");
    for (const listener of [...listeners]) listener({ phase: "stopped", ended_at: new Date().toISOString() });
    assert.equal(onSettledCalls, 0, "onSettled never fires after rejected call");
  }

  // Case 3: run stays running past post-timeout read -> returns false, keeps observer attached, and invokes onSettled once on terminal event.
  {
    let unsubscribed = 0;
    let onSettledCalls = 0;
    const listeners = new Set<(view: { phase: string; ended_at: string | null }) => void>();
    const adapter = {
      read: async () => ({ ref: run, phase: "running", ended_at: null }),
      observe: (_ref: unknown, listener: (view: { phase: string; ended_at: string | null }) => void) => {
        listeners.add(listener);
        return () => {
          if (listeners.delete(listener)) unsubscribed += 1;
        };
      },
      control: async () => {},
    };
    const settled = await stopOriginalRunWithSettlement(adapter as never, run, control, {
      deferRunningSettlement: true,
      runningWaitMs: 20,
      onSettled: () => { onSettledCalls += 1; },
    });
    assert.equal(settled, false);
    assert.equal(listeners.size, 1, "observer stays attached after handoff");
    assert.equal(onSettledCalls, 0);
    for (const listener of [...listeners]) listener({ phase: "stopped", ended_at: new Date().toISOString() });
    assert.equal(onSettledCalls, 1, "onSettled fires exactly once when deferred run settles");
    assert.equal(unsubscribed, 1, "observer self-unsubscribes after deferred settlement");
  }

  // Case 4 (CORE-02): onDispose detaches a handed-off observer cleanly when a subsequent step fails.
  {
    let unsubscribed = 0;
    let onSettledCalls = 0;
    let dispose: (() => void) | undefined;
    const listeners = new Set<(view: { phase: string; ended_at: string | null }) => void>();
    const adapter = {
      read: async () => ({ ref: run, phase: "running", ended_at: null }),
      observe: (_ref: unknown, listener: (view: { phase: string; ended_at: string | null }) => void) => {
        listeners.add(listener);
        return () => {
          if (listeners.delete(listener)) unsubscribed += 1;
        };
      },
      control: async () => {},
    };
    const settled = await stopOriginalRunWithSettlement(adapter as never, run, control, {
      deferRunningSettlement: true,
      runningWaitMs: 20,
      onSettled: () => { onSettledCalls += 1; },
      onDispose: fn => { dispose = fn; },
    });
    assert.equal(settled, false);
    assert.ok(dispose, "onDispose registered on handoff");
    dispose!();
    assert.equal(unsubscribed, 1, "observer detached immediately by onDispose");
    for (const listener of [...listeners]) listener({ phase: "stopped", ended_at: new Date().toISOString() });
    assert.equal(onSettledCalls, 0, "disposed observer never triggers onSettled");
  }
});

test("S-partition-isolation AP-02 AssistantService rejects personal objects for project work while accepting personal objects for personal work", async () => {
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const projectWork = store.create({
    actor_id: "web-user", title: "Project", scope: { kind: "project", project_id: "proj-a" },
    project_ref: { project_id: "proj-a", storage_key: "memory:proj-a" }, origin: null,
  });
  const personalWork = store.create({ actor_id: "web-user", title: "Personal", scope: { kind: "personal" }, origin: null });
  store.relations.link({ work_id: projectWork.work_id, project_id: "proj-a" }, "origin", { kind: "todo_item", id: "t1", revision: "1" }, "test");
  store.relations.link({ work_id: personalWork.work_id, project_id: null }, "origin", { kind: "todo_item", id: "t1", revision: "1" }, "test");

  let returnedProjectId: string | null | undefined = "personal";
  const readerView = {
    capability_id: "todo.read", version: 1,
    provider: { provider_id: "todo", title: "Todo", kind: "plugin" as const },
    availability: { available: true as const },
    action: {
      title: "Read todo", description: "Read todo", scope: "project" as const, kind: "query" as const,
      permissions: [], audiences: ["user" as const], subject_kinds: ["todo_item"],
      input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE,
      input_schema: { type: "object" }, output_schema: { type: "object" },
    },
  };
  const service = new AssistantService(store, {
    pages: async () => ["home"],
    host: async () => { throw new Error("unused"); },
    authority: async () => { throw new Error("unused"); },
    projectTitle: async () => null,
    scopeActions: async () => ({
      discover: async () => [readerView],
      invoke: async () => ({
        subject: { kind: "todo_item", id: "t1" }, revision: "1", title: "Todo", content: "", truncated: false,
        ...(returnedProjectId !== undefined ? { project_id: returnedProjectId } : {}),
      }),
    }) as never,
  }, "web-user");
  try {
    const stateOf = async (work: typeof projectWork, projectId: string | null | undefined) => {
      returnedProjectId = projectId;
      const objects = await service.reads.workObjects(work);
      assert.equal(objects.length, 1);
      return objects[0]!.state;
    };
    assert.equal(await stateOf(projectWork, "personal"), "moved", "project work must reject personal-partition objects");
    assert.equal(await stateOf(projectWork, "proj-b"), "moved", "project work must reject another project's objects");
    assert.equal(await stateOf(projectWork, "proj-a"), "current", "project work accepts its own project's objects");
    assert.equal(await stateOf(projectWork, null), "current", "unscoped home objects are not treated as elsewhere");
    assert.equal(await stateOf(personalWork, "personal"), "current", "personal work accepts personal-partition objects");
    assert.equal(await stateOf(personalWork, "proj-a"), "moved", "personal work rejects project objects");
    assert.equal(await stateOf(personalWork, null), "current");
  } finally {
    service.continuations.close();
  }
});

test("CORE-02 AssistantService.control deferred stop settles remaining child delegations even when parent assertCurrent fails", async () => {
  const now = new Date().toISOString();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const createdParent = store.create({ actor_id: "web-user", title: "Parent", scope: { kind: "personal" }, origin: null });
  const parent = store.update("web-user", createdParent.work_id, null, { graph_id: "g-core02", session_id: "s-parent" }, false);
  store.addRound(parent.work_id, { run_id: "r-parent", text: "go", materials: [], context: null, started_at: now });
  const createdChild1 = store.create({
    actor_id: "web-user", title: "Child 1", scope: { kind: "personal" }, origin: null,
    delegated_by: { graph_id: "g-core02", node_id: "n-1", title: "Parent", acceptance: "done" },
  });
  const child1 = store.update("web-user", createdChild1.work_id, null, { session_id: "s-child1" }, false);
  store.addRound(child1.work_id, { run_id: "r-child1", text: "sub1", materials: [], context: null, started_at: now });
  const createdChild2 = store.create({
    actor_id: "web-user", title: "Child 2", scope: { kind: "personal" }, origin: null,
    delegated_by: { graph_id: "g-core02", node_id: "n-2", title: "Parent", acceptance: "done" },
  });
  const child2 = store.update("web-user", createdChild2.work_id, null, { session_id: "s-child2" }, false);
  store.addRound(child2.work_id, { run_id: "r-child2", text: "sub2", materials: [], context: null, started_at: now });

  const listeners = new Set<(view: { phase: string; ended_at: string | null }) => void>();
  let parentStopped = false;
  const finished: string[] = [];
  let parentRejected = false;
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
  const host = new AgentHost({ reviews: queue });
  host.register({
    descriptor: { runtime_id: "prologue", title: "Prologue", capabilities: { pause: true, stop: true, cancel: true, steer: true } },
    openSession: async () => { throw new Error("unused"); },
    start: async () => { throw new Error("unused"); },
    read: async (ref: { session_id: string; run_id: string }) => ({
      ref,
      phase: ref.run_id === "r-parent" && !parentStopped ? "running" : "stopped",
      turns: [], activity: [], awaiting_input: [], command_outputs: [],
      usage: { tokens: { input: 0, output: 0, cached_input: 0, cache_creation: 0 } },
      frozen: { title: "t", role_id: "assistant", directory: null },
      started_at: now,
      ended_at: ref.run_id === "r-parent" && !parentStopped ? null : now,
    }),
    readSession: async (ref: { session_id: string }) => {
      const runId = ref.session_id === "s-parent" ? "r-parent" : ref.session_id === "s-child1" ? "r-child1" : "r-child2";
      const runRef = { session_id: ref.session_id, run_id: runId };
      const running = runId === "r-parent" && !parentStopped;
      return {
        ref, title: "t", workspace: "none", owner: { project_id: "home", plugin_id: "assistant" },
        runs: [runRef],
        latest_run: {
          ref: runRef,
          phase: running ? "running" : "stopped",
          turns: [], activity: [], awaiting_input: [], command_outputs: [],
          usage: { tokens: { input: 0, output: 0, cached_input: 0, cache_creation: 0 } },
          frozen: { title: "t", role_id: "assistant", directory: null },
          started_at: now,
          ended_at: running ? null : now,
        },
      };
    },
    observe: (_ref: unknown, listener: (view: { phase: string; ended_at: string | null }) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    control: async () => {},
    collaboration: {
      read: async () => [],
      works: {
        hold: async () => {},
        read: async () => [],
        onReady: () => () => {},
      },
    },
    delegations: {
      read: async () => null,
      beginEnd: async (subject: { work: { id: string } }) => ({ epoch: `ep-${subject.work.id}` }),
      finishEnd: async (subject: { work: { id: string } }, _epoch: string, control: { beforeEffect(): Promise<void>; assertCurrent(): void }) => {
        try {
          await control.beforeEffect();
          control.assertCurrent();
        } catch (error) {
          if (subject.work.id === parent.work_id) parentRejected = true;
          throw error;
        }
        finished.push(subject.work.id);
      },
    },
    close: async () => {},
  } as never);

  const service = new AssistantService(store, {
    pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("unused"); }, projectTitle: async () => null,
  }, "web-user");
  try {
    await service.control(parent.work_id, { kind: "stop" });
    assert.equal(listeners.size, 1, "parent running stop handed off to deferred settlement observer");
    assert.deepEqual(finished, [], "finishEnd waits until deferred run settles");
    // Mutate parent work before deferred settlement fires so parent's assistantEndControl throws.
    store.update("web-user", parent.work_id, null, {
      delegated_by: { graph_id: "mutated", node_id: "n-mut", title: "Mutated", acceptance: "x" },
    }, false);
    parentStopped = true;
    for (const listener of [...listeners]) listener({ phase: "stopped", ended_at: now });
    await until(() => finished.length === 2, "child delegations finishEnd");
    assert.equal(parentRejected, true, "parent end control rejected after mutation");
    assert.deepEqual(finished.sort(), [child1.work_id, child2.work_id].sort(), "both child delegations still complete finishEnd despite parent failure");
  } finally {
    service.continuations.close();
  }
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
    inputs: { send: async (_ref: unknown, input: { text: string }) => { steers.push(input.text); return { input_id: "i-1", accepted_at: new Date().toISOString() }; } },
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
