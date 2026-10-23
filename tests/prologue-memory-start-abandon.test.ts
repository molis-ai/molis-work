import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRecalledMemory } from "@molis-ai/molis-work-contracts/services/agent-host";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));

for (const withMemory of [false, true]) test(`a revoked unaccepted start removes its complete intent, with memory recipe=${withMemory}`, { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-start-abandon-")), appId = "io.molis.work.start-abandon-test";
  let providerCalls = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the actual request without retaining its body */ }
    providerCalls++;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"index":0,"delta":{"content":"Ready."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const open = () => createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot: home,
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`,
      model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  let adapter = await open();
  const inspector = createNodeHost({ storageRoot: home });
  const indexKind = `molis-agent-index-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
  const readIndex = async (id: string) => {
    const bytes = await inspector.storage.readSecure({ kind: indexKind, id });
    try { return JSON.parse(new TextDecoder().decode(bytes)) as { attempts: Array<{ run_id?: string; memory_context?: unknown }> }; }
    finally { bytes.fill(0); }
  };
  try {
    const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "coding", actor_id: "person" };
    const session = await adapter.createSession({ ...owner, workspace: "none", title: "Cancelled preparation" });
    const memory: AgentRecalledMemory = { consumer: "agent", current_scene: "coding", facts: { plugins: [owner.plugin_id] },
      scopes: [], pinned: [], task: false, skip: true, budget_chars: 1000, budget_tokens: 1000 };
    const request = { ...owner, session, workspace: "none" as const, role_id: "reader", task: "Finish without tools.",
      role: { role_id: "reader", version: 1, workspace: "none" as const, execution: "read-only" as const,
        host_tools: [], prompts: [], ...(withMemory ? { memory } : {}) } };
    let current = true, sawIntent = false;
    const assertCurrent = () => { if (!current) throw Object.assign(new Error("Original invocation revoked"), { code: "actions.forbidden" }); };
    const beforeStart = async () => {
      assertCurrent();
      // This is the real persisted Host intent, before the SDK has accepted a Run.
      const index = await readIndex(session.session_id);
      if (index.attempts.length) { sawIntent = true; current = false; }
    };
    await assert.rejects(adapter.start(request, { beforeStart, assertBeforeStart: assertCurrent }), /Original invocation revoked/);
    assert.equal(sawIntent, true);
    assert.equal(providerCalls, 0, "a revoked preparation never dispatches a model request");
    assert.deepEqual((await readIndex(session.session_id)).attempts, [], "only the rejected complete intent is removed");
    await adapter.close(); adapter = await open();
    assert.deepEqual((await readIndex(session.session_id)).attempts, [], "the removal is durable across restart");
    const restored = await adapter.readSession(session);
    assert.deepEqual(restored.runs, []);
    assert.equal(restored.recovery, undefined, "no fictitious Run or unresolved start remains");

    const accepted = await adapter.start(request);
    const deadline = Date.now() + 10_000;
    for (;;) {
      const view = await adapter.read(accepted.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
        assert.equal(view.phase, "completed", view.stop_reason); break;
      }
      assert.ok(Date.now() < deadline, "the later valid Run did not finish");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(providerCalls, 1);
    const retained = (await readIndex(session.session_id)).attempts;
    assert.equal(retained.length, 1);
    assert.equal(retained[0]!.run_id, accepted.ref.run_id, "an accepted Run's intent is retained");
    await adapter.close(); adapter = await open();
    const completed = await adapter.readSession(session);
    assert.equal(completed.latest_run?.phase, "completed");
    assert.equal(completed.recovery, undefined);
  } finally {
    await adapter.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
