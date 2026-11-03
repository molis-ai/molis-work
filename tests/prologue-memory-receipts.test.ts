import assert from "node:assert/strict";
import test from "node:test";
import { applyRunEvent, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";

const at = "2026-10-23T00:00:00.000Z";
function recalled(receiptId: string, id: string): PrologueEvent {
  return { type: "memory-recalled", method: "recall", segmentation: "given", injected: [{ id, version: 2 }], omitted: [], unavailable: [],
    retrieval: { receiptId, outcome: "ready" } };
}
function context(callId: string, status: "prepared" | "not-dispatched" | "dispatched-or-unknown" | "response-observed", id = "resident"): PrologueEvent {
  return { type: "memory-context", callId, status, tokens: 73, budgetTokens: 120, basis: "conservative-estimate",
    references: [{ receiptId: `receipt-${id}`, id, version: 2 }], parts: [{ index: 1, tokens: 73, form: "entry" }] };
}

test("resident and task selection retain separate receipts without claiming model dispatch", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, recalled("receipt-resident", "resident"), at);
  const first = state.memory_recalled!;
  applyRunEvent(state, recalled("receipt-task", "task"), at);
  assert.deepEqual(first.selected, [{ memory_id: "resident", version: 2 }], "a prior projection remains immutable");
  assert.deepEqual(state.memory_recalled!.selected, [{ memory_id: "resident", version: 2 }, { memory_id: "task", version: 2 }]);
  assert.deepEqual(state.memory_recalled!.retrievals?.map(one => one.receipt_id), ["receipt-resident", "receipt-task"]);
  assert.deepEqual(state.memory_recalled!.injected, []);
  applyRunEvent(state, context("call-1", "prepared"), at);
  applyRunEvent(state, context("call-1", "not-dispatched"), at);
  assert.deepEqual(state.memory_recalled!.injected, []);
  assert.equal(state.memory_recalled!.contexts?.length, 1);
  assert.equal(state.memory_recalled!.contexts?.[0]?.status, "not-dispatched");
});

test("final complete-wrapper measurement keeps dispatch uncertainty and response evidence per model call", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, recalled("receipt-resident", "resident"), at);
  applyRunEvent(state, context("call-1", "prepared"), at);
  applyRunEvent(state, context("call-1", "dispatched-or-unknown"), at);
  assert.deepEqual(state.memory_recalled!.injected, [{ memory_id: "resident", version: 2 }]);
  assert.equal(state.memory_recalled!.contexts?.[0]?.status, "dispatched-or-unknown");
  applyRunEvent(state, context("call-1", "response-observed"), at);
  applyRunEvent(state, context("call-2", "prepared", "expansion"), at);
  applyRunEvent(state, context("call-2", "response-observed", "expansion"), at);
  assert.equal(state.memory_recalled!.contexts?.length, 2, "repeated dispositions do not multiply token usage");
  assert.deepEqual(state.memory_recalled!.injected, [{ memory_id: "resident", version: 2 }, { memory_id: "expansion", version: 2 }]);
  assert.deepEqual(state.memory_recalled!.contexts?.[1], { call_id: "call-2", status: "response-observed", tokens: 73, budget_tokens: 120,
    basis: "conservative-estimate", references: [{ receipt_id: "receipt-expansion", memory_id: "expansion", version: 2 }],
    parts: [{ index: 1, tokens: 73, form: "entry" }] });
  assert.equal(state.unknown_frames, 0);
});

test("skip and legacy retrieval alone never acquire actual-use evidence", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, { type: "memory-recalled", method: "recall", injected: [], omitted: [], unavailable: [], retrieval: { receiptId: "skip", outcome: "skip" } }, at);
  applyRunEvent(state, { type: "memory-recalled", method: "pinned", injected: [{ id: "legacy", version: 1 }], omitted: [], unavailable: [] }, at);
  assert.deepEqual(state.memory_recalled!.injected, []);
  assert.equal(state.memory_recalled!.contexts, undefined);
  assert.deepEqual(state.memory_recalled!.selected, [{ memory_id: "legacy", version: 1 }]);
  assert.deepEqual(state.memory_recalled!.retrievals, [{ receipt_id: "skip", outcome: "skip" }]);
});
