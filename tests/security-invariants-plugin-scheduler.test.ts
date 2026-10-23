import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction, PluginScheduleWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginSchedulerFixture as fixture } from "./fixtures/plugin-scheduler.js";

const wakeup = "scheduler-a.wakeup", due = "2026-01-01T00:00:00.000Z";
const job = (object_ref: string) => ({ action: { capability_id: wakeup, version: 1 }, object_ref, title: object_ref, due_at: due });


test("SYS-15-S1: the Runtime scheduler joins its owner's project transaction and rolls back both owners", async t => {
  const f = await fixture(t), a = await f.start("scheduler_a");
  await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => {
    tx.run("INSERT INTO scheduler_a_notes VALUES (?)", ["kept"]);
    schedule.register(job("kept"));
  }));
  assert.equal(a.count(), 1); assert.equal(a.schedule.list().length, 1);
  await assert.rejects(a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => {
    tx.run("INSERT INTO scheduler_a_notes VALUES ('rollback')"); schedule.register(job("rollback")); throw new Error("rollback");
  })), /rollback/);
  await assert.rejects(a.database.transaction(async () => {}, tx => a.schedule.join(tx, async schedule => {
    tx.run("INSERT INTO scheduler_a_notes VALUES ('async')"); schedule.register(job("async"));
  })), /同步/);
  await assert.rejects(a.database.transaction(async () => { throw new Error("cancelled"); }, tx => a.schedule.join(tx, schedule => schedule.register(job("cancelled")))), /cancelled/);
  assert.equal(a.count(), 1); assert.deepEqual(a.schedule.list().map(item => item.object_ref), ["kept"]);
  const controller = new AbortController();
  await assert.rejects(a.invoke(async caller => { await a.database.transaction(caller.beforeEffect, tx => a.schedule.join(tx, schedule => {
    tx.run("INSERT INTO scheduler_a_notes VALUES ('aborted')"); schedule.register(job("aborted")); controller.abort();
  })); }, { signal: controller.signal }));
  let revoked = false;
  await assert.rejects(a.invoke(async caller => { await a.database.transaction(caller.beforeEffect, tx => a.schedule.join(tx, schedule => {
    tx.run("INSERT INTO scheduler_a_notes VALUES ('revoked')"); schedule.register(job("revoked")); revoked = true;
  })); }, { assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "revoked"); } }));
  assert.equal(a.count(), 1); assert.deepEqual(a.schedule.list().map(item => item.object_ref), ["kept"]);
  await a.stop();
  assert.throws(() => a.schedule.list(), { code: "actions.forbidden" });
  await assert.rejects(a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.register(job("stopped")))));
  assert.equal(f.scheduler.list().length, 1);
});

test("SYS-15-S2: foreign, copied and expired transaction handles and foreign jobs are refused", async t => {
  const f = await fixture(t), a = await f.start("scheduler_a"), b = await f.start("scheduler_b");
  const second = await fixture(t), elsewhere = await second.start("scheduler_a");
  let retained: PluginDatabaseTransaction | undefined, writer: PluginScheduleWriter | undefined;
  const mine = await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => {
    retained = tx; writer = schedule;
    assert.throws(() => schedule.register({ ...job("undeclared"), action: { capability_id: "not-declared", version: 1 } }), { code: "actions.forbidden" });
    assert.throws(() => schedule.register({ ...job("version"), action: { capability_id: wakeup, version: 2 } }), { code: "actions.forbidden" });
    assert.throws(() => b.schedule.join(tx, target => target.register(job("foreign"))), { code: "actions.forbidden" });
    assert.throws(() => elsewhere.schedule.join(tx, target => target.register(job("elsewhere"))), { code: "actions.forbidden" });
    assert.throws(() => a.schedule.join({ ...tx }, target => target.register(job("copy"))), { code: "actions.forbidden" });
    return schedule.register(job("mine"));
  }));
  assert.ok(retained && writer);
  assert.throws(() => a.schedule.join(retained!, target => target.register(job("expired"))), { code: "actions.forbidden" });
  assert.throws(() => writer!.cancel(mine.job_id), { code: "actions.forbidden" });
  assert.equal(b.schedule.get(mine.job_id), null); assert.equal(b.schedule.isExecuting(mine.job_id), false);
  await assert.rejects(b.database.transaction(async () => {}, tx => b.schedule.join(tx, target => target.cancel(mine.job_id))), { code: "scheduler.job_not_found" });
  assert.deepEqual(a.schedule.list().map(item => item.object_ref), ["mine"]); assert.deepEqual(b.schedule.list(), []);
});

for (const operation of ["pause", "replace", "cancel"] as const) {
  test(`SYS-15-S3: ${operation} interrupts an active execution only after commit`, async t => {
    const f = await fixture(t), a = await f.start("scheduler_a"), entered = deferred(), finish = deferred();
    let signal: AbortSignal | undefined;
    a.onWake(async caller => { signal = caller.signal; entered.resolve(); await finish.promise; await caller.beforeEffect(); return {}; });
    const record = await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.register(job("running"))));
    const tick = f.scheduler.tick(); await entered.promise;
    const mutate = (schedule: PluginScheduleWriter) => operation === "pause" ? schedule.setEnabled(record.job_id, false)
      : operation === "replace" ? schedule.register(job("running")) : schedule.cancel(record.job_id);
    await assert.rejects(a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => { mutate(schedule); throw new Error("rollback"); })), /rollback/);
    assert.equal(signal?.aborted, false); assert.equal(a.schedule.get(record.job_id)?.enabled, true, "an action-bound one-shot keeps its due point until the invocation finishes; rollback preserves the claim"); assert.equal(a.schedule.isExecuting(record.job_id), true);
    await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => { mutate(schedule); assert.equal(signal?.aborted, false); }));
    assert.equal(signal?.aborted, true);
    finish.resolve(); await tick;
    if (operation !== "replace") assert.equal((await f.scheduler.tick()).invoked, 0);
  });
}

test("SYS-15-S4/S5: wakeups use the action gateway and retain the installation through stop, restart and replacement", async t => {
  const f = await fixture(t), a = await f.start("scheduler_a");
  let calls = 0;
  a.onWake(async (caller, input) => {
    calls++;
    assert.equal(caller.audience, "plugin"); assert.equal(caller.plugin_install_id, a.install().install_id);
    assert.equal(caller.project_id, DEMO_PROJECT_ID); assert.equal(caller.host_plugin, undefined, "the plugin cannot borrow the Host-issued identity");
    assert.equal(currentPluginInvocation()?.caller.host_plugin?.plugin_id, a.id);
    assert.equal((input as { object_ref: string }).object_ref, "bound");
    await a.database.transaction(caller.beforeEffect, tx => tx.run("INSERT INTO scheduler_a_notes VALUES ('ran')"));
    return { detail: "stored" };
  });
  const record = await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.register(job("bound"))));
  const pending = f.scheduler.get(record.job_id);
  await a.stop();
  assert.equal((await f.scheduler.tick()).invoked, 0); assert.equal(calls, 0);
  assert.deepEqual(f.scheduler.get(record.job_id), pending);
  await a.restart();
  const ran = await f.scheduler.tick();
  assert.equal(ran.invoked, 1); assert.equal(ran.failed, 0, JSON.stringify(f.scheduler.get(record.job_id)?.last_wakeup));
  assert.equal(calls, 1); assert.equal(a.count(), 1);
  assert.equal(a.schedule.get(record.job_id)?.last_wakeup?.status, "ok");
  await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.register(job("bound"))));
  const generation = a.install().installation_generation;
  await a.reinstall();
  assert.notEqual(a.install().installation_generation, generation);
  assert.equal(a.schedule.get(record.job_id)?.authorization, "needs_confirmation");
  assert.equal((await f.scheduler.tick()).invoked, 0); assert.equal(calls, 1);
  await assert.rejects(a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.setEnabled(record.job_id, true))), { code: "actions.forbidden" });
  await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.register(job("bound"))));
  assert.equal((await f.scheduler.tick()).invoked, 1); assert.equal(calls, 2); assert.equal(a.count(), 2);
});

test("SYS-15-S5: stopping a running wakeup cancels the gateway call and refuses late records and receipts", async t => {
  const f = await fixture(t), a = await f.start("scheduler_a"), entered = deferred(), finish = deferred(), late = deferred();
  let signal: AbortSignal | undefined;
  a.onWake(async caller => {
    signal = caller.signal; entered.resolve(); await finish.promise;
    try { await a.database.transaction(caller.beforeEffect, tx => tx.run("INSERT INTO scheduler_a_notes VALUES ('late')")); }
    finally { late.resolve(); }
    return {};
  });
  const record = await a.database.transaction(async () => {}, tx => a.schedule.join(tx, schedule => schedule.register(job("late"))));
  const tick = f.scheduler.tick(); await entered.promise;
  await a.stop(); assert.equal(signal?.aborted, true);
  finish.resolve(); await late.promise; await tick;
  assert.equal(a.count(), 0); assert.equal(f.scheduler.get(record.job_id)?.last_wakeup, null);
});


test("SYS-15-S5: real process death after an action claim cannot consume an unprepared one-shot", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-scheduler-crash-"));
  const child = fork(new URL("./fixtures/plugin-scheduler-crash.ts", import.meta.url), [directory], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = ""; child.stderr!.on("data", chunk => { stderr += chunk; });
  const exited = once(child, "exit");
  let jobId: string;
  try {
    const [message] = await Promise.race([once(child, "message", { signal: AbortSignal.timeout(15000) }), exited.then(() => { throw new Error("Child exited before claim: " + stderr); })]);
    assert.equal(message.phase, "claimed"); jobId = message.job;
  } finally { child.kill("SIGKILL"); await exited; }
  const f = await fixture(t, { directory, now: () => new Date(Date.now() + 60000) });
  assert.equal(f.scheduler.get(jobId!)?.enabled, true, "no plugin outcome has consumed this due point");
  const owner = await f.start("scheduler_a"); let calls = 0;
  owner.onWake(async caller => { calls++; await owner.database.transaction(caller.beforeEffect, tx => tx.run("INSERT INTO scheduler_a_notes VALUES ('recovered')")); return {}; });
  const result = await f.scheduler.tick();
  assert.equal(result.invoked, 1); assert.equal(result.failed, 0); assert.equal(calls, 1); assert.equal(owner.count(), 1);
  assert.equal(f.scheduler.get(jobId!)?.enabled, false); assert.equal((await f.scheduler.tick()).invoked, 0);
});
