import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { currentCallId, newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import { createHostObservation, scheduleWakeupRecords, installHostUiText } from "@molis-ai/molis-work-app-local-host";
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
