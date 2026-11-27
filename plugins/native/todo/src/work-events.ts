import { assertWorkEventWindow, defineWorkEventsAction, type ActionCallContext, type ActionHandlerBinding, type WorkEvent, type WorkEventCollection, type WorkEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_PROJECT_PLUGIN_ID, TODO_SUBJECT_KIND, type TodoItem } from "./contract.js";
import { localDate } from "./dates.js";
import type { TodoAccess, TodoStore } from "./store.js";
import { todoFlags } from "./views.js";

/**
 * What Todo puts on the project's home page: reminders that are due, what is overdue, due or planned today, and follow-ups due.
 * All of it is still to do today, so it sits on today; the time shown is the reminder's, or when the todo was written down.
 */
export const todoWorkEventsAction = defineWorkEventsAction("todo.events", /* @version action.todo.events */ 1, [TODO_SUBJECT_KIND], "待办事件", ["todo:read"]);

const MAX_EVENTS = 20;
const open = (item: TodoItem) => ({ kind: "item" as const, surface: TODO_PROJECT_PLUGIN_ID, id: item.id, title: item.title, label: "打开待办" });
const clock = (iso: string) => { const at = new Date(iso); return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`; };

export function todoWorkEvents(store: TodoStore, access: TodoAccess, now: Date): WorkEvent[] {
  const today = localDate(now);
  const events: WorkEvent[] = [];
  const seen = new Set<string>();
  const facts = (item: TodoItem): Array<[string, string]> => [
    ...(item.due_date ? [["截止", item.due_date + (item.due_time ? " " + item.due_time : "")] as [string, string]] : []),
    ...(item.planned_date ? [["计划", item.planned_date] as [string, string]] : []),
  ];
  const push = (item: TodoItem, event: Omit<WorkEvent, "subject" | "category" | "title" | "content" | "facts" | "open">) => {
    if (seen.has(item.id) || events.length >= MAX_EVENTS) return;
    seen.add(item.id);
    events.push({ ...event, subject: { kind: TODO_SUBJECT_KIND, id: item.id }, category: "personal", title: item.title,
      content: item.notes || "（没有说明）", facts: facts(item), open: open(item) });
  };
  for (const { item, late } of store.dueReminders(access, now)) {
    push(item, { event_id: "todo-reminder:" + item.id + ":" + item.remind_at, occurred_at: item.remind_at!, placement: "today",
      summary: (late ? "错过的提醒 · " : "提醒 · ") + clock(item.remind_at!), needs_attention: true });
  }
  const active = store.list(access).filter(item => ["open", "doing", "waiting"].includes(item.status) && item.archived_at === null);
  for (const item of active) {
    const flags = todoFlags(item, today);
    if (flags.includes("overdue")) push(item, { event_id: "todo-overdue:" + item.id, occurred_at: item.created_at, placement: "today",
      summary: `已逾期，截止 ${item.due_date}`, needs_attention: true });
  }
  for (const item of active) {
    const flags = todoFlags(item, today);
    if (flags.includes("due_today")) push(item, { event_id: "todo-due:" + item.id, occurred_at: item.created_at, placement: "today",
      summary: item.status === "waiting" ? `今天截止，还在等${item.waiting?.who ? " " + item.waiting.who : "别人"}` : "今天截止", needs_attention: false });
    else if (item.status === "waiting" && item.waiting?.follow_up_on && item.waiting.follow_up_on <= today) push(item, { event_id: "todo-follow:" + item.id,
      occurred_at: item.created_at, placement: "today", summary: `约定今天跟进${item.waiting.who ? " " + item.waiting.who : ""}`, needs_attention: false });
    else if (flags.includes("planned_today")) push(item, { event_id: "todo-planned:" + item.id, occurred_at: item.created_at, placement: "today",
      summary: "计划今天做", needs_attention: false });
  }
  return events;
}

export function createTodoWorkEventsHandler(read: <T>(run: (store: TodoStore) => T) => T, now: () => Date = () => new Date()): ActionHandlerBinding {
  return { ...todoWorkEventsAction, handle: (caller: ActionCallContext, value: unknown): WorkEventCollection => {
    const window = value as WorkEventWindow;
    assertWorkEventWindow(window);
    const access: TodoAccess = { actor: "other", actorId: caller.actor_id };
    return { source: { surface: TODO_PROJECT_PLUGIN_ID, title: "待办", icon: "list" }, events: read(store => todoWorkEvents(store, access, now())) };
  } };
}
