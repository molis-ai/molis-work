import assert from "node:assert/strict";
import test from "node:test";
import { pluginSchedulerFixture } from "./fixtures/plugin-scheduler.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

// SYS-15-S2: replaces the removed typed schedule.* transport's owner checks with the real public Runtime service.
test("public Runtime scheduler ignores forged owner fields, isolates every input shape and invalidates stopped installations", async t => {
  const f = await pluginSchedulerFixture(t), a = await f.start("scheduler_a"), b = await f.start("scheduler_b");
  const registration = (capability: string, owner: string) => ({ action: { capability_id: capability, version: 1 }, object_ref: "owned", title: "Owned task", due_at: "2030-01-01T00:00:00.000Z", plugin_id: owner });
  const mine = await a.database.transaction(async () => {}, tx => a.schedule.join(tx, writer => writer.register(registration("scheduler-a.wakeup", b.id))));
  const theirs = await b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.register(registration("scheduler-b.wakeup", a.id))));
  assert.equal(mine.plugin_id, a.id); assert.equal(theirs.plugin_id, b.id);
  assert.deepEqual(a.schedule.list().map(job => job.job_id), [mine.job_id]);
  assert.deepEqual(b.schedule.list().map(job => job.job_id), [theirs.job_id]);
  assert.equal(b.schedule.get(mine.job_id), null);
  await assert.rejects(b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.cancel(mine.job_id))), { code: "scheduler.job_not_found" });
  await assert.rejects(b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.setEnabled(mine.job_id, false))), { code: "scheduler.job_not_found" });
  for (const input of [[], "x", 7, null, undefined, Object.assign([], { job_id: mine.job_id, enabled: false }), Object.assign(() => {}, { job_id: mine.job_id })]) {
    await assert.rejects(b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.register(input as never))));
    await assert.rejects(b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.cancel(input as never))));
    await assert.rejects(b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.setEnabled(input as never, false))));
  }
  assert.equal(a.schedule.get(mine.job_id)?.enabled, true); assert.equal(f.scheduler.list().length, 2);
  await a.database.transaction(async () => {}, tx => a.schedule.join(tx, writer => writer.setEnabled(mine.job_id, false)));
  assert.equal(a.schedule.get(mine.job_id)?.enabled, false);
  assert.deepEqual(await a.database.transaction(async () => {}, tx => a.schedule.join(tx, writer => writer.cancel(mine.job_id))), { cancelled: true });
  await b.stop();
  // BL-411: outside every call the stopped installation's handles are refused and do nothing: no list, no settlement, no cancel.
  assert.equal(b.schedule.list(), undefined);
  assert.equal(await within(b.database.transaction(async () => {}, tx => b.schedule.join(tx, writer => writer.cancel(theirs.job_id)))), PENDING);
  assert.deepEqual(f.scheduler.list().map(job => job.job_id), [theirs.job_id]);
});
