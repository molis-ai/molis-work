import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import {
  bindScheduleConversationJob, createScheduleConversationTask, createScheduleReminders, decideMissedRun, deliverScheduleReminder, getScheduleReminder,
  noteMissedWakeup, registerConversationJob, scheduleRunsOverview, SCHEDULE_PLUGIN_ID, SCHEDULE_PROJECT_DATABASE, SCHEDULE_REMINDER_WAKEUP,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
} from "@molis-ai/molis-work-plugin-schedule";
import { RUN_MISSED_GRACE_MS } from "@molis-ai/molis-work-contracts/platform/actions";
import { wakeupInstallation } from "./fixtures/scheduler-owner.js";

const at = "2026-11-11T09:00:00.000Z", DAY = 86_400_000, MINUTE = 60_000;
const projectId = "p";
const identity = { projectId, pluginId: "io.molis.work.test.reminders", installationId: "installed" };

/**
 * Schedule's real reminders, tasks and missed-run record over one in-memory library and the real Scheduler, with the wakeups doing
 * what Schedule's own wakeup action does first (`noteMissedWakeup`) and then their usual work. The clock is the test's.
 */
function harness(t: TestContext) {
  const db = openTestSqlite(":memory:"), clock = { now: Date.parse(at) - MINUTE };
  db.exec(SCHEDULER_SCHEMA_SQL);
  db.exec(SCHEDULE_PROJECT_DATABASE.schema);
  const write = async (operation: () => void) => { db.transaction(operation).immediate(); };
  const delivered: string[] = [], rounds: string[] = [];
  const wake = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  wake.action(SCHEDULE_REMINDER_WAKEUP, async (input, control) => {
    const missed = await noteMissedWakeup(db, projectId, input, clock.now, write);
    if (missed) return missed;
    return deliverScheduleReminder(db, input, control, { currentInstallation: () => true, deliver: (reminder, dueAt) => { delivered.push(`${reminder.text}@${dueAt}`); } });
  });
  wake.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, async input => {
    const missed = await noteMissedWakeup(db, projectId, input, clock.now, write);
    if (missed) return missed;
    rounds.push(`${input.object_ref}@${input.due_at}`);
    return { detail: "ok" };
  });
  const schedule = wake.scheduler(db, { now: () => new Date(clock.now) });
  t.after(async () => { await schedule.close(); db.close(); });
  const reminders = createScheduleReminders({ db, projectId, schedule, now: () => clock.now, describe: () => ({ title: "笔记", link: "/n", generation: "first" }) });
  const decide = (run_id: string, decision: "run_now" | "skip") => db.transaction(() => decideMissedRun(db, schedule, projectId, { run_id, decision }, new Date(clock.now))).immediate();
  const overview = (hours = 48) => scheduleRunsOverview(db, schedule.list(), projectId, { now: new Date(clock.now).toISOString(), upcoming_until: new Date(clock.now + hours * 3_600_000).toISOString() });
  const missedRows = () => db.prepare("SELECT run_id, kind, title, due_at, decision FROM schedule_missed_runs ORDER BY due_at").all() as Array<{ run_id: string; kind: string; title: string; due_at: string; decision: string | null }>;
  return { db, clock, schedule, reminders, delivered, rounds, decide, overview, missedRows,
    remind: (text: string, repeat: "none" | "daily" = "none", when = at) => reminders.add(identity, { at: when, text, repeat }).reminderId,
    task: (title: string) => {
      const created = createScheduleConversationTask(db, { title, instructions: "看一眼", hour: 9, minute: 0, notify_important: false }, () => new Date(clock.now));
      const job = registerConversationJob(schedule, created, new Date(clock.now));
      bindScheduleConversationJob(db, created.task_id, job.job_id, () => new Date(clock.now));
      return { taskId: created.task_id, jobId: job.job_id, dueAt: job.next_due_at };
    } };
}

test("RES-01 a reminder that comes up within the grace is delivered as usual; past it, it is written down, not delivered", async t => {
  const h = harness(t), early = h.remind("准时"), late = h.remind("晚了");
  h.clock.now = Date.parse(at) + RUN_MISSED_GRACE_MS - MINUTE;
  await h.schedule.tick();
  assert.deepEqual(h.delivered, ["准时@" + at, "晚了@" + at], "within the grace both go out");
  assert.equal(getScheduleReminder(h.db, early), null, "a delivered one-time reminder is gone");
  assert.equal(h.missedRows().length, 0);

  const later = new Date(Date.parse(at) + 3_600_000).toISOString(), missed = h.remind("睡着时到点", "none", later);
  h.clock.now = Date.parse(later) + RUN_MISSED_GRACE_MS + MINUTE;
  await h.schedule.tick();
  assert.deepEqual(h.delivered, ["准时@" + at, "晚了@" + at], "nothing more was delivered");
  assert.deepEqual(h.missedRows().map(row => [row.kind, row.title, row.due_at, row.decision]), [["reminder", "睡着时到点", later, null]]);
  assert.ok(getScheduleReminder(h.db, missed), "a missed one-time reminder is kept until the person decides");
  const job = h.schedule.get(getScheduleReminder(h.db, missed)!.jobId)!;
  assert.equal(job.enabled, false, "the one-time job is done like any answered wakeup");
  assert.equal(job.last_wakeup?.detail, "missed");
  assert.ok(late);
});

test("RES-01 a missed daily reminder and a missed task go on to their next time as usual, each missed occurrence one row", async t => {
  const h = harness(t), daily = h.remind("每天", "daily"), task = h.task("每日回顾");
  h.clock.now = Date.parse(task.dueAt) + 2 * 3_600_000;
  const reminderDue = getScheduleReminder(h.db, daily)!.at;
  h.clock.now = Math.max(h.clock.now, Date.parse(reminderDue) + 2 * 3_600_000);
  await h.schedule.tick();
  assert.deepEqual(h.delivered, []);
  assert.deepEqual(h.rounds, [], "a missed task does not run a round");
  assert.deepEqual(h.missedRows().map(row => row.kind).sort(), ["reminder", "task"]);
  const reminderJob = h.schedule.get(getScheduleReminder(h.db, daily)!.jobId)!;
  assert.equal(reminderJob.enabled, true);
  assert.equal(reminderJob.next_due_at, new Date(Date.parse(reminderDue) + DAY).toISOString(), "the next time keeps its time of day");
  await h.schedule.tick();
  assert.equal(h.missedRows().length, 2, "the same occurrence is never written twice");
});

test("RES-02 现在做 runs it once on the same path at the time it missed; 跳过 only marks it; a run no longer there is gone", async t => {
  const h = harness(t), once = h.remind("一次"), daily = h.remind("每天", "daily"), skipped = h.remind("跳过的");
  h.clock.now = Date.parse(at) + 3 * 3_600_000;
  await h.schedule.tick();
  const rows = Object.fromEntries(h.missedRows().map(row => [row.title, row.run_id]));
  assert.equal(Object.keys(rows).length, 3);
  assert.deepEqual(h.overview().missed.map(run => run.title).sort(), ["一次", "每天", "跳过的"].sort());

  assert.deepEqual(h.decide(rows["一次"]!, "run_now"), { state: "started" });
  assert.deepEqual(h.decide(rows["每天"]!, "run_now"), { state: "started" });
  assert.deepEqual(h.decide(rows["跳过的"]!, "skip"), { state: "skipped" });
  assert.deepEqual(h.decide(rows["一次"]!, "run_now"), { state: "gone" }, "a second click finds it decided");
  await h.schedule.tick();
  assert.deepEqual(h.delivered.sort(), ["一次@" + at, "每天@" + at].sort(), "each delivered once, with the time it missed");
  assert.equal(getScheduleReminder(h.db, once), null, "the one-time reminder is done after it ran");
  assert.equal(getScheduleReminder(h.db, skipped), null, "a skipped one-time reminder is over");
  assert.equal(h.schedule.get(getScheduleReminder(h.db, daily)!.jobId)!.next_due_at, new Date(Date.parse(at) + DAY).toISOString(), "the daily one keeps its next time");
  assert.deepEqual(h.missedRows().map(row => [row.title, row.decision]).sort(), [["一次", "run_now"], ["每天", "run_now"], ["跳过的", "skip"]]);
  assert.deepEqual(h.overview().missed, [], "decided runs leave the list");

  const cancelled = h.remind("取消了", "none", new Date(h.clock.now + 3_600_000).toISOString());
  h.clock.now += DAY;
  await h.schedule.tick();
  const row = h.missedRows().find(entry => entry.title === "取消了")!;
  h.reminders.cancel(identity, { reminderId: cancelled });
  assert.deepEqual(h.decide(row.run_id, "run_now"), { state: "gone" });
});

test("RES-02 the overview lists the jobs that are on and come in the window, with what each needs", async t => {
  const h = harness(t);
  h.remind("下午提醒");
  const task = h.task("每日回顾");
  const view = h.overview();
  assert.equal(view.source.surface, "schedule");
  const titles = view.upcoming.map(run => [run.title, run.needs]);
  assert.deepEqual(titles.find(([title]) => title === "每日回顾"), ["每日回顾", ["model"]], "a task needs the model");
  assert.deepEqual(titles.find(([title]) => title === "下午提醒"), ["下午提醒", []]);
  assert.ok(view.upcoming.every(run => run.project_id === projectId));
  assert.ok(view.upcoming.some(run => run.open?.id === task.taskId));
  assert.deepEqual(h.overview(0).upcoming, [], "nothing outside the window");
});
