import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, assistantServiceFor, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// MEM-03/20/31: Real protected HTTP -> Assistant memory tools -> Node SDK/SQLite. Hooks only hold
// existing calls and then delegate: no memory result, permission or receipt is fabricated.
for (const scenario of ["remember", "unrelated", "propose"] as const)
test(`source snapshot withdrawal: ${scenario}`, { timeout: 60_000 }, async t => {
  const gate = Promise.withResolvers<void>(), modelGate = Promise.withResolvers<void>(), modelReached = Promise.withResolvers<void>();
  t.after(() => { gate.resolve(); modelGate.resolve(); });
  const home = await openTestHome(t), text = "回答用要点列表";
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const current = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost,
    agentReady: () => system.ready, projectTitle: async () => null, pages: async () => ["home"] });
  const adapter = system.agentHost.adapter("prologue"), capability = adapter.memory!;
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true,
    current_scene: "common", purpose: "management" as const };
  const formal = () => capability.withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID);
  const candidates = () => capability.withCaller(caller).candidates.list("user", LOCAL_PERSON_ACTOR_ID);
  let reached = false, captured: Parameters<MemoryService["write"]> | undefined;
  const completedCall = Promise.withResolvers<{ result?: unknown; error?: string }>();
  const write = MemoryService.prototype.write;
  t.mock.method(MemoryService.prototype, "write", async function (this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
    if (args[1].text !== text) return write.apply(this, args);
    captured = args;
    return write.apply(this, args);
  });
  // Hold only the real source snapshot's return while the remember callback
  // is active. The original SDK reads and every SourcePort check still run.
  const memoryTools = Reflect.get(current.service, "memoryTools");
  const assistantPart = Reflect.get(current.service, "assistantPart");
  let remembering = false;
  const observe = async <T>(invoke: () => Promise<T>) => {
    remembering = true;
    try { const result = await invoke(); completedCall.resolve({ result }); return result; }
    catch (error) { completedCall.resolve({ error: String(error) }); throw error; }
    finally { remembering = false; }
  };
  Reflect.set(current.service, "memoryTools", function (...args: unknown[]) {
    const tools: AgentMemoryTools | undefined = Reflect.apply(memoryTools, current.service, args);
    if (tools?.remember) {
      const remember = tools.remember.bind(tools);
      tools.remember = (...call) => observe(() => remember(...call));
    }
    if (tools?.propose) {
      const propose = tools.propose.bind(tools);
      tools.propose = (...call) => observe(() => propose(...call));
    }
    return tools;
  });
  Reflect.set(current.service, "assistantPart", async function (...args: unknown[]) {
    const result = await Reflect.apply(assistantPart, current.service, args);
    if (remembering && !reached) { reached = true; await gate.promise; }
    return result;
  });
  t.after(() => {
    Reflect.set(current.service, "memoryTools", memoryTools);
    Reflect.set(current.service, "assistantPart", assistantPart);
  });
  {
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
  await connectorAssistantModel(t, home.home, (_body, turn) => turn === 1
    ? { name: "list-memories", input: {} } : turn === 2
      ? scenario === "propose" ? { name: "suggest-memory", input: { text, scope: "personal", why: "以后交付时使用", applies: "交付答复时" } }
        : { name: "remember", input: { text, said: text, scope: "personal" } } : "已处理。");
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: scenario === "unrelated" ? `${text}。` : "整理本周安排", request_id: randomUUID() });
  await modelReached.promise;
  const unrelatedText = "顺便列出明天的安排";
  if (scenario === "unrelated") await home.web.post<AssistantSendResult>("/api/assistant/send", { work_id: sent.work.work_id, text: unrelatedText, request_id: randomUUID() });
  const supplement = await home.web.post<AssistantSendResult>("/api/assistant/send", { work_id: sent.work.work_id, text, request_id: randomUUID() });
  assert.equal(supplement.outcome, "steered");
  const inputId = (await untilSetup(async () => (await current.service.read(sent.work.work_id)).rounds.flatMap(round => round.turns)
    .find(turn => turn.text === text)?.steer, "accepted supplement")).id;
  modelGate.resolve();
  await untilSetup(async () => reached ? true : undefined, "real remember awaits its actual source snapshot");
  const original = await adapter.inputs!.read!({ session_id: sent.work.session_id!, input_id: inputId });
  assert.equal(original?.state, "run");
  assert.ok(original?.state === "run" && ["applied", "read"].includes(original.receipt.state), "the real loop has adopted the person's supplement");
  assert.equal(captured, undefined, "the actual remember callback is still awaiting its source snapshot before Service.write");
  assert.equal((await formal()).length, 0);
  assert.equal((await candidates()).length, 0);
  // The SDK refuses to retract an already-adopted input. Its unchanged
  // receipt must not erase the person's withdrawal of this in-flight use.
  const withdrawnId = scenario === "unrelated" ? (await current.service.read(sent.work.work_id)).rounds.flatMap(round => round.turns)
    .find(turn => turn.text === unrelatedText)!.steer!.id : inputId;
  await assert.rejects(home.web.post<AssistantWorkView>(`/api/assistant/works/${sent.work.work_id}/control`,
    { kind: "withdraw", run_id: sent.run_id!, input_id: withdrawnId }), /这条补充已经放进上下文，撤不回了/);
  const afterRequest = await adapter.inputs!.read!({ session_id: sent.work.session_id!, input_id: inputId });
  assert.ok(afterRequest?.state === "run" && ["applied", "read"].includes(afterRequest.receipt.state));
  gate.resolve();
  const callResult = await completedCall.promise;
  const ended = await untilSetup(async () => {
    const run = await adapter.read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
    return ["completed", "failed", "stopped", "cancelled"].includes(run.phase) ? run : undefined;
  }, "the actual Run settles after the tool returns");
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
  t.diagnostic(JSON.stringify({ finalRun: ended.phase, callResult, ...actual }));
  const kept = scenario === "unrelated" ? 1 : 0;
  if (kept) assert.equal(entries[0]!.text, text, "the latest original supplies both the bound source and the stored wording");
  assert.deepEqual(actual, { formal: kept, ledgerChanges: kept, visible: kept, candidates: 0, candidateProjections: 0,
    restored: kept, restoredChanges: kept, restoredCandidates: 0 });
});
