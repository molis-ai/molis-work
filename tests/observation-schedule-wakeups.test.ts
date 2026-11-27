import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { currentCallId, newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import { createHostObservation, dueWakeupRecord, partitionLifecycleRecords, personSettingsObserved, scheduleWakeupRecords, installHostUiText, type PartitionPluginLifecycleEvent } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { DueEntryRecord } from "@molis-ai/molis-work-service-scheduler";
import type { SyncEvent, SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { wakeupInstallation } from "./fixtures/scheduler-owner.js";

installHostUiText();

// OCL-01, OCL-03, OCL-08 (specs/observation-collection/spec.md; design §4「定时与后台任务」): every wakeup of a project clock is a work
// record of its own, in the operation it ran as (the action it fired shares the call number), and one that ran, failed, could not
// run or was cut short says so; two jobs due together are two operations.

function clockWithRecords(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "observation-wakeups-")), observation = createHostObservation(home);
  const db = openTestSqlite(":memory:"); db.exec(SCHEDULER_SCHEMA_SQL);
  const installation = wakeupInstallation("io.molis.work.test.owner"), clock = { now: new Date("2026-11-13T08:00:00.000Z") };
  const schedule = installation.scheduler(db, { now: () => clock.now, eachWakeup: run => withCallId(newCallId(), run), wakeupEnded: scheduleWakeupRecords(home, "p1") });
  t.after(async () => { await schedule.close(); db.close(); observation.close(); rmSync(home, { recursive: true, force: true }); });
  const records = () => { observation.layer.flush(); return readRecords(observation.layer.writer.database()!.db, { fact: "scheduler.wakeup" }); };
  const job = (capability_id: string, object_ref: string) => schedule.register({ plugin_id: "io.molis.work.test.owner", capability_id, object_ref, title: object_ref,
    due_at: "2026-11-13T07:59:00.000Z", recurrence: { kind: "once" } });
  return { installation, schedule, clock, records, job };
}

test("OCL-01 OCL-03: each wakeup is one record in the operation it ran as, shared with what it fired, and two due together are two operations", async t => {
  const f = clockWithRecords(t), fired: (string | undefined)[] = [];
  f.installation.action("test.remind", async () => { fired.push(currentCallId()); return { detail: "sent" }; });
  f.job("test.remind", "reminder-a"); f.job("test.remind", "reminder-b");
  assert.deepEqual(await f.schedule.tick(), { invoked: 2, failed: 0, skipped: 0 });
  const records = f.records();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(record => record.work.call_id), fired, "the record and the action it fired share one call number");
  assert.notEqual(fired[0], fired[1], "two jobs due together are not one operation");
  for (const record of records) {
    assert.deepEqual([record.owner, record.entry, record.actor.actor_id, record.project_id, record.install_id, record.outcome, record.stage],
      [{ kind: "service", id: "scheduler" }, "schedule", "plugin:io.molis.work.test.owner", "p1", "install-io.molis.work.test.owner", "succeeded", "once"]);
    assert.equal(record.detail.late_ms, 60_000);
    assert.equal(record.detail.reply, "sent");
    assert.equal(record.subjects[0]?.kind, "schedule_job");
  }
});

test("OCL-08: a failed wakeup is recorded as failed with its reason, and a job left waiting for its plugin is not recorded as a wakeup", async t => {
  const f = clockWithRecords(t);
  f.installation.action("test.fails", async () => { throw new Error("mail server down"); });
  f.job("test.fails", "reminder-fails");
  const withdraw = f.installation.action("test.gone", async () => ({ detail: "never" }));
  f.job("test.gone", "reminder-gone");
  withdraw();
  assert.deepEqual(await f.schedule.tick(), { invoked: 1, failed: 1, skipped: 1 });
  const outcomes = Object.fromEntries(f.records().map(record => [record.detail.object_ref, [record.outcome, record.detail.status, record.detail.reply]]));
  assert.deepEqual(outcomes["reminder-fails"], ["failed", "failed", "mail server down"]);
  // Its plugin no longer offers the action: the job is not claimed and waits for it, so no wakeup happened and none is recorded as one.
  assert.equal(outcomes["reminder-gone"], undefined);
});

test("F-horiz-runtime-10: a wakeup whose final commit is skipped due to lease expiry reports interrupted and records cancelled", async t => {
  const home = mkdtempSync(join(tmpdir(), "observation-wakeups-lease-")), observation = createHostObservation(home);
  const db = openTestSqlite(":memory:"); db.exec(SCHEDULER_SCHEMA_SQL);
  const installation = wakeupInstallation("io.molis.work.test.owner");
  const baseMs = Date.parse("2026-11-13T08:00:00.000Z");
  let postReturnNowCalls = 0;
  let returned = false;
  const endedEvents: Array<{ interrupted: boolean; status: string }> = [];
  const forwardEnded = scheduleWakeupRecords(home, "p1");
  const schedule = installation.scheduler(db, {
    now: () => {
      if (!returned) return new Date(baseMs);
      postReturnNowCalls += 1;
      // First read occurs in control.beforeEffect() right after invoke() returns (still valid);
      // subsequent reads occur at final commit after lease expiry.
      return new Date(postReturnNowCalls === 1 ? baseMs + 1_000 : baseMs + 60_000);
    },
    leaseMs: 5_000,
    eachWakeup: run => withCallId(newCallId(), run),
    wakeupEnded: ended => {
      endedEvents.push({ interrupted: ended.interrupted, status: ended.wakeup.status });
      forwardEnded(ended);
    },
  });
  t.after(async () => { await schedule.close(); db.close(); observation.close(); rmSync(home, { recursive: true, force: true }); });
  installation.action("test.late-commit", async () => {
    returned = true;
    return { detail: "returned before commit lost lease" };
  });
  schedule.register({
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.late-commit",
    object_ref: "reminder-lost-lease",
    title: "reminder-lost-lease",
    due_at: "2026-11-13T07:59:00.000Z",
    recurrence: { kind: "once" },
  });
  await schedule.tick();
  assert.equal(endedEvents.length, 1);
  assert.equal(endedEvents[0]?.interrupted, true, "uncommitted wakeup must report interrupted=true");
  observation.layer.flush();
  const records = readRecords(observation.layer.writer.database()!.db, { fact: "scheduler.wakeup" });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.outcome, "cancelled", "uncommitted wakeup must be observed as cancelled, not succeeded");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM schedule_wakeups").get() as { n: number }).n, 0);
});

test("OCL-01 UPP-21 batch 108: each start and stop of a partition instance and each fallen-due entry it is handed is a work record, with codes and never messages", async t => {
  const home = mkdtempSync(join(tmpdir(), "observation-partitions-")), observation = createHostObservation(home);
  t.after(() => { observation.close(); rmSync(home, { recursive: true, force: true }); });
  const scope = { partition_id: "p1", plugin_id: "io.molis.work.todo", install_id: "todo-install" } as PartitionPluginLifecycleEvent["scope"];
  const lifecycle = partitionLifecycleRecords(home);
  lifecycle({ scope, stage: "start", reason: "due", outcome: "succeeded", started_at: "2026-11-26T08:00:00.000Z", duration_ms: 12 });
  lifecycle({ scope, stage: "stop", reason: "idle", outcome: "failed", started_at: "2026-11-26T08:10:00.000Z", duration_ms: 3, code: "actions.plugin_unavailable" });
  const entry = { install_id: "todo-install", plugin_id: "io.molis.work.todo", partition_id: "p1", entry_key: "task:t1", due_at: "2026-11-26T07:59:00.000Z", source: "overview" } as DueEntryRecord;
  dueWakeupRecord(home, entry, new Date("2026-11-26T08:00:00.000Z"), { outcome: "succeeded" });
  dueWakeupRecord(home, entry, new Date("2026-11-26T08:01:00.000Z"), { outcome: "failed", error: new ActionError("actions.plugin_unavailable", "这个插件在这里没有运行 /secret/path") });
  observation.layer.flush();
  const db = observation.layer.writer.database()!.db;
  const starts = readRecords(db, { fact: "home.partition_plugin_lifecycle" });
  assert.deepEqual(starts.map(record => [record.stage, record.outcome, record.project_id, record.actor.actor_id, record.detail.reason, record.detail.code ?? null]),
    [["start", "succeeded", "p1", "plugin:io.molis.work.todo", "due", null], ["stop", "failed", "p1", "plugin:io.molis.work.todo", "idle", "actions.plugin_unavailable"]]);
  const wakes = readRecords(db, { fact: "scheduler.due_wakeup" });
  assert.deepEqual(wakes.map(record => [record.stage, record.outcome, record.project_id, record.detail.late_ms, record.detail.code ?? null]),
    [["overview", "succeeded", "p1", 60_000, null], ["overview", "failed", "p1", 120_000, "actions.plugin_unavailable"]]);
  assert.ok(!JSON.stringify(wakes).includes("secret"), "an error's message stays out of the record");
});

test("OCL-01 UPP-15 batch 108: each person setting received from another device and each upload confirmed is a work record, never the setting", async t => {
  const home = mkdtempSync(join(tmpdir(), "observation-person-settings-")), observation = createHostObservation(home);
  t.after(() => { observation.close(); rmSync(home, { recursive: true, force: true }); });
  let fail = false;
  const replica = personSettingsObserved(home, {
    receive() { if (fail) throw new ActionError("actions.input_invalid", "default_service secret"); },
    acknowledge() {},
    cursor: () => 7,
    next: () => null,
    counts: () => ({ pending: 0, conflicts: 0 }),
    conflicts: () => [],
    resolve() {},
  } satisfies SyncReplicaAdapter);
  replica.receive({} as SyncEvent);
  replica.acknowledge("images-install/default_service", "op-1", 1);
  fail = true;
  assert.throws(() => replica.receive({} as SyncEvent), { code: "actions.input_invalid" }, "the replica's own refusal still reaches the sync");
  assert.equal(replica.cursor(), 7, "the other methods are the replica's own");
  observation.layer.flush();
  const records = readRecords(observation.layer.writer.database()!.db, { fact: "home.person_settings_sync" });
  assert.deepEqual(records.map(record => [record.stage, record.outcome, record.project_id]), [["receive", "succeeded", null], ["acknowledge", "succeeded", null], ["receive", "failed", null]]);
  assert.ok(!JSON.stringify(records).includes("default_service"), "the setting's key stays out of the record");
});
