import { SchedulePluginRouteTable } from "./schedule-direct-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_PROJECT_DATABASE,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
  bindScheduleConversationJob,
  composeScheduledTaskPrompt,
  createScheduleConversationTask,
  createScheduleActionPorts,
  createScheduleRouteHandlers,
  getScheduleConversationTask,
  handleScheduleTaskWakeup,
  nextDailyLocalDue,
  ownedScheduleJobs,
  parseScheduledAgentReply,
  pauseOrResumeConversationTask,
  registerConversationJob,
  rescheduleEnabledConversationTasks,
  schedulePrompts,
} from "@molis-ai/molis-work-plugin-schedule";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { directScheduleActions } from "./schedule-direct-actions.js";
import { wakeupInstallation } from "./fixtures/scheduler-owner.js";

/** A bare library with Schedule's declared tables, as the platform makes them when a project opens with Schedule. */
function scheduleDatabase() {
  const db = new Database(":memory:");
  db.exec(SCHEDULE_PROJECT_DATABASE.schema);
  return db;
}

for (const failure of [false, true]) test(`paused conversation ignores the late runner ${failure ? "error" : "result"} without writing failure`, async () => {
  const db = scheduleDatabase(), clock = { now: new Date(2026, 8, 20, 8, 50) };
  const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  const schedule = installation.scheduler(db, { now: () => clock.now });
  const ports = createScheduleActionPorts({ db, schedule, now: () => clock.now });
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, (input, control) => handleScheduleTaskWakeup(db, input.object_ref, {
    async run() { entered.resolve(); await gate.promise; if (failure) throw new Error("late failure"); return { text: "late result", important: true }; },
  }, () => clock.now, control));
  const task = ports.createTask({ title: "slow", instructions: "wait", hour: 9, minute: 0, notify_important: true });
  clock.now = new Date(2026, 8, 20, 9, 1);
  const running = schedule.tick();
  try {
    await entered.promise;
    ports.setTaskEnabled(task.task_id, false);
    gate.resolve(); await running;
    const persisted = getScheduleConversationTask(db, task.task_id)!;
    assert.equal(persisted.enabled, false);
    assert.deepEqual(persisted.turns.map(turn => [turn.kind, turn.text]), [["user", "wait"]]);
    assert.equal(persisted.last_error, null);
  } finally { gate.resolve(); await running; db.close(); }
});

test("LOGIC-04 a failed round still leaves 这一轮没跑成 when the task text changed while it ran", async () => {
  const db = scheduleDatabase(), clock = { now: new Date(2026, 8, 20, 8, 50) };
  const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  const schedule = installation.scheduler(db, { now: () => clock.now });
  const ports = createScheduleActionPorts({ db, schedule, now: () => clock.now });
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, (input, control) => handleScheduleTaskWakeup(db, input.object_ref, {
    async run() { entered.resolve(); await gate.promise; throw new Error("模型没接上"); },
  }, () => clock.now, control));
  const task = ports.createTask({ title: "slow", instructions: "wait", hour: 9, minute: 0, notify_important: false });
  clock.now = new Date(2026, 8, 20, 9, 1);
  const running = schedule.tick();
  try {
    await entered.promise;
    db.prepare("UPDATE schedule_conversation_tasks SET title = ? WHERE task_id = ?").run("改过的标题", task.task_id);
    gate.resolve();
    await running;
    const stored = getScheduleConversationTask(db, task.task_id)!;
    assert.match(stored.turns.at(-1)?.text ?? "", /到点了，但这一轮没跑成：模型没接上/);
    assert.equal(stored.enabled, true);
  } finally { gate.resolve(); await running; db.close(); }
});

test("LOGIC-04 a lost lease writes no failure sentence", async () => {
  const db = scheduleDatabase();
  const task = createScheduleConversationTask(db, { title: "租约", instructions: "看一眼", hour: 9, minute: 0, notify_important: false }, () => new Date("2026-09-20T01:00:00.000Z"));
  let checks = 0;
  await assert.rejects(() => handleScheduleTaskWakeup(db, task.task_id, {
    async run() { throw new Error("模型没接上"); },
  }, () => new Date("2026-09-20T01:05:00.000Z"), { beforeEffect() { checks += 1; if (checks > 1) throw new Error("lease lost"); } }));
  const stored = getScheduleConversationTask(db, task.task_id)!;
  assert.deepEqual(stored.turns.map(turn => turn.kind), ["user"]);
  assert.equal(stored.last_error, null);
  db.close();
});

test("LOGIC-04 the lease that guards the failure sentence is asked inside its write, so it cannot be lost in between", async () => {
  const db = scheduleDatabase();
  const task = createScheduleConversationTask(db, { title: "租约", instructions: "看一眼", hour: 9, minute: 0, notify_important: false }, () => new Date("2026-09-20T01:00:00.000Z"));
  const asked: boolean[] = [];
  await assert.rejects(() => handleScheduleTaskWakeup(db, task.task_id, {
    async run() { throw new Error("模型没接上"); },
  }, () => new Date("2026-09-20T01:05:00.000Z"), { beforeEffect() { asked.push(db.inTransaction); } }));
  assert.equal(asked.at(-1), true, "the last check before the sentence runs inside the transaction that writes it");
  assert.match(getScheduleConversationTask(db, task.task_id)!.turns.at(-1)?.text ?? "", /到点了，但这一轮没跑成：模型没接上/);
  db.close();
});

test("a concurrent calendar tick does not replace the lease of a running one-shot conversation", async () => {
  const db = scheduleDatabase(), clock = { now: new Date(2026, 8, 20, 8, 50) };
  const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  const schedule = installation.scheduler(db, { now: () => clock.now });
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, (input, control) => handleScheduleTaskWakeup(db, input.object_ref, {
    async run() { entered.resolve(); await gate.promise; return { text: "one result", important: false }; },
  }, () => clock.now, control));
  const ports = createScheduleActionPorts({ db, schedule, now: () => clock.now });
  const task = ports.createTask({ title: "slow", instructions: "wait", hour: 9, minute: 0 });
  clock.now = new Date(2026, 8, 20, 9, 1);
  const running = schedule.tick();
  try {
    await entered.promise;
    const held = () => db.prepare("SELECT lease_token FROM schedule_jobs WHERE job_id = ?").get(task.job_id) as { lease_token: string | null };
    const token = held().lease_token;
    assert.ok(token);
    const other = installation.scheduler(db, { now: () => clock.now });
    await other.tick();
    await rescheduleEnabledConversationTasks(db, other, () => clock.now);
    assert.equal(held().lease_token, token);
    clock.now = new Date(clock.now.getTime() + 1000);
    ports.openTask(task.task_id);
    gate.resolve(); await running;
    assert.equal(getScheduleConversationTask(db, task.task_id)?.turns.at(-1)?.text, "one result");
    await rescheduleEnabledConversationTasks(db, other, () => clock.now);
    assert.equal(other.get(task.job_id!)?.enabled, true);
    assert.ok(other.get(task.job_id!)!.next_due_at > clock.now.toISOString());
  } finally { gate.resolve(); await running; db.close(); }
});

test("本地日历日：过了当天时刻就排到明天", () => {
  const from = new Date(2026, 8, 20, 10, 0, 0);
  const next = nextDailyLocalDue(9, 0, from);
  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 8);
  assert.equal(next.getDate(), 21);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
  const sameMorning = nextDailyLocalDue(9, 0, new Date(2026, 8, 20, 8, 59, 0));
  assert.equal(sameMorning.getDate(), 20);
  const exact = nextDailyLocalDue(9, 0, new Date(2026, 8, 20, 9, 0, 0));
  assert.equal(exact.getDate(), 21);
});

test("Agent 回复第一行 IMPORTANT 决定是否标重要，并切掉这一行", () => {
  assert.deepEqual(parseScheduledAgentReply("IMPORTANT: yes\n有三封未读"), {
    text: "有三封未读",
    important: true,
    marked: true,
  });
  assert.deepEqual(parseScheduledAgentReply("IMPORTANT: no\n一切正常"), {
    text: "一切正常",
    important: false,
    marked: true,
  });
  assert.deepEqual(parseScheduledAgentReply("没有标记"), {
    text: "没有标记",
    important: false,
    marked: false,
  });
  assert.equal(parseScheduledAgentReply("正文里写了 IMPORTANT: yes").marked, false);
});

// Handbook 12.4-3: one rule, one layer. The task is the person's words plus the one line the code reads back; when to say yes is the reader role's.
test("a scheduled round's task is the person's title, instructions and history, ending with the output line the parser reads; when to say yes is only in the reader prompt", () => {
  const message = composeScheduledTaskPrompt({ title: "周报汇总", instructions: "汇总本周进展", history: [{ kind: "user", text: "汇总本周进展" }] });
  const contract = "输出格式：回复第一行单独写 IMPORTANT: yes 或 IMPORTANT: no，第二行起是正文。";
  assert.equal(message, `任务标题：周报汇总\n任务说明：\n汇总本周进展\n历史对话：\nuser: 汇总本周进展\n\n${contract}`);
  for (const answer of ["yes", "no"]) {
    assert.ok(contract.includes(`IMPORTANT: ${answer}`));
    assert.deepEqual(parseScheduledAgentReply(`IMPORTANT: ${answer}\n正文`), { text: "正文", important: answer === "yes", marked: true });
  }
  const reader = schedulePrompts.find((prompt) => prompt.prompt_id === "schedule-reader");
  assert.ok(reader?.body.includes("写 yes"), "when to say yes is the reader role's");
  assert.ok(!message.includes("写 yes"), "and is not repeated in the task");
});

test("创建任务会留下说明回合，到点 runner 写入助手回复并标有更新", async () => {
  const db = scheduleDatabase();
  const created = createScheduleConversationTask(db, {
    title: "早上汇总",
    instructions: "把未读收成三条",
    hour: 9,
    minute: 0,
    notify_important: true,
  }, () => new Date("2026-09-20T01:00:00.000Z"));
  assert.equal(created.turns.length, 1);
  assert.equal(created.turns[0]?.kind, "user");
  assert.equal(created.turns[0]?.text, "把未读收成三条");
  await handleScheduleTaskWakeup(db, created.task_id, {
    async run(input) {
      assert.equal(input.title, "早上汇总");
      assert.match(input.history[0]?.text ?? "", /未读/);
      return { text: "IMPORTANT: yes\n收件箱有三封要看。", important: false };
    },
  }, () => new Date("2026-09-20T01:05:00.000Z"));
  const after = getScheduleConversationTask(db, created.task_id);
  assert.equal(after?.turns.length, 2);
  assert.equal(after?.turns[1]?.kind, "assistant");
  assert.equal(after?.turns[1]?.text, "收件箱有三封要看。");
  assert.equal(after?.unread, true);
});

test("拨钟过点后只跑一轮，失败会留下系统说明，再排到明天", async () => {
  const db = scheduleDatabase();
  const clock = { now: new Date(2026, 8, 20, 8, 50, 0) };
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, async (input) => {
    return handleScheduleTaskWakeup(db, input.object_ref, {
      async run() {
        throw new Error("还没有可用的 Agent Runtime");
      },
    }, () => clock.now);
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
  const task = createScheduleConversationTask(db, {
    title: "失败也会再响",
    instructions: "看一眼 Inbox",
    hour: 9,
    minute: 0,
    notify_important: true,
  }, () => clock.now);
  const job = registerConversationJob(schedule, task, clock.now);
  bindScheduleConversationJob(db, task.task_id, job.job_id, () => clock.now);
  assert.equal(ownedScheduleJobs(schedule.list()).length, 0);
  clock.now = new Date(2026, 8, 20, 9, 10, 0);
  const result = await schedule.tick();
  assert.equal(result.invoked, 1);
  assert.equal(result.failed, 1);
  const stored = getScheduleConversationTask(db, task.task_id);
  assert.match(stored?.turns.at(-1)?.text ?? "", /还没有可用的 Agent Runtime/);
  assert.equal(schedule.get(job.job_id)?.enabled, false);
  await rescheduleEnabledConversationTasks(db, schedule, () => clock.now);
  const next = schedule.get(job.job_id);
  assert.equal(next?.enabled, true);
  const due = new Date(next?.next_due_at ?? "");
  assert.ok(due.getTime() > clock.now.getTime());
});

test("暂停后不再叫醒，恢复后重新挂下一拍", async () => {
  const db = scheduleDatabase();
  const clock = { now: new Date(2026, 8, 20, 8, 50, 0) };
  let runs = 0;
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, async (input) => {
    runs += 1;
    return handleScheduleTaskWakeup(db, input.object_ref, {
      async run() {
        return { text: "IMPORTANT: no\n无事", important: false };
      },
    }, () => clock.now);
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
  const task = createScheduleConversationTask(db, {
    title: "可暂停",
    instructions: "看一眼",
    hour: 9,
    minute: 0,
    notify_important: false,
  }, () => clock.now);
  const job = registerConversationJob(schedule, task, clock.now);
  bindScheduleConversationJob(db, task.task_id, job.job_id, () => clock.now);
  pauseOrResumeConversationTask(db, schedule, task.task_id, false, () => clock.now);
  clock.now = new Date(2026, 8, 20, 9, 10, 0);
  assert.deepEqual(await schedule.tick(), { invoked: 0, failed: 0, skipped: 0 });
  assert.equal(runs, 0);
  pauseOrResumeConversationTask(db, schedule, task.task_id, true, () => clock.now);
  assert.equal(schedule.list()[0]?.enabled, true);
});

test("HTTP 能创建对话任务并返回 tasks", async () => {
  const db = scheduleDatabase();
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, async () => undefined);
  const schedule = installation.scheduler(db, {
    now: () => new Date("2026-09-20T00:50:00.000Z"),
  });
  const ports = createScheduleActionPorts({
    db,
    schedule,
    now: () => new Date("2026-09-20T00:50:00.000Z"),
  });
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({
    actions: directScheduleActions(ports),
    changed: () => undefined,
  }));
  const created = await routes.handle({
    method: "POST",
    pathname: "/api/plugins/io.molis.work.schedule/tasks",
    query: new URLSearchParams(),
    body: { title: "汇总", instructions: "收成三条", time: "09:00", notify_important: true },
  });
  assert.equal(created?.status, 201);
  const taskId = (created?.body as { task: { task_id: string } }).task.task_id;
  const listed = await routes.handle({
    method: "GET",
    pathname: "/api/plugins/io.molis.work.schedule/list",
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal((listed?.body as { tasks: unknown[] }).tasks.length, 1);
  assert.equal((listed?.body as { jobs: unknown[] }).jobs.length, 0);
  assert.ok(taskId);
  const task = (created?.body as { task: { job_id: string } }).task;
  try {
    await routes.handle({
      method: "POST",
      pathname: `/api/plugins/io.molis.work.schedule/jobs/${encodeURIComponent(task.job_id)}/enabled`,
      query: new URLSearchParams(),
      body: { enabled: false },
    });
    assert.fail("对话任务不应走闹钟开关");
  } catch (error) {
    const response = actionErrorResponse(error);
    assert.deepEqual([response.status, response.body.code], [400, "schedule.task_invalid"]);
    assert.match(String((response.body as { error: string }).error), /任务自己的开关/);
  }
});

test("对话任务编辑会重新排期；归档后不在列表且不会再唤醒", async () => {
  const db = scheduleDatabase();
  const installation = wakeupInstallation(SCHEDULE_PLUGIN_ID);
  installation.action(SCHEDULE_TASK_WAKEUP_CAPABILITY, async () => undefined);
  const now = () => new Date("2026-09-20T00:50:00.000Z");
  const schedule = installation.scheduler(db, { now });
  const ports = createScheduleActionPorts({ db, schedule, now });
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: directScheduleActions(ports), changed() {} }));
  const call = (pathname: string, body: Record<string, unknown>) => routes.handle({ method: "POST", pathname, query: new URLSearchParams(), body });
  const created = await call("/api/plugins/io.molis.work.schedule/tasks", { title: "旧任务", instructions: "读旧说明", time: "09:00" });
  const id = (created?.body as { task: { task_id: string } }).task.task_id;
  const updated = await call(`/api/plugins/io.molis.work.schedule/tasks/${id}/update`, { title: "新任务", instructions: "读新说明", time: "18:30", notify_important: false });
  const task = (updated?.body as { task: { title: string; instructions: string; clock_label: string; notify_important: boolean; job_id: string } }).task;
  assert.equal(task.title, "新任务");
  assert.equal(task.instructions, "读新说明");
  assert.equal(task.clock_label, "18:30");
  assert.equal(task.notify_important, false);
  assert.equal(schedule.get(task.job_id)?.title, "新任务");
  assert.equal(schedule.get(task.job_id)?.next_due_at, nextDailyLocalDue(18, 30, now()).toISOString());
  assert.equal((await call(`/api/plugins/io.molis.work.schedule/tasks/${id}/archive`, {}))?.status, 200);
  assert.equal(schedule.get(task.job_id), null);
  assert.equal(ports.listTasks().length, 0);
  assert.equal(getScheduleConversationTask(db, id)?.archived, true);
  let runs = 0;
  assert.deepEqual(await handleScheduleTaskWakeup(db, id, { run: async () => { runs++; return { text: "不应运行", important: false }; } }, now), { detail: "任务已停" });
  assert.equal(runs, 0);
  db.close();
});
