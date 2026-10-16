import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { bindDatabaseSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import {
  createScheduleTaskReplica,
  installScheduleReplication,
  SCHEDULE_TASKS_SCHEMA_SQL,
} from "../src/index.js";

const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
const projectId = "project-one";
const key = JSON.stringify([projectId, "schedule_task", "task-1"]);
const context = { spaceId: space.spaceId, projectId, title: "项目", authorize: () => {} };

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(SCHEDULE_TASKS_SCHEMA_SQL);
  bindDatabaseSpace(db, space);
  installScheduleReplication(db, projectId);
  const replica = createScheduleTaskReplica(db, context);
  return { db, replica, close: () => db.close() };
}

function task(db: DatabaseSync, enabled = 1, jobId: string | null = "local-job") {
  db.prepare(`INSERT INTO schedule_conversation_tasks
    (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,last_run_at,last_error,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "task-1", "每日回顾", "检查今天的进展", 9, 30, 1, enabled, 0, 1, jobId,
    null, null, "2026-10-14T00:00:00.000Z", "2026-10-14T00:00:00.000Z",
  );
  db.prepare("INSERT INTO schedule_conversation_turns VALUES (?,?,?,?,?,?)").run(
    "turn-1", "task-1", "user", "检查今天的进展", 0, "2026-10-14T00:00:00.000Z",
  );
}

test("Schedule task and turns transfer, but no destination job is started", () => {
  const a = fixture(), b = fixture();
  try {
    task(a.db);
    const mutation = a.replica.next();
    assert.ok(mutation);
    assert.equal(mutation.key, key);
    b.replica.receive({ ...mutation, revision: 1 });
    const row = b.db.prepare("SELECT enabled,job_id,title FROM schedule_conversation_tasks WHERE task_id=?").get("task-1") as {
      enabled: number; job_id: string | null; title: string;
    };
    assert.deepEqual({ ...row }, { enabled: 0, job_id: null, title: "每日回顾" });
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM schedule_conversation_turns").get()?.n, 1);
    assert.equal(b.replica.next(), null, "remote restore does not echo");
    a.replica.receive({ ...mutation, revision: 1 });
    assert.equal(a.replica.next(), null);
    assert.equal(a.db.prepare("SELECT enabled,job_id FROM schedule_conversation_tasks").get()?.job_id, "local-job");
  } finally { a.close(); b.close(); }
});

test("malformed payload cannot replace a task, and an active local task cannot be overwritten", () => {
  const a = fixture(), b = fixture();
  try {
    task(a.db);
    const mutation = a.replica.next();
    assert.ok(mutation);
    const bad = structuredClone(mutation.value) as { task: { hour: number } };
    bad.task.hour = 99;
    b.replica.receive({ ...mutation, value: bad, revision: 1 });
    assert.equal(b.replica.conflicts().length, 1);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM schedule_conversation_tasks").get()?.n, 0);
    assert.throws(() => b.replica.resolve(key, "remote"));

    const c = fixture();
    try {
      task(c.db);
      c.replica.receive({ ...mutation, revision: 1 });
      assert.equal(c.replica.conflicts().length, 1);
      assert.equal(c.db.prepare("SELECT enabled FROM schedule_conversation_tasks").get()?.enabled, 1);
    } finally { c.close(); }
  } finally { a.close(); b.close(); }
});
