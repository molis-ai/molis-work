import assert from "node:assert/strict";
import test from "node:test";

import {
  TASK_NATIVE_PLUGIN_ROUTES,
  TASK_UI_CONTRIBUTION_ID,
  TaskPluginRouteTable,
  createTaskRouteHandlers,
  taskUiContribution,
  type TaskPluginRouteHandler,
  type TaskUiModel,
} from "@molis-ai/molis-work-plugin-task";
import { UiContributionError, UiHost } from "@molis-ai/molis-work-ui-host";
import type { TaskRecord } from "@molis-ai/molis-work-contracts/modules/task";

const primitives: TaskUiModel["primitives"] = {
  escape: (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value) => value,
};

const emptyFrame = { camera: { x: 0, y: 0, z: 1 }, blocks: [], expanded: "" };

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    board_id: "board-1",
    task_id: "task_one",
    title: "写周报",
    goal_id: null,
    frame: emptyFrame,
    created_at: "2026-09-16T10:00:00.000Z",
    updated_at: "2026-09-16T10:00:00.000Z",
    ...overrides,
  };
}

test("Workbench registers the Task UI Contribution through the generic UI Host", () => {
  const host = new UiHost();
  host.register(taskUiContribution);
  assert.deepEqual(host.list().map((item) => item.contribution_id), [TASK_UI_CONTRIBUTION_ID]);
  assert.throws(
    () => host.register(taskUiContribution),
    (error) => error instanceof UiContributionError && error.code === "ui_contribution_conflict",
  );
  const directory = host.render({
    contribution_id: TASK_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: { tasks: [], primitives },
  });
  assert.match(directory, /data-directory-panel="task"/);
  assert.match(directory, /data-task-create/);
  assert.match(directory, /还没有 Task/);
  const frame = host.render({
    contribution_id: TASK_UI_CONTRIBUTION_ID,
    surface: "frame",
    model: { tasks: [], primitives },
  });
  assert.match(frame, /data-task-frame-surface/);
  assert.match(frame, /把这条工作需要的内容放在这里/);
  assert.doesNotMatch(frame, /把这项目标需要的内容放在这里/);
});

test("Task HTTP creates an unlinked Task and reuses the Goal-linked Task", async () => {
  const records: TaskRecord[] = [];
  const handlers = createTaskRouteHandlers({
    listTasks: () => records,
    createTask: (title, goalId) => {
      const created = task({ task_id: `task_${records.length + 1}`, title, goal_id: goalId });
      records.push(created);
      return created;
    },
    openForGoal: (goalId, title) => {
      const existing = records.find((item) => item.goal_id === goalId);
      if (existing) return existing;
      const created = task({ task_id: "task_goal", title, goal_id: goalId });
      records.push(created);
      return created;
    },
    updateTask: (taskId, patch) => {
      const current = records.find((item) => item.task_id === taskId);
      if (!current) throw Object.assign(new Error("找不到这条 Task"), { code: "task_not_found" });
      Object.assign(current, patch);
      return current;
    },
    saveFrame: (taskId, frame) => {
      const current = records.find((item) => item.task_id === taskId)!;
      current.frame = frame;
      return current;
    },
    changed: () => {},
  });
  const routes = new TaskPluginRouteTable(handlers as Record<string, TaskPluginRouteHandler>);
  const created = await routes.handle({
    method: "POST",
    pathname: "/api/tasks",
    query: new URLSearchParams(),
    body: { title: "独立工作" },
  });
  assert.equal(created?.status, 201);
  assert.equal((created?.body as { task: TaskRecord }).task.goal_id, null);
  const first = await routes.handle({
    method: "POST",
    pathname: "/api/tasks/open-for-goal",
    query: new URLSearchParams(),
    body: { goal_id: "CORE", title: "核心协议" },
  });
  const second = await routes.handle({
    method: "POST",
    pathname: "/api/tasks/open-for-goal",
    query: new URLSearchParams(),
    body: { goal_id: "CORE", title: "另一个" },
  });
  assert.equal((first?.body as { task: TaskRecord }).task.task_id, "task_goal");
  assert.equal((second?.body as { task: TaskRecord }).task.task_id, "task_goal");
  assert.equal(TASK_NATIVE_PLUGIN_ROUTES.length, 5);
});
