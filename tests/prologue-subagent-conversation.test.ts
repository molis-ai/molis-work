import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, waitForSubagentChange } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { BUSINESS_HOST_TOOLS, BUSINESS_SUBAGENT_HOST_TOOLS, type AgentManifest, type AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentSubagentCommand, AgentSubagentControl, AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";

interface Wire { system?: unknown; tools?: Array<{ name: string }>; messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }> }
const userTexts = (body: Wire) => body.messages.filter(one => one.role === "user").map(one => typeof one.content === "string" ? one.content : one.content.map(part => part.text ?? "").join(""));
const owner = { project_id: "p", plugin_id: "io.molis.work.fixture", install_id: "i", actor_id: "person" };
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));

async function fixture(script: (body: Wire) => Response | Promise<Response>) {
  const root = await mkdtemp(join(tmpdir(), "molis-sai-"));
  const requests: Wire[] = [], errors: unknown[] = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Wire;
      requests.push(body);
      const result = await script(body);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) { errors.push(error); response.writeHead(500); response.end("fixture failure"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  let queue = new AgentReviewQueue();
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.sai", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue, questionTypes: ["choice", "number", "reference"],
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  let adapter = await make(), host = new AgentHost({ reviews: queue }); host.register(adapter);
  const until = async (done: () => boolean | Promise<boolean>) => {
    for (const deadline = Date.now() + 25_000; !await done();) {
      if (errors.length) throw errors[0];
      if (Date.now() > deadline) throw new Error("timed out: " + JSON.stringify({ requests, reviews: queue.list(owner.project_id) }));
      for (const item of queue.list(owner.project_id, "pending")) await queue.respond({ review_id: item.review_id, version: item.reference.version, actor_id: owner.actor_id, decision: "approve" });
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  return { root, requests, errors, until, get adapter() { return adapter; }, get host() { return host; },
    async reopen() { await adapter.close(); queue = new AgentReviewQueue(); adapter = await make(); host = new AgentHost({ reviews: queue }); host.register(adapter); },
    async close() { await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); } };
}

// SAI-03/04/05/08/09/10: actual Node HTTP, actual SDK/Session histories and disk reopen; no mocked subagent owner.
test("subtask original requests deliver once, continue the same child and survive reopen", { timeout: 60_000 }, async () => {
  const release = Promise.withResolvers<void>();
  let parentCalls = 0, childCalls = 0;
  const text = "Please keep this exact supplement: SAI_USER_59.";
  const f = await fixture(async body => {
    if (userTexts(body).some(one => one.startsWith("SAI_CHILD_ORIGINAL"))) {
      childCalls++;
      if (childCalls === 1) { await release.promise; return reply({ name: "context-remaining", input: {} }); }
      assert.ok(userTexts(body).some(one => one.includes(text)), JSON.stringify(body.messages));
      return reply(undefined, childCalls === 2 ? "Original child completed." : childCalls === 3 ? "Continued child completed." : "Retried child completed.");
    }
    if (++parentCalls === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
      return reply({ name: "dispatch-subagent", input: { instruction: "SAI_CHILD_ORIGINAL: inspect without changing files.", tools: [], character, idempotencyKey: "sai-child" } });
    }
    return reply(undefined, "Parent finished.");
  });
  try {
    const manifest = structuredClone(codingAgentManifest);
    manifest.subagents!.roles = manifest.subagents!.roles.filter(one => one.role_id === "coding-reader");
    const directory = { canonical_path: f.root, realpath_verified: true };
    const session = await f.adapter.createSession({ ...owner, title: "SAI parent", directory });
    const parent = await f.host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Dispatch one child." }, { manifest, prompts: codingPrompts, authorizedDirectories: [f.root] });
    await f.until(() => childCalls === 1);
    const [child] = await f.adapter.subagents!.list(parent.ref); assert.ok(child?.child_run);
    const port = () => f.adapter.subagents!;
    assert.doesNotThrow(() => port().assertCurrent!(parent.ref, child.subagent_id, child.child_run!));
    assert.throws(() => port().assertCurrent!({ ...parent.ref, run_id: "another-parent" }, child.subagent_id, child.child_run!));
    const control: AgentSubagentControl = { actor_id: owner.actor_id, original_text: text, execution: {} };
    const send: AgentSubagentCommand = { kind: "send", text, child_run: child.child_run, request_id: "original-send" };
    await assert.rejects(port().command!(parent.ref, child.subagent_id, send, { ...control, original_text: undefined }), /原件/);
    const snapshot = await waitForSubagentChange(port(), parent.ref, child.subagent_id, null, 0);
    const changed = waitForSubagentChange(port(), parent.ref, child.subagent_id, snapshot.version, 10_000);
    const accepted = await port().command!(parent.ref, child.subagent_id, send, control);
    assert.equal(accepted.state, "applied"); assert.ok(accepted.state === "applied" && accepted.input_id);
    assert.deepEqual(await port().command!(parent.ref, child.subagent_id, send, control), accepted);
    assert.ok((await changed).view.messages.some(one => one.text === text));
    release.resolve();
    await f.until(async () => (await port().list(parent.ref))[0]?.state === "completed");
    const original = await port().conversation!(parent.ref, child.subagent_id);
    assert.equal(original.messages.filter(one => one.text === text).length, 1);
    assert.equal(original.messages.find(one => one.text === text)?.kind, "user", "the SDK's attested person original stays a user message");
    assert.equal(original.messages.find(one => one.text === "SAI_CHILD_ORIGINAL: inspect without changing files.")?.kind, "notice", "the first delegated task is not a person's message");
    assert.ok(!original.messages.some(one => one.text.includes("Your task step reference")), "SDK execution instructions stay out of the child transcript projection");
    const nextText = "Continue this same child: SAI_NEXT_59.";
    const next: AgentSubagentCommand = { kind: "continue", text: nextText, child_run: child.child_run, request_id: "original-continue" };
    const continued = await port().command!(parent.ref, child.subagent_id, next, { ...control, original_text: nextText });
    assert.equal(continued.state, "applied");
    assert.deepEqual(await port().command!(parent.ref, child.subagent_id, next, { ...control, original_text: nextText }), continued);
    await f.until(async () => (await port().list(parent.ref))[0]?.state === "completed");
    const [after] = await port().list(parent.ref); assert.ok(after?.child_run);
    assert.equal(after.subagent_id, child.subagent_id); assert.equal(after.child_run.session_id, child.child_run.session_id);
    assert.notEqual(after.child_run.run_id, child.child_run.run_id); assert.equal(childCalls, 3);
    assert.throws(() => port().assertCurrent!(parent.ref, child.subagent_id, child.child_run!), /原子任务执行已改变/);
    assert.doesNotThrow(() => port().assertCurrent!(parent.ref, child.subagent_id, after.child_run!));
    assert.equal((await port().command!(parent.ref, child.subagent_id, { kind: "stop", child_run: child.child_run, request_id: "stale-stop" }, control)).state, "not-applied");
    assert.equal((await port().command!(parent.ref, child.subagent_id, { kind: "extend-budget", child_run: after.child_run, attempts: 1, request_id: "allow-one-retry" }, control)).state, "applied");
    assert.equal((await port().command!(parent.ref, child.subagent_id, { kind: "retry", child_run: after.child_run, source: "user-requested", request_id: "retry-without-person-text" }, control)).state, "applied");
    await f.until(async () => (await port().list(parent.ref))[0]?.state === "completed");
    const [retried] = await port().list(parent.ref); assert.ok(retried?.child_run);
    assert.equal(retried.budget?.retry_source, "user-requested");
    assert.equal(after.budget?.retry_source, "user-requested", "same operation source does not prove text authorship");
    const before = f.requests.length;
    await f.reopen();
    assert.deepEqual(await port().checkRequest!(parent.ref, child.subagent_id, send.request_id, owner.actor_id), accepted);
    assert.deepEqual(await port().checkRequest!(parent.ref, child.subagent_id, next.request_id, owner.actor_id), continued);
    const restored = await port().conversation!(parent.ref, child.subagent_id);
    assert.ok(restored.messages.some(one => one.text === nextText && one.kind === "user"));
    assert.equal(restored.messages.filter(one => one.run.run_id === after.child_run!.run_id && one.kind === "user" && !one.steer).length, 1);
    const retryOpening = restored.messages.find(one => one.run.run_id === retried.child_run!.run_id && one.text.includes("请先核对前次尝试"));
    assert.equal(retryOpening?.kind, "notice", "Host retry instructions remain readable without claiming personal authorship after reopen");
    assert.equal(new Set(restored.messages.map(one => one.turn_id)).size, restored.messages.length);
    assert.equal(f.requests.length, before, "reading and reopening cannot restart either agent");
    // SAI-03/10: corrupt optional provenance cannot manufacture personal authorship; raw history remains readable.
    await f.adapter.close();
    const inspector = createNodeHost({ storageRoot: join(f.root, "sdk") });
    const kind = `molis-agent-index-${createHash("sha256").update("io.molis.work.sai").digest("hex").slice(0, 24)}`;
    const bytes = await inspector.storage.readSecure({ kind, id: parent.ref.session_id });
    type Index = { attempts: Array<{ refused?: { code: string; at: string }; subagent_person_continuations?: unknown }> };
    let index: Index; try { index = JSON.parse(new TextDecoder().decode(bytes)) as Index; } finally { bytes.fill(0); }
    const saveIndex = async (value: Index) => {
      const row = await inspector.storage.get({ kind, id: parent.ref.session_id }); assert.ok(row);
      await inspector.storage.commit({ kind, id: parent.ref.session_id, expectedVersion: row.version, metadata: { schema: 1 }, secureBody: new TextEncoder().encode(JSON.stringify(value)) });
    };
    for (const change of ["duplicate-parent", "refused-parent", "duplicate-marker", "malformed-marker"] as const) {
      const changed = structuredClone(index);
      if (change === "duplicate-parent") changed.attempts.push(structuredClone(changed.attempts[0]!));
      else if (change === "refused-parent") changed.attempts[0]!.refused = { code: "SESSION_HISTORY_UNAVAILABLE", at: "2026-11-17T00:00:00.000Z" };
      else changed.attempts[0]!.subagent_person_continuations = change === "duplicate-marker" ? [after.child_run.run_id, after.child_run.run_id] : { run: after.child_run.run_id };
      await saveIndex(changed); await f.reopen();
      const unproven = await port().conversation!(parent.ref, child.subagent_id);
      const opening = unproven.messages.find(one => one.run.run_id === after.child_run!.run_id && !one.steer && one.kind !== "assistant");
      assert.equal(opening?.kind, "notice", change);
      assert.equal(opening?.text, change === "duplicate-parent" || change === "refused-parent" ? "" : nextText, change);
      assert.equal(unproven.messages.find(one => one.text === text)?.kind, "user", "independent original supplement receipt remains valid");
      await f.adapter.close();
    }
    await saveIndex(index);
    // Public Session adoption supplies a historical fixture with two caller prompts, as a prompt hook can write.
    const runtime = await createRuntime({ app: { appId: "io.molis.work.sai", appVersion: "1.0.0" }, host: inspector, preset: "local-agent" });
    const parentSession = await runtime.sessions.open({ kind: "session", id: parent.ref.session_id, revision: 1 }); assert.ok(parentSession);
    const originalParentRun = { kind: "run", id: parent.ref.run_id, revision: 1 } as const;
    const parentEvents = await parentSession.replay(originalParentRun);
    const envelopes = runtime.delivery.list({ to: parentSession.ref });
    const results = envelopes.filter((envelope: { attachments: Array<{ kind: string }> }) => envelope.attachments.some(one => one.kind === "subagent-result"));
    assert.equal(results.length, 3);
    const ordinary = await runtime.sessions.create({ title: "Ordinary sender" });
    const noticeEnvelope = (key: string, change: Record<string, unknown> = {}) => runtime.delivery.receiveInjection({
      to: parentSession.ref, from: ordinary.ref, body: "Ordinary peer text", idempotencyKey: key, ...change,
    }, Date.now());
    const valid = results[0]!;
    const malformed = [
      noticeEnvelope("ordinary"),
      noticeEnvelope("self-wait", { from: parentSession.ref, body: "SELF_WAIT_PROTOCOL: wait original-board original-step" }),
      noticeEnvelope("missing", { from: valid.from, body: "Old protocol has no display metadata" }),
      noticeEnvelope("wrong-parent", { from: valid.from, body: valid.body, attachments: valid.attachments.map((one: { kind: string }) => one.kind === "subagent-parent-run" ? { ...one, id: "another-parent" } : one) }),
      noticeEnvelope("wrong-from", { body: valid.body, attachments: valid.attachments }),
      noticeEnvelope("wrong-to", { to: ordinary.ref, from: valid.from, body: valid.body, attachments: valid.attachments }),
      noticeEnvelope("duplicate-result", { from: valid.from, body: valid.body, attachments: [...valid.attachments, ...valid.attachments.filter((one: { kind: string }) => one.kind === "subagent-result")] }),
    ];
    const originalNotice = envelopes.find((envelope: { attachments: Array<{ kind: string }> }) => envelope.attachments.some(one => one.kind === "subagent-input")); assert.ok(originalNotice);
    const displayEnvelopes = [...results, originalNotice, ...malformed];
    await runtime.delivery.flush();
    await parentSession.adoptRun(originalParentRun, [...displayEnvelopes.map(envelope => ({ type: "prompt", role: "user", source: "peer", text: envelope.body, injection: envelope.ref, atMs: 1 })), ...parentEvents]);
    const childSession = await runtime.sessions.open({ kind: "session", id: after.child_run.session_id, revision: 1 }); assert.ok(childSession);
    const run = { kind: "run", id: after.child_run.run_id, revision: 1 } as const;
    const events = await childSession.replay(run);
    await childSession.adoptRun(run, [{ type: "prompt", role: "user", source: "person", text: "NON_CALLER_PROMPT", atMs: 1 }, ...events]);
    await runtime.shutdown(); await f.reopen();
    const preceded = await port().conversation!(parent.ref, child.subagent_id);
    assert.ok(preceded.messages.some(one => one.run.run_id === run.id && one.notice === "task-unavailable" && !one.text));
    assert.ok(preceded.messages.every(one => one.text !== "NON_CALLER_PROMPT"));
    assert.equal(preceded.messages.find(one => one.text === nextText)?.kind, "user", "authorship binds to the attested caller event, not the first user-shaped turn");
    const parentView = await f.adapter.read(parent.ref);
    assert.equal(parentView.turns.filter(turn => turn.text === "Dispatch one child.").length, 1, "peer prompts before the caller do not disable opening deduplication");
    assert.deepEqual(parentView.turns.slice(1, 1 + displayEnvelopes.length).map(turn => [turn.kind, turn.text, turn.notice]), [
      ["notice", "Original child completed.", undefined], ["notice", "Continued child completed.", undefined], ["notice", "Retried child completed.", undefined],
      ["notice", "", "subagent-input"], ["notice", "Ordinary peer text", undefined],
      ...Array.from({ length: 6 }, () => ["notice", "", "peer-update"]),
    ], "each historical attempt keeps its own summary; incomplete and foreign facts cannot expose model protocol");
    await f.adapter.close();
    const changedRuntime = await createRuntime({ app: { appId: "io.molis.work.sai", appVersion: "1.0.0" }, host: inspector, preset: "local-agent" });
    const changedSession = await changedRuntime.sessions.open(childSession.ref); assert.ok(changedSession);
    await changedSession.adoptRun(run, [{ type: "prompt", role: "user", text: "HOOK_EXTRA_CALLER", atMs: 1 }, ...events]);
    await changedRuntime.shutdown(); await f.reopen();
    const ambiguous = await port().conversation!(parent.ref, child.subagent_id);
    assert.equal(ambiguous.messages.filter(one => one.run.run_id === run.id && one.notice === "task-unavailable").length, 2);
    assert.ok(ambiguous.messages.every(one => one.text !== nextText && one.text !== "HOOK_EXTRA_CALLER"), "ambiguous callers cannot manufacture a task description or personal text");
    assert.equal(f.requests.length, before);
    const followup = await f.host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "PARENT_READ_RESULTS_59" }, { manifest, prompts: codingPrompts, authorizedDirectories: [f.root] });
    await f.until(async () => (await f.adapter.read(followup.ref)).phase === "completed");
    const currentParent = await f.adapter.read(followup.ref);
    assert.equal(currentParent.turns.filter(turn => turn.text === "PARENT_READ_RESULTS_59").length, 1);
    assert.ok(currentParent.turns.some(turn => turn.kind === "notice" && turn.text === "Continued child completed."));
    assert.ok(currentParent.turns.some(turn => turn.kind === "notice" && turn.text === "Retried child completed."));
    assert.ok(f.requests.slice(before).some(request => userTexts(request).some(body => body.includes(`run ${after.child_run.run_id}`))), `model report for ${after.child_run.run_id}`);
    assert.ok(f.requests.slice(before).some(request => userTexts(request).some(body => body.includes("SELF_WAIT_PROTOCOL"))), "self-injection stays in the model's original input");
    assert.ok(currentParent.turns.some(turn => turn.notice === "peer-update" && turn.text === ""));
    assert.ok(currentParent.turns.every(turn => !turn.text.includes("SELF_WAIT_PROTOCOL")));
    await f.reopen();
    assert.deepEqual((await f.adapter.read(followup.ref)).turns.map(turn => [turn.kind, turn.text, turn.notice]), currentParent.turns.map(turn => [turn.kind, turn.text, turn.notice]));
    // SAI-03/10: an old SDK wrote task + board protocol into caller prompts, including later Host retries.
    await f.adapter.close();
    const legacyRuntime = await createRuntime({ app: { appId: "io.molis.work.sai", appVersion: "1.0.0" }, host: inspector, preset: "local-agent" });
    const legacySession = await legacyRuntime.sessions.open(childSession.ref); assert.ok(legacySession);
    const legacyTask = "LEGACY_TASK\n\nTask board: private-board-id. Use board-read before working.";
    const legacyRetry = "Retry the prior task: " + legacyTask;
    for (const [id, text] of [[child.child_run!.run_id, legacyTask], [retried.child_run!.run_id, legacyRetry]]) {
      const ref = { kind: "run", id, revision: 1 } as const;
      const raw = await legacySession.replay(ref);
      await legacySession.adoptRun(ref, raw.map(event => event.type === "prompt" && event.role === "user" && event.source === undefined && event.steerId === undefined && event.carried === undefined ? { ...event, text } : event));
      assert.ok((await legacySession.replay(ref)).some(event => event.type === "prompt" && event.text === text), "raw history stays readable through the original SDK");
    }
    await legacyRuntime.shutdown();
    const legacyBytes = await inspector.storage.readSecure({ kind, id: parent.ref.session_id });
    let legacyIndex; try { legacyIndex = JSON.parse(new TextDecoder().decode(legacyBytes)); } finally { legacyBytes.fill(0); }
    const legacyParent = legacyIndex.attempts.find((one: { run_id: string }) => one.run_id === parent.ref.run_id);
    for (const fact of legacyParent.child_openings) fact.format = "caller-only-v1";
    legacyParent.subagent_retry_tasks[retried.child_run!.run_id] = legacyRetry;
    await saveIndex(legacyIndex); await f.reopen();
    const legacy = await port().conversation!(parent.ref, child.subagent_id);
    assert.equal(legacy.child.task, "");
    assert.deepEqual(legacy.child.continuation_task, { status: "unavailable" });
    for (const id of [child.child_run!.run_id, retried.child_run!.run_id]) {
      assert.ok(legacy.messages.some(turn => turn.run.run_id === id && turn.notice === "task-unavailable" && turn.text === ""));
    }
    assert.ok(legacy.messages.every(turn => !turn.text.includes("private-board-id") && !turn.text.includes("board-read")));
    assert.ok(legacy.messages.some(turn => turn.kind === "assistant" && turn.text === "Original child completed."));
    assert.ok(legacy.messages.some(turn => turn.kind === "user" && turn.text === text), "the person's original input receipt stays readable");
    assert.deepEqual(f.errors, []);
  } finally { release.resolve(); await f.close(); }
});

// SAI-01/03/06/08: a root-free business child uses the real action pack and original Host approval bridge.
test("business subagent's first run binds its own action session and keeps writes under review", { timeout: 60_000 }, async () => {
  let childCalls = 0, parentCalls = 0, writes = 0;
  const actionSessions: string[] = [];
  const action: ActionView = { capability_id: "fixture.save", version: 1, operation: "command", action: { title: "Save", description: "Save a note", kind: "operation", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [], input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
    provider: { provider_id: "fixture", kind: "plugin", title: "Fixture" }, availability: { available: true } };
  const client = (sessionId: string): AgentActionClient => ({ discover: async () => [action], invoke: async (_ref, input) => {
    actionSessions.push(sessionId); assert.deepEqual(input, { text: "saved by child" }); writes++; return { saved: true };
  } });
  const f = await fixture(body => {
    if (userTexts(body).some(one => one.startsWith("SAI_BUSINESS_CHILD"))) {
      childCalls++;
      const names = body.tools?.map(one => one.name) ?? [];
      assert.ok(names.includes("change-capability"));
      for (const forbidden of ["read", "write", "run-command", "delegate-work", "remember", "report-delivery"]) assert.ok(!names.includes(forbidden), forbidden);
      if (childCalls % 3 === 1) return reply({ name: "find-capabilities", input: { query: "Save" } });
      if (childCalls % 3 === 2) return reply({ name: "change-capability", input: { capability_id: "fixture.save", version: 1, provider_id: "fixture", input: { text: "saved by child" } } });
      return reply(undefined, "The requested note was saved.");
    }
    if (++parentCalls === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
      return reply({ name: "dispatch-subagent", input: { instruction: "SAI_BUSINESS_CHILD: Save one note through the approved capability.", tools: [], character, idempotencyKey: "business-child" } });
    }
    return reply(undefined, "The child is handling the note.");
  });
  try {
    const manifest: AgentManifest = { roles: [{ role_id: "parent", version: 1, name: "Parent", workspace: "business", execution: "operate", host_tools: [...BUSINESS_HOST_TOOLS, ...BUSINESS_SUBAGENT_HOST_TOOLS], prompts: [] }],
      prompts: [{ prompt_id: "child", version: 1 }], subagents: { parent_role_ids: ["parent"], roles: [{ role_id: "child", version: 1, name: "Child", execution: "operate", host_tools: [...BUSINESS_HOST_TOOLS] }] } };
    const prompts: AgentPromptText[] = [{ prompt_id: "child", version: 1, body: "Use the available business actions to finish the assigned task." }];
    const session = await f.adapter.createSession({ ...owner, title: "Business", workspace: "business" });
    const parent = await f.host.start("prologue", { ...owner, session, workspace: "business", role_id: "parent", task: "Delegate one business operation.", action_gateway: true },
      { manifest, prompts, authorizedDirectories: [], actions: async (_runtime, _validate, target) => { assert.ok(target); return client(target.session_id); } });
    await f.until(async () => (await f.adapter.subagents!.list(parent.ref))[0]?.state === "completed");
    const [child] = await f.adapter.subagents!.list(parent.ref); assert.ok(child?.child_run);
    assert.equal(writes, 1); assert.deepEqual(actionSessions, [child.child_run.session_id]); assert.notEqual(actionSessions[0], session.session_id);
    const conversation = await f.adapter.subagents!.conversation!(parent.ref, child.subagent_id);
    assert.equal(conversation.child.workspace_path, null); assert.equal(conversation.approvals.length, 0);
    const admitted = Promise.withResolvers<void>(), releaseGateway = Promise.withResolvers<void>();
    let bindings = 0;
    const nextText = "Continue the same business child once.";
    const control: AgentSubagentControl = { actor_id: owner.actor_id, original_text: nextText, execution: {
      beforeDispatch: async () => undefined,
      subagentGateway: async (_role, ownSession) => { bindings++; admitted.resolve(); await releaseGateway.promise; return { operate: true, client: client(ownSession.session_id) }; },
    } };
    const command: AgentSubagentCommand = { kind: "continue", text: nextText, child_run: child.child_run, request_id: "business-continue" };
    const continued = f.adapter.subagents!.command!(parent.ref, child.subagent_id, command, control);
    await admitted.promise;
    await assert.rejects(f.adapter.subagents!.command!(parent.ref, child.subagent_id, { ...command, request_id: "competing-continue" }, control), { code: "agent.session_busy" });
    releaseGateway.resolve();
    assert.equal((await continued).state, "applied");
    await f.until(async () => (await f.adapter.subagents!.list(parent.ref))[0]?.state === "completed");
    assert.equal(bindings, 1); assert.equal(writes, 2); assert.equal(childCalls, 6);
    assert.deepEqual(actionSessions, [child.child_run.session_id, child.child_run.session_id]);

    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

// SAI-06/08/09: original pending owner, real child without a SessionIndex, live and normal-shutdown recovery.
for (const parked of [false, true]) test(`child original question answers once${parked ? " after normal shutdown and resumes only its queued answer" : " while live"}`, { timeout: 60_000 }, async () => {
  let childCalls = 0, parentCalls = 0;
  const f = await fixture(body => {
    if (userTexts(body).includes("Dispatch the question child.")) {
      if (++parentCalls > 1) return reply(undefined, "Parent finished.");
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
      return reply({ name: "dispatch-subagent", input: { instruction: "SAI_QUESTION_CHILD: ask the original duration question.", tools: [], character, idempotencyKey: "question-child", background: true } });
    }
    if (++childCalls === 1) return reply({ name: "ask-user", input: { why: "约复盘会", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true }] } });
    assert.match(JSON.stringify(body.messages), /45/u, "the actual child model consumes the original answer");
    return reply(undefined, "The child recorded 45 minutes.");
  });
  try {
    const manifest = structuredClone(codingAgentManifest); manifest.subagents!.roles = manifest.subagents!.roles.filter(one => one.role_id === "coding-reader");
    const directory = { canonical_path: f.root, realpath_verified: true };
    const session = await f.adapter.createSession({ ...owner, title: "Original question parent", directory });
    const parent = await f.host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Dispatch the question child." }, { manifest, prompts: codingPrompts, authorizedDirectories: [f.root] });
    const port = () => f.adapter.subagents!;
    await f.until(async () => { const [one] = await port().list(parent.ref); return !!one && (await port().conversation!(parent.ref, one.subagent_id)).questions.length === 1; });
    const [child] = await port().list(parent.ref); assert.ok(child?.child_run);
    await f.until(async () => (await f.adapter.read(parent.ref)).phase === "completed");
    const beforeParent = parentCalls;
    if (parked) await f.reopen();
    const view = await port().conversation!(parent.ref, child.subagent_id), question = view.questions[0]!;
    assert.equal(question.questions?.[0]?.prompt, "时长"); assert.equal(question.questions?.[0]?.type, "number");
    assert.equal(question.answerable, true); assert.equal(question.parked, parked ? true : undefined);
    const control: AgentSubagentControl = { actor_id: owner.actor_id, execution: {} };
    const answer: AgentSubagentCommand = { kind: "answer", request_id: "duration-answer", child_run: child.child_run, pending_id: question.pending_id, pending_revision: question.pending_revision!, answers: [{ question: 0, value: 45 }] };
    const invalid = await port().command!(parent.ref, child.subagent_id, { ...answer, request_id: "invalid-duration", answers: [{ question: 0, value: 1 }] }, control);
    assert.equal(invalid.state, "not-applied"); assert.equal((await port().conversation!(parent.ref, child.subagent_id)).questions.length, 1);
    const wrong = await port().command!(parent.ref, child.subagent_id, { ...answer, request_id: "wrong-pending", pending_id: "foreign" }, control);
    assert.equal(wrong.state, "not-applied");
    const accepted = await port().command!(parent.ref, child.subagent_id, answer, control);
    assert.equal(accepted.state, "applied"); assert.ok(accepted.state === "applied"); assert.equal(accepted.answer_delivery, parked ? "queued" : "delivered");
    assert.deepEqual(await port().command!(parent.ref, child.subagent_id, answer, control), accepted);
    await assert.rejects(port().command!(parent.ref, child.subagent_id, { ...answer, answers: [{ question: 0, value: 60 }] }, control));
    if (parked) {
      assert.equal(childCalls, 1, "answer acceptance does not implicitly start a child or parent");
      const waiting = await port().conversation!(parent.ref, child.subagent_id);
      assert.deepEqual(waiting.queued_answer, { pending_id: question.pending_id, pending_revision: question.pending_revision });
      const resume: AgentSubagentCommand = { kind: "resume-answer", request_id: "resume-duration", child_run: child.child_run, pending_id: question.pending_id, pending_revision: question.pending_revision! };
      const resumed = await port().command!(parent.ref, child.subagent_id, resume, control);
      assert.equal(resumed.state, "applied"); assert.deepEqual(await port().command!(parent.ref, child.subagent_id, resume, control), resumed);
    }
    await f.until(async () => (await port().list(parent.ref))[0]?.state === "completed");
    assert.equal(childCalls, 2); assert.equal(parentCalls, beforeParent);
    assert.equal((await port().conversation!(parent.ref, child.subagent_id)).questions.length, 0);
    await f.reopen();
    assert.deepEqual(await port().checkRequest!(parent.ref, child.subagent_id, answer.request_id, owner.actor_id), accepted);
    assert.equal(childCalls, 2); assert.equal(parentCalls, beforeParent);
  } finally { await f.close(); }
});

// SAI-09: stopping one exact child Run must not abort its sibling's model or input queue.
test("stopping one SDK child leaves its sibling running and able to consume personal input", { timeout: 60_000 }, async () => {
  const releaseA=Promise.withResolvers<void>(),releaseB=Promise.withResolvers<void>();
  let parentCalls=0,aCalls=0,bCalls=0;
  const supplement="SAI_SIBLING_B_PERSON_INPUT";
  const f=await fixture(async body=>{
    const first=userTexts(body)[0]??"";
    if(first.startsWith("SAI_SIBLING_A")){aCalls++;await releaseA.promise;return reply(undefined,"A late result");}
    if(first.startsWith("SAI_SIBLING_B")){
      if(++bCalls===1){await releaseB.promise;return reply({name:"context-remaining",input:{}});}
      assert.ok(userTexts(body).some(text=>text.includes(supplement)));return reply(undefined,"B finished with its own supplement");
    }
    if(++parentCalls<=2){
      const character=JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0];assert.ok(character);
      const child=parentCalls===1?"A":"B";
      return reply({name:"dispatch-subagent",input:{instruction:`SAI_SIBLING_${child}: independently read.`,tools:[],character,idempotencyKey:`sibling-${child}`,background:true}});
    }
    return reply(undefined,"Parent finished its original turn.");
  });
  try{
    const manifest=structuredClone(codingAgentManifest);manifest.subagents!.roles=manifest.subagents!.roles.filter(one=>one.role_id==="coding-reader");
    const directory={canonical_path:f.root,realpath_verified:true};
    const session=await f.adapter.createSession({...owner,title:"Independent siblings",directory});
    const parent=await f.host.start("prologue",{...owner,session,directory,role_id:"coordinator",task:"Dispatch A and B."},{manifest,prompts:codingPrompts,authorizedDirectories:[f.root]});
    await f.until(()=>aCalls===1&&bCalls===1);
    const children=await f.adapter.subagents!.list(parent.ref);assert.equal(children.length,2);
    const a=children.find(one=>one.task.startsWith("SAI_SIBLING_A"))!,b=children.find(one=>one.task.startsWith("SAI_SIBLING_B"))!;
    assert.ok(a?.child_run);assert.ok(b?.child_run);
    const port=f.adapter.subagents!,control={actor_id:owner.actor_id,execution:{}};
    assert.equal((await port.command!(parent.ref,a.subagent_id,{kind:"stop",child_run:a.child_run,request_id:"stop-only-A"},control)).state,"applied");
    assert.equal((await port.list(parent.ref)).find(one=>one.subagent_id===b.subagent_id)?.state,"running");
    assert.equal((await port.command!(parent.ref,b.subagent_id,{kind:"send",child_run:b.child_run,text:supplement,request_id:"send-only-B"},{...control,original_text:supplement})).state,"applied");
    releaseB.resolve();releaseA.resolve();
    await f.until(async()=>(await port.list(parent.ref)).find(one=>one.subagent_id===b.subagent_id)?.state==="completed");
    const final=await port.list(parent.ref);
    assert.equal(final.find(one=>one.subagent_id===a.subagent_id)?.state,"cancelled");
    const original=await port.conversation!(parent.ref,b.subagent_id);
    assert.equal(original.messages.filter(one=>one.text===supplement).length,1);
    assert.equal(bCalls,2);assert.equal(aCalls,1);assert.equal(parentCalls,3);
  }finally{releaseA.resolve();releaseB.resolve();await f.close();}
});
