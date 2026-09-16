import type { TaskFrame, TaskRecord } from "@molis-ai/molis-work-contracts/modules/task";
import type { TaskPluginRouteHandler } from "./routes.js";

export interface TaskRouteHandlerPorts {
  listTasks(): readonly TaskRecord[];
  createTask(title: string, goalId: string | null, frame?: TaskFrame): TaskRecord;
  openForGoal(goalId: string, title: string, frame?: TaskFrame): TaskRecord;
  updateTask(taskId: string, patch: { title?: string; goal_id?: string | null }): TaskRecord;
  saveFrame(taskId: string, frame: TaskFrame): TaskRecord;
  changed(): void;
}

export function createTaskRouteHandlers(options: TaskRouteHandlerPorts): Record<string, TaskPluginRouteHandler> {
  return {
    "task.list": () => ({
      status: 200,
      body: { tasks: options.listTasks() },
    }),
    "task.create": ({ request }) => {
      const title = optionalText(request.body.title);
      if (!title) return { status: 400, body: { error: "先给这条 Task 起个名字", code: "task_title_required" } };
      const task = options.createTask(title, optionalGoal(request.body.goal_id), optionalFrame(request.body.frame));
      options.changed();
      return { status: 201, body: { task } };
    },
    "task.open-for-goal": ({ request }) => {
      const goalId = optionalText(request.body.goal_id);
      const title = optionalText(request.body.title) || goalId;
      if (!goalId) return { status: 400, body: { error: "缺少 Goal", code: "task_invalid" } };
      const task = options.openForGoal(goalId, title || goalId, optionalFrame(request.body.frame));
      options.changed();
      return { status: 200, body: { task } };
    },
    "task.update": ({ params, request }) => {
      const taskId = params.task_id;
      if (!taskId) return { status: 404, body: { error: "找不到这条 Task", code: "task_not_found" } };
      const patch: { title?: string; goal_id?: string | null } = {};
      if ("title" in request.body) {
        const title = optionalText(request.body.title);
        if (!title) return { status: 400, body: { error: "先给这条 Task 起个名字", code: "task_title_required" } };
        patch.title = title;
      }
      if ("goal_id" in request.body) patch.goal_id = optionalGoal(request.body.goal_id);
      const task = options.updateTask(taskId, patch);
      options.changed();
      return { status: 200, body: { task } };
    },
    "task.frame": ({ params, request }) => {
      const taskId = params.task_id;
      const frame = optionalFrame(request.body.frame ?? request.body);
      if (!taskId) return { status: 404, body: { error: "找不到这条 Task", code: "task_not_found" } };
      if (!frame) return { status: 400, body: { error: "缺少构图", code: "task_frame_invalid" } };
      const task = options.saveFrame(taskId, frame);
      options.changed();
      return { status: 200, body: { task } };
    },
  };
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalGoal(value: unknown): string | null {
  if (value == null) return null;
  const text = optionalText(value);
  return text || null;
}

function optionalFrame(value: unknown): TaskFrame | undefined {
  if (!value || typeof value !== "object") return undefined;
  const frame = value as Partial<TaskFrame>;
  if (!frame.camera && !Array.isArray(frame.blocks)) return undefined;
  return {
    camera: {
      x: Number(frame.camera?.x) || 0,
      y: Number(frame.camera?.y) || 0,
      z: Number(frame.camera?.z) > 0 ? Number(frame.camera?.z) : 1,
    },
    blocks: Array.isArray(frame.blocks) ? frame.blocks : [],
    expanded: typeof frame.expanded === "string" ? frame.expanded : "",
  };
}
