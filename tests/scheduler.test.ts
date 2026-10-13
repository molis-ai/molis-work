import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  MIN_SCHEDULE_INTERVAL_MS,
  ScheduleError,
  scheduleCapabilities,
} from "@molis-ai/molis-work-contracts/services/scheduler";
import {
  PluginWakeupIndex,
  createScheduleService,
  registerScheduleCapabilities,
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

test("long wakeups renew through a second database connection without another owner tick", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const home = mkdtempSync(join(tmpdir(), "schedule-lease-"));
  const db = new Database(join(home, "jobs.sqlite")), observer = new Database(join(home, "jobs.sqlite"));
  const released = Promise.withResolvers<void>();
  const clock = { now: new Date("2026-09-22T00:00:00Z") };
  let calls = 0;
  const wakeupIndex = new PluginWakeupIndex();
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async (_input, control) => {
    calls++; await released.promise; control.beforeEffect();
  });
  const owner = createScheduleService(db, { wakeupIndex, now: () => clock.now, leaseMs: 300 });
  const other = createScheduleService(observer, { wakeupIndex, now: () => clock.now, leaseMs: 300 });
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
  const wakeupIndex = new PluginWakeupIndex();
  db.exec("CREATE TABLE test_effects (call INTEGER NOT NULL)");
  const effects = () => (observer.prepare("SELECT call FROM test_effects ORDER BY call").all() as { call: number }[]).map(row => row.call);
  let calls = 0, firstSignal: AbortSignal | undefined;
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async (_input, control) => {
    const call = ++calls;
    if (call === 1) {
      firstSignal = control.signal;
      await released.promise;
      if (afterExpiry === "return") return; // Scheduler must also fence its own receipt.
    }
    db.transaction(() => { control.beforeEffect(); db.prepare("INSERT INTO test_effects VALUES (?)").run(call); }).immediate();
  });
  const owner = createScheduleService(db, { wakeupIndex, now: () => clock.now, leaseMs: 300 });
  const other = createScheduleService(observer, { wakeupIndex, now: () => clock.now, leaseMs: 300 });
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
  const { db, wakeupIndex, schedule } = service(clock);
  const released = Promise.withResolvers<void>();
  const effects: string[] = [];
  wakeupIndex.register("io.molis.work.test.owner", "test.wakeup", async (_input, control) => {
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

// The owner of a typed schedule.* call is the plugin on the trusted invocation. The Host's generic port knows no
// capability by name, so the Scheduler's handlers are where this rule lives and where it is proven.
type ScheduleHandler = (context: unknown, input: unknown, invocation?: HostCapabilityInvocation) => unknown;
function scheduleChannel(clock: { now: Date }, plugins: string[] = ["io.molis.work.caller", "io.molis.work.other"]) {
  const { schedule, wakeupIndex } = service(clock);
  for (const plugin of plugins) wakeupIndex.register(plugin, "test.wakeup", async () => undefined);
  const handlers = new Map<string, ScheduleHandler>();
  registerScheduleCapabilities({ register(definition, handler) {
    handlers.set(definition.capability_id, handler as ScheduleHandler);
    return () => { handlers.delete(definition.capability_id); };
  } }, () => schedule);
  const as = (pluginId: string, active: () => void = () => {}): HostCapabilityInvocation => ({
    consumer: "plugin", beforeEffect: async () => {}, assertAuthorityCurrent: () => {},
    plugin: { plugin_id: pluginId, install_id: `install-${pluginId}`, actor_id: "web-user", project_id: "board", declaration: {} as never, assertActive: active },
  });
  const call = (definition: { capability_id: string }, input: unknown, invocation?: HostCapabilityInvocation) =>
    handlers.get(definition.capability_id)!(undefined, input, invocation);
  return { schedule, call, as };
}
const registration = { capability_id: "test.wakeup", object_ref: "owned-by-caller", title: "不能挂别人名下", due_at: "2026-09-20T03:00:00.000Z" };

test("schedule.register from a plugin is owned by the invocation's plugin, whatever plugin_id the input names", async () => {
  const { schedule, call, as } = scheduleChannel({ now: new Date("2026-09-20T03:00:00.000Z") });
  const job = call(scheduleCapabilities.register, { ...registration, plugin_id: "io.molis.work.other" }, as("io.molis.work.caller")) as { plugin_id: string };
  assert.equal(job.plugin_id, "io.molis.work.caller");
  assert.equal(schedule.list("io.molis.work.other").length, 0);
  assert.equal(schedule.list("io.molis.work.caller").length, 1);
});

test("schedule.cancel, setEnabled and list reach only the invocation's plugin's jobs, even when the input names another plugin", async () => {
  const { schedule, call, as } = scheduleChannel({ now: new Date("2026-09-20T03:00:00.000Z") });
  const mine = call(scheduleCapabilities.register, registration, as("io.molis.work.caller")) as { job_id: string };
  const theirs = call(scheduleCapabilities.register, { ...registration, object_ref: "theirs" }, as("io.molis.work.other")) as { job_id: string };
  const intruder = as("io.molis.work.other");
  const refused = { code: "schedule_job_not_found" };
  assert.throws(() => call(scheduleCapabilities.cancel, { job_id: mine.job_id, plugin_id: "io.molis.work.caller" }, intruder), refused);
  assert.throws(() => call(scheduleCapabilities.setEnabled, { job_id: mine.job_id, plugin_id: "io.molis.work.caller", enabled: false }, intruder), refused);
  assert.equal(schedule.get(mine.job_id)?.enabled, true);
  assert.deepEqual((call(scheduleCapabilities.list, { plugin_id: "io.molis.work.caller" }, intruder) as { jobs: Array<{ job_id: string }> }).jobs.map(job => job.job_id), [theirs.job_id]);
  assert.deepEqual(call(scheduleCapabilities.cancel, { job_id: theirs.job_id }, intruder), { cancelled: true });
  assert.equal(schedule.get(theirs.job_id), null);
  assert.equal(schedule.list().length, 1);
});

test("no input shape moves a schedule.* call off the invocation's plugin", async () => {
  const { schedule, call, as } = scheduleChannel({ now: new Date("2026-09-20T03:00:00.000Z") });
  const mine = call(scheduleCapabilities.register, registration, as("io.molis.work.caller")) as { job_id: string };
  const intruder = as("io.molis.work.other");
  const asArray = Object.assign([], { job_id: mine.job_id, enabled: false });
  const asFunction = Object.assign(() => undefined, { job_id: mine.job_id, enabled: false });
  for (const input of [[], "x", 7, null, undefined, asArray, asFunction]) {
    assert.deepEqual((call(scheduleCapabilities.list, input, intruder) as { jobs: unknown[] }).jobs, [], `list ${String(input)}`);
    for (const definition of [scheduleCapabilities.cancel, scheduleCapabilities.setEnabled, scheduleCapabilities.register]) {
      assert.throws(() => call(definition, input, intruder), { code: "schedule_job_invalid" }, `${definition.capability_id} ${String(input)}`);
    }
  }
  assert.equal(schedule.get(mine.job_id)?.enabled, true);
  assert.equal(schedule.list().length, 1);
});

test("a schedule.* call with no plugin identity, or from a stopped installation, writes and reads nothing", async () => {
  const { schedule, call, as } = scheduleChannel({ now: new Date("2026-09-20T03:00:00.000Z") });
  const mine = call(scheduleCapabilities.register, registration, as("io.molis.work.caller")) as { job_id: string };
  const stopped = as("io.molis.work.caller", () => { throw new Error("此插件实例已停止"); });
  const hostOnly: Array<HostCapabilityInvocation | undefined> = [undefined, { beforeEffect: async () => {}, assertAuthorityCurrent: () => {} }, { consumer: "plugin", beforeEffect: async () => {}, assertAuthorityCurrent: () => {} }];
  for (const invocation of hostOnly) {
    assert.throws(() => call(scheduleCapabilities.register, { ...registration, plugin_id: "io.molis.work.caller", object_ref: "second" }, invocation), { code: "schedule_job_invalid" });
    assert.throws(() => call(scheduleCapabilities.cancel, { job_id: mine.job_id, plugin_id: "io.molis.work.caller" }, invocation), { code: "schedule_job_invalid" });
    assert.throws(() => call(scheduleCapabilities.setEnabled, { job_id: mine.job_id, plugin_id: "io.molis.work.caller", enabled: false }, invocation), { code: "schedule_job_invalid" });
    assert.throws(() => call(scheduleCapabilities.list, { plugin_id: "io.molis.work.caller" }, invocation), { code: "schedule_job_invalid" });
  }
  assert.throws(() => call(scheduleCapabilities.register, { ...registration, object_ref: "second" }, stopped), /已停止/);
  assert.throws(() => call(scheduleCapabilities.cancel, { job_id: mine.job_id }, stopped), /已停止/);
  assert.throws(() => call(scheduleCapabilities.setEnabled, { job_id: mine.job_id, enabled: false }, stopped), /已停止/);
  assert.throws(() => call(scheduleCapabilities.list, {}, stopped), /已停止/);
  assert.equal(schedule.list().length, 1);
  assert.equal(schedule.get(mine.job_id)?.enabled, true);
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

test("长执行在租约到期前持续续租，同一服务不重叠且下一拍仍按周期", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
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
  for (let second = 0; second < 31; second++) { clock.now = new Date(clock.now.getTime() + 1000); t.mock.timers.tick(1000); }
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

test("超长执行仍不重叠", async () => {
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
