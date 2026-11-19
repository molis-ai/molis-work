import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import {
  bindScheduleConversationJob, createScheduleConversationTask, getScheduledOperation, saveScheduledOperation, createScheduleReminders, decideMissedRun, deliverScheduleReminder, getScheduleReminder,
  endExpiredOnce, noteMissedWakeup, registerConversationJob, scheduleRunsOverview, SCHEDULE_PLUGIN_ID, SCHEDULE_PROJECT_DATABASE, SCHEDULE_REMINDER_WAKEUP,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
} from "@molis-ai/molis-work-plugin-schedule";
import { RUN_MISSED_GRACE_MS, RUN_MISSED_KEPT_MS } from "@molis-ai/molis-work-contracts/platform/actions";
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
  const overview = (hours = 48, expiredAfter: string | null = null) => scheduleRunsOverview(db, schedule.list(), projectId,
    { now: new Date(clock.now).toISOString(), upcoming_until: new Date(clock.now + hours * 3_600_000).toISOString(), expired_after: expiredAfter });
  const missedRows = () => db.prepare("SELECT run_id, kind, title, due_at, decision FROM schedule_missed_runs ORDER BY due_at").all() as Array<{ run_id: string; kind: string; title: string; due_at: string; decision: string | null }>;
  /** Schedule's reconcile round, which runs every few seconds while the project is open (and first thing after a start). */
  const reconcile = () => db.transaction(() => endExpiredOnce(db, projectId, clock.now)).immediate();
  return { db, clock, schedule, reminders, delivered, rounds, decide, overview, missedRows, reconcile,
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

test("BL-missed-runs-never-expire a missed one-time reminder and a missed task wait seven days from due_at; at exactly seven days they are skipped on their own", async t => {
  const h = harness(t), once = h.remind("一次性提醒"), task = h.task("每日回顾"), daily = h.remind("每天", "daily");
  h.clock.now = Math.max(Date.parse(at), Date.parse(task.dueAt)) + 3 * 3_600_000;
  await h.schedule.tick();
  const rows = Object.fromEntries(h.missedRows().map(row => [row.title, row]));
  assert.deepEqual(Object.keys(rows).sort(), ["一次性提醒", "每天", "每日回顾"].sort());
  const deadline = (title: string) => Date.parse(rows[title]!.due_at) + RUN_MISSED_KEPT_MS;

  h.clock.now = deadline("一次性提醒") - 1;
  h.reconcile();
  assert.ok(h.overview().missed.some(run => run.title === "一次性提醒"), "a moment before the seventh day it still waits");
  assert.ok(getScheduleReminder(h.db, once), "and the one-time reminder is still there to be done");

  h.clock.now = Math.max(deadline("一次性提醒"), deadline("每日回顾"), deadline("每天"));
  const view = h.overview();
  assert.deepEqual(view.missed.filter(run => ["一次性提醒", "每日回顾", "每天"].includes(run.title) && rows[run.title]!.due_at === run.due_at), [], "all three leave the list");
  assert.equal(view.expired, 3, "and are counted as skipped on their own");
  assert.deepEqual(h.decide(rows["一次性提醒"]!.run_id, "run_now"), { state: "gone" }, "现在做 as it expires finds it gone");
  assert.equal(getScheduleReminder(h.db, once), null, "the one-time reminder behind it is over, as 跳过 would end it");
  assert.deepEqual(h.missedRows().filter(row => Object.values(rows).some(entry => entry.run_id === row.run_id)).map(row => row.decision), [null, null, null],
    "Schedule's rows stay undecided: not the person's 跳过");
  assert.ok(getScheduleReminder(h.db, daily), "a repeating reminder goes on");
  assert.equal(h.delivered.length, 0, "nothing expired is delivered");
});

test("BL-missed-runs-never-expire the computer off across the seventh day: the first reconcile ends the one-time reminder; the person's own decisions are not counted", async t => {
  const h = harness(t), once = h.remind("关机前错过"), skipped = h.remind("人跳过的"), ran = h.remind("人现在做的");
  h.clock.now = Date.parse(at) + 3 * 3_600_000;
  await h.schedule.tick();
  const rows = Object.fromEntries(h.missedRows().map(row => [row.title, row.run_id]));
  assert.deepEqual(h.decide(rows["人跳过的"]!, "skip"), { state: "skipped" });
  assert.deepEqual(h.decide(rows["人现在做的"]!, "run_now"), { state: "started" });
  // Off right after the clicks, back ten days later: the decided one is still delivered once, the undecided one is over.
  h.clock.now += 10 * 86_400_000;
  h.reconcile();
  await h.schedule.tick();
  assert.deepEqual(h.delivered, ["人现在做的@" + at], "the person's 现在做 is carried out, once");
  assert.equal(getScheduleReminder(h.db, once), null, "the expired one-time reminder is ended at start");
  assert.equal(getScheduleReminder(h.db, skipped), null);
  assert.equal(getScheduleReminder(h.db, ran), null);
  assert.equal(h.overview().expired, 1, "only the one nobody decided on is in the summary");
  const told = new Date(h.clock.now).toISOString();
  h.clock.now += 86_400_000;
  h.reconcile();
  await h.schedule.tick();
  assert.equal(h.overview(48, told).expired, 0, "once told, the same summary is not said again");
  assert.equal(h.delivered.length, 1, "and nothing is delivered twice");
});

test("BL-missed-runs-never-expire on the seventh day a one-time operation is ended only while it is still set for the time it missed and on", async t => {
  const h = harness(t), due = at, later = new Date(Date.parse(at) + 10 * DAY).toISOString();
  const operation = (id: string, when: string, state: "enabled" | "paused") => {
    saveScheduledOperation(h.db, { id, projectId, pluginId: "io.molis.work.test.ops", installationId: "installed", installationGeneration: "first", pluginTitle: "测试",
      operationId: "tidy", operationTitle: "整理", input: {}, inbox: false, link: "/o", jobId: `job-${id}`, jobOwner: SCHEDULE_PLUGIN_ID, repeat: "none", at: when, state, detail: null });
    h.db.prepare("INSERT INTO schedule_missed_runs (project_id, run_id, kind, ref, title, due_at, missed_at) VALUES (?, ?, 'operation', ?, ?, ?, ?)")
      .run(projectId, `operation:${id}:${due}`, id, id, due, new Date(Date.parse(due) + 3_600_000).toISOString());
  };
  operation("left", due, "enabled");
  operation("moved", later, "enabled");
  operation("paused", due, "paused");
  h.clock.now = Date.parse(due) + RUN_MISSED_KEPT_MS;
  h.reconcile();
  assert.deepEqual([getScheduledOperation(h.db, projectId, "left")?.state, getScheduledOperation(h.db, projectId, "left")?.detail], ["completed", "错过后跳过"],
    "left as it was: ended as 跳过 ends it");
  assert.equal(getScheduledOperation(h.db, projectId, "moved")?.state, "enabled", "moved by the person to another time: theirs to keep");
  assert.equal(getScheduledOperation(h.db, projectId, "paused")?.state, "paused", "paused: left for the person");
  h.reconcile();
  assert.equal(getScheduledOperation(h.db, projectId, "moved")?.at, later, "and every later round leaves it alone");
  assert.equal(h.overview().expired, 3, "all three rows are still counted: nobody decided on them");
});

test("BL-missed-runs-never-expire a run Schedule writes down only after the person was last told is still counted once; Schedule keeps each ended row a month", async t => {
  const h = harness(t);
  h.remind("新的一次");
  const row = (id: string, dueAt: string, missedAt: string) => h.db.prepare(
    "INSERT INTO schedule_missed_runs (project_id, run_id, kind, ref, title, due_at, missed_at) VALUES (?, ?, 'reminder', ?, ?, ?, ?)").run(projectId, id, id, id, dueAt, missedAt);
  row("late", "2026-10-25T09:00:00.000Z", "2026-11-12T09:00:00.000Z");
  row("told", "2026-10-26T09:00:00.000Z", "2026-10-26T10:00:00.000Z");
  row("old", "2026-09-01T09:00:00.000Z", "2026-09-01T10:00:00.000Z");
  h.clock.now = Date.parse("2026-11-12T10:00:00.000Z");
  assert.equal(h.overview(48, "2026-11-10T09:00:00.000Z").expired, 1, "only the one written down after the summary of the 10th; the others were in it");
  // A wakeup that writes a new row (the reminder above, three hours late) also drops what ended more than a month ago.
  h.clock.now = Date.parse(at) + 3 * 3_600_000;
  await h.schedule.tick();
  assert.deepEqual(h.missedRows().map(entry => entry.run_id).filter(id => ["late", "told", "old"].includes(id)).sort(), ["late", "told"],
    "the one that ran out in early September is gone; the October ones are kept");
});
