import { RegistryFallbackSessionAdapter } from "@molis-ai/molis-work-plugin-work";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCompleteRuntimeSessionCapabilities,
  CodexRuntimeSessionAdapter,
  RuntimeHostRouter,
} from "@molis-ai/molis-work-service-runtime-host";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

function definitelyRejected(message: string): Error {
  return Object.assign(new Error(message), { deliveryAccepted: false, retryable: true });
}
import { RUNTIME_SESSION_CAPABILITIES, type RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";

test("Codex Adapter declares every capability and routes only through verified app-server methods", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let eventListener: ((event: { method: string; params: unknown }) => void) | null = null;
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      return { method, params };
    },
    subscribe(listener) {
      eventListener = listener;
      return () => { eventListener = null; };
    },
  };
  const adapter = new CodexRuntimeSessionAdapter(transport);
  assertCompleteRuntimeSessionCapabilities(adapter.capabilities);
  assert.deepEqual(Object.keys(adapter.capabilities).sort(), [...RUNTIME_SESSION_CAPABILITIES].sort());

  for (const [capability, method] of [
    ["create", "thread/start"],
    ["list", "thread/list"],
    ["discover", "thread/list"],
    ["read", "thread/read"],
    ["resume", "thread/resume"],
  ] as const) {
    const result = await adapter.invoke(capability, capability === "read"
      ? { threadId: "thread-loop" }
      : { marker: capability });
    assert.equal(result.status, "ok");
    assert.equal(calls.at(-1)?.method, method);
  }
  const handoff = await adapter.invoke("handoff", {
    prompt: "HANDOFF PACKAGE",
    threadStart: { cwd: "/tmp/project" },
  });
  assert.equal(handoff.status, "failed", "the fixture must expose a missing native thread id instead of faking success");
  if (handoff.status === "failed") {
    assert.equal(handoff.recovery?.phase, "create");
    assert.equal(handoff.recovery?.retryable, false);
  }
  assert.equal(calls.at(-1)?.method, "thread/start");
  const events = await adapter.invoke("events", { listener: () => undefined });
  assert.equal(events.status, "ok");
  assert.equal(typeof eventListener, "function");
});

test("unknown Runtime uses honest registry fallback without Runtime-name branching", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-adapter-"));
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    const created = await router.invoke("future-runtime", "create", {
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      title: "Fallback Session",
    });
    assert.equal(created.status, "ok");
    if (created.status !== "ok") return;
    assert.equal(created.source, "registry");

    const listed = await router.invoke("future-runtime", "list", { project_id: "project-a" });
    assert.equal(listed.status, "ok");
    if (listed.status === "ok") assert.equal((listed.value as unknown[]).length, 1);

    for (const capability of ["discover", "read", "resume", "events", "handoff"] as const) {
      const result = await router.invoke("future-runtime", capability, {});
      assert.equal(result.status, "unsupported");
      if (result.status === "unsupported") assert.equal(result.code, "runtime.capability_unavailable");
    }
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex read uses metadata plus a bounded newest-first summary page", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: { id: "thread-paged", title: "Paged", turns: [] } };
      if (method === "thread/turns/list") {
        return {
          nextCursor: "older",
          data: [
            { id: "turn-new", status: "completed", itemsView: "summary", items: [] },
            { id: "turn-old", status: "completed", itemsView: "summary", items: [] },
          ],
        };
      }
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  });

  const result = await adapter.invoke("read", { threadId: "thread-paged", includeTurns: true });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(calls, [
    { method: "thread/read", params: { threadId: "thread-paged", includeTurns: false } },
    {
      method: "thread/turns/list",
      params: { threadId: "thread-paged", limit: 50, sortDirection: "desc", itemsView: "summary" },
    },
  ]);
  const value = result.value as {
    thread: { turns: Array<{ id: string }> };
    molis_work_history_page: { mode: string; turn_count: number; has_earlier: boolean };
  };
  assert.deepEqual(value.thread.turns.map((turn) => turn.id), ["turn-old", "turn-new"]);
  assert.deepEqual(value.molis_work_history_page, { mode: "summary", turn_count: 2, has_earlier: true });
});

test("Adapter failures stay failed instead of becoming empty native results", async () => {
  const adapter = new CodexRuntimeSessionAdapter({
    async request() { throw new Error("app-server unavailable"); },
    subscribe() { throw new Error("event stream unavailable"); },
  });
  const read = await adapter.invoke("read", { threadId: "thread-a" });
  assert.equal(read.status, "failed");
  if (read.status === "failed") assert.match(read.message, /app-server unavailable/);
  const events = await adapter.invoke("events", { listener: () => undefined });
  assert.equal(events.status, "failed");
});

test("Codex Handoff creates a new thread, delivers the package, and retries delivery without another thread", async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let failDelivery = true;
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/start") return { thread: { id: "thread-handoff-target" } };
      if (method === "turn/start" && failDelivery) throw definitelyRejected("turn unavailable");
      if (method === "turn/start") return { turn: { id: "turn-handoff-target" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  });

  const first = await adapter.invoke("handoff", {
    prompt: "HANDOFF PACKAGE",
    threadStart: { cwd: "/tmp/project" },
  });
  assert.equal(first.status, "failed");
  if (first.status === "failed") {
    assert.equal(first.recovery?.phase, "deliver");
    assert.equal(first.recovery?.native_runtime_session_id, "thread-handoff-target");
  }
  assert.deepEqual(calls.map((item) => item.method), ["thread/start", "turn/start"]);
  assert.deepEqual(calls[1]?.params.input, [{ type: "text", text: "HANDOFF PACKAGE", text_elements: [] }]);

  failDelivery = false;
  const retried = await adapter.invoke("handoff", {
    prompt: "EDITED PACKAGE",
    existingThreadId: "thread-handoff-target",
    threadStart: { cwd: "/tmp/ignored" },
  });
  assert.equal(retried.status, "ok");
  assert.deepEqual(calls.map((item) => item.method), ["thread/start", "turn/start", "turn/start"]);
  assert.equal(calls[2]?.params.threadId, "thread-handoff-target");
});

test("Codex Handoff does not automatically retry an ambiguous delivery error", async () => {
  const adapter = new CodexRuntimeSessionAdapter({
    async request(method) {
      if (method === "turn/start") throw new Error("connection closed after write");
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  });
  const result = await adapter.invoke("handoff", {
    prompt: "HANDOFF PACKAGE",
    existingThreadId: "thread-ambiguous-target",
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.recovery?.phase, "deliver");
    assert.equal(result.recovery?.native_runtime_session_id, "thread-ambiguous-target");
    assert.equal(result.recovery?.retryable, false);
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
