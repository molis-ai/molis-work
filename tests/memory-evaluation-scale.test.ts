import assert from "node:assert/strict";
import test from "node:test";
import { measureMemoryScaleReplica, observeScaleLists, observeScaleRecall } from "../scripts/memory-evaluation/scale.mjs";
import { memoryEvaluationEnvironment } from "../scripts/memory-evaluation/replay.mjs";

test("MEM-36: scale replay reopens real storage, restores B1 after B0, and counts every list return", { timeout: 60_000 }, async () => {
  const row = await measureMemoryScaleReplica(10, 0);
  assert.equal(row.actualSize, 10);
  assert.equal(Object.values(row.distribution).reduce((sum, count) => sum + count, 0), 10);
  const b0 = row.arms.find(arm => arm.arm === "B0")!;
  const b1 = row.arms.find(arm => arm.arm === "B1")!;
  assert.equal(b0.status, "observed", b0.error ?? "");
  assert.equal(b1.status, "observed", b1.error ?? "");
  assert.equal(b0.samples.length, 10);
  assert.equal(b1.samples.length, 10);
  assert.equal(b1.samples[0]!.phase, "first-recall-after-runtime-reopen");
  for (const sample of b0.samples) { assert.equal(sample.state, "off"); assert.equal(sample.listCalls, 0); assert.equal(sample.selected, 0); }
  for (const sample of b1.samples) {
    assert.equal(sample.listCalls, 2);
    assert.equal(sample.listEntriesReturned, 9, "5 personal plus 4 project-a entries; project-b remains isolated");
    assert.equal(sample.calls.length, sample.listCalls);
    assert.equal(sample.failedListCalls, 0);
    assert.equal(sample.underlyingStorageScans, null);
    assert.ok(sample.selected! > 0);
  }
});

test("MEM-36: a failed list remains a measured failure and does not erase the next real recall", { timeout: 60_000 }, async () => {
  const env = await memoryEvaluationEnvironment();
  const memory = env.adapter.memory!;
  const original = memory.list;
  let failOnce = true;
  // A fault at the public port tests reporting only, while every attempt still delegates to real SDK storage.
  memory.list = async (scope, owner) => { const rows = await original.call(memory, scope, owner); if (failOnce) { failOnce = false; throw new Error("scale observation fault"); } return rows; };
  const observer = observeScaleLists(memory);
  try {
    const failed = await observeScaleRecall(env, observer, 0);
    assert.equal(failed.status, "failed");
    assert.match(failed.error!, /scale observation fault/);
    assert.equal(failed.selected, null);
    assert.equal(failed.listCalls, 1);
    assert.equal(failed.failedListCalls, 1);
    assert.equal(failed.calls[0]!.entries, null, "failed calls do not claim zero rows returned");
    const next = await observeScaleRecall(env, observer, 1);
    assert.equal(next.status, "observed");
    assert.equal(next.listCalls, 2);
    assert.equal(next.failedListCalls, 0);
    assert.ok(next.selected! > 0);
  } finally { observer.restore(); memory.list = original; await env.close(); }
});
