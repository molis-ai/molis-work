import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchRevisionOf, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ScheduleConversationTaskView } from "./tasks.js";

/** Schedule's part in the system search: the person's conversation tasks, their instructions and what each run reported. */
export const scheduleSearchActions = {
  entries: defineSearchEntriesAction("schedule.search.entries", [{ kind: "schedule_task", title: "定时任务", surface: "schedule" }], "定时任务", ["schedule:read"]),
  subject: defineSubjectContextAction("schedule.subject.read", "schedule_task", "定时任务", ["schedule:read"]),
};
const revisionOf = (task: ScheduleConversationTaskView) => searchRevisionOf([task.updated_at, String(task.turns.length), task.turns.at(-1)?.turn_id ?? ""]);
// A reader asked "when does it run" answers from the task itself: its clock and whether it is on come first.
const whenOf = (task: ScheduleConversationTaskView) => `每天 ${task.clock_label} 运行${task.enabled ? "" : "（已停用）"}`;
const contentOf = (task: ScheduleConversationTaskView) => [whenOf(task), task.instructions, ...task.turns.map(turn => turn.text)].filter(Boolean).join("\n\n");

export function createScheduleSearchHandlers(projectId: string, tasks: () => readonly ScheduleConversationTaskView[]): ActionHandlerBinding[] {
  const scoped = (caller: ActionCallContext) => { if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与定时任务所在项目不一致"); };
  return [
    bindSearchEntriesHandler(scheduleSearchActions.entries, caller => { scoped(caller); return tasks().filter(task => !task.archived).map(task => ({
      subject: { kind: "schedule_task", id: task.task_id }, revision: revisionOf(task), title: task.title, summary: searchText(`${task.clock_label} ${task.instructions}`, 600),
      updated_at: task.updated_at, content: "context" as const, open: { surface: "schedule", id: task.task_id } })); }),
    { ...scheduleSearchActions.subject, handle: (caller, input) => {
      scoped(caller);
      const task = tasks().find(entry => entry.task_id === (input as { subject_id: string }).subject_id);
      if (!task || task.archived) throw new ActionError("schedule.not_found", "定时任务已归档或不存在");
      return subjectContext({ subject: { kind: "schedule_task", id: task.task_id }, revision: revisionOf(task), title: task.title, content: contentOf(task),
        goal_ids: [], session_id: null, open: { surface: "schedule", id: task.task_id } });
    } },
  ];
}
