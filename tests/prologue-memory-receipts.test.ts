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

// MEM-07: one retrieval's receipt id runs from selection to the final Context; what recall selected, what it left out,
// and what the final Context kept after trimming are separate facts; a body the SDK event carries is never projected.
test("MEM-07 receipt id runs through selection, omission and the final trimmed Context without projecting bodies", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, { type: "memory-recalled", method: "recall", segmentation: "given",
    injected: [{ id: "kept", version: 3, text: "BODY_KEPT" }, { id: "trimmed", version: 1, text: "BODY_TRIMMED" }],
    omitted: [{ id: "over-budget", version: 2, reason: "budget", text: "BODY_OMITTED" }], unavailable: [],
    retrieval: { receiptId: "receipt-7", outcome: "ready" } } as never, at);
  assert.deepEqual(state.memory_recalled!.selected, [{ memory_id: "kept", version: 3 }, { memory_id: "trimmed", version: 1 }]);
  assert.deepEqual(state.memory_recalled!.omitted, [{ memory_id: "over-budget", version: 2 }]);
  assert.deepEqual(state.memory_recalled!.injected, [], "selection alone is not delivery");
  applyRunEvent(state, { type: "memory-context", callId: "call-1", status: "response-observed", tokens: 40, budgetTokens: 60, basis: "conservative-estimate",
    references: [{ receiptId: "receipt-7", id: "kept", version: 3, text: "BODY_KEPT" }], parts: [{ index: 1, tokens: 40, form: "entry" }] } as never, at);
  assert.deepEqual(state.memory_recalled!.injected, [{ memory_id: "kept", version: 3 }], "only what the final Context kept counts as injected");
  assert.deepEqual(state.memory_recalled!.selected.map(one => one.memory_id), ["kept", "trimmed"], "the trimmed selection stays recorded as selected");
  assert.deepEqual(state.memory_recalled!.contexts?.[0]?.references, [{ receipt_id: "receipt-7", memory_id: "kept", version: 3 }]);
  assert.equal(state.memory_recalled!.retrievals?.[0]?.receipt_id, state.memory_recalled!.contexts?.[0]?.references[0]?.receipt_id);
  assert.doesNotMatch(JSON.stringify(state.memory_recalled), /BODY_/, "no body reaches the projection");
});
