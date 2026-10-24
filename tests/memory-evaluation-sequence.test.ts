import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluationPerson } from "../scripts/memory-evaluation/originals.mjs";
import { MEMORY_EVALUATION_SEQUENCES, MEMORY_SEQUENCE_PROTOCOL } from "./fixtures/memory-evaluation-sequences.js";
import { observeMemoryFormation, replayMemorySequences } from "../scripts/memory-evaluation/sequence-replay.mjs";
import { summarizeMemoryReport } from "../scripts/memory-evaluation/report.mjs";
import { observeEmittedMemory } from "../scripts/memory-evaluation/request-observation.mjs";
import type { AgentMemoryRecallFact } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryClassRestriction } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryEvaluationEnvironment } from "../scripts/memory-evaluation/replay.mjs";

test("MEM-36: the frozen corpus separates layers, complete sequences and approved history from formation labels", () => {
  const layers = new Set(MEMORY_EVALUATION_SEQUENCES.map(item => item.layer));
  for (const layer of layers) assert.deepEqual(MEMORY_EVALUATION_SEQUENCES.filter(item => item.layer === layer).map(item => item.split).sort(), ["held-out", "tuning"]);
  assert.equal(MEMORY_EVALUATION_SEQUENCES.length * MEMORY_SEQUENCE_PROTOCOL.repeats * 6, MEMORY_SEQUENCE_PROTOCOL.budget.maxNetworkAttempts);
  assert.ok(MEMORY_EVALUATION_SEQUENCES.filter(item => item.layer === "source-attribution").every(item => item.seeds.length === 0));
  assert.ok(MEMORY_EVALUATION_SEQUENCES.every(item => item.sources.length === 2 && item.tasks.length === 2));
});

test("MEM-36: observation reads the existing ledger without triggering candidate expiry", async () => {
  const env = await memoryEvaluationEnvironment(undefined, { seeds: [] });
  try {
    await env.memory.propose(evaluationPerson(null, "assistant"), {
      scope: "personal", text: "周报先写结论", kind: "preference", basis: "explicit", why: "用户原话", from: "work",
    });
    env.setClock("2026-11-30T00:00:00.000Z");
    assert.deepEqual(env.inspectLedger().candidates.map(candidate => candidate.state), ["pending"]);
    assert.deepEqual(env.inspectLedger().candidates.map(candidate => candidate.state), ["pending"], "an observation must not run the lifecycle expiry action");
  } finally { await env.close(); }
});

test("MEM-36: continuous sequences use real formation, candidate promotion, emitted wrappers and per-event checkpoints", { timeout: 60_000 }, async () => {
  const limits: number[] = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); limits.push(body.max_tokens);
    let text = "fixture task answer";
    if (body.max_tokens === 1500) {
      const prompt = body.messages.flatMap((message: { content: string | { text?: string }[] }) => typeof message.content === "string" ? [message.content] : message.content.map(part => part.text ?? "")).join("\n");
      const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));
      const slot = data.destinations.find((group: { scope: string; replacement?: string }) => group.scope === "project" && !group.replacement)?.slots.convention[0];
      assert.ok(slot, "fixture chooses a supplied destination, not a precomputed candidate id");
      text = JSON.stringify({ drafts: [{ slot_id: slot, text: data.sources[0].text, suggested_basis: "explicit",
        evidence: data.sources.map((source: { id: string; text: string }) => ({ source_id: source.id, quote: source.text })) }] });
    }
    const frames: string[] = [];
    const emit = (type: string, content: object) => frames.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...content })}\n\n`);
    emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 29, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }); emit("message_stop", {});
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(frames.join(""));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const checkpoints: number[] = [];
  const fixtureCheckpoints: number[] = [];
  try {
    const sample = MEMORY_EVALUATION_SEQUENCES[0]!;
    const sequence = { ...sample, sources: [{ ...sample.sources[0], text: "以后 Atlas 项目使用 pnpm 安装依赖。" }, { ...sample.sources[1], text: "以后 Atlas 项目使用 pnpm 安装依赖。" }] as const };
    const report = await replayMemorySequences({ endpoint, protocol: "anthropic-compatible", model: "fixture", credential_ref: "fixture" }, "fixture-key",
      async progress => { checkpoints.push(progress.rows.length); fixtureCheckpoints.push(progress.fixtureRequests.length); }, [sequence], 1);
    assert.ok(report.rows.every(row => row.status === "observed"), JSON.stringify(report.rows.filter(row => row.status !== "observed")));
    assert.deepEqual(checkpoints, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(report.attempts, 6);
    assert.equal(report.fixtureRequests.length, 4, "source setup is real loopback HTTP and reported separately from evaluated attempts");
    assert.equal(fixtureCheckpoints.at(-1), 4, "partial reports retain source setup attempts too");
    assert.equal(report.schema, "molis-memory-sequence-b2-v2");
    assert.notEqual(report.source.molisCommit, report.source.historicalBaseline.molisCommit);
    assert.deepEqual(limits.sort(), [1024, 1024, 1024, 1024, 1500, 1500]);
    const task = report.rows.find(row => row.arm === "B2" && row.event === "task2")!;
    const observation = task.observation;
    assert.ok(observation && typeof observation === "object" && "finalMemory" in observation);
    const finalMemory = observation.finalMemory;
    assert.ok(finalMemory && typeof finalMemory === "object" && "tokens" in finalMemory && typeof finalMemory.tokens === "number" && finalMemory.tokens > 0, JSON.stringify(report.rows.filter(row => row.arm === "B2")));
    assert.ok("messages" in finalMemory && Array.isArray(finalMemory.messages));
    assert.match(finalMemory.messages[0]!.content, /以后 Atlas 项目使用 pnpm 安装依赖。/);
    const formed = report.rows.find(row => row.arm === "B2" && row.event === "source2")!.observation as { outcome: { learned: Array<{ memory_id: string; outcome: string }> } };
    const promoted = formed.outcome.learned.find(item => item.outcome === "written");
    assert.ok(promoted?.memory_id, JSON.stringify(formed.outcome));
    assert.ok("contextCalls" in observation);
    const calls = observation.contextCalls as AgentMemoryRecallFact["contexts"];
    assert.equal(calls?.length, 1);
    assert.equal(calls[0]!.status, "response-observed");
    assert.deepEqual(calls[0]!.references.map(ref => ({ id: ref.memory_id, version: ref.version })), [{ id: promoted.memory_id, version: 1 }]);
    assert.ok(calls[0]!.parts.length > 0);
    const observed = observeEmittedMemory(report.requests.slice(task.attemptRange.startInclusive), calls);
    assert.equal(observed.messageAssociation.state, "unknown", "separate facts do not invent a message-to-reference mapping");
    for (const context of [null, [...calls].reverse(), calls.map(call => ({ ...call, parts: call.parts.map(part => ({ ...part, index: 1000 })) }))]) {
      const changed = observeEmittedMemory([...report.requests].reverse(), context);
      assert.equal(changed.messageAssociation.state, "unknown", "missing, reordered or incompatible indices never imply a match");
      assert.equal(changed.tokens, observed.tokens, "actual HTTP wrapper cost does not depend on receipt matching");
    }
    assert.ok("basis" in finalMemory && finalMemory.basis === "conservative-estimate");
    assert.equal(task.attemptRange.endExclusive - task.attemptRange.startInclusive, 1);
    const summary = summarizeMemoryReport({ ...report, stage: "completed", rows: [] });
    assert.equal(summary.fixtureSetup?.calls, 4);
    assert.equal(summary.source, report.source);
    assert.deepEqual(summary.limitations, report.limitations);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});


test("MEM-36: a real completed original keeps the same source identity and time after reopening", { timeout: 20_000 }, async () => {
  let env = await memoryEvaluationEnvironment(undefined, { seeds: [] });
  try {
    const restriction: MemoryClassRestriction = { selector: { consumer: "assistant", current_scene: "assistant", kind: "fact" }, read: "off", form: "off" };
    env.memory.savePrefs(evaluationPerson("project-a"), "project", { class_restrictions: [restriction] });
    const first = await env.original("以后周报先写风险", "assistant", "project-a");
    assert.equal(first.sources.length, 1);
    assert.equal(first.sources[0]!.text, "以后周报先写风险");
    assert.equal(first.sources[0]!.occurred_at_ms, Date.parse("2026-10-22T00:00:00.000Z"));
    const expectedPolicy = { policy_version: 2, taxonomy_version: 1, personal: [], project: [restriction] };
    assert.deepEqual(first.original.caller.class_restrictions, expectedPolicy);
    const session = { runtime_id: "prologue", session_id: first.original.caller.session_id! };
    assert.deepEqual((await env.adapter.readSession(session)).latest_run?.class_restrictions, expectedPolicy);
    const homeDirectory = env.home;
    await env.close(false);
    env = await memoryEvaluationEnvironment(undefined, { seeds: [], homeDirectory, clock: "2026-11-01T00:00:00Z" });
    env.memory.savePrefs(evaluationPerson("project-a"), "project", { class_restrictions: [] });
    const replay = await env.original("以后周报先写风险", "assistant", "project-a", first.original);
    assert.deepEqual(replay.sources, first.sources);
    assert.deepEqual(replay.original.caller.class_restrictions, expectedPolicy, "current settings cannot replace the original Run snapshot");
    assert.deepEqual((await env.adapter.readSession(session)).latest_run?.class_restrictions, expectedPolicy, "the original policy survives a real adapter restart");
    assert.equal(env.sourceSetup().calls, 0, "replaying an original is not a new source/model setup call");
    const { class_restrictions: _policy, ...unbound } = replay.original.caller;
    const denied = await env.memory.learnFromWork({ ...unbound, operation_id: "evaluation-missing-run-policy" }, { said: ["以后周报先写风险"], sources: replay.sources });
    assert.equal(denied.formation.outcome, "failed");
    assert.equal(denied.formation.code, "MEMORY_SCOPE_DENIED");
    assert.equal(denied.formation.extraction.calls, 0, "missing original policy is refused before extraction");
  } finally { await env.close(); }
});

test("MEM-36: partial SDK formation remains failed while preserving committed items and reported usage", { timeout: 20_000 }, async t => {
  let requests = 0;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    requests++;
    const body = JSON.parse(raw);
    const prompt = body.messages.flatMap((message: { content: string | { text?: string }[] }) => typeof message.content === "string"
      ? [message.content] : message.content.map(part => part.text ?? "")).join("\n");
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));
    const slots = data.destinations.find((group: { scope: string; replacement?: string }) => group.scope === "project" && !group.replacement).slots.convention.slice(0, 2);
    assert.equal(slots.length, 2);
    const text = JSON.stringify({ drafts: slots.map((slot_id: string) => ({ slot_id, text: data.sources[0].text, suggested_basis: "inferred",
      evidence: [{ source_id: data.sources[0].id, quote: data.sources[0].text }] })) });
    const frames: string[] = [];
    const emit = (type: string, content: object) => frames.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...content })}\n\n`);
    emit("message_start", { message: { id: "partial", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 29, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }); emit("message_stop", {});
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(frames.join(""));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const env = await memoryEvaluationEnvironment({ modelConfiguration: async () => ({ endpoint, protocol: "anthropic-compatible", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-key" }, { seeds: [] });
  try {
    const sample = MEMORY_EVALUATION_SEQUENCES[0]!;
    const sequence = { ...sample, sources: [{ ...sample.sources[0], text: "以后 Atlas 项目使用 pnpm 安装依赖。" }, sample.sources[1]] as const };
    const original = await env.original(sequence.sources[0].text, "coding", "project-a");
    const memory = env.adapter.memory!.withCaller(original.original.caller);
    const read = env.adapter.readOriginalInput!.bind(env.adapter);
    // Inject a current source-owner failure only after the first actual SDK candidate is durable.
    const records = join(env.home, "sdk", "records", "io.molis.work~memory-candidates");
    const lookup = t.mock.method(env.adapter, "readOriginalInput", async (ref: Parameters<typeof read>[0]) => {
      if (existsSync(records) && readdirSync(records).some(name => name.endsWith(".json"))) return undefined;
      return read(ref);
    });
    const observation = await observeMemoryFormation(env, sequence, 0, 0, {
      MOLIS_WORK_TEXT_API_KEY: "fixture-key", MOLIS_WORK_TEXT_BASE_URL: endpoint.replace(/\/v1\/messages$/, ""),
      MOLIS_WORK_TEXT_MODEL: "fixture", MOLIS_WORK_TEXT_API_FORMAT: "anthropic-messages",
    }, original.original);
    lookup.mock.restore();
    assert.equal(requests, 1);
    assert.equal(observation.outcome?.formation.outcome, "partial");
    assert.deepEqual(observation.outcome.formation.items.map(item => item.outcome), ["created", "unknown"]);
    assert.deepEqual(observation.outcome.formation.extraction, { calls: 1, usage: { input_tokens: 29, output_tokens: 3 } });
    assert.equal(observation.outcome.recording_error, undefined);
    assert.equal(observation.outcome.learned.length, 1);
    assert.equal((await memory.candidates.list("project", "project-a")).length, 1);
    assert.equal(env.inspectLedger().candidates.length, 1);
    assert.ok(observation.error, "a partial formation must not be emitted as an observed/successful sequence row");
  } finally { await env.close(); }
});
