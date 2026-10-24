import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryBatchPreview, type MemoryBatchResult, type MemoryPageResponse, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { AgentMemoryCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("overview and filtered HTTP pages share the real bounded Action and never fetch a formal full list", { timeout: 30_000 }, async t => {
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const saved: string[] = [];
  for (let index = 0; index < 43; index++) {
    const result = await client.invoke(memoryActions.write, { scope: "personal", text: `Distinct personal convention number ${index}`, kind: "convention" }) as MemoryWriteResult;
    assert.ok(result.memory); saved.push(result.memory.memory_id);
  }
  const ledger = openMemoryLedger({ homeDirectory: env.home });
  try { ledger.savePair(LOCAL_PERSON_ACTOR_ID, { pair_id: "actual-pending-pair", kind: "conflict", scope: "personal", project_id: null,
    owner: LOCAL_PERSON_ACTOR_ID, state: "pending", a: { memory_id: saved[0]!, text: "Old copy must be re-read", source: "manual" },
    b: { memory_id: saved[1]!, text: "Another old copy", source: "manual" }, why: "Needs a person", created_at: new Date().toISOString() }); }
  finally { ledger.close(); }
  const system = ensureSystemAgentService(env.host, env.home); await system.ready;
  const memory = system.agentHost.adapter("prologue").memory!; let fullLists = 0;
  const observe = (bound: AgentMemoryCapability): AgentMemoryCapability => ({ ...bound,
    withCaller: caller => observe(bound.withCaller(caller)),
    ...(bound.withExecution ? { withExecution: control => observe(bound.withExecution!(control)) } : {}),
    list: async (scope, owner) => { fullLists++; return bound.list(scope, owner); },
  });
  const bind = memory.withCaller.bind(memory);
  t.mock.method(memory, "withCaller", caller => observe(bind(caller)));
  t.mock.method(MemoryService.prototype, "list", async () => { assert.fail("HTTP management must not use the old full list"); });
  let calls = 0; const page = MemoryService.prototype.page;
  t.mock.method(MemoryService.prototype, "page", function(this: MemoryService, ...args: Parameters<MemoryService["page"]>) { calls++; return page.apply(this, args); });
  const response = await env.request("/api/memory/overview?scope=personal"), first = await response.json() as MemoryPageResponse & { labels: { goals: object }; pairs: null };
  assert.equal(response.status, 200, JSON.stringify(first)); assert.equal(first.items.length, 40); assert.ok(first.items.every(item => item.owner === LOCAL_PERSON_ACTOR_ID)); assert.equal(calls, 1);
  assert.equal(first.exhausted, false); assert.deepEqual(first.total, { kind: "unknown" }); assert.deepEqual(first.labels, { goals: {} });
  assert.equal(first.pairs, null); assert.equal(fullLists, 0, "even a nonempty pending pair must not trigger a first-screen full read");
  const next = await env.request(`/api/memory/page?input=${encodeURIComponent(JSON.stringify({ scope: "personal", cursor: first.cursor }))}`);
  const last = await next.json() as MemoryPageResponse;
  assert.equal(next.status, 200, JSON.stringify(last)); assert.equal(last.exhausted, true); assert.equal(calls, 2);
  assert.deepEqual([...first.items, ...last.items].map(item => item.memory_id).sort(), saved.sort());
  const empty = await env.request(`/api/memory/page?input=${encodeURIComponent(JSON.stringify({ scope: "personal", query: "no-matching-body", limit: 1 }))}`);
  const search = await empty.json() as MemoryPageResponse;
  assert.equal(empty.status, 200, JSON.stringify(search)); assert.deepEqual(search.items, []); assert.equal(search.exhausted, false); assert.ok(search.cursor);
  assert.deepEqual(search.total, { kind: "unknown" }); assert.equal(search.scanned, "unknown"); assert.equal(fullLists, 0);
  const pairs = await env.request("/api/memory/pairs?scope=personal"), pairResult = await pairs.json() as { pairs: Array<{ pair_id: string }> };
  assert.equal(pairs.status, 200, JSON.stringify(pairResult)); assert.deepEqual(pairResult.pairs.map(pair => pair.pair_id), ["actual-pending-pair"]);
  assert.ok(fullLists > 0, "only the explicit pair query retains its existing full-read behavior");
});

test("page Action denies non-person or owner injection before the Service and rejects invalid cursor changes", { timeout: 20_000 }, async t => {
  const env = await serveHomeRuntime(t); let calls = 0; const page = MemoryService.prototype.page;
  t.mock.method(MemoryService.prototype, "page", function(this: MemoryService, ...args: Parameters<MemoryService["page"]>) { calls++; return page.apply(this, args); });
  for (const input of [{ owner: "someone-else" }, { scope: "app" }, { limit: 101 }, { filter: { kinds: ["unknown"] } }]) {
    const response = await env.request(`/api/memory/page?input=${encodeURIComponent(JSON.stringify(input))}`);
    assert.notEqual(response.status, 200);
  }
  assert.equal(calls, 0);
  const agent = bindActionClient(env.host.homeActionClient(), () => ({ ...person(MEMORY_PERMISSIONS), audience: "agent", actor_kind: "runtime" }));
  await assert.rejects(agent.invoke(memoryActions.page, { scope: "personal" })); assert.equal(calls, 0);
  const response = await env.request("/api/memory/page?input=%7B"); assert.notEqual(response.status, 200); assert.equal(calls, 0);
  const valid = await env.request("/api/memory/page?input=%7B%7D"), body = await valid.json() as MemoryPageResponse;
  assert.equal(valid.status, 200, JSON.stringify(body)); assert.deepEqual(body.total, { kind: "exact", value: 0 });
});

test("selected batch HTTP exposes incomplete item outcomes and retries the original fixed identities", { timeout: 30_000 }, async t => {
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const add = async (text: string) => (await client.invoke(memoryActions.write, { scope: "personal", text, kind: "convention" }) as MemoryWriteResult).memory!;
  const first = await add("Selected HTTP first"), second = await add("Selected HTTP second");
  const page = await (await env.request("/api/memory/page?input=%7B%7D")).json() as MemoryPageResponse;
  const items = page.items.map(item => ({ scope: item.scope, owner: item.owner, memory_id: item.memory_id, expected_version: item.version }));
  const previewResponse = await env.request("/api/memory/batch/preview", { method: "POST", body: { operation_id: crypto.randomUUID(), action: "disable", items } });
  const preview = await previewResponse.json() as MemoryBatchPreview;
  assert.equal(previewResponse.status, 200, JSON.stringify(preview)); assert.deepEqual(preview.items, items);
  const later = await add("Created after the fixed HTTP preview");
  const change = MemoryService.prototype.change; let interrupt = true;
  t.mock.method(MemoryService.prototype, "change", function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    if (args[1].memory_id === preview.items[1]!.memory_id && interrupt) { interrupt = false; throw new Error("Second child interrupted"); }
    return change.apply(this, args);
  });
  const apply = () => env.request("/api/memory/batch/apply", { method: "POST", body: { preview_id: preview.preview_id, operation_id: crypto.randomUUID() } });
  const partialResponse = await apply(), partial = await partialResponse.json() as MemoryBatchResult;
  assert.equal(partialResponse.status, 200); assert.equal(partial.complete, false);
  assert.deepEqual(partial.items.map(item => item.outcome), ["completed", "unknown"]);
  const result = await (await apply()).json() as MemoryBatchResult;
  assert.equal(result.complete, true); assert.deepEqual(result.items.map(item => item.outcome), ["completed", "completed"]);
  assert.deepEqual(await (await apply()).json(), result);
  const final = await (await env.request("/api/memory/page?input=%7B%7D")).json() as MemoryPageResponse;
  assert.ok(final.items.filter(item => [first.memory_id, second.memory_id].includes(item.memory_id)).every(item => item.state === "disabled"));
  assert.equal(final.items.find(item => item.memory_id === later.memory_id)!.state, "active");
  for (const body of [{ action: "remove", items: Array.from({ length: 101 }, () => items[0]) },
    { action: "remove", items: [{ ...items[0], owner: "foreign-owner" }] }, { action: "remove", items, actor_id: "foreign-owner" }]) {
    assert.notEqual((await env.request("/api/memory/batch/preview", { method: "POST", body })).status, 200);
  }
  const agent = bindActionClient(env.host.homeActionClient(), () => ({ ...person(MEMORY_PERMISSIONS), audience: "agent", actor_kind: "runtime" }));
  await assert.rejects(agent.invoke(memoryActions.batchApply, { preview_id: preview.preview_id }));
  const ungranted = bindActionClient(env.host.homeActionClient(), () => person([]));
  await assert.rejects(ungranted.invoke(memoryActions.batchPreview, { action: "remove", items }));
  await assert.rejects(ungranted.invoke(memoryActions.batchApply, { preview_id: preview.preview_id }));
});
