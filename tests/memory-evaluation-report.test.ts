import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMemoryReport } from "../scripts/memory-evaluation/report.mjs";

test("MEM-36: each layer discloses failed or unexecuted memory costs separately from observed zero injection", () => {
  const identity = { sequence: "coding-prism", layer: "coding-convention", split: "held-out", repeat: 0, arm: "B1" as const, window: "cold" };
  const report: Parameters<typeof summarizeMemoryReport>[0] = {
    stage: "completed", schema: "molis-memory-sequence-baseline-v1", model: "MiniMax-M3", recordedAt: "2026-10-22T00:00:00Z", attempts: 3,
    rows: [
      { ...identity, event: "task1", status: "failed", error: "request byte limit", attemptRange: { startInclusive: 0, endExclusive: 3 },
        observation: { answer: "partial answer", usage: null, finalMemory: { tokens: null, basis: "conservative-estimate", messages: [] } } },
      { ...identity, event: "task2", status: "not-run", error: "budget exhausted", attemptRange: { startInclusive: 3, endExclusive: 3 }, observation: null },
      { ...identity, sequence: "coding-atlas", event: "task1", status: "observed", error: null, attemptRange: { startInclusive: 3, endExclusive: 3 },
        observation: { finalMemory: { tokens: 0, basis: "conservative-estimate", messages: [] } } },
    ],
  };
  const original = structuredClone(report);
  const summary = summarizeMemoryReport(report);
  assert.deepEqual(summary.status, { observed: 1, failed: 1, "not-run": 1 });
  assert.equal(summary.attempts, 3);
  assert.deepEqual(summary.failures.map(row => [row.reason, row.attemptRange]), [
    ["request byte limit", { startInclusive: 0, endExclusive: 3 }], ["budget exhausted", { startInclusive: 3, endExclusive: 3 }],
  ]);
  assert.equal(summary.layers[identity.layer]!.memoryByArm.B1!.finalMemoryUnknownEvents, 2);
  assert.equal(summary.layers[identity.layer]!.memoryByArm.B1!.finalMemoryEstimatedTokens, 0, "zero is only the known subtotal, with missing events disclosed");
  assert.equal(summary.costsByArmAndWindow["B1/cold"]!.costs.input.unknown.tokens, null);
  assert.equal(summary.costsByArmAndWindow["B1/cold"]!.finalMemoryUnknownEvents, 2);
  assert.deepEqual(report, original, "a summary must preserve the raw failure and partial answer");
});
