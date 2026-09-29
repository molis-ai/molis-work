import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_PROJECT_PLUGIN_ID, TODO_SUBJECT_KIND, type TodoItem } from "@molis-ai/molis-work-contracts/modules/todo";
import type { TodoAccess, TodoStore } from "./store.js";
import { todoCallerProject } from "./caller.js";

/** Todo's part in the system search and in object reading (the Assistant's "this todo"). */
export const todoSearchActions = {
  entries: defineSearchEntriesAction("todo.search.entries", [{ kind: TODO_SUBJECT_KIND, title: "待办", surface: TODO_PROJECT_PLUGIN_ID }], "待办", ["todo:read"], "home"),
  subject: defineSubjectContextAction("todo.item.subject.read", TODO_SUBJECT_KIND, "待办", ["todo:read"], "home"),
};

const STATUS: Record<TodoItem["status"], string> = { open: "待处理", doing: "进行中", waiting: "等待他人", done: "已完成", cancelled: "已取消" };
const PLACEMENT: Record<TodoItem["placement"], string> = { personal: "个人", project: "项目", unassigned: "暂未归类" };

/** The facts a reader (search, the Assistant) needs, in plain words; the owner's revision says when it changed. */
export function todoText(item: TodoItem): string {
  const lines = [
    `状态：${STATUS[item.status]}${item.archived_at ? "（已归档）" : ""}`,
    `归属：${PLACEMENT[item.placement]}`,
    item.due_date ? `截止：${item.due_date}${item.due_time ? " " + item.due_time : ""}` : "",
    item.planned_date ? `计划处理：${item.planned_date}` : "",
    item.remind_at ? `提醒：${item.remind_at}` : "",
    item.important ? "重要：是（本人标记）" : "",
    item.status === "waiting" && item.waiting ? `在等：${[item.waiting.who, item.waiting.what].filter(Boolean).join("，")}${item.waiting.follow_up_on ? `；${item.waiting.follow_up_on} 跟进` : ""}` : "",
    item.notes ? `说明：\n${item.notes}` : "",
    ...item.sources.map(source => `来源：${source.title}${source.reason ? `（${source.reason}）` : ""}${source.excerpt ? `\n  依据：${source.excerpt}` : ""}`),
    ...item.links.map(link => `关联：${link.title}${link.relation ? `（${link.relation}）` : link.outcome === "draft" ? "（草稿）" : link.outcome === "done" ? "（已完成的动作）" : ""}`),
    item.edited_fields.length ? `你手动改过：${item.edited_fields.join("、")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const open = (id: string) => ({ surface: TODO_PROJECT_PLUGIN_ID, id });
const goals = (item: TodoItem) => item.links.filter(link => link.kind === "goal").map(link => link.subject.id);

export function createTodoSearchHandlers(withStore: <T>(run: (store: TodoStore) => T) => T): ActionHandlerBinding[] {
  // Search and readers see what the caller sees: personal, unplaced, and the caller's own project.
  const access = (caller: ActionCallContext): TodoAccess => ({ projectId: todoCallerProject(caller), everything: false, actor: "other", actorId: caller.actor_id });
  return [
    bindSearchEntriesHandler(todoSearchActions.entries, caller => withStore(store => store.list(access(caller)).map((item): SearchEntry => ({
      subject: { kind: TODO_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title,
      summary: searchText(item.notes, 1000), updated_at: item.updated_at, content: "context", open: open(item.id),
    })))),
    { ...todoSearchActions.subject, handle: (caller, input) => withStore(store => {
      let item: TodoItem;
      try { item = store.get((input as { subject_id: string }).subject_id, access(caller)); }
      catch { throw new ActionError("todo.not_found", "这件待办已删除，或不在当前范围内"); }
      // Readers treat an archived object as gone from use (the shared convention); Todo itself still lists it under 已归档.
      if (item.archived_at) throw new ActionError("todo.not_found", "这件待办已归档");
      return subjectContext({ subject: { kind: TODO_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title,
        content: todoText(item), goal_ids: goals(item), session_id: null, open: open(item.id) });
    }) },
  ];
}
