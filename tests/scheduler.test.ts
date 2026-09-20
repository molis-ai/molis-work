import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import {
  MIN_SCHEDULE_INTERVAL_MS,
  ScheduleError,
  scheduleCapabilities,
} from "@molis-ai/molis-work-contracts/services/scheduler";
import {
  PluginWakeupIndex,
  bindScheduleCaller,
  createScheduleService,
} from "@molis-ai/molis-work-service-scheduler";

function service(clock: { now: Date }, calls: Array<Record<string, string>> = []) {
  const db = new Database(":memory:");
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async (input) => {
    calls.push({ ...input });
  });
  const schedule = createScheduleService(db, {
    wakeupIndex,
    now: () => clock.now,
  });
  return { db, wakeupIndex, schedule, calls };
}

test("登记后拨钟会叫醒 owner，参数带 object_ref 和 job_id", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule, calls } = service(clock);
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:alpha",
    title: "拉一次",
    due_at: "2026-09-20T03:00:05.000Z",
  });
  clock.now = new Date("2026-09-20T03:00:04.000Z");
  assert.deepEqual(await schedule.tick(), { invoked: 0, failed: 0, skipped: 0 });
  assert.equal(calls.length, 0);
  clock.now = new Date("2026-09-20T03:00:06.000Z");
  assert.deepEqual(await schedule.tick(), { invoked: 1, failed: 0, skipped: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.object_ref, "source:alpha");
  assert.equal(calls[0]?.job_id, job.job_id);
  const done = schedule.get(job.job_id);
  assert.equal(done?.enabled, false);
  assert.equal(done?.last_wakeup?.status, "ok");
});

test("interval 漏打只叫醒一次，并跳到现在之后的下一拍", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule, calls } = service(clock);
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:beta",
    title: "周期",
    due_at: "2026-09-20T03:00:00.000Z",
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  clock.now = new Date("2026-09-20T03:00:17.000Z");
  assert.deepEqual(await schedule.tick(), { invoked: 1, failed: 0, skipped: 0 });
  assert.equal(calls.length, 1);
  const next = schedule.get(job.job_id);
  assert.equal(next?.enabled, true);
  assert.equal(next?.next_due_at, "2026-09-20T03:00:20.000Z");
});

test("重叠 tick 不会把还在执行的 job 再叫醒一次", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const db = new Database(":memory:");
  const wakeupIndex = new PluginWakeupIndex();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => {
    await gate;
  });
  const schedule = createScheduleService(db, { wakeupIndex, now: () => clock.now });
  schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:gamma",
    title: "重叠",
    due_at: "2026-09-20T03:00:00.000Z",
  });
  const first = schedule.tick();
  const second = await schedule.tick();
  assert.equal(second.invoked, 0);
  release();
  assert.deepEqual(await first, { invoked: 1, failed: 0, skipped: 0 });
});

test("未注册 handler 不能登记；tick 时缺失写下 plugin_unavailable", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule, wakeupIndex } = service(clock);
  assert.throws(
    () => schedule.register({
      plugin_id: "io.molis.work.missing",
      capability_id: "test.wakeup",
      object_ref: "x",
      title: "没有人接",
      due_at: "2026-09-20T03:00:00.000Z",
    }),
    (error: unknown) => error instanceof ScheduleError && error.code === "schedule_handler_missing",
  );
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:delta",
    title: "会卸掉",
    due_at: "2026-09-20T03:00:00.000Z",
  });
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => undefined)();
  assert.equal(wakeupIndex.has("io.molis.work.test.owner", "test.wakeup"), false);
  clock.now = new Date("2026-09-20T03:00:01.000Z");
  const result = await schedule.tick();
  assert.equal(result.invoked, 1);
  assert.equal(result.failed, 1);
  assert.equal(schedule.get(job.job_id)?.last_wakeup?.status, "plugin_unavailable");
});

test("绝对路径和 .. 的 object_ref 被拒", () => {
  const { schedule } = service({ now: new Date("2026-09-20T03:00:00.000Z") });
  for (const object_ref of ["/tmp/secret", "../escape", "C:\\\\Windows\\\\x", "~/file"]) {
    assert.throws(
      () => schedule.register({
        plugin_id: "io.molis.work.test.owner",
        capability_id: "test.wakeup",
        object_ref,
        title: "路径",
        due_at: "2026-09-20T03:00:00.000Z",
      }),
      (error: unknown) => error instanceof ScheduleError && error.code === "schedule_path_refused",
      object_ref,
    );
  }
});

test("同一把钥匙再登记是改期，不是第二份", () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule } = service(clock);
  const first = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:same",
    title: "第一次",
    due_at: "2026-09-20T03:00:05.000Z",
  });
  const second = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:same",
    title: "改期",
    due_at: "2026-09-20T04:00:00.000Z",
  });
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.title, "改期");
  assert.equal(second.next_due_at, "2026-09-20T04:00:00.000Z");
  assert.equal(schedule.list().length, 1);
});

test("暂停后不再叫醒，恢复后按下次时间继续", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule, calls } = service(clock);
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:pause",
    title: "可暂停",
    due_at: "2026-09-20T03:00:00.000Z",
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  schedule.setEnabled(job.job_id, false);
  clock.now = new Date("2026-09-20T03:00:01.000Z");
  assert.deepEqual(await schedule.tick(), { invoked: 0, failed: 0, skipped: 0 });
  assert.equal(calls.length, 0);
  schedule.setEnabled(job.job_id, true);
  assert.deepEqual(await schedule.tick(), { invoked: 1, failed: 0, skipped: 0 });
  assert.equal(calls.length, 1);
});

test("插件 Capability 调用会覆盖 plugin_id 为调用方", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule, wakeupIndex } = service(clock);
  wakeupIndex.register("io.molis.work.caller", "test.wakeup", async () => undefined);
  const registry = new CapabilityRegistry<typeof schedule>();
  registry.register(scheduleCapabilities.register, (_context, input) => _context.register(input));
  const stamped = bindScheduleCaller("io.molis.work.caller", {
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "owned-by-caller",
    title: "不能挂别人名下",
    due_at: "2026-09-20T03:00:00.000Z",
  });
  const job = await registry.invoke(schedule, scheduleCapabilities.register, stamped);
  assert.equal(job.plugin_id, "io.molis.work.caller");
  assert.equal(schedule.list("io.molis.work.test.owner").length, 0);
  assert.equal(schedule.list("io.molis.work.caller").length, 1);
});
