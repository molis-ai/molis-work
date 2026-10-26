// Stage 1 of specs/ai-input-receipts (§3.3, §11): the run view says what the runtime's ledger says about each supplement.
// The ledgers here are ones the runtime writes: a read always follows the supplement's applied (the SDK reads only applied ones).
import assert from "node:assert/strict";
import test from "node:test";
import { applyRunEvent, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";

const steer = (id: string, text: string): PrologueEvent => ({ type: "prompt", role: "user", text, steerId: id });
const states = (state: ReturnType<typeof emptyPrologueStreamState>) =>
  Object.fromEntries(state.turns.filter(turn => turn.steer).map(turn => [turn.steer!.id, turn.steer!.state]));

test("AC-R1: a supplement is received, then applied, then read, each only on the runtime's own fact", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, { type: "prompt", role: "user", text: "改登录页" }, null);
  applyRunEvent(state, steer("s-1", "别动测试夹具"), null);
  assert.deepEqual(states(state), { "s-1": "received" });
  assert.equal(state.turns[0]!.steer, undefined, "the round's own task is not a supplement");
  assert.equal(applyRunEvent(state, { type: "steer-applied", steerId: "s-1" }, null), true);
  assert.deepEqual(states(state), { "s-1": "applied" }, "in the context is not read");
  assert.equal(applyRunEvent(state, { type: "steer-read", steerIds: ["s-1"], callId: "call-2" }, null), true);
  assert.deepEqual(states(state), { "s-1": "read" });
});

test("AC-R1: a fact never moves a receipt back, and one for another run's supplement changes nothing", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, steer("s-1", "先跑测试"), null);
  applyRunEvent(state, { type: "steer-applied", steerId: "s-1" }, null);
  applyRunEvent(state, { type: "steer-read", steerIds: ["s-1"], callId: "call-1" }, null);
  assert.equal(applyRunEvent(state, { type: "steer-applied", steerId: "s-1" }, null), false, "a late applied after read is no change");
  assert.equal(applyRunEvent(state, { type: "steer-read", steerIds: ["elsewhere"], callId: "call-1" }, null), false);
  assert.deepEqual(states(state), { "s-1": "read" });
});

test("AC-R2: taken back before it reached the model is withdrawn, and the end of the round leaves it so", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, steer("s-1", "改成 40 分钟"), null);
  applyRunEvent(state, { type: "steer-withdrawn", steerId: "s-1" }, null);
  applyRunEvent(state, { type: "completed" }, null);
  assert.deepEqual(states(state), { "s-1": "withdrawn" });
});

test("AC-R2: a round that ends before a kept reply says unread, whether the supplement reached the context or not", () => {
  for (const end of [{ type: "completed" }, { type: "failed", error: { code: "MODEL_UNAVAILABLE", safeMessage: "down" } }, { type: "cancelled" }] as PrologueEvent[]) {
    const state = emptyPrologueStreamState();
    applyRunEvent(state, steer("queued", "下一步先发布"), null);
    applyRunEvent(state, steer("applied", "不要发布"), null);
    applyRunEvent(state, { type: "steer-applied", steerId: "applied" }, null);
    applyRunEvent(state, steer("read", "用中文"), null);
    applyRunEvent(state, { type: "steer-applied", steerId: "read" }, null);
    applyRunEvent(state, { type: "steer-read", steerIds: ["read"], callId: "call-1" }, null);
    applyRunEvent(state, end, null);
    assert.deepEqual(states(state), { queued: "unread", applied: "unread", read: "read" }, end.type);
  }
});

test("AC-R3: what the Host relays is a note in the run, never the person's words, and keeps its receipt", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, { type: "prompt", role: "user", text: "（Molis 转告）用户拒绝了这次修改", steerId: "s-host", source: "app" }, null);
  applyRunEvent(state, steer("s-person", "那就只改文案"), null);
  assert.deepEqual(state.turns.map(turn => [turn.kind, turn.steer?.id]), [["notice", "s-host"], ["user", "s-person"]]);
  for (const steerId of ["s-host", "s-person"]) applyRunEvent(state, { type: "steer-applied", steerId }, null);
  applyRunEvent(state, { type: "steer-read", steerIds: ["s-host", "s-person"], callId: "call-1" }, null);
  assert.deepEqual(states(state), { "s-host": "read", "s-person": "read" });
});


test("original acceptance and speaker survive carried prompt projection; old records stay unknown", () => {
  const state = emptyPrologueStreamState();
  applyRunEvent(state, { type: "prompt", role: "user", text: "Original text", steerId: "input-1", source: "peer", acceptedAtMs: 1234 }, null);
  applyRunEvent(state, { type: "steer-applied", steerId: "input-1" }, null);
  applyRunEvent(state, { type: "cancelled" }, null);
  assert.deepEqual(state.turns[0]?.steer, { id: "input-1", state: "unread", source: "peer", accepted_at_ms: 1234 });
  const older = emptyPrologueStreamState();
  applyRunEvent(older, { type: "prompt", role: "user", text: "Old host text", steerId: "old", source: "app" }, null);
  assert.equal(older.turns[0]?.steer?.source, "host");
  assert.equal(older.turns[0]?.steer?.accepted_at_ms, undefined);
});
