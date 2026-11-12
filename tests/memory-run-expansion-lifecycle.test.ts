import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { ensureSystemAgentService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { grantMcpAction } from "@molis-ai/molis-work-test-kit/local-host-http";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

type Request = CodingProviderRequest & { tools?: Array<{ name: string; description?: string }> };
type Fixture = Awaited<ReturnType<typeof codingProductHost>>;
const actionRef = (definition = memoryActions.list) => ({ capability_id: definition.capability_id, version: definition.version, provider_id: MEMORY_PROVIDER_ID });
const person = (f: Fixture) => bindActionClient(f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: f.project.project_id })),
  () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
async function allowFacts(manager: ReturnType<typeof person>) {
  for (const scope of ["personal", "project"] as const) await manager.invoke(memoryActions.savePrefs, { scope,
    prefs: { plugins: { "io.molis.work.coding": { allowed: true, kinds: ["fact", "convention"] } } } });
}
const receipts = (request: Request): Array<{ outcome: string; tokens: number; remainingTokens: number; receiptId: string; basis: string }> => request.messages.flatMap(message =>
  Array.isArray(message.content) ? message.content.filter(block => block.type === "tool_result").map(block => JSON.parse((block as { content: string }).content)) : []);
async function start(f: Fixture, task: string, definition = memoryActions.list) {
  const action = actionRef(definition);
  await grantMcpAction(f.web, { clientId: "agent:prologue", projectId: null, action });
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, "/api/plugins/io.molis.work.coding/sessions", { title: task });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const result = await f.call<{ run: AgentRunView }>(f.project.project_id, `/api/plugins/io.molis.work.coding/sessions/${created.body.session.session_id}/runs`, {
    intent: "discuss", task, workspace_id: f.workspaceId, action_tools: [action], provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.run;
}
function scripted(seen: Request[], definition = memoryActions.list, count = 1, beforeFirst?: () => Promise<void>) {
  return async (given: CodingProviderRequest) => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    seen.push(request);
    if (seen.length === 1) await beforeFirst?.();
    if (seen.length <= count) {
      const tool = request.tools?.find(item => item.name.startsWith("molis-action-") && item.description?.includes(definition.action.title));
      assert.ok(tool);
      return cogniaScriptedResponse({ name: tool.name, input: definition.capability_id === memoryActions.list.capability_id
        ? { scope: "project", query: "EXPLICIT_PAYLOAD" } : { scopes: ["project"], query: "EXPLICIT_PAYLOAD" } });
    }
    return cogniaScriptedResponse(undefined, "已核对完成。");
  };
}

for (const definition of [memoryActions.list, memoryActions.recall]) test(`C1 ${definition.capability_id}: explicit-only classification selects through the actual SDK and only Context records use`, { timeout: 40_000 }, async t => {
  const seen: Request[] = [], f = await codingProductHost(t, scripted(seen, definition), { loopbackProvider: true }), manager = person(f);
  await allowFacts(manager);
  const kept = await manager.invoke(memoryActions.write, { scope: "project", kind: "fact", text: "EXPLICIT_PAYLOAD: BODY_ONLY_FROM_CONTEXT" });
  assert.ok(kept.memory);
  await manager.invoke(memoryActions.savePrefs, { scope: "project", prefs: { class_restrictions: [{
    selector: { consumer: "agent", current_scene: "coding", kind: "fact" }, read: "explicit-only", form: "inherit",
  }] } });
  const handle = await start(f, "核对这个项目的所选能力", definition), view = await f.ended(handle.ref);
  assert.equal(view.phase, "completed", view.stop_reason ?? ""); assert.equal(seen.length, 2);
  assert.doesNotMatch(JSON.stringify(seen[0]), /BODY_ONLY_FROM_CONTEXT/);
  assert.doesNotMatch(JSON.stringify(receipts(seen[1]!)), /BODY_ONLY_FROM_CONTEXT/);
  assert.match(JSON.stringify(seen[1]!.messages), /BODY_ONLY_FROM_CONTEXT/);
  assert.equal(receipts(seen[1]!)[0]!.outcome, "queued");
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try {
    const uses = ledger.uses({ memory_id: kept.memory.memory_id }); assert.ok(uses.length);
    assert.ok(uses.every(use => use.source === "run-context" && use.state !== "returned"));
    assert.ok(uses.some(use => use.run?.run_id === handle.ref.run_id && use.state === "response-observed"));
  } finally { ledger.close(); }
  const read = await manager.invoke(memoryActions.list, { scope: "project" }); assert.match(read.items[0]!.text, /BODY_ONLY_FROM_CONTEXT/);
});

test("C1 actual task + test-selected resident + expansion share one budget and repeated refs spend zero again", { timeout: 40_000 }, async t => {
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  const seen: Request[] = [], f = await codingProductHost(t, scripted(seen, memoryActions.list, 2, async () => { reached.resolve(); await release.promise; }), { loopbackProvider: true });
  const manager = person(f); await allowFacts(manager);
  const task = await manager.invoke(memoryActions.write, { scope: "personal", kind: "fact", text: "发布 检查 共享 预算：TASK_SHARED_ALLOWANCE" });
  const resident = await manager.invoke(memoryActions.write, { scope: "personal", kind: "fact", text: "RESIDENT_SHARED_ALLOWANCE" }); assert.ok(resident.memory && task.memory);
  const forRun = MemoryService.prototype.forRun;
  t.mock.method(MemoryService.prototype, "forRun", async function(this: MemoryService, ...args: Parameters<typeof forRun>) {
    const recipe = await forRun.apply(this, args); if (!recipe) return recipe;
    return { ...recipe, budget_tokens: 800, pinned: [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID, memory_id: resident.memory!.memory_id, version: resident.memory!.version }] };
  });
  const starting = start(f, "发布 检查 共享 预算"); await reached.promise;
  assert.match(JSON.stringify(seen[0]), /TASK_SHARED_ALLOWANCE/); assert.match(JSON.stringify(seen[0]), /RESIDENT_SHARED_ALLOWANCE/);
  for (const text of ["EXPLICIT_PAYLOAD short", ...["A", "B", "C", "D", "E", "F", "G", "H"].map(key => "EXPLICIT_PAYLOAD large" + key + " " + key.repeat(310))])
    await manager.invoke(memoryActions.write, { scope: "project", kind: "fact", text });
  release.resolve(); const handle = await starting, view = await f.ended(handle.ref);
  assert.equal(view.phase, "completed", view.stop_reason ?? ""); assert.equal(seen.length, 3);
  const first = receipts(seen[1]!)[0]!, second = receipts(seen[2]!).at(-1)!;
  assert.equal(first.outcome, "queued");
  assert.equal(Object.hasOwn(first, "queued"), false); assert.equal(Object.hasOwn(first, "omitted"), false);
  const expansion = view.memory_recalled!.contexts!.filter(one => one.references.some(ref => ref.receipt_id.includes("expand")));
  assert.ok(expansion.length, "actual explicit Context dispatch is recorded");
  const initial = view.memory_recalled!.contexts![0]!.tokens;
  assert.ok(initial > 0 && first.tokens > 0); assert.equal(initial + first.tokens + first.remainingTokens, 800);
  assert.equal(second.outcome, "none"); assert.equal(second.tokens, 0); assert.equal(second.remainingTokens, first.remainingTokens);
  for (const request of seen.slice(1)) assert.doesNotMatch(JSON.stringify(receipts(request)), /largeA|largeB|EXPLICIT_PAYLOAD/);
});

// MEM-29: an entry that expires while a selection waits leaves the Run at once; it is never delivered stale.
for (const change of ["disable", "remove", "expire", "revoke", "cancel"] as const) test(`C1 selection waiting then ${change} never delivers stale memory`, { timeout: 40_000 }, async t => {
  const selected = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  const seen: Request[] = [], f = await codingProductHost(t, scripted(seen), { loopbackProvider: true }), manager = person(f);
  const actionClient = f.host.actionClient.bind(f.host);
  t.mock.method(f.host, "actionClient", (...args: Parameters<typeof actionClient>) => {
    const client = actionClient(...args);
    return { ...client, invoke: async (...call: Parameters<typeof client.invoke>) => {
      const result = await client.invoke(...call);
      // The Host client has released its outer action queue before holding this Run-only delivery.
      if (call[0].memory_context_selection && call[1].capability_id === memoryActions.list.capability_id) { selected.resolve(); await release.promise; }
      return result;
    } };
  });
  await allowFacts(manager);
  const expires = Date.now() + 3000;
  const kept = await manager.invoke(memoryActions.write, { scope: "project", kind: "fact", text: "EXPLICIT_PAYLOAD: STALE_BODY_NEVER_SENT", ...(change === "expire" ? { expires_at: new Date(expires).toISOString() } : {}) }); assert.ok(kept.memory);
  const handle = await start(f, "核对这个项目的所选能力"); await Promise.race([selected.promise, f.ended(handle.ref).then(view => { throw new Error("Run ended before selection: " + JSON.stringify(view.activity)); })]);
  if (change === "revoke") await manager.invoke(memoryActions.savePrefs, { scope: "project", prefs: { class_restrictions: [{
    selector: { consumer: "agent", current_scene: "coding", kind: "fact" }, read: "off", form: "inherit",
  }] } });
  else if (change === "expire") await new Promise(resolve => setTimeout(resolve, Math.max(0, expires - Date.now() + 30)));
  else if (change === "cancel") await ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue").control(handle.ref, { kind: "cancel" });
  else await manager.invoke(memoryActions.change, { memory_id: kept.memory.memory_id, expected_version: kept.memory.version, action: change });
  release.resolve(); const view = await f.ended(handle.ref);
  assert.equal(view.phase, change === "cancel" ? "cancelled" : "completed", view.stop_reason ?? "");
  assert.doesNotMatch(JSON.stringify(seen), /STALE_BODY_NEVER_SENT/);
  if (change === "revoke" || change === "remove") assert.equal(JSON.stringify(seen).includes(kept.memory.memory_id), false, "a rejected old selection must not disclose even its canonical identity to the model");
  assert.deepEqual(view.memory_recalled?.injected ?? [], []);
});
