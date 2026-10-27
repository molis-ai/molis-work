import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentHost, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunHandle, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.opening-projection", appVersion: "1.0.0" };
const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installation", actor_id: "person" };
const legacy = { kind: "run" as const, id: "legacy-opening", revision: 1 };
const FIRST = "CALLER_ORIGINAL_TASK", EXTRA = "UNATTRIBUTED_OLD_OPENING", NEXT = "NEXT_TASK";
const notice = "本轮未带入部分无法确认来源的旧开场内容，可能缺少背景；原会话记录仍保留供查看。";
const kind = `molis-agent-index-${createHash("sha256").update(app.appId).digest("hex").slice(0, 24)}`;
type FixtureIndex = { owner: typeof owner; parent_run?: { session_id: string; run_id: string };
  attempts: Array<{ frozen: Record<string, unknown>; task?: string; refused?: { code: string; at: string }; [key: string]: unknown }> };
const role = { role_id: "reader", version: 1, workspace: "none" as const, execution: "read-only" as const, host_tools: [], prompts: [] };

async function finished(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, handle: AgentRunHandle): Promise<AgentRunView> {
  const until = Date.now() + 15_000;
  for (;;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
      assert.equal(view.phase, "completed", view.stop_reason);
      return view;
    }
    if (Date.now() >= until) assert.fail("Run did not finish");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** Real Node storage and the public Session adoption boundary retain the old ledger shape; no SDK internals are imported. */
async function fixture(t: TestContext, history: "digest" | "session" = "digest") {
  const storageRoot = await mkdtemp(join(tmpdir(), "molis-session-opening-")), requests: string[] = [];
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  const releaseReads: Array<() => void> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    requests.push(raw); // Every real model request, including any unintended background call, is counted.
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"model":"scripted","choices":[{"index":0,"delta":{"content":"CURRENT_REPLY"},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
  });
  t.after(async () => {
    for (const release of releaseReads) release();
    await adapter?.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(storageRoot, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  let deleting = false;
  const open = () => createPrologueNodeAdapter({ app, storageRoot, projectDeletionPending: () => deleting,
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  adapter = await open();
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: role.role_id, title: "Original caller task" });
  await adapter.close(); adapter = undefined;

  const host = createNodeHost({ storageRoot });
  const runtime = await createRuntime({ app, host, preset: "local-agent" }).catch(async error => { await host.storage.close?.(); throw error; });
  let before: string;
  try {
    const saved = await runtime.sessions.open({ kind: "session", id: session.session_id, revision: 1 }); assert.ok(saved);
    await saved.adoptRun(legacy, [
      ...(history === "digest" ? [{ type: "prompt" as const, role: "user" as const, text: EXTRA, atMs: 1 }] : []),
      { type: "prompt", role: "user", text: FIRST, atMs: 1 },
      { type: "prompt", role: "user", text: "IDENTIFIED_PEER", source: "peer", atMs: 1 },
      { type: "text-delta", text: "OLD_ASSISTANT_BEFORE" },
      { type: "tool-call", call: { id: "legacy-read", name: "read", input: { path: "old.txt" } } },
      { type: "tool-result", callId: "legacy-read", name: "read", text: "OLD_TOOL_RESULT" },
      { type: "text-delta", text: "OLD_ASSISTANT_AFTER" }, { type: "completed" },
    ]);
    before = JSON.stringify(await saved.replay(legacy));
    const record = await host.storage.get({ kind, id: session.session_id }); assert.ok(record);
    const bytes = await host.storage.readSecure({ kind, id: session.session_id });
    const index = JSON.parse(new TextDecoder().decode(bytes)) as FixtureIndex; bytes.fill(0);
    index.attempts.push({ run_id: legacy.id, task: FIRST, started_at: "2026-09-19T00:00:00.000Z", frozen: {
      role_id: role.role_id, role_version: role.version, execution: role.execution, model_id: "scripted", workspace: "none",
      prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, ...(history === "digest" ? { history } : {}),
    } });
    const secureBody = new TextEncoder().encode(JSON.stringify(index));
    try { await host.storage.commit({ kind, id: session.session_id, expectedVersion: record.version, metadata: { schema: 1 }, secureBody }); }
    finally { secureBody.fill(0); }
  } finally { await runtime.shutdown(); }

  return {
    requests, session,
    async mutate(change: (saved: FixtureIndex) => void) {
      assert.equal(adapter, undefined, "corruption fixtures are prepared before opening the production adapter");
      const inspector = createNodeHost({ storageRoot });
      try {
        const record = await inspector.storage.get({ kind, id: session.session_id }); assert.ok(record);
        const bytes = await inspector.storage.readSecure({ kind, id: session.session_id });
        const index = JSON.parse(new TextDecoder().decode(bytes)) as FixtureIndex; bytes.fill(0); change(index);
        const secureBody = new TextEncoder().encode(JSON.stringify(index));
        try { await inspector.storage.commit({ kind, id: session.session_id, expectedVersion: record.version, metadata: { schema: 1 }, secureBody }); }
        finally { secureBody.fill(0); }
      } finally { await inspector.storage.close?.(); }
    },
    async start() {
      adapter ??= await open();
      return adapter.start({ ...owner, session, workspace: "none", role_id: role.role_id, role, task: NEXT, history: "session" });
    },
    async startThroughHost() {
      adapter ??= await open();
      const service = new AgentHost(); service.register(adapter);
      return service.start(session.runtime_id, { ...owner, session, workspace: "none", role_id: role.role_id, task: NEXT, history: "session" },
        { manifest: { roles: [role] }, authorizedDirectories: [] });
    },
    async lifecycle() { adapter ??= await open(); return adapter.sessionLifecycle!.read(session, owner); },
    async archive(version: number) {
      assert.ok(adapter);
      return adapter.sessionLifecycle!.archive(session, { operation_id: "archive-during-opening", expected_version: version, expected_state: "active" }, owner);
    },
    async holdOpeningRead() {
      const inspector = createNodeHost({ storageRoot }), storage = inspector.storage;
      const prototype = Object.getPrototypeOf(storage);
      const commit = storage.commit, get = storage.get, readSecure = storage.readSecure;
      await storage.close?.();
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      releaseReads.push(() => release.resolve());
      const phases: string[] = [];
      let intent = false, history = false, held = false;
      // Observe real public storage operations. The main start commits its pending intent, then
      // creates the Reader and enters SDK Session history. The next App-index body is that Reader's
      // original lookup; earlier recovery and Memory-authority reads cannot arm this barrier.
      t.mock.method(prototype, "commit", async function(this: typeof storage, input: { kind: string; id: string; secureBody?: Uint8Array }) {
        const pending = input.kind === kind && input.id === session.session_id && input.secureBody
          && (JSON.parse(new TextDecoder().decode(input.secureBody)) as FixtureIndex).attempts.some(row => row.task === NEXT && row.run_id === undefined);
        const result = await commit.call(this, input);
        if (pending && !intent) { intent = true; phases.push("pending-intent-committed"); }
        return result;
      });
      t.mock.method(prototype, "get", async function(this: typeof storage, input: { kind: string; id: string }) {
        const result = await get.call(this, input);
        if (intent && !history && input.kind === `${app.appId}~sessions` && input.id === session.session_id) {
          history = true; phases.push("sdk-session-read");
        }
        return result;
      });
      t.mock.method(prototype, "readSecure", async function(this: typeof storage, input: { kind: string; id: string }) {
        const bytes = await readSecure.call(this, input);
        if (history && !held && input.kind === kind && input.id === session.session_id) {
          held = true; phases.push("original-index-read-held"); entered.resolve(); await release.promise;
        }
        return bytes;
      });
      return { phases, release: () => release.resolve(), async reached(starting: Promise<AgentRunHandle>) {
        await Promise.race([entered.promise, starting.then(() => assert.fail("start finished without reading its original opening"))]);
        assert.deepEqual(phases, ["pending-intent-committed", "sdk-session-read", "original-index-read-held"]);
      } };
    },
    async finish(handle: AgentRunHandle) { assert.ok(adapter); return finished(adapter, handle); },
    async reopen(handle: AgentRunHandle) {
      await adapter?.close(); adapter = await open(); return adapter.read(handle.ref);
    },
    async checkOriginal() {
      await adapter?.close(); adapter = undefined;
      const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot }), preset: "local-agent" });
      try {
        const saved = await runtime.sessions.open({ kind: "session", id: session.session_id, revision: 1 }); assert.ok(saved);
        assert.equal(JSON.stringify(await saved.replay(legacy)), before, "the original ledger is not rewritten");
      } finally { await runtime.shutdown(); }
    },
    blockProject() { deleting = true; },
  };
}

for (const history of ["digest", "session"] as const) test(`old ${history} main opening uses Host caller facts and preserves notice across restart`, { timeout: 40_000 }, async t => {
  const f = await fixture(t, history), handle = await f.start(), view = await f.finish(handle);
  assert.equal(f.requests.length, 1);
  const wire = f.requests[0]!;
  assert.doesNotMatch(wire, /UNATTRIBUTED_OLD_OPENING/);
  for (const value of [FIRST, NEXT, "IDENTIFIED_PEER", "OLD_ASSISTANT_BEFORE", "OLD_TOOL_RESULT", "OLD_ASSISTANT_AFTER"]) assert.ok(wire.includes(value), value);
  assert.ok(wire.indexOf("OLD_ASSISTANT_BEFORE") < wire.indexOf("OLD_TOOL_RESULT"));
  assert.ok(wire.indexOf("OLD_TOOL_RESULT") < wire.indexOf("OLD_ASSISTANT_AFTER"));
  const notes = view.turns.filter(turn => turn.kind === "notice");
  assert.deepEqual(notes.map(turn => turn.text), history === "digest" ? [notice] : []);
  assert.deepEqual((await f.reopen(handle)).turns.filter(turn => turn.kind === "notice"), notes);
  assert.equal(f.requests.length, 1, "restoring the notice dispatches nothing");
  await f.checkOriginal();
});

for (const [name, corrupt] of Object.entries({
  "missing accepted attempt": (index: FixtureIndex) => { index.attempts = []; },
  "duplicate accepted run": (index: FixtureIndex) => { index.attempts.push(structuredClone(index.attempts[0])); },
  "refused attempt": (index: FixtureIndex) => { index.attempts[0].refused = { code: "SESSION_HISTORY_UNAVAILABLE", at: "2026-09-19T00:00:00.000Z" }; },
  "child prompt backfill": (index: FixtureIndex) => { index.parent_run = { session_id: "parent", run_id: "parent-run" }; },
  "missing caller task": (index: FixtureIndex) => { delete index.attempts[0].task; },
  "unknown history": (index: FixtureIndex) => { index.attempts[0].frozen.history = "session"; },
  "unknown frozen skeleton": (index: FixtureIndex) => { index.attempts[0].frozen = { workspace: "none" }; },
  "caller does not align": (index: FixtureIndex) => { index.attempts[0].task = "NOT_THE_ORIGINAL_CALLER"; },
})) test(`unproven old opening refuses ${name} without model dispatch`, { timeout: 30_000 }, async t => {
  const f = await fixture(t); await f.mutate(corrupt);
  await assert.rejects(f.start(), error => {
    assert.ok(error instanceof Error);
    if (["duplicate accepted run", "refused attempt", "unknown history", "caller does not align"].includes(name)) {
      assert.equal((error as { code?: string }).code, "SESSION_HISTORY_UNAVAILABLE");
    }
    assert.ok(!error.message.includes(FIRST) && !error.message.includes(EXTRA), "failure does not disclose old opening content");
    return true;
  });
  assert.equal(f.requests.length, 0);
  await f.checkOriginal();
});

test("AgentHost rejects a caller from a different installation before old history is used", { timeout: 30_000 }, async t => {
  const f = await fixture(t);
  await f.mutate(index => { index.owner.install_id = "another-installation"; });
  await assert.rejects(f.startThroughHost(), { code: "agent.session_unknown" });
  assert.equal(f.requests.length, 0);
  await f.checkOriginal();
});

test("project deletion during the original opening read refuses stale history without dispatch", { timeout: 30_000 }, async t => {
  const f = await fixture(t), gate = await f.holdOpeningRead(), starting = f.start();
  await gate.reached(starting);
  assert.equal(f.requests.length, 0);
  f.blockProject(); gate.release();
  await assert.rejects(starting, { code: "SESSION_HISTORY_UNAVAILABLE" });
  assert.equal(f.requests.length, 0);
  await f.checkOriginal();
});

test("a main start excludes lifecycle mutation while its original opening is being read", { timeout: 30_000 }, async t => {
  const f = await fixture(t), before = await f.lifecycle();
  assert.equal(before.state, "active"); assert.notEqual(before.version, null);
  const gate = await f.holdOpeningRead(), starting = f.start();
  await gate.reached(starting);
  assert.equal(f.requests.length, 0);
  await assert.rejects(f.archive(before.version!), { code: "agent.session_busy" });
  gate.release(); const handle = await starting, view = await f.finish(handle);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(view.turns.filter(turn => turn.kind === "notice").map(turn => turn.text), [notice]);
  const after = await f.lifecycle(); assert.equal(after.state, "active"); assert.equal(after.operation, undefined);
  assert.doesNotMatch(f.requests[0]!, /UNATTRIBUTED_OLD_OPENING/);
  await f.checkOriginal();
});

test("project deletion admission refuses old opening without dispatch", { timeout: 30_000 }, async t => {
  const f = await fixture(t); f.blockProject();
  await assert.rejects(f.start()); assert.equal(f.requests.length, 0);
  await f.checkOriginal();
});
