import { scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";

/** Real ordinary-plugin contracts, shared by the page/MCP/typed and assistant legs. */
export const crossEntrySchedule = {
  create: scheduleActions.createTask,
  archive: scheduleActions.archiveTask,
  list: scheduleActions.list,
  missing: { code: "schedule.task_not_found", message: "定时任务不存在" },
  path(projectId: string) { return `/projects/${encodeURIComponent(projectId)}/api/schedule`; },
  input(title: string, time: string) { return { title, instructions: "读当前项目的工作记录，给本人一条摘要。", time, notify_important: false }; },
};
export const crossEntryTodo = { create: todoActions.create, get: todoActions.get, status: todoActions.status, batch: todoActions.batch, conflict: "todo.conflict" };

export function isCrossEntryObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
