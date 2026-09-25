import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  PluginWakeupIndex,
  createScheduleService,
} from "@molis-ai/molis-work-service-scheduler";
import {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
  SchedulePluginRouteTable,
  bindScheduleConversationJob,
  createScheduleConversationTask,
  createScheduleRouteHandlerPorts,
  createScheduleRouteHandlers,
  getScheduleConversationTask,
  handleScheduleTaskWakeup,
  nextDailyLocalDue,
  ownedScheduleJobs,
  parseScheduledAgentReply,
  pauseOrResumeConversationTask,
  registerConversationJob,
  rescheduleEnabledConversationTasks,
  scheduleRouteErrorResponse,
} from "@molis-ai/molis-work-plugin-schedule";

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

test("创建任务会留下说明回合，到点 runner 写入助手回复并标有更新", async () => {
  const db = new Database(":memory:");
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
  const db = new Database(":memory:");
  const clock = { now: new Date(2026, 8, 20, 8, 50, 0) };
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY, async (input) => {
    return handleScheduleTaskWakeup(db, input.object_ref, {
      async run() {
        throw new Error("还没有可用的 Agent Runtime");
      },
    }, () => clock.now);
  });
  const schedule = createScheduleService(db, { wakeupIndex, now: () => clock.now });
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
  const db = new Database(":memory:");
  const clock = { now: new Date(2026, 8, 20, 8, 50, 0) };
  let runs = 0;
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY, async (input) => {
    runs += 1;
    return handleScheduleTaskWakeup(db, input.object_ref, {
      async run() {
        return { text: "IMPORTANT: no\n无事", important: false };
      },
    }, () => clock.now);
  });
  const schedule = createScheduleService(db, { wakeupIndex, now: () => clock.now });
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
  const db = new Database(":memory:");
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY, async () => undefined);
  const schedule = createScheduleService(db, {
    wakeupIndex,
    now: () => new Date("2026-09-20T00:50:00.000Z"),
  });
  const ports = createScheduleRouteHandlerPorts({
    db,
    schedule,
    now: () => new Date("2026-09-20T00:50:00.000Z"),
  });
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({
    ...ports,
    changed: () => undefined,
  }));
  const created = await routes.handle({
    method: "POST",
    pathname: "/api/schedule/tasks",
    query: new URLSearchParams(),
    body: { title: "汇总", instructions: "收成三条", time: "09:00", notify_important: true },
  });
  assert.equal(created?.status, 201);
  const taskId = (created?.body as { task: { task_id: string } }).task.task_id;
  const listed = await routes.handle({
    method: "GET",
    pathname: "/api/schedule",
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
      pathname: `/api/schedule/jobs/${encodeURIComponent(task.job_id)}/enabled`,
      query: new URLSearchParams(),
      body: { enabled: false },
    });
    assert.fail("对话任务不应走闹钟开关");
  } catch (error) {
    const response = scheduleRouteErrorResponse(error);
    assert.equal(response.status, 400);
    assert.match(String((response.body as { error: string }).error), /任务自己的开关/);
  }
});

test("对话任务编辑会重新排期；归档后不在列表且不会再唤醒", async () => {
  const db = new Database(":memory:");
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY, async () => undefined);
  const now = () => new Date("2026-09-20T00:50:00.000Z");
  const schedule = createScheduleService(db, { wakeupIndex, now });
  const ports = createScheduleRouteHandlerPorts({ db, schedule, now });
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ ...ports, changed() {} }));
  const call = (pathname: string, body: Record<string, unknown>) => routes.handle({ method: "POST", pathname, query: new URLSearchParams(), body });
  const created = await call("/api/schedule/tasks", { title: "旧任务", instructions: "读旧说明", time: "09:00" });
  const id = (created?.body as { task: { task_id: string } }).task.task_id;
  const updated = await call(`/api/schedule/tasks/${id}/update`, { title: "新任务", instructions: "读新说明", time: "18:30", notify_important: false });
  const task = (updated?.body as { task: { title: string; instructions: string; clock_label: string; notify_important: boolean; job_id: string } }).task;
  assert.equal(task.title, "新任务");
  assert.equal(task.instructions, "读新说明");
  assert.equal(task.clock_label, "18:30");
  assert.equal(task.notify_important, false);
  assert.equal(schedule.get(task.job_id)?.title, "新任务");
  assert.equal(schedule.get(task.job_id)?.next_due_at, nextDailyLocalDue(18, 30, now()).toISOString());
  assert.equal((await call(`/api/schedule/tasks/${id}/archive`, {}))?.status, 200);
  assert.equal(schedule.get(task.job_id), null);
  assert.equal(ports.listTasks().length, 0);
  assert.equal(getScheduleConversationTask(db, id)?.archived, true);
  let runs = 0;
  assert.deepEqual(await handleScheduleTaskWakeup(db, id, { run: async () => { runs++; return { text: "不应运行", important: false }; } }, now), { detail: "任务已停" });
  assert.equal(runs, 0);
  db.close();
});
