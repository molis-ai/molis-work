import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, assistantServiceFor, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// MEM-20/31: only hold an existing real Host boundary, after its asynchronous
// check. Every mutation and permission decision still runs the production code.
for (const scope of ["personal", "project"] as const) for (const permission of ["none", "target", "unrelated", "form-off"] as const)
test(`forget ${scope} final commit: ${permission}`, { timeout: 60_000 }, async t => {
  const gate = Promise.withResolvers<void>(); t.after(() => gate.resolve());
  const home = await openTestHome(t), project = await home.createProject("Forget target authority");
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const current = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost,
    agentReady: () => system.ready, projectTitle: async () => null, pages: async () => ["home"] });
  const capability = system.agentHost.adapter("prologue").memory!;
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui" as const, person: true,
    current_scene: "common", purpose: "management" as const };
  const projectBase = `/projects/${project.project_id}`;
  const saved = await home.web.post<MemoryWriteResult>(`${scope === "personal" ? "" : projectBase}/api/memory/items`, { operation_id: randomUUID(), scope, text: "回答用要点列表", kind: "preference" });
  assert.ok(saved.memory);
  const targetId = saved.memory.memory_id;
  const sdkScope = scope === "personal" ? "user" : "project", targetOwner = scope === "personal" ? LOCAL_PERSON_ACTOR_ID : project.project_id;
  const formal = () => capability.withCaller(caller).list(sdkScope, targetOwner);
  const before = (await formal()).find(entry => entry.memory_id === targetId)!;
  assert.equal(before.scope, sdkScope); assert.equal(before.owner, targetOwner); assert.equal(before.disabled, undefined);
  const history = () => { const ledger = openMemoryLedger({ homeDirectory: home.home }); try { return ledger.changes(LOCAL_PERSON_ACTOR_ID, 100); } finally { ledger.close(); } };
  const historyBefore = history();
  let reached = false, changing = false;
  const completedChange = Promise.withResolvers<{ result?: unknown; error?: string }>();
  const change = MemoryService.prototype.change;
  t.mock.method(MemoryService.prototype, "change", async function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    if (args[0].consumer !== "assistant" || args[1].memory_id !== targetId) return change.apply(this, args);
    changing = true;
    try { const result = await change.apply(this, args); completedChange.resolve({ result }); return result; }
    catch (error) { completedChange.resolve({ error: String(error) }); throw error; }
  });
  const withCaller = capability.withCaller.bind(capability);
  t.mock.method(capability, "withCaller", (owner: Parameters<typeof withCaller>[0]) => {
    const bound = withCaller(owner), withExecution = bound.withExecution!.bind(bound);
    bound.withExecution = control => withExecution({
      beforeEffect: async () => { await control.beforeEffect(); if (changing && !reached) { reached = true; await gate.promise; } },
      assert_current: () => control.assert_current(),
    });
    return bound;
  });
  await connectorAssistantModel(t, home.home, (_body, turn) => turn === 1
    ? { name: "forget-memory", input: { memory_id: targetId } } : "已处理。");
  const sent = await home.web.post<AssistantSendResult>(`${projectBase}/api/assistant/send`, { text: "停用刚才的要点列表偏好", request_id: randomUUID() });
  await untilSetup(async () => reached ? true : undefined, "actual forget passed authorization and async Host check");
  assert.deepEqual(await formal(), [before], "the gate precedes the first formal commit");
  assert.deepEqual(history(), historyBefore);
  if (permission !== "none") {
    const changedScope = permission === "unrelated" ? scope === "personal" ? "project" : "personal" : scope;
    await home.web.post(`${changedScope === "personal" ? "" : projectBase}/api/memory/prefs`, { scope: changedScope,
      prefs: permission === "form-off" ? { form: false } : { consumers: { assistant: false } } });
  }
  gate.resolve();
  const result = await completedChange.promise;
  await untilSetup(async () => {
    const run = await system.agentHost.adapter("prologue").read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
    return ["completed", "failed", "stopped", "cancelled"].includes(run.phase) ? true : undefined;
  }, "forget Run settled");
  const after = (await formal()).find(entry => entry.memory_id === targetId)!;
  const historyAfter = history(), visible = (await current.service.memories(project.project_id)).find(entry => entry.memory_id === targetId)!;
  await home.close(); await home.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  let restored: typeof before | undefined, restoredHistory: ReturnType<typeof history> = [];
  let reopenedWeb: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  try {
    // The web entry installs the existing project catalog owner; a bare Host cannot authorize this project caller.
    reopenedWeb = await serveTestHost(null, { home: home.home, host: reopened });
    const again = ensureSystemAgentService(reopened, home.home); await again.ready;
    restored = (await again.agentHost.adapter("prologue").memory!.withCaller(caller).list(sdkScope, targetOwner)).find(entry => entry.memory_id === targetId);
    restoredHistory = history();
  } finally { await reopenedWeb?.close(); await reopened.close(); }
  t.diagnostic(JSON.stringify({ scope, permission, result, versions: [before.version, after.version, restored?.version],
    disabled: [!!after.disabled, visible.disabled, !!restored?.disabled], historyDelta: historyAfter.length - historyBefore.length }));
  if (permission === "target") {
    assert.deepEqual(after, before, "revoked target permission prevents the actual formal mutation");
    assert.deepEqual(historyAfter, historyBefore, "no late history write");
    assert.deepEqual(restored, before); assert.deepEqual(restoredHistory, historyBefore); assert.equal(visible.disabled, false);
  } else {
    assert.ok(after.disabled); assert.ok(restored?.disabled); assert.equal(visible.disabled, true);
    assert.equal(historyAfter.length, historyBefore.length + 1); assert.deepEqual(restoredHistory, historyAfter);
  }
});
