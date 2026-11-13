import assert from "node:assert/strict";
import test from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_PROJECT_DATABASE,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
  composeScheduledTaskPrompt,
  createScheduleActionPorts,
  getScheduleConversationTask,
  handleScheduleTaskWakeup,
  rescheduleEnabledConversationTasks,
  scheduleActions,
} from "@molis-ai/molis-work-plugin-schedule";
import { directScheduleActions } from "./schedule-direct-actions.js";
import { wakeupInstallation } from "./fixtures/scheduler-owner.js";

// specs/risk-plugin/implementation.md §4.5: a one-off task about an object (a risk's review) runs once at its time, names its
// object in the round's words, and stops.

function scheduleDatabase() {
  const db = openTestSqlite(":memory:");
  db.exec(SCHEDULER_SCHEMA_SQL);
  db.exec(SCHEDULE_PROJECT_DATABASE.schema);
  return db;
}

const subject = { kind: "risk", id: "risk_1" };

function harness(run: (input: { subject?: { kind: string; id: string } | null }) => Promise<{ text: string; important: boolean }>) {
  const db = scheduleDatabase();
  const clock = { now: new Date() };
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  const schedule = installation.scheduler(db, { now: () => clock.now });
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, (input, control) => handleScheduleTaskWakeup(db, input.object_ref, { run }, () => clock.now, control));
  const ports = createScheduleActionPorts({ db, schedule, now: () => clock.now,
    taskReads: async () => [{ task_id: "sct_other", categories: 1, granted: 1, needs_confirmation: 0, unavailable: 0, removed: 0 }] });
  return { db, clock, schedule, ports, actions: directScheduleActions(ports) };
}

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

test("RISK-07 a one-off task about a risk runs once at its time, names the risk in its round, then stops and is not woken again", async () => {
  const subjects: unknown[] = [];
  const h = harness(async input => { subjects.push(input.subject); return { text: "IMPORTANT: no\n没有变化。", important: false }; });
  try {
    const at = inAnHour();
    const { task } = await h.actions.invoke(scheduleActions.createTask, { title: "复查风险", instructions: "看看这条风险", repeat: "none", at, subject });
    assert.equal(task.repeat, "none");
    assert.equal(task.run_at, new Date(at).toISOString());
    assert.deepEqual(task.subject, subject);
    assert.equal(h.schedule.get(task.job_id!)?.next_due_at, new Date(at).toISOString(), "the job is due at the one time, not the next daily clock");

    h.clock.now = new Date(Date.parse(at) + 60_000);
    assert.equal((await h.schedule.tick()).invoked, 1);
    assert.deepEqual(subjects, [subject]);
    const after = getScheduleConversationTask(h.db, task.task_id)!;
    assert.equal(after.enabled, false, "the task stops in the same write as its answer");
    assert.equal(after.turns.at(-1)?.text, "没有变化。");

    rescheduleEnabledConversationTasks(h.db, h.schedule, () => h.clock.now);
    h.clock.now = new Date(Date.parse(at) + 2 * 86_400_000);
    assert.equal((await h.schedule.tick()).invoked, 0, "no second round, not even a day later");
    assert.equal(getScheduleConversationTask(h.db, task.task_id)!.turns.filter(turn => turn.kind === "assistant").length, 1);
  } finally { h.db.close(); }
});

test("RISK-07 a one-off round that failed is not retried by the reconcile loop: the task says so and stops", async () => {
  const h = harness(async () => { throw new Error("模型没接上"); });
  try {
    const at = inAnHour();
    const { task } = await h.actions.invoke(scheduleActions.createTask, { title: "复查", instructions: "看", repeat: "none", at, subject });
    h.clock.now = new Date(Date.parse(at) + 60_000);
    assert.equal((await h.schedule.tick()).failed, 1);
    rescheduleEnabledConversationTasks(h.db, h.schedule, () => h.clock.now);
    const stored = getScheduleConversationTask(h.db, task.task_id)!;
    assert.equal(stored.enabled, false);
    assert.match(stored.turns.at(-1)?.text ?? "", /这一轮没跑成：模型没接上/);
    h.clock.now = new Date(Date.parse(at) + 86_400_000 + 60_000);
    assert.equal((await h.schedule.tick()).invoked, 0);
  } finally { h.db.close(); }
});

test("RISK-07 a one-off task past its time cannot be resumed; given a new time it is on again and due then", async () => {
  const h = harness(async () => ({ text: "IMPORTANT: no\n好", important: false }));
  try {
    const at = inAnHour();
    const { task } = await h.actions.invoke(scheduleActions.createTask, { title: "复查", instructions: "看", repeat: "none", at, subject });
    h.clock.now = new Date(Date.parse(at) + 60_000);
    await h.schedule.tick();
    await assert.rejects(() => h.actions.invoke(scheduleActions.setTaskEnabled, { task_id: task.task_id, enabled: true }),
      (error: { code?: string }) => error.code === "schedule.task_invalid");

    const later = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const moved = await h.actions.invoke(scheduleActions.updateTask, { task_id: task.task_id, title: "复查", instructions: "看", repeat: "none", at: later });
    assert.equal(moved.task.enabled, true);
    assert.deepEqual(moved.task.subject, subject, "an update without a subject keeps the one the task is about");
    assert.equal(h.schedule.get(moved.task.job_id!)?.next_due_at, new Date(later).toISOString());
  } finally { h.db.close(); }
});

test("RISK-07 a one-off time is checked as a reminder's: with a time zone, not past, within a year; a daily task still needs its clock", async () => {
  const h = harness(async () => ({ text: "", important: false }));
  try {
    const refused = (input: Record<string, unknown>) => assert.rejects(
      () => h.actions.invoke(scheduleActions.createTask, { title: "复查", instructions: "看", ...input }),
      (error: { code?: string }) => error.code === "schedule.task_invalid");
    await refused({ repeat: "none" });
    await refused({ repeat: "none", at: "2099-01-01T09:00:00" });
    await refused({ repeat: "none", at: new Date(Date.now() - 60_000).toISOString() });
    await refused({ repeat: "none", at: new Date(Date.now() + 400 * 86_400_000).toISOString() });
    await refused({});
    const daily = await h.actions.invoke(scheduleActions.createTask, { title: "每天", instructions: "看", time: "09:00" });
    assert.equal(daily.task.repeat, "daily");
    assert.equal(daily.task.run_at, null);
    assert.equal(daily.task.subject, null);
  } finally { h.db.close(); }
});

test("RISK-07 a round whose one-off time changed while it ran saves nothing", async () => {
  const entered = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>();
  const h = harness(async () => { entered.resolve(); await gate.promise; return { text: "IMPORTANT: no\n迟到的结果", important: false }; });
  try {
    const at = inAnHour();
    const { task } = await h.actions.invoke(scheduleActions.createTask, { title: "复查", instructions: "看", repeat: "none", at, subject });
    h.clock.now = new Date(Date.parse(at) + 60_000);
    const running = h.schedule.tick();
    await entered.promise;
    h.db.prepare("UPDATE schedule_conversation_tasks SET run_at = ? WHERE task_id = ?").run(new Date(Date.parse(at) + 86_400_000).toISOString(), task.task_id);
    gate.resolve();
    await running;
    const stored = getScheduleConversationTask(h.db, task.task_id)!;
    assert.equal(stored.turns.some(turn => turn.text === "迟到的结果"), false);
  } finally { gate.resolve(); h.db.close(); }
});

test("RISK-07 tasks.list with a subject lists only that object's tasks and what each may read; without one it is unchanged", async () => {
  const h = harness(async () => ({ text: "", important: false }));
  try {
    const mine = await h.actions.invoke(scheduleActions.createTask, { title: "复查", instructions: "看", repeat: "none", at: inAnHour(), subject });
    await h.actions.invoke(scheduleActions.createTask, { title: "别的", instructions: "看", repeat: "none", at: inAnHour(), subject: { kind: "risk", id: "risk_2" } });
    await h.actions.invoke(scheduleActions.createTask, { title: "每天", instructions: "看", time: "09:00" });
    const listed = await h.actions.invoke(scheduleActions.list, { subject });
    assert.deepEqual(listed.tasks.map(task => task.task_id), [mine.task.task_id]);
    assert.deepEqual(listed.reads, [], "only the listed tasks' reads, and this one has none turned on");
    const all = await h.actions.invoke(scheduleActions.list, {});
    assert.equal(all.tasks.length, 3);
    assert.equal(all.reads, undefined);
  } finally { h.db.close(); }
});

test("RISK-07 the round's words name the object; reading it still goes by the task's own grant", () => {
  const prompt = composeScheduledTaskPrompt({ title: "复查", instructions: "看", history: [], subject });
  assert.match(prompt, /任务关心的对象：risk risk_1/);
  assert.doesNotMatch(composeScheduledTaskPrompt({ title: "每天", instructions: "看", history: [] }), /任务关心的对象/);
});
