import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createScheduleService } from "@molis-ai/molis-work-service-scheduler";
import { LocalSqliteStorage, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { SCHEDULE_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-schedule";

const before = readFileSync(new URL("./fixtures/project-database-schema-v8.sql", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("./fixtures/project-maintenance-v9.sql", import.meta.url), "utf8");
// The separately rehearsed next step still stops at v10. Scheduler checks borrow the historical store directly;
// only the explicitly selected project-instance rehearsal proves opening the current v11 library.
const next = readFileSync(new URL("./fixtures/project-maintenance-v10.sql", import.meta.url), "utf8");
function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "project-maintenance-v9-")), file = join(directory, "project.db");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(file); db.exec(before); db.exec(SCHEDULE_PROJECT_DATABASE.schema);
  db.exec(`PRAGMA user_version = 8;
    INSERT INTO project_root VALUES ('project', '2026-10-21T00:00:00Z');
    INSERT INTO schedule_jobs (job_id, plugin_id, capability_id, object_ref, title, recurrence_kind, interval_ms, next_due_at, enabled, created_at, updated_at)
      VALUES ('old-job', 'io.molis.work.schedule', 'old.wakeup', 'old-task', 'Keep this reminder', 'interval', 60000, '2026-10-21T01:00:00Z', 1, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z');
    INSERT INTO schedule_wakeups VALUES ('old-receipt', 'old-job', '2026-10-20T01:00:00Z', '2026-10-20T01:00:00Z', '2026-10-20T01:00:01Z', 'ok', 'Kept history');
    INSERT INTO schedule_conversation_tasks VALUES ('old-task', 'Morning brief', 'Read the project', 8, 30, 1, 1, 0, 1, 'old-job', NULL, NULL, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z');
    INSERT INTO schedule_conversation_turns VALUES ('old-turn', 'old-task', 'assistant', 'Yesterday remains available', 1, '2026-10-20T01:00:01Z');`);
  db.close(); return file;
}
const read = (file: string) => {
  const db = new DatabaseSync(file);
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version,
    job: { ...db.prepare("SELECT * FROM schedule_jobs").get() }, receipt: { ...db.prepare("SELECT * FROM schedule_wakeups").get() },
    task: { ...db.prepare("SELECT * FROM schedule_conversation_tasks").get() }, turn: { ...db.prepare("SELECT * FROM schedule_conversation_turns").get() },
    bindings: db.prepare("SELECT name FROM sqlite_master WHERE name = 'schedule_action_bindings'").all().length }; }
  finally { db.close(); }
};
function apply(file: string, sql = maintenance) {
  const db = new DatabaseSync(file);
  try { db.exec(sql); } finally { db.close(); }
}

test("SYS-15-S6: v8 is refused; offline maintenance preserves jobs/history, pauses dispatch and never guesses installation authority", async t => {
  const file = fixture(t), original = read(file);
  assert.throws(() => new LocalProjectDatabase(file), SqliteSchemaVersionError);
  assert.deepEqual(read(file), original, "the runtime refusal writes nothing");
  apply(file); const after = read(file);
  assert.equal(after.version, 9); assert.equal(after.bindings, 1);
  assert.deepEqual(after.job, { ...original.job, enabled: 0, lease_token: null, lease_until: null });
  assert.deepEqual(after.receipt, original.receipt);
  assert.deepEqual(after.task, original.task); assert.deepEqual(after.turn, original.turn);
  apply(file, next);
  const historical = read(file); assert.equal(historical.version, 10);
  assert.throws(() => new LocalProjectDatabase(file), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 10 && error.expected === 11);
  assert.deepEqual(read(file), historical, "current opening does not adopt the historical maintenance output");
  const store = new LocalSqliteStorage(file, { fileMustExist: true }), clock = createScheduleService(store.db);
  try {
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM schedule_action_bindings").get()!.n, 0);
    assert.equal((await clock.tick(new Date("2026-10-22T00:00:00Z"))).invoked, 0);
    assert.equal(clock.get("old-job")!.next_due_at, original.job.next_due_at);
  } finally { await clock.close(); store.close(); }
  assert.deepEqual(read(file), historical, "the historical Scheduler rehearsal does not upgrade the project or bind old jobs");
});

test("SYS-15-S6: wrong versions and a write failure roll back the entire maintenance", t => {
  const file = fixture(t), original = read(file);
  const db = new DatabaseSync(file); db.exec("PRAGMA user_version = 7"); db.close();
  assert.throws(() => apply(file)); assert.deepEqual(read(file), { ...original, version: 7 });
  const reset = new DatabaseSync(file); reset.exec("PRAGMA user_version = 8; CREATE TRIGGER refuse_pause BEFORE UPDATE ON schedule_jobs BEGIN SELECT RAISE(ABORT, 'maintenance write refused'); END"); reset.close();
  assert.throws(() => apply(file), /maintenance write refused/); assert.deepEqual(read(file), original);
});
