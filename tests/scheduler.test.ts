import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MIN_SCHEDULE_INTERVAL_MS,
} from "@molis-ai/molis-work-contracts/services/scheduler";
import { wakeupInstallation } from "./fixtures/scheduler-owner.js";

function service(clock: { now: Date }, calls: Array<Record<string, string>> = []) {
  const db = new Database(":memory:");
  const installation = wakeupInstallation("io.molis.work.test.owner");
  installation.action("test.wakeup", async (input) => {
    calls.push({ ...input });
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
  return { db, installation, schedule, calls };
}

test("long wakeups renew through a second database connection without another owner tick", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = mkdtempSync(join(tmpdir(), "schedule-lease-"));
  const db = new Database(join(home, "jobs.sqlite")), observer = new Database(join(home, "jobs.sqlite"));
  const released = Promise.withResolvers<void>();
  const clock = { now: new Date("2026-09-22T00:00:00Z") };
  let calls = 0;
  const installation = wakeupInstallation("io.molis.work.test.owner");
  installation.action("test.wakeup", async (_input, control) => {
    calls++; await released.promise; control.beforeEffect();
  });
  const owner = installation.scheduler(db, { now: () => clock.now, leaseMs: 300 });
  const other = installation.scheduler(observer, { now: () => clock.now, leaseMs: 300 });
  const job = owner.register({ plugin_id: "io.molis.work.test.owner", capability_id: "test.wakeup", object_ref: "slow",
    title: "slow", due_at: clock.now.toISOString(), recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS } });
  const running = owner.tick();
  try {
    for (let i = 0; i < 60; i++) { clock.now = new Date(clock.now.getTime() + 100); t.mock.timers.tick(100); }
    assert.deepEqual(await other.tick(), { invoked: 0, skipped: 1, failed: 0 });
    assert.equal(calls, 1);
    released.resolve(); await running;
    assert.equal(other.get(job.job_id)?.last_wakeup?.status, "ok");
  } finally { released.resolve(); await running; db.close(); observer.close(); rmSync(home, { recursive: true, force: true }); }
});

for (const afterExpiry of ["commit", "renew", "return"] as const) test(`expired scheduler lease cannot ${afterExpiry} before takeover`, async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = mkdtempSync(join(tmpdir(), "schedule-expired-"));
  const db = new Database(join(home, "jobs.sqlite")), observer = new Database(join(home, "jobs.sqlite"));
  const released = Promise.withResolvers<void>();
  const clock = { now: new Date("2026-09-22T00:00:00Z") };
  const installation = wakeupInstallation("io.molis.work.test.owner");
  db.exec("CREATE TABLE test_effects (call INTEGER NOT NULL)");
  const effects = () => (observer.prepare("SELECT call FROM test_effects ORDER BY call").all() as { call: number }[]).map(row => row.call);
  let calls = 0, firstSignal: AbortSignal | undefined;
  installation.action("test.wakeup", async (_input, control) => {
    const call = ++calls;
    if (call === 1) {
      firstSignal = control.signal;
      await released.promise;
      if (afterExpiry === "return") return; // Scheduler must also fence its own receipt.
    }
    db.transaction(() => { control.beforeEffect(); db.prepare("INSERT INTO test_effects VALUES (?)").run(call); }).immediate();
  });
  const owner = installation.scheduler(db, { now: () => clock.now, leaseMs: 300 });
  const other = installation.scheduler(observer, { now: () => clock.now, leaseMs: 300 });
  const job = owner.register({ plugin_id: "io.molis.work.test.owner", capability_id: "test.wakeup", object_ref: "expired",
    title: "expired", due_at: clock.now.toISOString(), recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS } });
  const running = owner.tick();
  try {
    const held = leaseOf(observer, job.job_id);
    clock.now = new Date("2026-09-22T00:00:00.300Z"); // Expiry itself, without a competing claim.
    assert.equal(other.isExecuting(job.job_id), false);
    if (afterExpiry === "renew") t.mock.timers.tick(100);
    released.resolve(); await running;
    assert.equal(firstSignal?.aborted, true);
    assert.deepEqual(effects(), [], "expired owner must not write business state");
    assert.deepEqual(leaseOf(observer, job.job_id), held, "expired lease cannot be renewed or cleared by its old owner");
    assert.equal((observer.prepare("SELECT COUNT(*) n FROM schedule_wakeups").get() as { n: number }).n, 0);
    assert.equal(other.get(job.job_id)?.last_wakeup, null);
    clock.now = new Date("2026-09-22T00:00:05.000Z");
    assert.deepEqual(await other.tick(), { invoked: 1, skipped: 0, failed: 0 });
    assert.deepEqual(effects(), [2]);
    assert.equal(other.get(job.job_id)?.last_wakeup?.status, "ok");
  } finally { released.resolve(); await running; db.close(); observer.close(); rmSync(home, { recursive: true, force: true }); }
});

for (const operation of ["pause", "cancel", "replace"] as const) test(`scheduler ${operation} fences the handler's late business effect`, async () => {
  const clock = { now: new Date("2026-09-22T00:00:00Z") };
  const { db, installation, schedule } = service(clock);
  const released = Promise.withResolvers<void>();
  const effects: string[] = [];
  installation.action("test.wakeup", async (_input, control) => {
    await released.promise; control.beforeEffect(); effects.push("late");
  });
  const input = { plugin_id: "io.molis.work.test.owner", capability_id: "test.wakeup", object_ref: "late", title: "late", due_at: clock.now.toISOString() };
  const job = schedule.register(input), running = schedule.tick();
  try {
    if (operation === "pause") schedule.setEnabled(job.job_id, false);
    else if (operation === "cancel") schedule.cancel(job.job_id);
    else schedule.register({ ...input, due_at: new Date(clock.now.getTime() + 60_000).toISOString() });
    released.resolve(); await running;
    assert.deepEqual(effects, []);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM schedule_wakeups").get() as { n: number }).n, 0);
    if (operation === "replace") assert.equal(schedule.get(job.job_id)?.next_due_at, "2026-09-22T00:01:00.000Z");
  } finally { released.resolve(); await running; db.close(); }
});

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
  const installation = wakeupInstallation("io.molis.work.test.owner");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  installation.action("test.wakeup", async () => {
    await gate;
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
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

test("没有安装提供的叫醒动作不能登记；提供者不在时，到点的任务原样留着，不记失败", async () => {
  const clock = { now: new Date("2026-09-20T03:00:00.000Z") };
  const { schedule } = service(clock);
  assert.throws(
    () => schedule.register({
      plugin_id: "io.molis.work.missing",
      capability_id: "test.wakeup",
      object_ref: "x",
      title: "没有人接",
      due_at: "2026-09-20T03:00:00.000Z",
    }),
    (error: unknown) => {
      // I7-01: missing handler remains the Scheduler's current 400 and creates no job.
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "scheduler.handler_missing");
      assert.equal(error.message, "叫醒对象还没有提供执行接口");
      assert.equal(error.kind, "invalid");
      assert.equal(actionHttpStatus(error), 400);
      return true;
    },
  );
  assert.deepEqual(schedule.list(), [], "I7-01: rejected registration persists no job");
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:delta",
    title: "会卸掉",
    due_at: "2026-09-20T03:00:00.000Z",
  });
  schedule.disconnect();
  clock.now = new Date("2026-09-20T03:00:01.000Z");
  assert.deepEqual(await schedule.tick(), { invoked: 0, failed: 0, skipped: 1 }, "an installation that is gone is not woken, and not recorded as failed");
  assert.equal(schedule.get(job.job_id)?.last_wakeup, null);
  assert.equal(schedule.get(job.job_id)?.enabled, true);
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
      (error: unknown) => error instanceof ActionError && error.code === "scheduler.path_refused",
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

// Public plugin identity and malformed-input regressions run through the real Runtime in scheduler-plugin-identity.test.ts.

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

test("长执行在租约到期前持续续租，同一服务不重叠且下一拍仍按周期", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  let active = 0;
  let maxActive = 0;
  const installation = wakeupInstallation("io.molis.work.test.owner");
  installation.action("test.wakeup", async () => {
    started += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (started === 1) await gate;
    active -= 1;
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:long",
    title: "超长",
    due_at: clock.now.toISOString(),
    recurrence: { kind: "interval", interval_ms: MIN_SCHEDULE_INTERVAL_MS },
  });
  const first = schedule.tick();
  for (let second = 0; second < 31; second++) { clock.now = new Date(clock.now.getTime() + 1000); t.mock.timers.tick(1000); }
  const second = await schedule.tick();
  assert.equal(second.invoked, 0);
  assert.equal(second.skipped, 1);
  assert.equal(started, 1);
  assert.equal(maxActive, 1);
  const held = leaseOf(db, job.job_id);
  assert.equal(held.next_due_at, "2026-09-22T00:00:00.000Z", "the due point is kept until the action answers; the lease, not the timestamp, keeps it exclusive");
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
  const installation = wakeupInstallation("io.molis.work.test.owner");
  installation.action("test.wakeup", async () => {
    started += 1;
    if (started === 1) await firstGate;
    else await nextGate;
  });
  const running = installation.scheduler(db, { now: () => clock.now });
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
  const recovered = installation.scheduler(db, { now: () => clock.now });
  const takeover = recovered.tick();
  assert.equal(started, 2);
  const held = leaseOf(db, job.job_id);
  assert.equal(held.lease_until, "2026-09-22T00:01:01.000Z");
  assert.equal(held.next_due_at, "2026-09-22T00:00:00.000Z");
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
  assert.equal(recovered.get(job.job_id)?.next_due_at, "2026-09-22T00:00:35.000Z", "the next beat is the first one after the takeover's own clock");
  assert.equal(recovered.get(job.job_id)?.last_wakeup?.status, "ok");
});

test("取消或停止后，迟到的执行结果不能把任务复活", async () => {
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const installation = wakeupInstallation("io.molis.work.test.owner");
  installation.action("test.wakeup", async () => {
    started += 1;
    await gate;
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
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
  installation.action("test.wakeup", async () => {
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

test("超长执行仍不重叠", async () => {
  const clock = { now: new Date("2026-09-22T00:00:00.000Z") };
  const db = new Database(":memory:");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const installation = wakeupInstallation("io.molis.work.test.owner");
  installation.action("test.wakeup", async () => {
    started += 1;
    await gate;
  });
  const schedule = installation.scheduler(db, { now: () => clock.now });
  schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:long-run",
    title: "超长执行",
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


// W2-18-SCHEDULE-02: a dispatched one-shot may have committed an owner effect before its response is lost.
// The Scheduler keeps the due point until the action answers, so it redelivers; the action's own ledger keeps the effect single.
test("W2-18-SCHEDULE-02: close revokes waits before SQLite release; a dispatched one-shot is redelivered and its action's ledger keeps the effect single", async () => {
  const home = mkdtempSync(join(tmpdir(), "schedule-close-")), file = join(home, "project.sqlite");
  const db = new Database(file), installation = wakeupInstallation("io.molis.work.test.owner"), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  db.exec("CREATE TABLE owner_results (job_id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  let lateRejected = false;
  installation.action("test.wakeup", async (input, control) => {
    control.beforeEffect(); db.prepare("INSERT INTO owner_results VALUES (?, ?)").run(input.job_id, "accepted owner result"); entered.resolve();
    await release.promise;
    try { control.beforeEffect(); db.prepare("INSERT INTO owner_results VALUES (?, ?)").run("late", "must not happen"); }
    catch { lateRejected = true; }
  });
  const service = installation.scheduler(db, { leaseMs: 300 });
  const job = service.register({ plugin_id: "io.molis.work.test.owner", capability_id: "test.wakeup", object_ref: "once", title: "Once",
    due_at: new Date(Date.now() - 1000).toISOString(), recurrence: { kind: "once" } });
  const running = service.tick(); await entered.promise;
  try {
    await service.close(); await running;
    const stopped = db.prepare("SELECT enabled, lease_token, lease_until, next_due_at FROM schedule_jobs WHERE job_id=?").get(job.job_id);
    assert.deepEqual(stopped, { enabled: 1, lease_token: null, lease_until: null, next_due_at: job.next_due_at }, "no answer came, so the due point is still there");
    db.close(); release.resolve(); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(lateRejected, true);
    const reopened = new Database(file);
    try {
      let redelivered = 0;
      const after = wakeupInstallation("io.molis.work.test.owner");
      after.action("test.wakeup", async (input, control) => {
        control.beforeEffect(); redelivered++;
        reopened.prepare("INSERT OR IGNORE INTO owner_results VALUES (?, ?)").run(input.job_id, "replayed owner result");
      });
      const next = after.scheduler(reopened);
      assert.equal(next.get(job.job_id)?.last_wakeup, null, "a lost response does not become a false success receipt");
      assert.deepEqual(await next.tick(), { invoked: 1, failed: 0, skipped: 0 });
      assert.equal(redelivered, 1);
      assert.deepEqual(reopened.prepare("SELECT * FROM owner_results").all(), [{ job_id: job.job_id, value: "accepted owner result" }]);
      assert.equal(next.get(job.job_id)?.last_wakeup?.status, "ok", "the receipt comes from the answer that followed");
      assert.equal(next.get(job.job_id)?.enabled, false);
      await next.close();
    } finally { reopened.close(); }
  } finally { release.resolve(); await service.close(); if (db.open) db.close(); rmSync(home, { recursive: true, force: true }); }
});

type NoteAct = () => Promise<{ detail?: string } | void>;

/** Runs one due wakeup whose action does `act`; returns what the Scheduler kept: the job's last wakeup, and the row in the table. */
async function keptNote(act: NoteAct) {
  const clock = { now: new Date("2026-10-29T03:00:00.000Z") };
  const { db, installation, schedule } = service(clock);
  installation.action("test.wakeup", act);
  const job = schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "note:cut",
    title: "cut",
    due_at: "2026-10-29T03:00:05.000Z",
  });
  clock.now = new Date("2026-10-29T03:00:06.000Z");
  const ticked = await schedule.tick();
  const record = schedule.get(job.job_id)?.last_wakeup;
  const row = db.prepare("SELECT status, detail FROM schedule_wakeups WHERE job_id = ?").get(job.job_id);
  db.close();
  return { ticked, status: record?.status, detail: record?.detail, row };
}

const PAIR = "\u{1F600}"; // two UTF-16 units, U+D83D U+DE00
const TAIL = "z".repeat(10);

for (const { name, detail, expected } of [
  { name: "unit 500 is the first half of a pair", detail: "a".repeat(499) + PAIR + TAIL, expected: "a".repeat(499) },
  { name: "a pair ends exactly at unit 500", detail: "a".repeat(498) + PAIR + TAIL, expected: "a".repeat(498) + PAIR },
  { name: "250 pairs after one plain character", detail: "a" + PAIR.repeat(250), expected: "a" + PAIR.repeat(249) },
  { name: "600 plain characters", detail: "a".repeat(600), expected: "a".repeat(500) },
]) {
  test(`RAC-1950 a reply's note is cut at 500 UTF-16 units on a whole character: ${name}`, async () => {
    const kept = await keptNote(async () => ({ detail }));
    assert.deepEqual(kept.ticked, { invoked: 1, failed: 0, skipped: 0 });
    assert.equal(kept.status, "ok");
    assert.equal(kept.detail, expected);
    assert.deepEqual(kept.row, { status: "ok", detail: expected });
  });
}

for (const { name, thrown, expected } of [
  { name: "an Error, unit 500 is the first half of a pair", thrown: new Error("a".repeat(499) + PAIR + TAIL), expected: "a".repeat(499) },
  { name: "an Error, a pair ends exactly at unit 500", thrown: new Error("a".repeat(498) + PAIR + TAIL), expected: "a".repeat(498) + PAIR },
  { name: "a thrown string, unit 500 is the first half of a pair", thrown: "a".repeat(499) + PAIR + TAIL, expected: "a".repeat(499) },
]) {
  test(`RAC-1951 a thrown error's message is cut at 500 UTF-16 units on a whole character: ${name}`, async () => {
    const kept = await keptNote(async () => { throw thrown; });
    assert.deepEqual(kept.ticked, { invoked: 1, failed: 1, skipped: 0 });
    assert.equal(kept.status, "failed");
    assert.equal(kept.detail, expected);
    assert.deepEqual(kept.row, { status: "failed", detail: expected });
  });
}

const keptAsItWas: Array<{ name: string; act: NoteAct; status: string; detail: string | null }> = [
  { name: "no reply", act: async () => {}, status: "ok", detail: null },
  { name: "a reply without a note", act: async () => ({}), status: "ok", detail: null },
  { name: "an empty note stays empty", act: async () => ({ detail: "" }), status: "ok", detail: "" },
  { name: "a short note", act: async () => ({ detail: "pulled 3 items" }), status: "ok", detail: "pulled 3 items" },
  { name: "500 plain characters", act: async () => ({ detail: "a".repeat(500) }), status: "ok", detail: "a".repeat(500) },
  { name: "250 pairs, 500 units", act: async () => ({ detail: PAIR.repeat(250) }), status: "ok", detail: PAIR.repeat(250) },
  { name: "a short error message", act: async () => { throw new Error("boom"); }, status: "failed", detail: "boom" },
];
for (const { name, act, status, detail } of keptAsItWas) {
  test(`RAC-1952 a note that fits, or is not there, is kept as it was: ${name}`, async () => {
    const kept = await keptNote(act);
    assert.equal(kept.status, status);
    assert.equal(kept.detail, detail);
    assert.deepEqual(kept.row, { status, detail });
  });
}
