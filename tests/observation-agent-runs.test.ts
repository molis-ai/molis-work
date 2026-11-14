import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunHandle, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ObservationRecorder } from "@molis-ai/molis-work-contracts/services/observation";
import { ObservationLayer, observationKeys, readRecords, snapshotText } from "@molis-ai/molis-work-service-observation";

// OCL-01, OCL-03, OCL-05, OCL-06 (specs/observation-collection/spec.md; contract-design §4): an Agent round is recorded by agent-host through the
// recorder the Host binds when the round starts, from the runtime's own events, joined to the call that started it. Real Node, HTTP and
// SQLite; the model's reply is scripted, so this is engineering evidence of what is recorded, not of model quality.

const project = "agent-records", plugin = "io.molis.work.coding";
const owner = { project_id: project, plugin_id: plugin, install_id: "coding-install", actor_id: LOCAL_PERSON_ACTOR_ID };

async function finished(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, handle: AgentRunHandle): Promise<AgentRunView> {
  const until = Date.now() + 15_000;
  for (;;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); return view; }
    if (Date.now() > until) assert.fail(`Run did not finish: ${view.phase}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function round(t: test.TestContext, observeRun: (start: { owner: typeof owner; call_id?: string }) => ObservationRecorder | undefined) {
  const home = await mkdtemp(join(tmpdir(), "observation-agent-runs-")), received: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    received.push(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"model":"scripted","choices":[{"index":0,"delta":{"content":"Ready to "},"finish_reason":null}]}\n\n'
      + 'data: {"model":"scripted","choices":[{"index":0,"delta":{"content":"help."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), observeRun,
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  t.after(async () => {
    await adapter.dispose?.(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  });
  const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "reader", title: "Work records" });
  const skill = { source: { kind: "plugin" as const, plugin_id: plugin, plugin_version: "1.0.0", publisher_signature: "fixture" }, skill_id: "release-notes", version: 2,
    install_id: owner.install_id, installation_generation: "g1" };
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "reader", task: "Summarise the release notes", skills: [skill],
    text_materials: [{ material_id: "m1", title: "Release notes", text: "v2: faster sync; fixed login", source_artifact_id: "artifact-7", source_version: 3 }],
    role: { role_id: "reader", version: 3, workspace: "business", execution: "read-only", host_tools: [],
      prompts: [{ prompt_id: "reader.base", version: 4, body: "Read carefully; answer in one line." }],
      skills: [{ ref: skill, origin: "own", name: "Release notes", tools: [], named: true, body: "Group the notes by area." }] } }, { call_id: "call-start-1" });
  return { home, handle, received, view: await finished(adapter, handle) };
}

test("OCL-01 OCL-03 OCL-05 OCL-06: an Agent round records its start, the prompt and Skill bodies it was sent, the full request the model received, the reply, usage with its model and its end, joined to the starting call", async t => {
  const secrets = new Map<string, string>(), layerHome = await mkdtemp(join(tmpdir(), "observation-agent-layer-"));
  const keys = observationKeys({ get: key => secrets.get(key) ?? null, createIfAbsent: (key, value) => { if (secrets.has(key)) return false; secrets.set(key, value); return true; } }, () => false);
  const layer = new ObservationLayer({ home: layerHome, env: { platformVersion: "0.test", now: () => new Date(), projectClass: () => "user" }, keys: () => keys, flushDelayMs: 5 });
  t.after(async () => { layer.close(); await rm(layerHome, { recursive: true, force: true }); });
  const starts: unknown[] = [];
  const { handle, received } = await round(t, start => {
    starts.push(start);
    return layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: start.owner.actor_id, project_id: start.owner.project_id,
      install_id: start.owner.install_id, ...(start.call_id ? { call_id: start.call_id } : {}) });
  });
  assert.deepEqual(starts, [{ owner, call_id: "call-start-1" }], "bound once, when the round started, to its session's owner and the starting call");
  layer.flush();
  const db = layer.writer.database()!.db, records = readRecords(db, { run_id: handle.ref.run_id });
  const facts = records.map(record => `${record.fact}:${record.stage ?? ""}:${record.outcome}`);
  assert.equal(facts[0], "agent.run:started:succeeded");
  assert.equal(facts.at(-1), "agent.run:ended:succeeded");
  assert.ok(facts.includes("agent.instructions::succeeded") && facts.includes("agent.skill:effective:succeeded"), facts.join(" "));
  assert.ok(facts.includes("agent.reply::succeeded"), facts.join(" "));
  assert.ok(facts.includes("agent.usage:model:succeeded"), facts.join(" "));
  for (const record of records) {
    assert.deepEqual([record.owner, record.entry, record.actor.actor_id, record.project_id, record.install_id, record.work.call_id, record.work.run_id, record.source_class],
      [{ kind: "service", id: "agent" }, "agent", LOCAL_PERSON_ACTOR_ID, project, "coding-install", "call-start-1", handle.ref.run_id, "real"], record.fact);
    assert.deepEqual(record.subjects[0], { kind: "agent_session", id: handle.ref.session_id });
  }
  const find = (fact: string) => records.find(record => record.fact === fact)!;
  const started = records[0]!, text = (role: string, record = started) => {
    const ref = record.evidence.find(item => item.role === role)?.ref;
    assert.equal(ref?.kind, "snapshot", `${record.fact} ${role}`);
    return snapshotText(db, keys, ref.kind === "snapshot" ? ref.digest : "");
  };
  assert.equal(text("task"), "Summarise the release notes");
  assert.deepEqual(started.conditions.model, { provider: "openai-compatible", model_id: "scripted" });
  assert.equal(started.detail.role_version, 3);
  assert.deepEqual(started.conditions.prompts, [{ key: "reader.base", version: 4 }]);
  assert.deepEqual(started.conditions.skills, [{ id: "release-notes", version: 2 }]);
  // OCL-06: the bodies in force when the round started, not their names alone.
  assert.equal(text("prompt:reader.base", find("agent.instructions")), "Read carefully; answer in one line.");
  assert.equal(text("body", find("agent.skill")), "Group the notes by area.");
  assert.deepEqual(find("agent.skill").subjects[1], { kind: "skill", id: "release-notes", version: 2 });
  assert.equal(text("material:m1", find("agent.materials")), "v2: faster sync; fixed login", "the text the model could read, as it was");
  assert.deepEqual(find("agent.materials").subjects[1], { kind: "artifact", id: "artifact-7", version: 3 });
  assert.equal(text("reply", find("agent.reply")), "Ready to help.", "one reply per model call, its deltas joined");
  // The request the model received, byte for byte as the runtime sent it, one per model call and joined to that call's usage.
  const requests = records.filter(record => record.fact === "agent.model_request"), usage = find("agent.usage");
  assert.equal(requests.length, received.length, "one record per request the model server received");
  assert.deepEqual([requests[0]!.stage, requests[0]!.outcome, requests[0]!.conditions.model], ["response-observed", "succeeded", { provider: "openai-compatible", model_id: "scripted" }]);
  const sent = text("request", requests[0]!);
  assert.equal(sent, received[0], "what was kept is what the model received");
  assert.match(sent, /Summarise the release notes/u);
  assert.match(sent, /Group the notes by area\./u);
  assert.equal(requests[0]!.detail.bytes, Buffer.byteLength(received[0]!));
  assert.ok(!sent.includes("test-only"), "the credential is not in the request body");
  assert.equal(requests[0]!.detail.model_call_id, usage.detail.model_call_id, "the request and its usage are the same model call");
  assert.deepEqual({ ...usage.detail, model_call_id: undefined }, { input_tokens: 20, output_tokens: 2, model_call_id: undefined });
});

test("OCL-15: a recorder that fails never stops or changes the round it records, and a round with no recorder runs as before", async t => {
  const broken = await round(t, () => ({ record: () => { throw new Error("recorder fault"); } }));
  assert.equal(broken.view.turns.at(-1)?.text, "Ready to help.");
  const unbound = await round(t, () => undefined);
  assert.equal(unbound.view.turns.at(-1)?.text, "Ready to help.");
});

// A subagent's round (review B1 on #2059): its start and end are recorded in the round that dispatched it, and every request it sent is
// recorded as its own run's work, naming the dispatching run, byte for byte. Its own stream is not followed (coverage says so).
test("OCL-01 OCL-05 OCL-09: a subagent's start, end and every request it sent are recorded, joined to the round that dispatched it", { timeout: 60_000 }, async t => {
  const secrets = new Map<string, string>(), home = await mkdtemp(join(tmpdir(), "observation-subagent-"));
  const keys = observationKeys({ get: key => secrets.get(key) ?? null, createIfAbsent: (key, value) => { if (secrets.has(key)) return false; secrets.set(key, value); return true; } }, () => false);
  const layer = new ObservationLayer({ home: join(home, "layer"), env: { platformVersion: "0.test", now: () => new Date(), projectClass: () => "user" }, keys: () => keys, flushDelayMs: 5 });
  const childBodies: string[] = [];
  let parentCalls = 0;
  const reply = (text: string, tool?: { name: string; input: unknown }) => {
    const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${parentCalls}`, name: tool.name, input: tool.input } : { type: "text", text: "" } });
    if (!tool) emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
    emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } }); emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  };
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const raw = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array), body = JSON.parse(raw);
    // The child's opening message is its instruction; the parent's later requests carry that text only inside the dispatch call.
    const opening = (message: { content: unknown }) => typeof message.content === "string" ? message.content : ((message.content ?? []) as { text?: string }[]).map(block => block.text ?? "").join("");
    if ((body.messages as { role: string; content: unknown }[]).some(message => message.role === "user" && opening(message).startsWith("CHILD_TASK_7Q"))) { childBodies.push(raw); return reply("Child read it."); }
    parentCalls++;
    if (parentCalls === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
      return reply("", { name: "dispatch-subagent", input: { instruction: "CHILD_TASK_7Q: read sample.txt once.", tools: ["read"], character, idempotencyKey: "records-child" } });
    }
    const ref = JSON.stringify(body.messages).match(/sub-[a-z0-9-]+/u)?.[0];
    if (parentCalls === 2 && ref) return reply("", { name: "await-subagents", input: { refs: [ref], mode: "all" } });
    return reply("Delegated and done.");
  });
  const queue = new AgentReviewQueue(), root = join(home, "work");
  await mkdir(root); await writeFile(join(root, "sample.txt"), "CHILD FILE");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.observation-subagent", appVersion: "1.0.0" }, storageRoot: join(home, "runtime"), reviewQueue: queue,
    observeRun: start => layer.sink("agent").bind({ kind: "background", entry: "agent", actor_id: start.owner.actor_id, project_id: start.owner.project_id, install_id: start.owner.install_id }),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  t.after(async () => { await adapter.close(); layer.close(); await rm(home, { recursive: true, force: true }); });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Parent" });
  const handle = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Delegate one read." },
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
  const decided = new Set<string>();
  for (const deadline = Date.now() + 40_000; ;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); break; }
    if (Date.now() > deadline) assert.fail(`Run did not finish: ${view.phase}`);
    for (const review of queue.list(project, "pending")) if (!decided.has(review.review_id)) { decided.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: LOCAL_PERSON_ACTOR_ID }); }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const [child] = await adapter.subagents!.list(handle.ref); assert.ok(child);
  layer.flush();
  const db = layer.writer.database()!.db, parent = readRecords(db, { run_id: handle.ref.run_id }), own = readRecords(db, { run_id: child.child_run.run_id });
  const dispatched = parent.filter(record => record.fact === "agent.subagent").map(record => [record.stage, record.outcome, record.detail.child_run_id, record.subjects[1]]);
  assert.deepEqual(dispatched, [["started", "succeeded", child.child_run.run_id, { kind: "agent_session", id: child.child_run.session_id }],
    ["ended", "succeeded", child.child_run.run_id, { kind: "agent_session", id: child.child_run.session_id }]]);
  const requests = own.filter(record => record.fact === "agent.model_request");
  assert.equal(requests.length, childBodies.length, "one record per request the child sent");
  assert.ok(childBodies.length > 0);
  for (const [index, record] of requests.entries()) {
    assert.deepEqual([record.detail.parent_run_id, record.subjects, record.project_id], [handle.ref.run_id, [{ kind: "agent_session", id: child.child_run.session_id }], project]);
    const ref = record.evidence.find(item => item.role === "request")?.ref;
    assert.equal(ref?.kind === "snapshot" ? snapshotText(db, keys, ref.digest) : undefined, childBodies[index], "what was kept is what the model received");
  }
  assert.ok(parent.filter(record => record.fact === "agent.model_request").every(record => record.detail.parent_run_id === undefined), "the round's own requests name no parent");
});
