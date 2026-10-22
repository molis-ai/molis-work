import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { MEMORY_EVALUATION_SEQUENCES, MEMORY_SEQUENCE_PROTOCOL } from "./fixtures/memory-evaluation-sequences.js";
import { replayMemorySequences } from "../scripts/memory-evaluation/sequence-replay.mjs";
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
    await env.memory.propose({ actor_id: "synthetic-person", project_id: null, consumer: "ui", person: true }, {
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
    const text = body.max_tokens === 1500 ? JSON.stringify({ candidates: [{ text: "Atlas 项目使用 pnpm 安装依赖", kind: "convention", scope: "project", applies_when: null,
      basis: "explicit", quote: "Atlas 项目使用 pnpm 安装依赖", same_as: null, supersedes: null }] }) : "fixture task answer";
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
  try {
    const sample = MEMORY_EVALUATION_SEQUENCES[0]!;
    const sequence = { ...sample, sources: [{ ...sample.sources[0], text: "以后 Atlas 项目使用 pnpm 安装依赖。" }, { ...sample.sources[1], text: "以后仍然规定 Atlas 项目使用 pnpm 安装依赖。" }] as const };
    const report = await replayMemorySequences({ endpoint, protocol: "anthropic-compatible", model: "fixture", credential_ref: "fixture" }, "fixture-key",
      async progress => { checkpoints.push(progress.rows.length); }, [sequence], 1);
    assert.ok(report.rows.every(row => row.status === "observed"), JSON.stringify(report.rows.filter(row => row.status !== "observed")));
    assert.deepEqual(checkpoints, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(report.attempts, 6);
    assert.deepEqual(limits.sort(), [1024, 1024, 1024, 1024, 1500, 1500]);
    const task = report.rows.find(row => row.arm === "B1" && row.event === "task2")!;
    const observation = task.observation;
    assert.ok(observation && typeof observation === "object" && "finalMemory" in observation);
    const finalMemory = observation.finalMemory;
    assert.ok(finalMemory && typeof finalMemory === "object" && "tokens" in finalMemory && typeof finalMemory.tokens === "number" && finalMemory.tokens > 0, JSON.stringify(report.rows.filter(row => row.arm === "B1")));
    assert.ok("unmatchedMessages" in finalMemory && finalMemory.unmatchedMessages === 0);
    assert.ok("basis" in finalMemory && finalMemory.basis === "conservative-estimate");
    assert.equal(task.attemptRange.endExclusive - task.attemptRange.startInclusive, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
