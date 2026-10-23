import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
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
    await assert.rejects(fetch(endpoint, { method: "POST", body: JSON.stringify({ max_tokens: 1 }) }), /attempt 预算已用尽/);
    assert.equal(observed.requests.length, 2, "a refused retry does not send a third HTTP request");
  } finally {
    observed.restore(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("MEM-36: current tools reject a historical B1 arm before creating a Home", () => {
  assert.throws(() => assertEvaluationArm("B1"), /冻结工具 5e47ed2bc/);
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
