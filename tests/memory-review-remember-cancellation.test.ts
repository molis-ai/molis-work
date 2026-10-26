import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, assistantServiceFor, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// Real protected HTTP -> Assistant remember -> Node SDK/SQLite. Hooks only hold
// existing calls and then delegate: no memory result, permission or receipt is fabricated.
const scenarios = [
  { boundary: "screen", action: "none" }, { boundary: "screen", action: "stop" },
  { boundary: "screen", action: "pause" }, { boundary: "screen", action: "withdraw" },
  { boundary: "screen", action: "revoke" },
  { boundary: "screen", action: "latest-input" },
  { boundary: "commit", action: "none" }, { boundary: "commit", action: "stop" },
  { boundary: "commit", action: "withdraw" }, { boundary: "commit", action: "revoke" },
  { boundary: "commit", action: "form-off" },
  { boundary: "commit", action: "latest-input" },
  { boundary: "commit", action: "withdraw-unrelated" },
] as const;
for (const { boundary, action } of scenarios) {
  test(`remember ${boundary}: ${action === "none" ? "normal save" : action === "withdraw-unrelated" ? "unrelated withdrawal request preserves save" : `${action === "withdraw" ? "withdrawal request for an adopted input" : action} prevents later writes`}`, { timeout: 60_000 }, async t => {
    const gate = Promise.withResolvers<void>(), modelGate = Promise.withResolvers<void>(), modelReached = Promise.withResolvers<void>();
    t.after(() => { gate.resolve(); modelGate.resolve(); });
    const home = await openTestHome(t), text = "回答用要点列表";
    const hasSupplement = action === "withdraw" || action === "withdraw-unrelated" || action === "revoke";
    const system = ensureSystemAgentService(home.host, home.home); await system.ready;
    const current = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost,
      agentReady: () => system.ready, projectTitle: async () => null, pages: async () => ["home"] });
    const adapter = system.agentHost.adapter("prologue"), capability = adapter.memory!;
    const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true,
      current_scene: "common", purpose: "management" as const };
    const formal = () => capability.withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID);
    const candidates = () => capability.withCaller(caller).candidates.list("user", LOCAL_PERSON_ACTOR_ID);
    let reached = false, captured: Parameters<MemoryService["write"]> | undefined;
    const completedWrite = Promise.withResolvers<{ result?: unknown; error?: string }>();
    const write = MemoryService.prototype.write;
    t.mock.method(MemoryService.prototype, "write", async function (this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
      if (args[1].text !== text) return write.apply(this, args);
      captured = args;
      try { const result = await write.apply(this, args); completedWrite.resolve({ result }); return result; }
      catch (error) { completedWrite.resolve({ error: String(error) }); throw error; }
    });
    if (boundary === "screen") {
      assert.ok(capability.screen);
      const screening = capability as typeof capability & Required<Pick<typeof capability, "screen">>, screen = screening.screen.bind(capability);
      t.mock.method(screening, "screen", async (value: string) => {
        if (value === text && !reached) { reached = true; await gate.promise; }
        return screen(value);
      });
    } else {
      const withCaller = capability.withCaller.bind(capability);
      t.mock.method(capability, "withCaller", (owner: Parameters<typeof withCaller>[0]) => {
        const bound = withCaller(owner), withExecution = bound.withExecution!.bind(bound);
        bound.withExecution = control => withExecution({
          // Hold AFTER the real async source check. The synchronous final guard
          // must still stop this exact Host commit and every later ledger call.
          beforeEffect: async () => { await control.beforeEffect(); if (captured && !reached) { reached = true; await gate.promise; } },
          assert_current: () => control.assert_current(),
        });
        return bound;
      });
    }
    if (hasSupplement) {
      const fetchModel = globalThis.fetch;
      let heldModel = false;
      t.mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
        const response = await fetchModel(...args);
        const body = args[1]?.body;
        if (!heldModel && body && /"model"\s*:\s*"fixture"/.test(typeof body === "string" ? body : Buffer.from(body as Uint8Array).toString())) {
          heldModel = true; modelReached.resolve(); await modelGate.promise;
        }
        return response;
      });
    }
    await connectorAssistantModel(t, home.home, (_body, turn) => hasSupplement && turn === 1
      ? { name: "list-memories", input: {} } : turn === (hasSupplement ? 2 : 1)
        ? { name: "remember", input: { text, said: text, scope: "personal" } } : "已处理。");
    const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: hasSupplement ? "整理本周安排" : text, request_id: randomUUID() });
    let inputId: string | undefined, unrelatedId: string | undefined;
    if (hasSupplement) {
      await modelReached.promise;
      const supplement = await home.web.post<AssistantSendResult>("/api/assistant/send", { work_id: sent.work.work_id, text, request_id: randomUUID() });
      assert.equal(supplement.outcome, "steered");
      inputId = (await untilSetup(async () => (await current.service.read(sent.work.work_id)).rounds.flatMap(round => round.turns)
        .find(turn => turn.text === text)?.steer, "accepted supplement")).id;
      if (action === "withdraw-unrelated") {
        const unrelated = "今天先整理会议记录";
        await home.web.post<AssistantSendResult>("/api/assistant/send", { work_id: sent.work.work_id, text: unrelated, request_id: randomUUID() });
        unrelatedId = (await untilSetup(async () => (await current.service.read(sent.work.work_id)).rounds.flatMap(round => round.turns)
          .find(turn => turn.text === unrelated)?.steer, "unrelated supplement")).id;
      }
      modelGate.resolve();
    }
    await untilSetup(async () => reached ? true : undefined, `real remember reached ${boundary}`);
    if (hasSupplement) {
      const original = await adapter.inputs!.read!({ session_id: sent.work.session_id!, input_id: inputId! });
      assert.equal(original?.state, "run");
      assert.ok(original?.state === "run" && ["applied", "read"].includes(original.receipt.state), "the real loop has adopted the person's supplement");
    }
    assert.equal(captured?.[2]?.originals?.includes(text), true);
    assert.equal(captured?.[2]?.sources?.length, 1, "only the actual selected original is bound");
    assert.equal((await formal()).length, 0);
    assert.equal((await candidates()).length, 0);
    if (action === "stop" || action === "pause") {
      const controlled = await home.web.post<AssistantWorkView>(`/api/assistant/works/${sent.work.work_id}/control`, { kind: action });
      assert.equal(controlled.work.state, action === "stop" ? "stopped" : "paused");
      assert.equal(current.store.get(LOCAL_PERSON_ACTOR_ID, sent.work.work_id).continuation_hold, action === "stop" ? "stopped" : "paused");
    } else if (action === "withdraw" || action === "withdraw-unrelated") {
      const withdrawnId = action === "withdraw" ? inputId! : unrelatedId!;
      // The SDK cannot retract text already sent to the model. The validated
      // withdrawal request still cancels an in-flight use before its commit.
      await assert.rejects(home.web.post<AssistantWorkView>(`/api/assistant/works/${sent.work.work_id}/control`, { kind: "withdraw", run_id: sent.run_id!, input_id: withdrawnId }), /这条补充已经放进上下文，撤不回了/);
      const afterRequest = await adapter.inputs!.read!({ session_id: sent.work.session_id!, input_id: withdrawnId });
      assert.ok(afterRequest?.state === "run" && ["applied", "read"].includes(afterRequest.receipt.state));
      assert.equal(captured?.[0].signal?.aborted, action === "withdraw");
    } else if (action === "revoke" || action === "form-off") {
      await home.web.post("/api/memory/prefs", { scope: "personal", prefs: action === "form-off" ? { form: false } : { consumers: { assistant: false } } });
    } else if (action === "latest-input") {
      // Keep the actual newer Send preparation open while the old real tool returns from its held boundary.
      const latest = current.service.continuations.begin(current.store.get(LOCAL_PERSON_ACTOR_ID, sent.work.work_id), "先不要记住，等我补充");
      t.after(latest.end);
      assert.equal(latest.current(), true);
      assert.equal(current.store.get(LOCAL_PERSON_ACTOR_ID, sent.work.work_id).continuation_hold, "input");
    }
    gate.resolve();
    const writeResult = await completedWrite.promise;
    if (action === "pause") await home.web.post(`/api/assistant/works/${sent.work.work_id}/control`, { kind: "stop" });
    const ended = await untilSetup(async () => {
      const run = await adapter.read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
      return ["completed", "failed", "stopped", "cancelled"].includes(run.phase) ? run : undefined;
    }, "the actual Run settles after the tool returns");
    if (action === "withdraw-unrelated" || action === "revoke") {
      assert.equal(captured?.[0].signal?.aborted, false, "success or permission failure did not abort this completed invocation");
      // The public withdrawal still reaches its validated owner seam, even when
      // SDK refuses an already-read input. Completed/failed tools have unbound.
      await home.web.post(`/api/assistant/works/${sent.work.work_id}/control`, { kind: "withdraw", run_id: sent.run_id!, input_id: inputId! }).catch(() => undefined);
      assert.equal(captured?.[0].signal?.aborted, false, "no stale source listener survives a successful or failed tool");
    }
    const entries = await formal(), proposed = await candidates();
    const ledger = openMemoryLedger({ homeDirectory: home.home });
    let changes: ReturnType<typeof ledger.changes>, projections: ReturnType<typeof ledger.candidates>;
    try { changes = ledger.changes(LOCAL_PERSON_ACTOR_ID, 100); projections = ledger.candidates(LOCAL_PERSON_ACTOR_ID); } finally { ledger.close(); }
    const visible = await current.service.memories();
    assert.equal((await formal()).length, entries.length, "a later owner read agrees");
    await home.close(); await home.host.close();
    const reopened = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
    let restored = 0, restoredChanges = 0, restoredCandidates = 0;
    try {
      const again = ensureSystemAgentService(reopened, home.home); await again.ready;
      const memory = again.agentHost.adapter("prologue").memory!.withCaller(caller);
      restored = (await memory.list("user", LOCAL_PERSON_ACTOR_ID)).length;
      restoredCandidates = (await memory.candidates.list("user", LOCAL_PERSON_ACTOR_ID)).length;
      const reopenedLedger = openMemoryLedger({ homeDirectory: home.home });
      try { restoredChanges = reopenedLedger.changes(LOCAL_PERSON_ACTOR_ID, 100).length; } finally { reopenedLedger.close(); }
    } finally { await reopened.close(); }
    const actual = { formal: entries.length, ledgerChanges: changes.length, visible: visible.length, candidates: proposed.length,
      candidateProjections: projections.length, restored, restoredChanges, restoredCandidates };
    t.diagnostic(JSON.stringify({ boundary, action, finalRun: ended.phase, writeResult, ...actual }));
    const expected = action === "none" || action === "withdraw-unrelated" ? 1 : 0;
    assert.deepEqual(actual, { formal: expected, ledgerChanges: expected, visible: expected, candidates: 0, candidateProjections: 0,
      restored: expected, restoredChanges: expected, restoredCandidates: 0 });
  });
}

test("MEM-35: a fresh explicit original in the same work can be remembered after the old source was forgotten", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), text = "回答用要点列表";
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const adapter = system.agentHost.adapter("prologue"), capability = adapter.memory!;
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true,
    current_scene: "common", purpose: "management" as const };
  const formal = () => capability.withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID);
  const writes: Array<Parameters<MemoryService["write"]>> = [], write = MemoryService.prototype.write;
  t.mock.method(MemoryService.prototype, "write", function(this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
    if (args[0].consumer === "assistant") writes.push(args);
    return write.apply(this, args);
  });
  await connectorAssistantModel(t, home.home, (_body, turn) => turn === 1 || turn === 3
    ? { name: "remember", input: { text, said: text, scope: "personal" } } : "已处理。");
  const send = (workId?: string) => home.web.post<AssistantSendResult>("/api/assistant/send", { text, request_id: randomUUID(), ...(workId ? { work_id: workId } : {}) });
  const settle = async (sent: AssistantSendResult) => untilSetup(async () => {
    const run = await adapter.read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
    return run.phase === "completed" ? true : undefined;
  }, "remember round completed");
  const first = await send(); await settle(first);
  const initial = (await formal())[0]!; assert.equal(initial.text, text); assert.equal(writes.length, 1);
  await home.web.post("/api/memory/change", { operation_id: randomUUID(), memory_id: initial.memory_id, expected_version: initial.version, action: "remove" });
  assert.deepEqual(await formal(), [], "the old entry was really forgotten through settings");
  const next = await send(first.work.work_id); await settle(next);
  const entries = await formal(); assert.equal(entries.length, 1); assert.equal(entries[0]!.text, text);
  assert.notEqual(entries[0]!.memory_id, initial.memory_id); assert.equal(writes.length, 2);
  assert.equal(writes[0]![2]?.sources?.length, 1); assert.equal(writes[1]![2]?.sources?.length, 1);
  assert.notEqual(writes[1]![2]!.sources![0]!.event_id, writes[0]![2]!.sources![0]!.event_id, "only the new canonical original authorizes this save");
  await home.close(); await home.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  try {
    const again = ensureSystemAgentService(reopened, home.home); await again.ready;
    assert.deepEqual(await again.agentHost.adapter("prologue").memory!.withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID), entries);
  } finally { await reopened.close(); }
});
