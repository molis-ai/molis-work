import { memoryData } from "./fixtures/current-memory.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryChangeResult, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

const START = Date.parse("2026-10-24T08:00:00Z"), DAY = 86_400_000;

// MEM-08/17/28/34: real HTTP -> Action -> trusted caller -> Service -> persistent SDK owner.
test("HTTP renewal keeps the original decision after a lost response, rejects injected authority and does not enable disabled memory", { timeout: 30_000 }, async t => {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const env = await serveHomeRuntime(t), client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  assert.equal(memoryActions.change.version, 4);
  const saved = (await client.invoke(memoryActions.write, { scope: "personal", text: "The original HTTP expiry decision", kind: "convention",
    expires_at: new Date(START + 1000).toISOString() })).memory!;
  const disabled = (await client.invoke(memoryActions.change, { memory_id: saved.memory_id, expected_version: saved.version, action: "disable" })).memory!;
  t.mock.timers.setTime(START + 2000);
  const body = { action: "renew", memory_id: disabled.memory_id, expected_version: disabled.version,
    expires_at: new Date(START + DAY).toISOString(), operation_id: randomUUID() };
  const post = (value: unknown, authorized = true) => env.request("/api/memory/change", { method: "POST", body: value, authorized });
  assert.notEqual((await post(body, false)).status, 200);
  for (const injected of [{ actor_id: "other-person" }, { owner: "other-person" }, { person: true }, { namespace: "foreign-plugin" },
    { session_id: "untrusted-session" }, { expires_at: null }, { expires_at: undefined }, { text: "Mixed edit" }, { expected_version: undefined }]) {
    const response = await post({ ...body, ...injected, operation_id: randomUUID() });
    assert.notEqual(response.status, 200, JSON.stringify(await response.json()));
  }
  const agent = bindActionClient(env.host.homeActionClient(), () => ({ ...person(MEMORY_PERMISSIONS), audience: "agent", actor_kind: "runtime" }));
  await assert.rejects(agent.invoke(memoryActions.change, { memory_id: body.memory_id, expected_version: body.expected_version, action: "renew", expires_at: body.expires_at }));
  const change = MemoryService.prototype.change; let loseReply = true;
  t.mock.method(MemoryService.prototype, "change", async function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    const result = await change.apply(this, args);
    if (args[1].action === "renew" && loseReply) { loseReply = false; throw new Error("Committed response unavailable"); }
    return result;
  });
  const lost = await post(body); assert.notEqual(lost.status, 200);
  const replayResponse = await post(body), replay = await replayResponse.json() as MemoryChangeResult;
  assert.equal(replayResponse.status, 200, JSON.stringify(replay)); assert.equal(replay.memory!.version, disabled.version + 1);
  assert.equal(replay.memory!.expires_at, body.expires_at); assert.equal(replay.memory!.state, "disabled"); assert.equal(replay.memory!.text, saved.text);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: saved.memory_id })).revisions.length, 2);
  const changedExpiry = await post({ ...body, expires_at: new Date(START + 2 * DAY).toISOString() }); assert.equal(changedExpiry.status, 409);
  const changedAction = await post({ memory_id: saved.memory_id, expected_version: disabled.version, action: "remove", operation_id: body.operation_id });
  assert.equal(changedAction.status, 409);
  const pageResponse = await env.request("/api/memory/page?input=" + encodeURIComponent(JSON.stringify({ scope: "personal" })));
  const page = await pageResponse.json() as MemoryPageResponse; assert.equal(pageResponse.status, 200);
  assert.equal(page.items[0]!.expired, false); assert.equal(page.items[0]!.state, "disabled");
  const later = (await client.invoke(memoryActions.change, { action: "update", memory_id: saved.memory_id,
    expected_version: replay.memory!.version, text: "The later HTTP decision" })).memory!;
  const stale = await post(body), staleError = await stale.json() as { code: string };
  assert.equal(stale.status, 409, JSON.stringify(staleError)); assert.equal(staleError.code, "agent.memory_conflict");
  assert.equal((memoryData(await client.invoke(memoryActions.list, {}))).items[0]!.text, later.text);
});

test("project HTTP renewal cannot cross the trusted project or create an unknown formal identity", { timeout: 30_000 }, async t => {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const env = await serveHomeRuntime(t), a = await env.project("Expiry owner A"), b = await env.project("Expiry owner B");
  const client = bindActionClient(env.host.actionClient(a.reference), () => person(MEMORY_PERMISSIONS, a.project_id));
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text: "A project-specific expiry", kind: "convention",
    expires_at: new Date(START + 1000).toISOString() })).memory!;
  t.mock.timers.setTime(START + 2000);
  const body = { memory_id: saved.memory_id, expected_version: saved.version, action: "renew", expires_at: new Date(START + DAY).toISOString(), operation_id: randomUUID() };
  const refused = await env.request(`/projects/${b.project_id}/api/memory/change`, { method: "POST", body });
  assert.notEqual(refused.status, 200, JSON.stringify(await refused.json()));
  const valid = await env.request(`/projects/${a.project_id}/api/memory/change`, { method: "POST", body });
  const result = await valid.json() as MemoryChangeResult; assert.equal(valid.status, 200, JSON.stringify(result));
  assert.equal(result.memory!.memory_id, saved.memory_id); assert.equal(result.memory!.project_id, a.project_id);
  const missing = await env.request(`/projects/${a.project_id}/api/memory/change`, { method: "POST", body: { ...body,
    memory_id: "unknown-formal-ref", operation_id: randomUUID() } });
  assert.notEqual(missing.status, 200); assert.equal((await client.invoke(memoryActions.page, { scope: "project" })).items.length, 1);
});
