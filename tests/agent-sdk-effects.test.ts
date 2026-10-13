import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { AgentHost, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { agentHostCapabilities as agent, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));

// W2-18-CODING-EFFECT-01: queued SDK effects keep the original checker after a failed/returned preparation scope.
test("an SDK effect queued by an invocation cannot lose its guard just because the wrapper returned", async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-queued-effects-"));
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.queued-effects-test", appVersion: "1.0.0" }, storageRoot: home });
  const release = Promise.withResolvers<void>(), committed = Promise.withResolvers<unknown>(); let current = true;
  t.after(async () => { release.resolve(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  await adapter.withEffect({ beforeEffect: async () => {}, assert_current: () => { if (!current) throw new Error("queued effect lost its original authority"); } }, async () => {
    void release.promise.then(() => adapter.memory!.write({ scope: "app", owner: "original", text: "A queued SDK write", origin: "fixture" })).then(committed.resolve, committed.reject);
  });
  current = false; const rejected = assert.rejects(committed.promise); release.resolve(); await rejected;
  assert.deepEqual(await adapter.memory!.list("app", "original"), []);
});

// W2-18-CODING-EFFECT-02: the final SDK commit fence and the typed Host bridge, including an independent peer.
test("typed start revocation at SDK commit rejects only its invocation; accepted work survives disconnect and restart", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-sdk-effects-")), appId = "io.molis.work.sdk-effects-test", storageRoot = join(home, "runtime");
  const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "install", actor_id: "person" }, directory = { canonical_path: home, realpath_verified: true };
  const make = () => createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter = await make(); const agentHost = new AgentHost(); agentHost.register(adapter);
  const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } });
  const finished = Promise.withResolvers<void>(); let originalSession = "";
  registerAgentHostCapabilities({ register: (definition, handler) => local.registerCapability(definition, async (source, input, invocation) => {
    try { return await handler(source, input, invocation); }
    finally { if (definition.capability_id === agent.startRun.capability_id && (input as [string, { session: { session_id: string } }])[1].session.session_id === originalSession) finished.resolve(); }
  }) }, { agentHost: () => agentHost, projectId: () => owner.project_id,
    authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home] }) });
  const client = local.client({ project_id: owner.project_id, storage_key: join(home, "project") });
  const session = await client.invoke(agent.createSession, ["prologue", { ...owner, directory, title: "Revoked" }]);
  originalSession = session.session_id;
  const peer = await client.invoke(agent.createSession, ["prologue", { ...owner, directory, title: "Peer" }]);
  const inspector = createNodeHost({ storageRoot }), indexKind = `molis-agent-index-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), network = Promise.withResolvers<void>(), response = Promise.withResolvers<void>();
  let current = true, holding = true, providerCalls = 0;
  const controller = new AbortController(), assertCurrent = () => { controller.signal.throwIfAborted(); if (!current) throw new ActionError("actions.forbidden", "original caller revoked"); };
  const beforeEffect = async () => {
    assertCurrent();
    // The actual intent is already committed: this wait is at a subsequent SDK storage commit, before Run acceptance.
    const bytes = await inspector.storage.readSecure({ kind: indexKind, id: session.session_id });
    const index = JSON.parse(new TextDecoder().decode(bytes)); bytes.fill(0);
    if (holding && index.attempts.length) { holding = false; entered.resolve(); await release.promise; }
  };
  t.mock.method(globalThis, "fetch", async () => { providerCalls++; network.resolve(); await response.promise; return cogniaModelResponse("The accepted round finished."); });
  const request = (target: typeof session) => ["prologue", { ...owner, session: target, directory, role_id: "reader", task: "Read without tools." }] as const;
  t.after(async () => { release.resolve(); response.resolve(); await local.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const original = client.invoke(agent.startRun, [...request(session)], { signal: controller.signal, before_effect: beforeEffect, assert_authority_current: assertCurrent });
  const rejected = assert.rejects(original);
  await entered.promise;
  const accepted = await client.invoke(agent.startRun, [...request(peer)]); await network.promise;
  assert.equal(providerCalls, 1, "a peer with the same permissions cannot lend its authority to the held call");
  current = false; controller.abort(); release.resolve(); await rejected; await finished.promise;
  assert.deepEqual((await adapter.readSession(session)).runs, []);
  assert.equal((await adapter.readSession(session)).recovery, undefined, "the rejected prepared intent is removed, not accepted as unknown work");
  const detached = new AbortController(); let detachedCurrent = true;
  const guard = () => { detached.signal.throwIfAborted(); if (!detachedCurrent) throw new ActionError("actions.forbidden", "foreground ended"); };
  const third = await client.invoke(agent.createSession, ["prologue", { ...owner, directory, title: "Accepted" }]);
  const background = await client.invoke(agent.startRun, [...request(third)], { signal: detached.signal, before_effect: async () => guard(), assert_authority_current: guard });
  detachedCurrent = false; detached.abort(); response.resolve();
  const settle = (ref: AgentRunRef) => new Promise<void>((resolve, reject) => {
    let off = () => {}; const timer = setTimeout(() => reject(new Error("accepted SDK round did not finish")), 10_000);
    off = adapter.observe(ref, view => { if (!["completed", "failed", "cancelled"].includes(view.phase)) return; clearTimeout(timer); queueMicrotask(() => off());
      if (view.phase === "completed") resolve(); else reject(new Error(`accepted work ended as ${view.phase}`)); });
  });
  await Promise.all([settle(accepted.ref), settle(background.ref)]);
  await adapter.close(); adapter = await make();
  assert.deepEqual((await adapter.readSession(session)).runs, []);
  assert.equal((await adapter.readSession(third)).latest_run?.phase, "completed", "the accepted Run and its terminal receipt survive reopening");
});

// W2-18-CODING-EFFECT-03: check both commits of actual SDK Session creation, including rejected half completion.
for (const phase of ["sdk-session", "owner-index"] as const) test(`new Session revoked at ${phase} leaves no unpublished SDK Session or index`, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-session-effects-")), appId = "io.molis.work.session-effects-test";
  const adapter = await createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot: home });
  const inspector = createNodeHost({ storageRoot: home }), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let current = true;
  t.after(async () => { release.resolve(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const pending = adapter.withEffect({ beforeEffect: async () => {
    assert.ok(current);
    const written = (await inspector.storage.list({ kind: "sessions" })).records;
    if (phase === "sdk-session" || written.length) { entered.resolve(); await release.promise; }
  }, assert_current: () => { if (!current) throw new Error("original session guard revoked"); } },
    () => adapter.createSession({ project_id: "project", plugin_id: "coding", install_id: "install", actor_id: "person", title: "Held", directory: { canonical_path: home, realpath_verified: true } }));
  const rejected = assert.rejects(pending); await entered.promise;
  assert.equal((await inspector.storage.list({ kind: "sessions" })).records.length, phase === "owner-index" ? 1 : 0, "the second barrier is after the SDK's actual Session commit");
  current = false; release.resolve(); await rejected;
  assert.deepEqual((await inspector.storage.list({ kind: "sessions" })).records, [], "a rejected half-complete Session is purged by its SDK owner");
  const indexKind = `molis-agent-index-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
  assert.deepEqual((await inspector.storage.list({ kind: indexKind })).records, []);
  const fresh = await adapter.createSession({ project_id: "project", plugin_id: "coding", install_id: "install", actor_id: "person", title: "Fresh", directory: { canonical_path: home, realpath_verified: true } });
  assert.equal((await adapter.readSession(fresh)).title, "Fresh");
});


function switchReadResponse(): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "switch-tool", type: "message", role: "assistant", model: "START", usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "read-note", name: "read", input: {} } });
  emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ path: "note.txt" }) } });
  emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 10 } }); emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

for (const stage of ["configuration", "credential"] as const) for (const invalidation of ["cancel", "revoke"] as const)
  test(`W2-18-MODEL-SWITCH-01/02: ${invalidation} during ${stage} keeps accepted B and its display`, { timeout: 60_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "switch-original-call-")); await writeFile(join(home, "note.txt"), "A real bounded read before finishing.");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), network = Promise.withResolvers<void>(), response = Promise.withResolvers<void>();
    const models: string[] = []; let held = false, current = true;
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.switch-authority-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      modelConfiguration: async selection => {
        const name = selection?.model_id === "denied" ? "C" : selection?.model_id === "peer" ? "B" : "START";
        if (stage === "configuration" && name === "C" && !held) { held = true; entered.resolve(); await release.promise; }
        return { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: name, credential_ref: name };
      }, resolveCredential: async ref => {
        if (stage === "credential" && ref === "C" && !held) { held = true; entered.resolve(); await release.promise; }
        return "fixture-only";
      } });
    const host = new AgentHost(); host.register(adapter);
    const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } });
    registerAgentHostCapabilities<null>({ register: (definition, handler) => local.registerCapability(definition, handler) }, { agentHost: () => host, projectId: () => "project", authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home] }) });
    const client = local.client({ project_id: "project", storage_key: join(home, "project.db") });
    const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "install", actor_id: "person" }, directory = { canonical_path: home, realpath_verified: true };
    const controller = new AbortController();
    const check = () => { controller.signal.throwIfAborted(); if (!current) throw new ActionError("actions.forbidden", "original switch revoked"); };
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      const payload = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
      const body = JSON.parse(payload); models.push(body.model);
      if (models.length === 1) { network.resolve(); await response.promise; return switchReadResponse(); }
      return cogniaModelResponse("Finished with the accepted model B.");
    });
    t.after(async () => { release.resolve(); response.resolve(); await local.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
    const session = await client.invoke(agent.createSession, ["prologue", { ...owner, directory, title: "One running session" }]);
    const handle = await client.invoke(agent.startRun, ["prologue", { ...owner, session, directory, role_id: "reader", task: "Read note.txt, then answer." }]);
    await network.promise;
    const requested = (id: string) => [session, handle.ref, { kind: "switch-model" as const, provider_id: "fixture", model_id: id }] as const;
    await client.invoke(agent.controlRun, [...requested("peer")]);
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B");
    const refused = client.invoke(agent.controlRun, [...requested("denied")], { signal: controller.signal, before_effect: async () => check(), assert_authority_current: check });
    const rejected = assert.rejects(refused);
    await entered.promise;
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B", "preparing C does not alter the accepted display");
    if (invalidation === "cancel") controller.abort(new Error("original switch cancelled")); else current = false;
    release.resolve(); await rejected;
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B", "rejection preserves the SDK's still-pending B");
    response.resolve();
    const deadline = Date.now() + 20_000;
    for (;;) { const view = await adapter.read(handle.ref); if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed"); break; }
      assert.ok(Date.now() < deadline, "accepted work did not finish"); await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.deepEqual(models, ["START", "B"], "the actual SDK's later model call matches its accepted display");
    assert.equal((await adapter.readSession(session)).runs.length, 1, "control created no new run");
  });
