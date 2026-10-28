import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { memoryPhaseObservation } from "../scripts/memory-evaluation/memory-phase-observation.mjs";
import { assertEvaluationArm } from "../scripts/memory-evaluation/environment.mjs";
import { createServer } from "node:http";
import { evaluationPerson } from "../scripts/memory-evaluation/originals.mjs";
import { MEMORY_EVALUATION_CORPUS } from "./fixtures/memory-evaluation-corpus.js";
import { memoryEvaluationEnvironment, replayMemoryEvaluationCase, scoreSelection } from "../scripts/memory-evaluation/replay.mjs";
import { observeEvaluationRequests, replayMemoryModelCase, runMemoryEvaluationTask } from "../scripts/memory-evaluation/model-replay.mjs";

test("MEM-36: evaluation keeps independent labels, missing/irrelevant selections and unknown costs distinct", () => {
  const item = MEMORY_EVALUATION_CORPUS.cases[0];
  const score = scoreSelection(item, [{ seed: "assistant-meeting", text: "安排个人会议时优先考虑下午" }]);
  assert.deepEqual(score.missing, ["project-tool"]);
  assert.deepEqual(score.irrelevant, ["assistant-meeting"]);
  assert.equal(score.precision, 0);
  assert.equal(score.recall, 0);
  const empty = scoreSelection(item, []);
  assert.equal(empty.precision, null, "no selection does not manufacture perfect precision");
  assert.equal(empty.recall, 0, "dropping the needed memory is a miss");
});

test("MEM-36: a failed production backend list still counts as one attempted read", async () => {
  const env = await memoryEvaluationEnvironment(undefined, { seeds: [] });
  try {
    await env.prepare("B2");
    env.failLists(() => { throw new Error("fixture list unavailable"); });
    await assert.rejects(env.memory.recall(evaluationPerson("project-a", "coding"), { query: "安装依赖" }), /fixture list unavailable/);
    assert.deepEqual(env.readCounts(), { calls: 1, entries: 0 });
  } finally { await env.close(); }
});

test("MEM-36: an interrupted real HTTP stream retains the observed state and recall failures stay visible", { timeout: 60_000 }, async t => {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain the actual SDK request */ }
    response.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (type: string, content: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...content })}\n\n`);
    emit("message_start", { message: { id: "partial", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 29, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "partial answer" } });
    // The stream deliberately never completes; cancellation must still account for what was observable.
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const observed = observeEvaluationRequests(endpoint, 1);
  t.after(() => observed.restore());
  const model = { modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint, model: "fixture", credential_ref: "evaluation:fixture" }), resolveCredential: () => "evaluation-fixture" };
  const env = await memoryEvaluationEnvironment(model);
  try {
    env.memory.forRun = async () => { throw new Error("fixture recall unavailable"); };
    const row = await runMemoryEvaluationTask(env, "B2", MEMORY_EVALUATION_CORPUS.cases[0], 500);
    assert.equal(row.phase, "failed");
    assert.equal(row.recallFailure, "fixture recall unavailable", "production swallowing cannot masquerade as a clean miss");
    assert.match(row.error ?? "", /超时/);
    assert.ok(row.lastObservedView);
    assert.deepEqual(row.usage, row.lastObservedView.usage, "preserve reported or explicitly unknown usage");
    assert.match(row.answer ?? "", /partial answer/);
    assert.equal(observed.requests.length, 1);
    assert.equal(row.memoryPhases.method, "sdk-opening-memory-phases-v1");
    assert.ok(row.memoryPhases.raw.length > 0, "the failed business result retains the actual opening observations");
    assert.equal(row.taskRetrievalLatencyMs, row.memoryPhases.taskRecall.durationMs);
    assert.equal(row.openingMemoryPreparationLatencyMs, row.memoryPhases.openingMemoryPreparation.durationMs);
  } finally {
    await env.close();
  }
});

test("MEM-36: B0 and B2 replay the same synthetic memories through public MemoryService and the real SDK Host", { timeout: 60_000 }, async () => {
  const item = MEMORY_EVALUATION_CORPUS.cases[0];
  const without = await replayMemoryEvaluationCase("B0", item);
  const baseline = await replayMemoryEvaluationCase("B2", item);
  assert.equal(without.state, "off");
  assert.deepEqual(without.selected, []);
  assert.equal(without.observations.backendListCalls, 0, "production switch prevents backend reads");
  assert.ok(baseline.selected.some(row => row.seed === "project-tool"));
  assert.ok(baseline.observations.backendListCalls > 0);
  assert.equal(baseline.prefsBefore.auto, true, "explicitly map the old effective auto choice, not new-user reviewed defaults");
  assert.equal(baseline.finalContext, null);
  assert.equal(baseline.usage, null, "no provider measurement is unknown, not zero");
  assert.equal(baseline.taskQuality, null);
});

test("MEM-35/MEM-36: later reads observe production correction and deletion rather than a replay-side imitation", { timeout: 60_000 }, async () => {
  for (const id of ["correction", "forget"]) {
    const item = MEMORY_EVALUATION_CORPUS.cases.find(row => row.id === id)!;
    const row = await replayMemoryEvaluationCase("B2", item);
    assert.deepEqual(row.score.forbiddenTextFound, []);
    if (id === "correction") assert.ok(row.selected.some(selected => selected.text.includes("优先考虑上午")));
    else assert.ok(!row.selected.some(selected => selected.seed === "assistant-meeting"));
  }
});

test("MEM-36: real HTTP replay reaches the production Agent Context and retains provider usage without claiming model quality", { timeout: 60_000 }, async () => {
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    assert.ok(JSON.parse(body).messages);
    const frames: string[] = [];
    const emit = (type: string, content: object) => frames.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...content })}\n\n`);
    emit("message_start", { message: { id: "fixture-response", type: "message", role: "assistant", model: "fixture-reported", content: [], usage: { input_tokens: 29, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "fixture answer" } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } });
    emit("message_stop", {});
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(frames.join(""));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const observed = observeEvaluationRequests(endpoint, 2);
  try {
    const model = { modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint, model: "fixture", credential_ref: "evaluation:fixture" }), resolveCredential: () => "evaluation-fixture" };
    const item = MEMORY_EVALUATION_CORPUS.cases[0];
    const b0 = await replayMemoryModelCase("B0", item, model);
    const b1 = await replayMemoryModelCase("B2", item, model);
    assert.equal(b0.phase, "completed", b0.stopReason ?? "");
    assert.equal(b1.phase, "completed", b1.stopReason ?? "");
    assert.deepEqual(b0.runtimeContextReferences, []);
    assert.ok(b1.runtimeContextReferences.some(row => row.seed === "project-tool"));
    assert.equal(observed.requests.length, 2);
    assert.doesNotMatch(JSON.stringify(observed.requests[0]!.body), /都用 pnpm/);
    assert.match(JSON.stringify(observed.requests[1]!.body), /都用 pnpm/);
    assert.equal(b1.usage!.tokens.input, 29);
    assert.equal(b1.usage!.tokens.output, 3);
    assert.equal(b1.usage!.coverage?.input, "reported");
    assert.equal(b1.memoryTokens, null);
    assert.equal(b0.memoryPhases.taskRecall.state, "not-run");
    assert.equal(b0.taskRetrievalLatencyMs, null, "disabled task recall is not a zero millisecond read");
    const skipped = b0.memoryPhases.raw.find(row => row.phase === "taskRecall");
    assert.ok(skipped?.boundary === "not-run");
    assert.equal(b0.memoryPhases.taskRecall.reason, skipped.reason, "preserve the SDK's decision, not an inferred preference");
    assert.equal(b1.memoryPhases.taskRecall.state, "complete");
    assert.equal(b1.memoryPhases.openingMemoryPreparation.state, "complete");
    assert.ok(b1.taskRetrievalLatencyMs !== null && b1.taskRetrievalLatencyMs >= 0);
    assert.ok(b1.openingMemoryPreparationLatencyMs !== null && b1.openingMemoryPreparationLatencyMs >= b1.taskRetrievalLatencyMs);
    assert.ok(b1.recipeLatencyMs !== null, "the original recipe measurement stays separate");
    const phases = b1.memoryPhases.raw;
    assert.deepEqual(phases.map(row => `${row.phase}:${row.boundary}`), ["openingMemoryPreparation:begin", "taskRecall:begin", "taskRecall:end", "openingMemoryPreparation:end"]);
    assert.ok(phases.every(row => row.sessionRef.id === b1.memoryPhases.sessionId && row.openingReceiptId === b1.memoryPhases.openingReceiptId));
    const taskEnd = phases.find(row => row.phase === "taskRecall" && row.boundary === "end");
    assert.ok(taskEnd?.phase === "taskRecall" && taskEnd.boundary === "end");
    assert.ok(b1.retrievals?.some(row => row.receipt_id === taskEnd.receiptId), "pair to the actual SDK retrieval receipt");
    assert.notEqual(b0.memoryPhases.sessionId, b1.memoryPhases.sessionId);
    await assert.rejects(fetch(endpoint, { method: "POST", body: JSON.stringify({ max_tokens: 1 }) }), /attempt 预算已用尽/);
    assert.equal(observed.requests.length, 2, "a refused retry does not send a third HTTP request");
  } finally {
    observed.restore(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("MEM-36: current tools reject a historical B1 arm before creating a Home", () => {
  assert.throws(() => assertEvaluationArm("B1"), /冻结工具 5e47ed2bc/);
});

test("MEM-36: phase pairing preserves nested intervals, failures and explicit not-run without retaining foreign data", () => {
  let at = 0;
  const collector = memoryPhaseObservation(() => ++at);
  const session = { runtime_id: "prologue", session_id: "sample" };
  const identity = { sessionRef: { kind: "session" as const, id: "sample", revision: 1 }, openingReceiptId: "opening" };
  const emit = collector.audit.memoryPhase!;
  const finish = collector.bind(session);
  assert.throws(() => collector.bind(session), /active sample/);
  emit({ ...identity, phase: "openingMemoryPreparation", boundary: "begin", text: "must not be retained" } as Parameters<typeof emit>[0]);
  emit({ ...identity, phase: "taskRecall", receiptId: "task", boundary: "begin" });
  emit({ ...identity, phase: "taskRecall", receiptId: "task", boundary: "end", settlement: "resolved", outcome: "failed", errorCode: "STORAGE_CONFLICT" });
  emit({ ...identity, phase: "openingMemoryPreparation", boundary: "end", settlement: "rejected", errorCode: "STORAGE_CONFLICT" });
  const result = finish();
  assert.equal(result.taskRecall.durationMs, 1);
  assert.equal(result.openingMemoryPreparation.durationMs, 3);
  assert.equal(result.taskRecall.state, "complete", "complete pairing does not mean a successful read");
  assert.equal(result.taskRecall.outcome, "failed");
  assert.equal(result.openingMemoryPreparation.settlement, "rejected");
  assert.equal(result.openingMemoryPreparation.errorCode, "STORAGE_CONFLICT");
  assert.doesNotMatch(JSON.stringify(result), /must not be retained|"text"/);
  emit({ ...identity, phase: "taskRecall", boundary: "not-run", reason: "recipe" });
  assert.equal(finish().raw.length, 4, "released samples ignore later callbacks");
  Object.assign(result.raw[0]!.sessionRef, { id: "changed snapshot" });
  assert.equal(finish().raw[0]!.sessionRef.id, "sample", "report snapshots do not expose collector identity");
  const next = collector.bind({ ...session, session_id: "next" });
  emit({ ...identity, phase: "taskRecall", boundary: "not-run", reason: "disabled" });
  emit({ ...identity, sessionRef: { ...identity.sessionRef, id: "next" }, phase: "taskRecall", boundary: "not-run", reason: "recipe" });
  const skipped = next();
  assert.equal(skipped.unrelated, 1); assert.equal(skipped.raw.length, 1);
  assert.equal(skipped.taskRecall.state, "not-run"); assert.equal(skipped.taskRecall.durationMs, null);
  assert.equal(skipped.taskRecall.reason, "recipe"); assert.equal(skipped.openingMemoryPreparation.state, "incomplete");
});

test("MEM-36: missing, duplicated, reordered and cross-opening phase samples stay visibly unusable", () => {
  const identity = { sessionRef: { kind: "session" as const, id: "sample", revision: 1 }, openingReceiptId: "opening" };
  type Entry = Parameters<NonNullable<ReturnType<typeof memoryPhaseObservation>["audit"]["memoryPhase"]>>[0];
  const begin: Entry = { ...identity, phase: "taskRecall", receiptId: "task", boundary: "begin" };
  const end: Entry = { ...identity, phase: "taskRecall", receiptId: "task", boundary: "end", settlement: "resolved", outcome: "ready" };
  const cases: Array<[string, Entry[], "incomplete" | "invalid"]> = [
    ["missing", [], "incomplete"], ["half", [begin], "incomplete"], ["end only", [end], "incomplete"],
    ["duplicate begin", [begin, begin, end], "invalid"], ["duplicate end", [begin, end, end], "invalid"],
    ["reordered", [end, begin], "invalid"],
    ["not-run mixed", [begin, { ...identity, phase: "taskRecall", boundary: "not-run", reason: "recipe" }], "invalid"],
    ["opening", [begin, { ...end, openingReceiptId: "other" }], "invalid"],
    ["revision", [begin, { ...end, sessionRef: { ...identity.sessionRef, revision: 2 } }], "invalid"],
    ["task receipt", [begin, { ...end, receiptId: "other" }], "invalid"],
    ["overflow", Array.from({ length: 10 }, () => begin), "invalid"],
  ];
  for (const [label, rows, state] of cases) {
    let time = 0;
    const collector = memoryPhaseObservation(() => ++time), finish = collector.bind({ runtime_id: "prologue", session_id: "sample" });
    for (const row of rows) collector.audit.memoryPhase!(row);
    const result = finish();
    assert.equal(result.taskRecall.state, state, label); assert.equal(result.taskRecall.durationMs, null, label);
    assert.equal(result.raw.length, Math.min(8, rows.length), label);
    assert.equal(result.overflow, Math.max(0, rows.length - 8), label);
    assert.ok(result.taskRecall.issues.length > 0, label);
  }
  const clock = memoryPhaseObservation(() => Number.NaN), clockFinish = clock.bind({ runtime_id: "prologue", session_id: "sample" });
  clock.audit.memoryPhase!(begin); clock.audit.memoryPhase!(end);
  assert.equal(clockFinish().taskRecall.state, "invalid");
  const cleared = memoryPhaseObservation(), stopped = cleared.bind({ runtime_id: "prologue", session_id: "sample" });
  cleared.clear(); cleared.audit.memoryPhase!(begin);
  assert.equal(stopped().taskRecall.state, "incomplete");
  const empty = cleared.bind({ runtime_id: "prologue", session_id: "next" });
  assert.equal(empty().raw.length, 0);
});

test("MEM-36: initialization failure closes the actual server/SDK and releases the clock", { timeout: 20_000 }, async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const script = `import { memoryEvaluationEnvironment } from './scripts/memory-evaluation/environment.mts';
    import assert from 'node:assert/strict';
    const before = Date.now();
    await assert.rejects(memoryEvaluationEnvironment(undefined, { seeds: [{ id:'bad', source:{id:'fixture',speaker:'user',text:''},project:null,request:{scope:'personal',text:''} }] }));
    assert.ok(Date.now() >= before);
    const next = await memoryEvaluationEnvironment(undefined, { seeds:[] }); await next.close();
    await next.close(); console.log('closed');`;
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: root, timeout: 15_000 });
  assert.match(result.stdout, /closed/, "the child exits naturally: no leaked listener or Runtime after failed setup");
});
