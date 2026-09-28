import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionLifetime } from "../packages/plugin-sdk/src/index.js";

test("execution lifetime fences late work after local cancellation and stops lease renewal", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const stop = new AbortController(), reason = new Error("owner stopped");
  let renewals = 0;
  const execution = createExecutionLifetime({ signal: stop.signal, monitor: { intervalMs: 20, check: () => { renewals++; } } });
  t.mock.timers.tick(20);
  assert.equal(renewals, 1);
  stop.abort(reason);
  assert.throws(() => execution.assertActive(), error => error === reason);
  t.mock.timers.tick(100);
  assert.equal(renewals, 1);
  execution.dispose();
  assert.equal(execution.signal.reason, reason);
});

test("execution lifetime keeps the first stop reason and refuses a result after its deadline", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let checks = 0;
  const deadline = new Error("remote result unknown");
  const execution = createExecutionLifetime({ timeout: { milliseconds: 40, reason: deadline },
    monitor: { intervalMs: 10, check: () => { checks++; } } });
  t.mock.timers.tick(40);
  assert.throws(() => execution.assertActive(), error => error === deadline);
  const stopped = checks;
  t.mock.timers.tick(100);
  assert.equal(checks, stopped);
  execution.dispose();
  assert.equal(execution.signal.reason, deadline);
});

test("execution lifetime refuses writes when its lease monitor fails", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const lostLease = new Error("lease lost");
  let owned = true;
  const execution = createExecutionLifetime({ monitor: { intervalMs: 10, check: () => { if (!owned) throw lostLease; } } });
  execution.assertActive();
  owned = false; t.mock.timers.tick(10);
  assert.throws(() => execution.assertActive(), error => error === lostLease);
});

test("execution lifetime does not start monitoring for an already aborted caller and dispose fences late callbacks", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const stop = new AbortController(); stop.abort(new Error("already stopped"));
  let checks = 0;
  const cancelled = createExecutionLifetime({ signal: stop.signal, monitor: { intervalMs: 10, check: () => { checks++; } } });
  const completed = createExecutionLifetime({ monitor: { intervalMs: 10, check: () => { checks++; } } });
  completed.dispose(); completed.dispose();
  t.mock.timers.tick(100);
  assert.equal(checks, 0);
  assert.throws(() => cancelled.assertActive(), /already stopped/);
  assert.throws(() => completed.assertActive(), { name: "AbortError" });
});

test("cancellable waiting observes late rejections and removes listeners for an already stopped owner", async () => {
  const { getEventListeners } = await import("node:events");
  const stop = new AbortController(), reason = new Error("cancelled");
  const execution = createExecutionLifetime({ signal: stop.signal });
  let rejectWork!: (reason: Error) => void;
  const work = new Promise<never>((_resolve, reject) => { rejectWork = reject; });
  const wait = assert.rejects(execution.wait(work), error => error === reason);
  stop.abort(reason); await wait;
  rejectWork(new Error("late remote error"));
  await assert.rejects(execution.wait(new Promise(() => {})), error => error === reason);
  assert.equal(getEventListeners(execution.signal, "abort").length, 0);
});
