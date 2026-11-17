import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ServerResponse } from "node:http";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// S-assistant-memory-candidate-cancellation: the normal HTTP card action retains the original execution fence.
for (const decision of ["accept", "discard"] as const) {
  test(`QEA-49 · Assistant candidate ${decision}: HTTP abandonment prevents the held SDK commit and a new decision succeeds`, { timeout: 60_000 }, async t => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const controller = new AbortController();
    t.after(() => { controller.abort(); release.resolve(); });
    const home = await openTestHome(t);
    const system = ensureSystemAgentService(home.host, home.home); await system.ready;
    const adapter = system.agentHost.adapter("prologue"), capability = adapter.memory!;
    const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const,
      person: true, current_scene: "common", purpose: "management" as const };
    const read = async () => {
      const memory = capability.withCaller(caller), ledger = openMemoryLedger({ homeDirectory: home.home });
      try {
        return { formal: await memory.list("user", LOCAL_PERSON_ACTOR_ID),
          candidates: await memory.candidates.list("user", LOCAL_PERSON_ACTOR_ID),
          changes: ledger.changes(LOCAL_PERSON_ACTOR_ID, 100), projections: ledger.candidates(LOCAL_PERSON_ACTOR_ID) };
      } finally { ledger.close(); }
    };
    const text = "交付时先列出已完成事项，再列出待处理问题";
    await connectorAssistantModel(t, home.home, (_body, turn) => turn === 1
      ? { name: "suggest-memory", input: { text, scope: "personal", why: "以后交付时使用", applies: "交付答复时" } }
      : "已整理，记忆建议等待你决定。", undefined, home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog));
    const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text, request_id: randomUUID() });
    await untilSetup(async () => {
      const run = await adapter.read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
      return ["completed", "failed", "stopped", "cancelled"].includes(run.phase) ? run : undefined;
    }, "the real suggestion run completes");
    const before = await read(), candidate = before.candidates.find(item => item.text === text);
    assert.ok(candidate, "the real Assistant tool created the candidate");
    assert.equal(candidate.state, "pending");
    assert.equal(before.formal.length, 0);

    const finished = Promise.withResolvers<{ error?: unknown }>();
    let settling = false, held = false, closed = false, completedClosed = false;
    let signal: AbortSignal | undefined;
    for (const method of ["accept", "discard"] as const) {
      const original = MemoryService.prototype[method];
      t.mock.method(MemoryService.prototype, method, async function (this: MemoryService, ...args: Parameters<typeof original>) {
        if (args[1] !== candidate.candidate_id) return Reflect.apply(original, this, args);
        settling = true; signal = args[0].signal;
        try { const result = await Reflect.apply(original, this, args); finished.resolve({}); return result; }
        catch (error) { finished.resolve({ error }); throw error; }
        finally { settling = false; }
      });
    }
    const withCaller = capability.withCaller.bind(capability);
    t.mock.method(capability, "withCaller", (owner: Parameters<typeof withCaller>[0]) => {
      const bound = withCaller(owner), withExecution = bound.withExecution!.bind(bound);
      bound.withExecution = control => withExecution({
        beforeEffect: async () => { await control.beforeEffect(); if (settling && !held) { held = true; entered.resolve(); await release.promise; } },
        assert_current: () => control.assert_current(),
      });
      return bound;
    });
    const path = `/api/assistant/memory-candidates/${candidate.candidate_id}/${decision}`;
    // Observe the server's real close event, not just the client's rejected fetch.
    const emit = ServerResponse.prototype.emit;
    t.mock.method(ServerResponse.prototype, "emit", function (this: ServerResponse, event: string | symbol, ...args: unknown[]) {
      const result = emit.call(this, event, ...args);
      if (event === "close" && this.req.url === path) {
        if (this.writableEnded) completedClosed = true; else closed = true;
      }
      return result;
    });
    const pending = fetch(`${home.origin}${path}`, { method: "POST", signal: controller.signal,
      headers: { origin: home.origin, "x-molis-work-control-token": home.controlToken,
        "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify({ expected_version: candidate.version }) });
    const abandoned = assert.rejects(pending, { name: "AbortError" });
    await entered.promise;
    controller.abort(); await abandoned;
    await untilSetup(async () => closed || undefined, "the server observes the abandoned HTTP response", 5_000);
    release.resolve();
    const outcome = await finished.promise;
    const after = await read();
    assert.deepEqual(after, before, "no candidate settlement, formal memory or ledger change survives the cancelled invocation");
    assert.equal(signal?.aborted, true);
    assert.ok(outcome.error, "the owner refuses the cancelled commit");

    const result = await home.web.post<{ candidate: { state: string } }>(path, { expected_version: candidate.version });
    assert.equal(result.candidate.state, decision === "accept" ? "accepted" : "discarded");
    await untilSetup(async () => completedClosed || undefined, "the successful response finishes and closes", 5_000);
    assert.equal(signal?.aborted, false, "normal response completion does not cancel a successful call");
    const recovered = await read();
    assert.equal(recovered.candidates.find(item => item.candidate_id === candidate.candidate_id)?.state, result.candidate.state);
    assert.equal(recovered.formal.length, decision === "accept" ? 1 : 0);
    assert.equal(recovered.changes.length - before.changes.length, decision === "accept" ? 1 : 0);
    assert.equal(recovered.projections.find(item => item.candidate_id === candidate.candidate_id)?.state, result.candidate.state);
  });
}
