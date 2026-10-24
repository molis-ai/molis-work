import { memoryData } from "./fixtures/current-memory.js";
import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryChangeResult, type MemoryHistoryResponse, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// MEM-04/28/34: actual HTTP -> shared Action -> trusted caller -> Service -> Node owner, with public output validation.
test("classification HTTP commits one version, safely projects history and rejects injected authority or unsupported targets", { timeout: 30_000 }, async t => {
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const saved = (await client.invoke(memoryActions.write, { scope: "personal", text: "A convention to correct", kind: "convention" })).memory!;
  const request = { memory_id: saved.memory_id, expected_version: saved.version, action: "reclassify", kind: "project-decision",
    classification: { scenes: ["common", "coding"], lifecycle: "long-term" }, text: "A corrected decision", applies: { task: "Release review" } };
  const post = (body: unknown) => env.request("/api/memory/change", { method: "POST", body });
  for (const injected of [ { owner: "other-person" }, { namespace: "other-plugin" }, { session_id: "page-claimed-session" },
    { classification: { ...request.classification, extra: { private: ["page-claimed"] } } }, { classification: { scenes: ["unannounced"], lifecycle: "long-term" } },
    { classification: { scenes: ["common"], lifecycle: "session" } }, { kind: undefined }, { classification: undefined } ]) {
    const refused = await post({ ...request, ...injected }); assert.notEqual(refused.status, 200, JSON.stringify(await refused.json()));
  }
  assert.equal((memoryData(await client.invoke(memoryActions.list, {}))).items[0]!.version, saved.version);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: saved.memory_id })).revisions.length, 1);
  const agent = bindActionClient(env.host.homeActionClient(), () => ({ ...person(MEMORY_PERMISSIONS), audience: "agent", actor_kind: "runtime" }));
  await assert.rejects(agent.invoke(memoryActions.change, request as never));
  const response = await post(request), corrected = await response.json() as MemoryChangeResult;
  assert.equal(response.status, 200, JSON.stringify(corrected)); assert.equal(corrected.memory!.kind, "project-decision");
  assert.equal(corrected.memory!.version, saved.version + 1); assert.equal(corrected.memory!.text, request.text); assert.deepEqual(corrected.memory!.applies, request.applies);
  const historyResponse = await env.request(`/api/memory/items/${encodeURIComponent(saved.memory_id)}/history`), history = await historyResponse.json() as MemoryHistoryResponse;
  assert.equal(historyResponse.status, 200, JSON.stringify(history)); assert.equal(history.revisions.length, 2);
  assert.deepEqual(history.revisions.map(one => one.classification?.scenes.toSorted()), [["common"], ["coding", "common"]]);
  assert.ok(history.revisions.every(one => one.snapshot_available)); assert.equal(JSON.stringify(history).includes('"snapshot"'), false);
  const filtered = await env.request(`/api/memory/page?input=${encodeURIComponent(JSON.stringify({ scope: "personal", filter: { kinds: ["project-decision"], scenes: ["coding"] } }))}`);
  const page = await filtered.json() as MemoryPageResponse; assert.equal(filtered.status, 200, JSON.stringify(page)); assert.equal(page.items[0]!.memory_id, saved.memory_id);
  const stale = await post(request); assert.notEqual(stale.status, 200);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: saved.memory_id })).revisions.length, 2);
});

test("classification request identity rejects an HTTP retry with another memory or action", { timeout: 30_000 }, async t => {
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const a = (await client.invoke(memoryActions.write, { scope: "personal", text: "HTTP Alpha memory" })).memory!;
  const b = (await client.invoke(memoryActions.write, { scope: "personal", text: "HTTP Beta memory" })).memory!;
  const operation_id = crypto.randomUUID(), body = { operation_id, memory_id: a.memory_id, expected_version: a.version,
    action: "reclassify", kind: "habit", classification: { scenes: ["common"], lifecycle: "long-term" } };
  const post = (body: unknown) => env.request("/api/memory/change", { method: "POST", body });
  const first = await post(body), firstResult = await first.json() as MemoryChangeResult; assert.equal(first.status, 200, JSON.stringify(firstResult));
  const changedTarget = await post({ ...body, memory_id: b.memory_id, expected_version: b.version });
  assert.notEqual(changedTarget.status, 200, JSON.stringify(await changedTarget.json()));
  const changedAction = await post({ operation_id, memory_id: b.memory_id, expected_version: b.version, action: "remove" });
  assert.notEqual(changedAction.status, 200, JSON.stringify(await changedAction.json()));
  const retried = await post(body), replay = await retried.json() as MemoryChangeResult;
  assert.equal(retried.status, 200, JSON.stringify(replay)); assert.equal(replay.memory!.version, firstResult.memory!.version);
  const items = (memoryData(await client.invoke(memoryActions.list, {}))).items;
  assert.equal(items.find(one => one.memory_id === b.memory_id)!.version, b.version);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: a.memory_id })).revisions.length, 2);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: b.memory_id })).revisions.length, 1);
});
