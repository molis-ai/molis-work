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

test("RAC-1803 a timed operation's result past the 100000 units a notification body takes is cut at a whole character and still reaches the Inbox", { timeout: 60_000 }, async t => {
  // 50000 🟢 (U+1F7E2, two units each) are 100000 units, which the notification service takes as a body; 50001 are one character past it
  // (apps/local-host/src/plugin-notification-service.ts:39-41), which it refused, rolling the delivery back with the occurrence left running and
  // nothing in the Inbox. Whole characters within 99999 units are 49999 🟢 (99998 units), then 「…」. A cut by units would keep half of the 50000th 🟢.
  const f = await scheduleRuntimeFixture(t), at = new Date(Date.now() + 1000).toISOString();
  await parkFeedClock(f);
  f.execute(async (_caller, input) => ({ text: "🟢".repeat((input as { text: string }).text === "over" ? 50_001 : 50_000) }));
  const over = await f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "over" }, inbox: true });
  await f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "edge" }, inbox: true });
  assert.equal((await f.tick(at)).failed, 0, "neither notice is refused");
  const bodies = (await f.inbox()).map(item => item.body ?? "");
  assert.deepEqual(bodies.map(body => body.length).sort((a, b) => a - b), [99_999, 100_000], "both notices reach the Inbox, the longer result cut within 100000 units");
  assert.ok(bodies.includes("🟢".repeat(50_000)), "a result of exactly 100000 units is delivered whole");
  assert.ok(bodies.includes("🟢".repeat(49_999) + "…"), "a longer one keeps its whole characters within 99999 units and ends with 「…」");
  const store = await f.store();
  assert.equal(listScheduledOperationOccurrences(store.db, f.project.project_id, over.scheduleId)[0]?.state, "succeeded", "the longer result's run is recorded as done");
});

test("RAC-1803 a timed operation whose result is only blanks still reaches the Inbox, named by its operation", { timeout: 60_000 }, async t => {
  // The notification service refuses a body that trims to nothing (plugin-notification-service.ts:39-41), and " \n " is not empty, so
  // `text || "操作已结束"` (runtime-wakeups.ts:79) kept it and the delivery rolled back like an overlong one. A blank result is now empty: the body
  // is 「操作已结束」 and the success title falls back to the operation's name.
  const f = await scheduleRuntimeFixture(t), at = new Date(Date.now() + 1000).toISOString();
  await parkFeedClock(f);
  f.execute(async () => ({ text: " \n " }));
  const created = await f.sdk.invoke(scheduledOperationActions.add, { at, operation: "summarize", input: { text: "x" }, inbox: true });
  assert.equal((await f.tick(at)).failed, 0, "the notice is not refused");
  assert.deepEqual((await f.inbox()).map(item => [item.title, item.body]), [["定时笔记：汇总", "操作已结束"]], "the notice names the operation and says it finished");
  const store = await f.store();
  assert.equal(listScheduledOperationOccurrences(store.db, f.project.project_id, created.scheduleId)[0]?.state, "succeeded", "the run is recorded as done");
});
