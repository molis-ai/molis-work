import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentHost, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunHandle } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { project_id: "p", plugin_id: "fixture", install_id: "i", actor_id: "person" };
const manifest = { roles: [{ role_id: "reader", version: 1, name: "Reader", execution: "read-only" as const, host_tools: [], workspace: "none" as const }], prompts: [] };
for (const revoke of [false, true]) test(`real Node transport executes the original Agent dispatch fence; revoked=${revoke}`, { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-c3-fence-")); let requests = 0, synchronousChecks = 0, current = true;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* actual transport request */ } requests++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[{"index":0,"delta":{"content":"done"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.c3-fence", appVersion: "1.0.0" }, storageRoot: root,
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }), resolveCredential: () => "fixture" });
  try {
    const host = new AgentHost(); host.register(adapter);
    const session = await adapter.createSession({ ...owner, workspace: "none", title: "Final fence" });
    const handle: AgentRunHandle = await host.start("prologue", { ...owner, session, workspace: "none", role_id: "reader", task: "No tools." }, {
      manifest, authorizedDirectories: [],
      async beforeDispatch() {
        assert.equal(current, true, "the original asynchronous check actually passes");
        if (revoke) queueMicrotask(() => { current = false; });
        return () => { synchronousChecks++; if (!current) throw Object.assign(new Error("Original dispatch source revoked"), { code: "actions.forbidden" }); };
      },
    });
    let view;
    for (const deadline = Date.now() + 10_000; Date.now() < deadline;) {
      view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(view?.phase, revoke ? "failed" : "completed", view?.stop_reason);
    assert.equal(requests, revoke ? 0 : 1);
    assert.ok(synchronousChecks > 0, "the returned same-call fence reaches actual transport");
    if (revoke) assert.match(view!.stop_reason!, /EFFECT_NOT_AUTHORIZED/);
  } finally { await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

for (const outcome of ["cancel", "async-fence"] as const) test(`C3 waiting actual Node dispatch ${outcome} has zero transport requests`, { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-c3-fence-cancel-")); let requests = 0;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const server = createServer(async (req, res) => { for await (const _chunk of req) {} requests++; res.writeHead(500); res.end(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.c3-cancel", appVersion: "1.0.0" }, storageRoot: root,
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }), resolveCredential: () => "fixture" });
  try {
    const host = new AgentHost(); host.register(adapter);
    const session = await adapter.createSession({ ...owner, workspace: "none", title: "Final cancellation" });
    const handle = await host.start("prologue", { ...owner, session, workspace: "none", role_id: "reader", task: "No tools" }, {
      manifest, authorizedDirectories: [], async beforeDispatch() { entered.resolve(); await release.promise; return outcome === "async-fence" ? async () => {} : () => {}; },
    });
    await entered.promise;
    if (outcome === "cancel") await adapter.control(handle.ref, { kind: "cancel" });
    release.resolve();
    let view;
    for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
      view = await adapter.read(handle.ref); if (["completed", "failed", "cancelled"].includes(view.phase)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(view?.phase, outcome === "cancel" ? "cancelled" : "failed", view?.stop_reason); assert.equal(requests, 0);
  } finally { release.resolve(); await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("C3 two live callers release in reverse order without borrowing the other's final fence", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-c3-fence-pair-")), requests: string[] = [];
  const enteredA = Promise.withResolvers<void>(), enteredB = Promise.withResolvers<void>(), releaseA = Promise.withResolvers<void>(), releaseB = Promise.withResolvers<void>();
  let currentA = true, checksA = 0, checksB = 0;
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk; requests.push(body);
    res.writeHead(200, { "content-type": "text/event-stream" }); res.end('data: {"choices":[{"index":0,"delta":{"content":"done"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.c3-pair", appVersion: "1.0.0" }, storageRoot: root,
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }), resolveCredential: () => "fixture" });
  try {
    const host = new AgentHost(); host.register(adapter);
    const a = await adapter.createSession({ ...owner, workspace: "none", title: "A" }), b = await adapter.createSession({ ...owner, workspace: "none", title: "B" });
    const start = (session: typeof a, task: string, beforeDispatch: () => Promise<() => void>) => host.start("prologue", { ...owner, session, workspace: "none", role_id: "reader", task }, { manifest, authorizedDirectories: [], beforeDispatch });
    const first = await start(a, "CALLER_A", async () => { enteredA.resolve(); await releaseA.promise; return () => { checksA++; if (!currentA) throw new Error("A original authority revoked"); }; });
    await enteredA.promise;
    const second = await start(b, "CALLER_B", async () => { enteredB.resolve(); await releaseB.promise; return () => { checksB++; }; });
    await enteredB.promise; currentA = false; releaseB.resolve();
    const finish = async (handle: AgentRunHandle) => {
      for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
        const view = await adapter.read(handle.ref); if (["failed", "completed", "cancelled"].includes(view.phase)) return view;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error("concurrent caller did not end");
    };
    assert.equal((await finish(second)).phase, "completed");
    releaseA.resolve(); assert.equal((await finish(first)).phase, "failed");
    assert.equal(requests.length, 1); assert.match(requests[0]!, /CALLER_B/); assert.doesNotMatch(requests[0]!, /CALLER_A/);
    assert.ok(checksA > 0 && checksB > 0);
  } finally { releaseA.resolve(); releaseB.resolve(); await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
