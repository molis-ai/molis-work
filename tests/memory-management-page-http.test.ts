import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryPageResponse, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
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

// MEM-22/23/28: complete public output validation, including a duplicate with a different formal kind.
test("HTTP duplicate saves return the six-kind formal item and all superseded Action versions refuse", { timeout: 30_000 }, async t => {
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  for (const kind of ["habit", "project-decision"] as const) {
    const text = `Classified formal text ${kind}`;
    const saved = await client.invoke(memoryActions.write, { scope: "personal", text, kind: "convention" }) as MemoryWriteResult;
    const change = await env.request("/api/memory/change", { method: "POST", body: { memory_id: saved.memory!.memory_id,
      action: "reclassify", expected_version: saved.memory!.version, kind, classification: { scenes: ["common"], lifecycle: "long-term" }, operation_id: crypto.randomUUID() } });
    const corrected = await change.json() as { memory: { version: number }; error?: string };
    assert.equal(change.status, 200, JSON.stringify(corrected));
    const duplicate = await env.request("/api/memory/items", { method: "POST", body: { scope: "personal", text, kind: "convention", operation_id: crypto.randomUUID() } });
    const result = await duplicate.json() as MemoryWriteResult;
    assert.equal(duplicate.status, 200, JSON.stringify(result)); assert.equal(result.outcome, "duplicate");
    assert.equal(result.memory!.memory_id, saved.memory!.memory_id); assert.equal(result.memory!.kind, kind); assert.equal(result.memory!.version, corrected.memory.version);
  }
  // Versions restarted at one (unified start); any version other than the current one is refused, never routed to it.
  const other = [ [memoryActions.recall, {}], [memoryActions.list, {}], [memoryActions.write, { scope: "personal", text: "Another version must refuse" }],
    [memoryActions.change, { memory_id: "any", expected_version: 1, action: "disable" }], [memoryActions.history, { memory_id: "any" }],
    [memoryActions.accept, { candidate_id: "any", expected_version: 1 }] ] as const;
  for (const [definition, input] of other) await assert.rejects(client.invoke({ ...definition, version: definition.version + 1 }, input));
  assert.equal((await (await env.request("/api/memory/overview?scope=personal")).json() as MemoryPageResponse).items.length, 2);
});

test("B4 selected batch and discovery use the actual protected HTTP Actions and reject foreign owner input", { timeout: 30_000 }, async t => {
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const saved = (await client.invoke(memoryActions.write, { scope: "personal", text: "HTTP选中批量真实正文", kind: "preference" })).memory!;
  const input = { scope: "personal", action: "disable", items: [{ memory_id: saved.memory_id, expected_version: saved.version }] };
  const refused = await env.request("/api/memory/batch/preview", { method: "POST", body: { ...input, owner: "someone-else" } });
  assert.notEqual(refused.status, 200);
  const response = await env.request("/api/memory/batch/preview", { method: "POST", body: input });
  const preview = await response.json() as { preview_id: string }; assert.equal(response.status, 200, JSON.stringify(preview));
  const applied = await env.request("/api/memory/batch/apply", { method: "POST", body: { preview_id: preview.preview_id } });
  const done = await applied.json() as { complete: boolean }; assert.equal(applied.status, 200, JSON.stringify(done)); assert.equal(done.complete, true);
  assert.notEqual((await env.request("/api/memory/operations?scope=app")).status, 200);
  const operations = await env.request("/api/memory/operations?scope=personal");
  assert.equal(operations.status, 200); assert.equal(JSON.stringify(await operations.json()).includes(saved.text), false);
  const agent = bindActionClient(env.host.homeActionClient(), () => ({ ...person(MEMORY_PERMISSIONS), audience: "agent", actor_kind: "runtime" }));
  await assert.rejects(agent.invoke(memoryActions.operations, { scope: "personal" }));
});
