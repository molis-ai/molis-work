import type { TodoItem, TodoView } from "@molis-ai/molis-work-contracts/modules/todo";
import { addDays } from "./dates.js";

/** Marks beside the status; none of them changes it. */
export type TodoFlag = "overdue" | "due_today" | "planned_past" | "planned_today" | "stale";

const ACTIVE = new Set(["open", "doing", "waiting"]);
const STALE_DAYS = 14;

export const isActive = (item: TodoItem) => ACTIVE.has(item.status) && item.archived_at === null;

export function todoFlags(item: TodoItem, today: string): TodoFlag[] {
  if (!isActive(item)) return [];
  const flags: TodoFlag[] = [];
  if (item.due_date !== null && item.due_date < today) flags.push("overdue");
  if (item.due_date === today) flags.push("due_today");
  if (item.planned_date !== null && item.planned_date < today) flags.push("planned_past");
  if (item.planned_date === today) flags.push("planned_today");
  if (item.updated_at.slice(0, 10) < addDays(today, -STALE_DAYS)) flags.push("stale");
  return flags;
}

/** Whether an item answers the view's question. */
export function inView(item: TodoItem, view: TodoView, today: string): boolean {
  switch (view) {
    case "today":
      return isActive(item) && (item.status === "doing"
        || (item.planned_date !== null && item.planned_date <= today)
        || (item.due_date !== null && item.due_date <= today));
    case "waiting":
      return isActive(item) && item.status === "waiting";
    case "unscheduled":
      return isActive(item) && item.status === "open" && item.planned_date === null && item.due_date === null;
    case "upcoming":
      return isActive(item) && item.due_date !== null && item.due_date > today && item.due_date <= addDays(today, 7);
    case "all":
      return isActive(item);
    case "closed":
      return (item.status === "done" || item.status === "cancelled") && item.archived_at === null;
  }
}

const order = (value: string | null) => value ?? "9999-99-99";

/** Important first, then whatever is most pressing: overdue, due soonest, planned soonest, oldest. */
export function compareTodos(view: TodoView, a: TodoItem, b: TodoItem): number {
  if (view === "closed") return (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at);
  if (view === "waiting") {
    const follow = order(a.waiting?.follow_up_on ?? null).localeCompare(order(b.waiting?.follow_up_on ?? null));
    if (follow) return follow;
    return a.updated_at.localeCompare(b.updated_at);
  }
  if (a.important !== b.important) return a.important ? -1 : 1;
  return order(a.due_date).localeCompare(order(b.due_date))
    || order(a.planned_date).localeCompare(order(b.planned_date))
    || a.created_at.localeCompare(b.created_at);
}

export function selectView(items: readonly TodoItem[], view: TodoView, today: string): TodoItem[] {
  return items.filter(item => inView(item, view, today)).sort((a, b) => compareTodos(view, a, b));
}

/** Counts behind the view list, so each view can say how much is in it. */
export function viewCounts(items: readonly TodoItem[], today: string): Record<TodoView, number> {
  const views: TodoView[] = ["today", "waiting", "unscheduled", "upcoming", "all", "closed"];
  return Object.fromEntries(views.map(view => [view, items.filter(item => inView(item, view, today)).length])) as Record<TodoView, number>;
}
