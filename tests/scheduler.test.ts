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

interface LeaseRow {
  lease_until: string | null;
  lease_token: string | null;
  next_due_at: string;
  enabled: number;
}

function leaseOf(db: Database.Database, jobId: string): LeaseRow {
  return db.prepare(
    "SELECT lease_until, lease_token, next_due_at, enabled FROM schedule_jobs WHERE job_id = ?",
  ).get(jobId) as LeaseRow;
}

test("执行超过周期和租约时同一服务不重叠，下一拍仍按周期而不是租约", async () => {
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  let active = 0;
  let maxActive = 0;
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => {
    started += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (started === 1) await gate;
    active -= 1;
  });
  const schedule = createScheduleService(db, { wakeupIndex, now: () => clock.now });
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:long",
    title: "超长",
    due_at: clock.now.toISOString(),
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  const first = schedule.tick();
  clock.now = new Date("2026-09-22T00:00:31.000Z");
  const second = await schedule.tick();
  assert.equal(second.invoked, 0);
  assert.equal(second.skipped, 1);
  assert.equal(started, 1);
  assert.equal(maxActive, 1);
  const held = leaseOf(db, job.job_id);
  assert.equal(held.next_due_at, "2026-09-22T00:00:05.000Z");
  assert.equal(held.lease_until, "2026-09-22T00:01:01.000Z");
  release();
  assert.deepEqual(await first, { invoked: 1, failed: 0, skipped: 0 });
  const again = await schedule.tick();
  assert.equal(again.invoked, 1);
  assert.equal(started, 2);
  assert.equal(maxActive, 1, "上一轮结束后才能再跑，不能叠在一起");
});

test("执行者消失后过期租约可以接管，旧结束不能清掉新租约", async () => {
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  let releaseFirst!: () => void;
  let releaseNext!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const nextGate = new Promise<void>((resolve) => { releaseNext = resolve; });
  let started = 0;
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => {
    started += 1;
    if (started === 1) await firstGate;
    else await nextGate;
  });
  const running = createScheduleService(db, { wakeupIndex, now: () => clock.now });
  const job = running.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:crash",
    title: "崩溃后接管",
    due_at: clock.now.toISOString(),
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  const first = running.tick();
  clock.now = new Date("2026-09-22T00:00:31.000Z");
  const recovered = createScheduleService(db, { wakeupIndex, now: () => clock.now });
  const takeover = recovered.tick();
  assert.equal(started, 2);
  const held = leaseOf(db, job.job_id);
  assert.equal(held.lease_until, "2026-09-22T00:01:01.000Z");
  assert.equal(held.next_due_at, "2026-09-22T00:00:35.000Z");
  assert.ok(held.lease_token);
  releaseFirst();
  await first;
  const afterLateFinish = leaseOf(db, job.job_id);
  assert.equal(afterLateFinish.lease_token, held.lease_token);
  assert.equal(afterLateFinish.lease_until, held.lease_until);
  assert.equal(afterLateFinish.enabled, 1);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM schedule_wakeups").get() as { n: number }).n,
    0,
    "旧执行结束不能把自己的收据写成当前租约的结果",
  );
  releaseNext();
  assert.equal((await takeover).invoked, 1);
  assert.equal(recovered.get(job.job_id)?.enabled, true);
  assert.equal(recovered.get(job.job_id)?.last_wakeup?.status, "ok");
});

test("取消或停止后，迟到的执行结果不能把任务复活", async () => {
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => {
    started += 1;
    await gate;
  });
  const schedule = createScheduleService(db, { wakeupIndex, now: () => clock.now });
  const paused = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:stop",
    title: "停止",
    due_at: clock.now.toISOString(),
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  const stopping = schedule.tick();
  schedule.setEnabled(paused.job_id, false);
  release();
  await stopping;
  clock.now = new Date("2026-09-22T00:00:31.000Z");
  assert.equal((await schedule.tick()).invoked, 0);
  assert.equal(schedule.get(paused.job_id)?.enabled, false);
  assert.equal(started, 1);

  let releaseCancel!: () => void;
  const cancelGate = new Promise<void>((resolve) => { releaseCancel = resolve; });
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => {
    started += 1;
    await cancelGate;
  });
  const cancelled = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:cancel",
    title: "取消",
    due_at: clock.now.toISOString(),
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  const cancelling = schedule.tick();
  assert.equal(schedule.cancel(cancelled.job_id).cancelled, true);
  releaseCancel();
  await cancelling;
  assert.equal(schedule.get(cancelled.job_id), null);
  assert.equal((await schedule.tick()).invoked, 0);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM schedule_jobs WHERE job_id = ?").get(cancelled.job_id) as { n: number }).n,
    0,
  );
});

test("旧表没有执行身份列时会补上，并且超长执行仍不重叠", async () => {
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE schedule_jobs (
      job_id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      object_ref TEXT NOT NULL,
      title TEXT NOT NULL,
      recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('once', 'interval')),
      interval_ms INTEGER,
      next_due_at TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      lease_until TEXT,
      last_wakeup_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (plugin_id, capability_id, object_ref)
    );
    CREATE TABLE schedule_wakeups (
      wakeup_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'plugin_unavailable')),
      detail TEXT
    );
  `);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async () => {
    started += 1;
    await gate;
  });
  const schedule = createScheduleService(db, { wakeupIndex, now: () => clock.now });
  const columns = db.prepare("PRAGMA table_info(schedule_jobs)").all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => column.name === "lease_token"), true);
  schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:legacy",
    title: "旧表",
    due_at: clock.now.toISOString(),
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  const first = schedule.tick();
  clock.now = new Date("2026-09-22T00:00:31.000Z");
  assert.equal((await schedule.tick()).invoked, 0);
  assert.equal(started, 1);
  release();
  await first;
});
