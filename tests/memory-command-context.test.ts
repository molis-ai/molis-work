import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// MEM-20: use the real HTTP envelope, action gateway and SDK writer, not an internal parser export.
test("Memory retries preserve their operation identity while HTTP calls and authority remain independent", { timeout: 20_000 }, async t => {
  const env = await serveHomeRuntime(t), seen: MemoryCaller[] = [];
  const write = MemoryService.prototype.write;
  t.mock.method(MemoryService.prototype, "write", function(this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
    seen.push(args[0]); return write.apply(this, args);
  });
  const operation_id = randomUUID(), body = { operation_id, scope: "personal", text: "Keep summaries concise.", kind: "preference" };
  const first = await env.request("/api/memory/items", { method: "POST", body });
  const saved = await first.json() as MemoryWriteResult;
  assert.equal(first.status, 200, JSON.stringify(saved)); assert.ok(saved.memory);
  const second = await env.request("/api/memory/items", { method: "POST", body: structuredClone(body) });
  const retried = await second.json() as MemoryWriteResult;
  assert.equal(second.status, 200, JSON.stringify(retried));
  assert.equal(retried.memory?.memory_id, saved.memory.memory_id);
  assert.equal(retried.memory?.version, saved.memory.version);
  assert.equal(seen[0]!.operation_id, operation_id); assert.equal(seen[1]!.operation_id, operation_id);
  assert.equal(seen[0]!.person, true); assert.equal(seen[1]!.person, true);
  const firstCall = first.headers.get("x-molis-work-call-id"), secondCall = second.headers.get("x-molis-work-call-id");
  assert.ok(firstCall); assert.ok(secondCall); assert.notEqual(firstCall, secondCall);
  assert.notEqual(firstCall, operation_id); assert.notEqual(secondCall, operation_id);
  const unprivileged = bindActionClient(env.host.homeActionClient(), () => ({ ...person(MEMORY_PERMISSIONS), audience: "agent", actor_kind: "runtime", call_id: "unprivileged-command" }));
  await assert.rejects(unprivileged.invoke(memoryActions.write, { scope: "personal", text: "May not claim a person." }), /原话/);
  assert.equal(seen.at(-1)!.person, false); assert.equal(seen.at(-1)!.operation_id, "unprivileged-command");
  const changed = await env.request("/api/memory/items", { method: "POST", body: { ...body, text: "Changed command must be rejected." } });
  assert.notEqual(changed.status, 200);
  const list = await env.request("/api/memory/overview?scope=personal");
  const overview = await list.json() as { items: Array<{ text: string }> };
  assert.equal(list.status, 200, JSON.stringify(overview));
  assert.deepEqual(overview.items.map(item => item.text), [body.text]);
});

test("invalid HTTP Memory identities fail before dispatch and an aborted request cancels the live writer", { timeout: 20_000 }, async t => {
  const env = await serveHomeRuntime(t);
  let calls = 0, entered!: (caller: MemoryCaller) => void, settled!: (error: unknown) => void;
  const held = new Promise<MemoryCaller>(resolve => { entered = resolve; });
  const finished = new Promise<unknown>(resolve => { settled = resolve; });
  const write = MemoryService.prototype.write;
  t.mock.method(MemoryService.prototype, "write", async function(this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
    calls++; const caller = args[0];
    assert.ok(caller.signal, "the actual transport cancellation must reach the Memory writer");
    entered(caller);
    if (!caller.signal.aborted) await new Promise<void>(resolve => caller.signal!.addEventListener("abort", () => resolve(), { once: true }));
    try { const result = await write.apply(this, args); settled(undefined); return result; }
    catch (error) { settled(error); throw error; }
  });
  for (const operation_id of ["", "../target", 1, {}, "a".repeat(1000)]) {
    const reply = await env.request("/api/memory/items", { method: "POST", body: { operation_id, scope: "personal", text: "Must not be saved." } });
    assert.notEqual(reply.status, 200);
    assert.equal((await reply.json() as { code: string }).code, "memory.invalid");
  }
  assert.equal(calls, 0);
  const controller = new AbortController();
  const request = env.request("/api/memory/items", { method: "POST", signal: controller.signal,
    body: { operation_id: randomUUID(), scope: "personal", text: "Cancelled before saving." } });
  const rejected = assert.rejects(request, /abort/i);
  const caller = await held; controller.abort(); await rejected;
  if (!caller.signal!.aborted) await new Promise<void>(resolve => caller.signal!.addEventListener("abort", () => resolve(), { once: true }));
  assert.throws(() => caller.signal!.throwIfAborted());
  assert.ok(await finished, "the production writer must reject after cancellation before the persisted state is checked");
  const overview = await env.request("/api/memory/overview?scope=personal");
  const empty = await overview.json() as { items: unknown[] };
  assert.equal(overview.status, 200, JSON.stringify(empty)); assert.deepEqual(empty.items, []);
});
