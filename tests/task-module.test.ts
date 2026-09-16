import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { TaskError, TaskModule, createTasksSchema } from "@molis-ai/molis-work-module-task";

function createHarness() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE boards (
      board_id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    );
    CREATE TABLE goals (
      goal_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id)
    );
  `);
  createTasksSchema(db);
  db.prepare("INSERT INTO boards (board_id, title) VALUES (?, ?)").run("board-1", "Demo");
  db.prepare("INSERT INTO goals (goal_id, board_id) VALUES (?, ?)").run("CORE", "board-1");
  const module = new TaskModule({
    db,
    now: () => "2026-09-16T10:00:00.000Z",
    id: () => "task_fixed",
  });
  return { db, module };
}

test("Task can be created without a Goal and listed from the project board", () => {
  const { module } = createHarness();
  const created = module.commands.createTask({ board_id: "board-1", title: " 写周报 " });
  assert.equal(created.task_id, "task_fixed");
  assert.equal(created.title, "写周报");
  assert.equal(created.goal_id, null);
  assert.deepEqual(created.frame.blocks, []);
  assert.equal(module.query.listTasks("board-1").length, 1);
  assert.equal(module.query.getTask("board-1", created.task_id)?.title, "写周报");
});

test("Opening a Goal reuses the same Task and rejects a second Task for that Goal", () => {
  const { module } = createHarness();
  const first = module.commands.openTaskForGoal({
    board_id: "board-1",
    goal_id: "CORE",
    title: "核心协议",
    frame: { camera: { x: 10, y: 20, z: 1 }, blocks: [{ id: "b1", kind: "session", itemId: "s1", title: "会话", caption: "会话", x: 1, y: 2 }], expanded: "" },
  });
  const again = module.commands.openTaskForGoal({ board_id: "board-1", goal_id: "CORE", title: "另一个名字" });
  assert.equal(again.task_id, first.task_id);
  assert.equal(again.title, "核心协议");
  assert.equal(again.frame.blocks[0]?.itemId, "s1");
  assert.throws(
    () => module.commands.createTask({ board_id: "board-1", title: "重复", goal_id: "CORE" }),
    (error: unknown) => error instanceof TaskError && error.code === "task_goal_conflict",
  );
});

test("Saving the Frame updates composition without changing the Goal link", () => {
  const { module } = createHarness();
  const created = module.commands.createTask({ board_id: "board-1", title: "独立工作" });
  const saved = module.commands.saveTaskFrame({
    board_id: "board-1",
    task_id: created.task_id,
    frame: { camera: { x: 0, y: 8, z: 1.2 }, blocks: [], expanded: "b-2" },
  });
  assert.equal(saved.goal_id, null);
  assert.equal(saved.frame.camera.y, 8);
  assert.equal(saved.frame.expanded, "b-2");
});

test("Deleting a Goal unlinks the Task instead of deleting it", () => {
  const { db, module } = createHarness();
  const created = module.commands.openTaskForGoal({ board_id: "board-1", goal_id: "CORE", title: "核心协议" });
  db.prepare("DELETE FROM goals WHERE goal_id = ?").run("CORE");
  const remaining = module.query.getTask("board-1", created.task_id);
  assert.equal(remaining?.title, "核心协议");
  assert.equal(remaining?.goal_id, null);
});
