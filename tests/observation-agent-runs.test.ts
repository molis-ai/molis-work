import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
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
  const home = await mkdtemp(join(tmpdir(), "observation-agent-runs-"));
  const server = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
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
    role: { role_id: "reader", version: 3, workspace: "business", execution: "read-only", host_tools: [],
      prompts: [{ prompt_id: "reader.base", version: 4, body: "Read carefully; answer in one line." }],
      skills: [{ ref: skill, origin: "own", name: "Release notes", tools: [], named: true, body: "Group the notes by area." }] } }, { call_id: "call-start-1" });
  return { home, handle, view: await finished(adapter, handle) };
}

test("OCL-01 OCL-03 OCL-05 OCL-06: an Agent round records its start, the prompt and Skill bodies it was sent, the reply, usage with its model and its end, joined to the starting call", async t => {
  const secrets = new Map<string, string>(), layerHome = await mkdtemp(join(tmpdir(), "observation-agent-layer-"));
  const keys = observationKeys({ get: key => secrets.get(key) ?? null, createIfAbsent: (key, value) => { if (secrets.has(key)) return false; secrets.set(key, value); return true; } }, () => false);
  const layer = new ObservationLayer({ home: layerHome, env: { platformVersion: "0.test", now: () => new Date(), projectClass: () => "user" }, keys: () => keys, flushDelayMs: 5 });
  t.after(async () => { layer.close(); await rm(layerHome, { recursive: true, force: true }); });
  const starts: unknown[] = [];
  const { handle } = await round(t, start => {
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
  assert.equal(text("reply", find("agent.reply")), "Ready to help.", "one reply per model call, its deltas joined");
  assert.deepEqual(find("agent.usage").detail, { input_tokens: 20, output_tokens: 2 });
});

test("OCL-15: a recorder that fails never stops or changes the round it records, and a round with no recorder runs as before", async t => {
  const broken = await round(t, () => ({ record: () => { throw new Error("recorder fault"); } }));
  assert.equal(broken.view.turns.at(-1)?.text, "Ready to help.");
  const unbound = await round(t, () => undefined);
  assert.equal(unbound.view.turns.at(-1)?.text, "Ready to help.");
});
