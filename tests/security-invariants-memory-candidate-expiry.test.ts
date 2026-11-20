import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ServerResponse } from "node:http";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions, MEMORY_READ_PERMISSION, MEMORY_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/memory";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// S-memory-candidate-expiry: the read query has no business effects; only live maintenance can settle expiry.
for (const stop of ["cancel", "revoke"] as const) {
test(`QEA-51/QEA-52 · read-only actions and abandoned Assistant reads never settle expiry; upkeep ${stop} refuses, a new upkeep resumes`, { timeout: 60_000 }, async t => {
  const readEntered = Promise.withResolvers<void>(), readRelease = Promise.withResolvers<void>();
  const writeEntered = Promise.withResolvers<void>(), writeRelease = Promise.withResolvers<void>();
  const readController = new AbortController(), writeController = new AbortController();
  t.after(() => { readController.abort(); writeController.abort(); readRelease.resolve(); writeRelease.resolve(); });
  const home = await openTestHome(t);
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const adapter = system.agentHost.adapter("prologue"), capability = adapter.memory!;
  const manager = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const,
    person: true, current_scene: "common", purpose: "management" as const };
  const read = async () => {
    const memory = capability.withCaller(manager), ledger = openMemoryLedger({ homeDirectory: home.home });
    try { return { canonical: await memory.candidates.list("user", LOCAL_PERSON_ACTOR_ID),
      formal: await memory.list("user", LOCAL_PERSON_ACTOR_ID), notes: ledger.candidates(LOCAL_PERSON_ACTOR_ID),
      changes: ledger.changes(LOCAL_PERSON_ACTOR_ID, 100), markers: ledger.listMarkers(LOCAL_PERSON_ACTOR_ID, { prefix: "memory-operation:", limit: 100 }) }; }
    finally { ledger.close(); }
  };
  const text = "交付时先说明已经验证的结果";
  await connectorAssistantModel(t, home.home, (_body, turn) => turn === 1
    ? { name: "suggest-memory", input: { text, scope: "personal", why: "交付习惯", applies: "交付时" } }
    : "建议等待你决定。", undefined, home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog));
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text, request_id: randomUUID() });
  await untilSetup(async () => {
    const run = await adapter.read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
    return run.phase === "completed" ? run : undefined;
  }, "the real Assistant suggestion completes");
  const before = await read();
  assert.equal(before.canonical.length, 1); assert.equal(before.canonical[0]!.state, "pending");
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 15 * 86_400_000 });
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] };
  const client = home.host.homeActionClient();
  assert.deepEqual(await client.invoke({ ...person, permissions: [MEMORY_READ_PERMISSION] }, memoryActions.candidates, { scope: "personal" }), { candidates: [] });
  assert.deepEqual(await read(), before, "a caller with only read permission causes no SDK or business ledger writes");

  const readFinished = Promise.withResolvers<void>();
  let holdRead = true, holdWrite = false, closed = false;
  const candidates = MemoryService.prototype.candidates;
  t.mock.method(MemoryService.prototype, "candidates", async function (this: MemoryService, ...args: Parameters<typeof candidates>) {
    try { return await candidates.apply(this, args); } finally { readFinished.resolve(); }
  });
  const withCaller = capability.withCaller.bind(capability);
  const observeRead = (bound: ReturnType<typeof withCaller>) => {
    const list = bound.candidates.list.bind(bound.candidates);
    bound.candidates.list = async (...args: Parameters<typeof list>) => {
      const result = await list(...args);
      if (holdRead && args[0] === "user") { holdRead = false; readEntered.resolve(); await readRelease.promise; }
      return result;
    };
    return bound;
  };
  t.mock.method(capability, "withCaller", (owner: Parameters<typeof withCaller>[0]) => {
    const bound = withCaller(owner), withExecution = bound.withExecution!.bind(bound);
    bound.withExecution = control => observeRead(withExecution({ beforeEffect: async () => {
      await control.beforeEffect();
      if (holdWrite) { holdWrite = false; writeEntered.resolve(); await writeRelease.promise; }
    }, assert_current: () => control.assert_current() }));
    return observeRead(bound);
  });
  const path = "/api/assistant/memory-candidates", emit = ServerResponse.prototype.emit;
  t.mock.method(ServerResponse.prototype, "emit", function (this: ServerResponse, event: string | symbol, ...args: unknown[]) {
    const result = emit.call(this, event, ...args);
    if (event === "close" && this.req.url === path && !this.writableEnded) closed = true;
    return result;
  });
  const pending = fetch(home.origin + path, { signal: readController.signal,
    headers: { origin: home.origin, "x-molis-work-control-token": home.controlToken } });
  const abandoned = assert.rejects(pending, { name: "AbortError" });
  await readEntered.promise;
  readController.abort(); await abandoned;
  await untilSetup(async () => closed || undefined, "the server observes the closed read response");
  readRelease.resolve(); await readFinished.promise;
  assert.deepEqual(await read(), before, "finishing an abandoned read cannot settle or repair expiry");

  holdWrite = true;
  let revoked = false;
  const upkeep = client.invoke({ ...person, signal: writeController.signal, validate_authority: reference => {
    if (revoked && reference.capability_id === memoryActions.upkeep.capability_id) throw new ActionError("actions.permission_revoked", "fixture authority revoked");
  } }, memoryActions.upkeep, {});
  const cancelled = assert.rejects(upkeep);
  await writeEntered.promise;
  const ledger = openMemoryLedger({ homeDirectory: home.home });
  const atFence = { ...before, markers: ledger.listMarkers(LOCAL_PERSON_ACTOR_ID, { prefix: "memory-operation:", limit: 100 }) };
  ledger.close();
  if (stop === "cancel") writeController.abort(); else revoked = true;
  writeRelease.resolve(); await cancelled;
  assert.deepEqual(await read(), atFence, "the actual SDK and ledger are unchanged after cancellation at the commit fence");
  assert.equal(atFence.canonical[0]!.state, "pending");
  const resumed = await client.invoke(person, memoryActions.upkeep, {});
  assert.equal(resumed.expired, 0, "a suggestion is not counted as an expired formal memory");
  const after = await read();
  assert.equal(after.canonical[0]!.state, "expired"); assert.equal(after.canonical[0]!.version, 2);
  assert.equal(after.notes[0]!.state, "expired"); assert.equal(after.notes[0]!.version, 2);
  assert.deepEqual(after.formal, []); assert.deepEqual(after.changes, []);
});
}
