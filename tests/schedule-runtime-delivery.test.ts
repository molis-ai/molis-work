import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { getScheduleReminder, getScheduledOperation, listScheduledOperationOccurrences, reminderActions, scheduledOperationActions } from "@molis-ai/molis-work-plugin-schedule";
import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { scheduleRuntimeFixture } from "./fixtures/schedule-runtime.js";

/**
 * Feed keeps its own job on the platform's clock (FI-6), set due at once a moment after the project opens. It is not Schedule's: once Feed
 * has set it, it is moved past the rounds below, which then count only Schedule's jobs (a running Feed leaves a current job of its own alone).
 */
async function parkFeedClock(f: Awaited<ReturnType<typeof scheduleRuntimeFixture>>): Promise<void> {
  const { db } = await f.store(), count = () => (db.prepare("SELECT COUNT(*) AS count FROM schedule_jobs WHERE plugin_id = ?").get(FEED_PLUGIN_ID) as { count: number }).count;
  for (const deadline = Date.now() + 10_000; count() !== 1;) {
    assert.ok(Date.now() < deadline, "Feed set its clock job when the project opened");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  db.prepare("UPDATE schedule_jobs SET next_due_at = '9999-12-31T00:00:00.000Z' WHERE plugin_id = ?").run(FEED_PLUGIN_ID);
}

test("SYS-15-D1/N1: a normal Runtime plugin schedules its own reminder and public operation; reopening preserves bindings and delivers once", { timeout: 60_000 }, async t => {
  const f = await scheduleRuntimeFixture(t);
  await parkFeedClock(f);
  const at = new Date(Date.now() + 1000).toISOString();
  const reminder = await f.sdk.invoke(reminderActions.add, { at, text: "复习第一章" });
  await assert.rejects(f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { unexpected: true } }), { code: "actions.input_invalid" });
  const operation = await f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "今天的汇总" }, inbox: true });
  assert.equal(f.calls(), 0); assert.equal((await f.inbox()).length, 0);
  const installation = await f.record();
  await f.reopen(); assert.equal((await f.record()).installation_generation, installation.installation_generation);
  const result = await f.tick(at);
  assert.equal(result.invoked, 2); assert.equal(result.failed, 0, JSON.stringify(result));
  assert.equal(f.calls(), 1); assert.equal((await f.tick(at)).invoked, 0);
  const items = await f.inbox();
  assert.deepEqual(items.map(item => item.summary).sort(), ["今天的汇总", "复习第一章"].sort());
  assert.ok(items.every(item => item.url === `/projects/${f.project.project_id}/plugins/${f.id}`));
  const store = await f.store();
  assert.equal(getScheduleReminder(store.db, reminder.reminderId), null);
  assert.equal(getScheduledOperation(store.db, f.project.project_id, operation.scheduleId)?.state, "completed");
  assert.equal(listScheduledOperationOccurrences(store.db, f.project.project_id, operation.scheduleId)[0]?.state, "succeeded");
});

for (const outcome of ["failed", "unknown"] as const) test(`SYS-15-D2: actual scheduled dependency ${outcome} keeps its outcome and never replays unknown work`, { timeout: 60_000 }, async t => {
  const f = await scheduleRuntimeFixture(t), at = new Date(Date.now() + 1000).toISOString();
  f.execute(async () => { throw new ActionError(outcome === "unknown" ? "actions.outcome_unknown" : "actions.execution_failed", "External failure"); });
  const created = await f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "run" }, inbox: true, repeat: "daily" });
  await f.tick(at);
  const store = await f.store(), run = getScheduledOperation(store.db, f.project.project_id, created.scheduleId)!;
  assert.equal(listScheduledOperationOccurrences(store.db, f.project.project_id, run.id)[0]?.state, outcome);
  if (outcome === "unknown") {
    assert.equal(run.state, "needs_review"); assert.equal((await f.inbox()).length, 0);
    await f.tick(new Date(Date.parse(at) + 86400000).toISOString()); assert.equal(f.calls(), 1);
  } else { assert.equal(run.state, "enabled"); assert.equal((await f.inbox()).length, 1); }
});
