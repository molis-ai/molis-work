import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, waitForSubagentChange } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { BUSINESS_HOST_TOOLS, BUSINESS_SUBAGENT_HOST_TOOLS, type AgentManifest, type AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentSubagentCommand, AgentSubagentControl, AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";

interface Wire { system?: unknown; tools?: Array<{ name: string }>; messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }> }
const userTexts = (body: Wire) => body.messages.filter(one => one.role === "user").map(one => typeof one.content === "string" ? one.content : one.content.map(part => part.text ?? "").join(""));
const owner = { project_id: "p", plugin_id: "io.molis.work.fixture", install_id: "i", actor_id: "person" };

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
      for (const item of queue.list(owner.project_id, "pending")) await queue.respond({ review_id: item.review_id, actor_id: owner.actor_id, decision: "approve" });
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
      return reply(undefined, childCalls === 2 ? "Original child completed." : "Continued child completed.");
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
    const before = f.requests.length;
    await f.reopen();
    assert.deepEqual(await port().checkRequest!(parent.ref, child.subagent_id, send.request_id, owner.actor_id), accepted);
    assert.deepEqual(await port().checkRequest!(parent.ref, child.subagent_id, next.request_id, owner.actor_id), continued);
    const restored = await port().conversation!(parent.ref, child.subagent_id);
    assert.ok(restored.messages.some(one => one.text === nextText));
    assert.equal(new Set(restored.messages.map(one => one.turn_id)).size, restored.messages.length);
    assert.equal(f.requests.length, before, "reading and reopening cannot restart either agent");
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
