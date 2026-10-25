import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { LocalHost, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { agentHostCapabilities as agent, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { actionErrorBody, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { callAs, callerPlugin, issuedCaller, registerProbe, startPlugin } from "./fixtures/plugin-callers.js";

/** A call made for the plugin the Host issued `caller` to, with the original call's own fence: what the plugin's SDK presents. */
const as = (caller: HostPluginCaller, fence: { signal?: AbortSignal; beforeEffect?: () => Promise<void>; current?: () => void } = {}): ActionCallContext =>
  callAs(caller, [], { ...(fence.signal ? { signal: fence.signal } : {}), ...(fence.beforeEffect ? { validate_authority: fence.beforeEffect } : {}),
    ...(fence.current ? { assert_authority_current: fence.current } : {}) });

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));

test("I6-02: a real Node questionnaire refusal preserves each problem and the pending can still be answered", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-question-errors-"));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).pathname, "/v1/messages");
    const body: { messages?: unknown } = JSON.parse(await request.text());
    requests++;
    if (requests === 1) return cogniaScriptedResponse({ name: "ask-user", input: { why: "确认本轮安排", questions: [
      { id: "format", prompt: "如何沟通", options: [{ label: "一起复盘" }, { label: "异步审阅" }] },
      { id: "minutes", type: "number", prompt: "安排多少分钟", min: 15, max: 120, integer: true },
    ] } });
    assert.equal(requests, 2, "only an accepted answer resumes the real SDK model call");
    assert.match(JSON.stringify(body.messages), /45/);
    return cogniaModelResponse("安排已确认。");
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.question-errors-test", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: ["choice", "number"], reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  t.after(async () => { await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { project_id: "questions", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Questions" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "确认安排" });
  const deadline = Date.now() + 20_000;
  let question;
  for (;;) {
    const view = await adapter.read(handle.ref);
    question = view.awaiting_input.find(item => item.answerable && item.kind === "questionnaire");
    if (question) break;
    assert.ok(Date.now() < deadline, "the SDK did not reach the real questionnaire wait");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(question.questions?.map(item => [item.id, item.type]), [["format", "choice"], ["minutes", "number"]]);
  const expected = [{ question: 0, id: "format", reason: "required" }, { question: 1, id: "minutes", reason: "too-large" }];
  await assert.rejects(adapter.control(handle.ref, { kind: "answer", pending_id: question.pending_id, pending_revision: question.pending_revision,
    answers: [{ question: 0, indexes: [] }, { question: 1, value: 999 }],
  }), (error: unknown) => {
    assert.ok(error instanceof ActionError);
    assert.equal(error.code, "agent.answer_invalid");
    assert.equal(error.message, "有 2 道题的回答不能提交");
    assert.equal(actionHttpStatus(error), 400);
    assert.deepEqual((error as ActionError & { problems?: unknown }).problems, expected);
    assert.deepEqual(error.details?.problems, expected);
    assert.deepEqual(actionErrorBody(error).details?.problems, expected);
    return true;
  });
  const stillWaiting = await adapter.read(handle.ref);
  assert.equal(stillWaiting.phase, "awaiting-input");
  assert.equal(stillWaiting.awaiting_input[0]?.pending_id, question.pending_id);
  assert.equal(stillWaiting.awaiting_input[0]?.answerable, true);
  assert.equal(requests, 1, "a rejected answer is not delivered to the SDK waiter");
  await adapter.control(handle.ref, { kind: "answer", pending_id: question.pending_id, pending_revision: question.pending_revision,
    answers: [{ question: 0, indexes: [0] }, { question: 1, value: 45 }],
  });
  for (;;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) {
      assert.equal(view.phase, "completed");
      assert.deepEqual(view.awaiting_input, []);
      break;
    }
    assert.ok(Date.now() < deadline, "the SDK did not resume after the valid answer");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(requests, 2);
});

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

// W2-18-CODING-EFFECT-02: the final SDK commit fence and the Host action gateway, including an independent peer.
test("plugin start revocation at SDK commit rejects only its invocation; accepted work survives disconnect and restart", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-sdk-effects-")), appId = "io.molis.work.sdk-effects-test", storageRoot = join(home, "runtime");
  const directory = { canonical_path: home, realpath_verified: true };
  const make = () => createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter = await make(); const agentHost = new AgentHost(); agentHost.register(adapter);
  const local = new LocalHost<{ project_id: string }>({ runtimeFactory: { open: project => ({ project_id: project.project_id }), close: () => {} } });
  const finished = Promise.withResolvers<void>(); let originalSession = "";
  registerAgentHostCapabilities({ register: (definition, inner) => {
    const handler: typeof inner = async (source, input, invocation) => {
      try { return await inner(source, input, invocation); }
      finally { if (definition.capability_id === agent.startRun.capability_id && (input as [string, { session: { session_id: string } }])[1].session.session_id === originalSession) finished.resolve(); }
    };
    return local.registerAction(definition, handler);
  } }, { agentHost: () => agentHost, projectId: runtime => runtime.project_id,
    authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home] }) });
  // Sessions and rounds are a plugin's own actions (R8 batch 3): each project's round is started by a plugin the Host started there.
  const store = new LocalProjectDatabase(join(home, "plugins.db")), starter = callerPlugin("sdk-effects", "project");
  const callerIn = async (project_id: string) => {
    const reference = { project_id, storage_key: join(home, project_id) }, probe = registerProbe(local.actionRegistry(reference), "project");
    await startPlugin(local, reference, store, starter, { actorId: "person" });
    return { client: local.actionClient(reference), plugin_caller: await issuedCaller(probe, starter, project_id) };
  };
  const { client, plugin_caller } = await callerIn("project");
  const session = await client.invoke(as(plugin_caller), agent.createSession, ["prologue", { directory, title: "Revoked" }]);
  originalSession = session.session_id;
  const { client: peerClient, plugin_caller: peerCaller } = await callerIn("peer-project");
  const peer = await peerClient.invoke(as(peerCaller), agent.createSession, ["prologue", { directory, title: "Peer" }]);
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
  const request = (target: typeof session) => ["prologue", { session: target, directory, role_id: "reader", task: "Read without tools." }] as const;
  t.after(async () => { release.resolve(); response.resolve(); await local.close(); await adapter.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const original = client.invoke(as(plugin_caller, { signal: controller.signal, beforeEffect: beforeEffect, current: assertCurrent }), agent.startRun, [...request(session)]);
  const rejected = assert.rejects(original);
  await entered.promise;
  const accepted = await peerClient.invoke(as(peerCaller), agent.startRun, [...request(peer)]); await network.promise;
  assert.equal(providerCalls, 1, "a peer with the same permissions cannot lend its authority to the held call");
  current = false; controller.abort(); release.resolve(); await rejected; await finished.promise;
  assert.deepEqual((await adapter.readSession(session)).runs, []);
  assert.equal((await adapter.readSession(session)).recovery, undefined, "the rejected prepared intent is removed, not accepted as unknown work");
  const detached = new AbortController(); let detachedCurrent = true;
  const guard = () => { detached.signal.throwIfAborted(); if (!detachedCurrent) throw new ActionError("actions.forbidden", "foreground ended"); };
  const third = await client.invoke(as(plugin_caller), agent.createSession, ["prologue", { directory, title: "Accepted" }]);
  const background = await client.invoke(as(plugin_caller, { signal: detached.signal, beforeEffect: async () => guard(), current: guard }), agent.startRun, [...request(third)]);
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
    const written = (await inspector.storage.list({ kind: appId + "~sessions" })).records;
    if (phase === "sdk-session" || written.length) { entered.resolve(); await release.promise; }
  }, assert_current: () => { if (!current) throw new Error("original session guard revoked"); } },
    () => adapter.createSession({ project_id: "project", plugin_id: "coding", install_id: "install", actor_id: "person", title: "Held", directory: { canonical_path: home, realpath_verified: true } }));
  const rejected = assert.rejects(pending); await entered.promise;
  assert.equal((await inspector.storage.list({ kind: appId + "~sessions" })).records.length, phase === "owner-index" ? 1 : 0, "the second barrier is after the SDK's actual Session commit");
  current = false; release.resolve(); await rejected;
  assert.deepEqual((await inspector.storage.list({ kind: appId + "~sessions" })).records, [], "a rejected half-complete Session is purged by its SDK owner");
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

for (const stage of ["configuration", "credential", "sdk-acceptance"] as const) for (const invalidation of ["cancel", "revoke"] as const)
  test(`W2-18-MODEL-SWITCH-01/02: ${invalidation} during ${stage} keeps accepted B and its display`, { timeout: 60_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "switch-original-call-")); await writeFile(join(home, "note.txt"), "A real bounded read before finishing.");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), network = Promise.withResolvers<void>(), response = Promise.withResolvers<void>();
    const models: string[] = []; let held = false, current = true, credentialReads = 0;
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.switch-authority-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      modelConfiguration: async selection => {
        const name = selection?.model_id === "denied" ? "C" : selection?.model_id === "peer" ? "B" : "START";
        if (stage === "configuration" && name === "C" && !held) { held = true; entered.resolve(); await release.promise; }
        return { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: name, credential_ref: name };
      }, resolveCredential: async ref => {
        if (ref === "C") credentialReads++;
        if (stage === "credential" && ref === "C" && !held) { held = true; entered.resolve(); await release.promise; }
        return "fixture-only";
      } });
    const host = new AgentHost(); host.register(adapter);
    const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } });
    registerAgentHostCapabilities<null>({ register: (definition, handler) => local.registerAction(definition, handler) }, { agentHost: () => host, projectId: () => "project", authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home] }) });
    const reference = { project_id: "project", storage_key: join(home, "project.db") }, client = local.actionClient(reference);
    // Controlling a round is a plugin's own action (R8 batch 3): the round is started and switched by a plugin the Host started.
    const store = new LocalProjectDatabase(join(home, "plugins.db")), probe = registerProbe(local.actionRegistry(reference), "project");
    const starter = callerPlugin("switch-authority", "project");
    await startPlugin(local, reference, store, starter, { actorId: "person" });
    const plugin_caller = await issuedCaller(probe, starter, reference.project_id);
    const directory = { canonical_path: home, realpath_verified: true };
    const controller = new AbortController();
    const invalidate = () => { if (invalidation === "cancel") controller.abort(new Error("original switch cancelled")); else current = false; };
    const check = () => {
      if (stage === "sdk-acceptance" && !held && credentialReads >= 2 && /[\\/]agent[\\/]core[\\/]control\.js/.test(new Error().stack ?? "")) {
        // Observe the actual SDK control frame, not a count of earlier preparation checks.
        // This trusted caller revokes at that final checkpoint; dropping Node's beforeAccept
        // leaves this checkpoint unreachable and permits C, which the outcomes below reject.
        held = true; entered.resolve(); invalidate();
      }
      controller.signal.throwIfAborted(); if (!current) throw new ActionError("actions.forbidden", "original switch revoked");
    };
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      const payload = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
      const body = JSON.parse(payload); models.push(body.model);
      if (models.length === 1) { network.resolve(); await response.promise; return switchReadResponse(); }
      return cogniaModelResponse("Finished with the accepted model B.");
    });
    t.after(async () => { release.resolve(); response.resolve(); await local.close(); await adapter.close(); store.close(); await rm(home, { recursive: true, force: true }); });
    const session = await client.invoke(as(plugin_caller), agent.createSession, ["prologue", { directory, title: "One running session" }]);
    const handle = await client.invoke(as(plugin_caller), agent.startRun, ["prologue", { session, directory, role_id: "reader", task: "Read note.txt, then answer." }]);
    await network.promise;
    const requested = (id: string) => [session, handle.ref, { kind: "switch-model" as const, provider_id: "fixture", model_id: id }] as const;
    await client.invoke(as(plugin_caller), agent.controlRun, [...requested("peer")]);
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B");
    const refused = client.invoke(as(plugin_caller, { signal: controller.signal, beforeEffect: async () => check(), current: check }), agent.controlRun, [...requested("denied")]);
    const rejected = assert.rejects(refused);
    if (stage === "sdk-acceptance") { await rejected; assert.equal(held, true, "the original checker reached the actual SDK acceptance frame"); }
    else await entered.promise;
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B", "preparing C does not alter the accepted display");
    if (stage !== "sdk-acceptance") invalidate();
    release.resolve(); await rejected;
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B", "rejection preserves the SDK's still-pending B");
    response.resolve();
    const deadline = Date.now() + 20_000;
    for (;;) { const view = await adapter.read(handle.ref); if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed"); break; }
      assert.ok(Date.now() < deadline, "accepted work did not finish"); await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.deepEqual(models, ["START", "B"], "the actual SDK's later model call matches its accepted display");
    assert.equal((await adapter.readSession(session)).runs.length, 1, "control created no new run");
  });

// PA-24 (§5.6a gap 3): a switch the round has accepted is still only a request; the next model call is checked again before it
// leaves. When the plugin instance stops or the round's Character is disabled in between, nothing reaches the new endpoint.
for (const invalidation of ["plugin-stopped", "character-disabled"] as const)
  test(`PA-24: ${invalidation} after a switch is accepted stops the next model call before it reaches the new endpoint`, { timeout: 60_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "switch-then-revoke-")); await writeFile(join(home, "note.txt"), "A real bounded read before finishing.");
    const network = Promise.withResolvers<void>(), response = Promise.withResolvers<void>();
    const requests: Array<{ endpoint: string; model: string }> = [];
    let characterAvailable = true;
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.switch-revoke-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      modelConfiguration: async selection => selection?.model_id === "peer"
        ? { protocol: "anthropic-compatible", endpoint: "https://1.1.1.2/v1/messages", model: "B", credential_ref: "B" }
        : { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "START", credential_ref: "START" },
      resolveCredential: async () => "fixture-only" });
    const directory = { canonical_path: home, realpath_verified: true };
    const character = { reference: { artifact_id: "character:project:verifier", version: 1 }, character_id: "verifier", title: "Verifier", instructions: "Verify before answering.",
      host_tools: null, source: { owner_actor_id: "person", draft_revision: 1 }, project_id: "project", content_digest: "verifier-digest",
      producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "fixture" }, published_at: "2026-10-15T00:00:00Z" };
    const resolveCharacter = () => {
      if (!characterAvailable) throw new Error("所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行");
      return structuredClone(character);
    };
    const host = new AgentHost(); host.register(adapter);
    const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } });
    registerAgentHostCapabilities<null>({ register: (definition, handler) => local.registerAction(definition, handler) }, { agentHost: () => host, projectId: () => "project",
      authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home], resolveCharacter }) });
    const reference = { project_id: "project", storage_key: join(home, "project.db") }, client = local.actionClient(reference);
    // The plugin instance that starts the round, started by the Host for the person: its calls present the caller the Host issued
    // its session (S-15), and that caller refuses once the instance stops (apps/local-host/src/plugin-host-services.ts).
    const store = new LocalProjectDatabase(join(home, "plugins.db")), probe = registerProbe(local.actionRegistry(reference), "project");
    const starter = callerPlugin("switcher", "project"), started = await startPlugin(local, reference, store, starter, { actorId: "person" });
    const plugin_caller = await issuedCaller(probe, starter, reference.project_id);
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init: RequestInit) => {
      const payload = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
      requests.push({ endpoint: new Request(url).url, model: JSON.parse(payload).model });
      if (requests.length === 1) { network.resolve(); await response.promise; return switchReadResponse(); }
      return cogniaModelResponse("Finished with B, which must not happen.");
    });
    t.after(async () => { response.resolve(); await local.close(); await adapter.close(); store.close(); await rm(home, { recursive: true, force: true }); });
    const session = await client.invoke(as(plugin_caller), agent.createSession, ["prologue", { directory, title: "Switch then revoke" }]);
    const handle = await client.invoke(as(plugin_caller), agent.startRun, ["prologue", { session, directory, role_id: "reader", task: "Read note.txt, then answer.",
      ...(invalidation === "character-disabled" ? { character: character.reference } : {}) }]);
    await network.promise;
    await client.invoke(as(plugin_caller), agent.controlRun, [session, handle.ref, { kind: "switch-model", provider_id: "fixture", model_id: "peer" }]);
    assert.equal((await adapter.read(handle.ref)).model_switch?.requested, "B", "the SDK accepted the switch for the next model call");
    if (invalidation === "plugin-stopped") await started.runtime.stop(started.install_id); else characterAvailable = false;
    response.resolve();
    const deadline = Date.now() + 20_000;
    let view;
    for (;;) { view = await adapter.read(handle.ref); if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) break;
      assert.ok(Date.now() < deadline, "the round did not end"); await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.deepEqual(requests, [{ endpoint: "https://1.1.1.1/v1/messages", model: "START" }], "the new endpoint received nothing");
    const reason = invalidation === "plugin-stopped" ? "此插件实例已停止，请重新打开" : "所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行";
    assert.equal(view.phase, "failed");
    assert.equal(view.stop_reason, `EFFECT_NOT_AUTHORIZED: The App refused this network dispatch before sending: ${reason}`, "the round says why it ended");
    // The switch took effect at that call boundary (the SDK's model-switched), and the call it took effect for was refused before
    // sending: the view shows the switch, no request left over, and usage from the first model only.
    assert.deepEqual(view.model_switch, { now: "B" });
    assert.deepEqual(view.usage.tokens, { input: 20, output: 10 }, "only START's call is counted");
    assert.equal(view.frozen.model_id, "START");
    assert.equal((await adapter.readSession(session)).runs.length, 1, "nothing started another round");
  });
