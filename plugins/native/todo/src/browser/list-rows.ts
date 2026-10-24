import type { TodoItem } from "@molis-ai/molis-work-contracts/modules/todo";
import { iconSvg, make } from "./dom.js";
import type { TodoFlag, TodoPage, TodoRow } from "./types.js";

export interface Group { readonly key: string; readonly title: string; readonly items: readonly TodoRow[] }

/** The one line over the list: what the view holds, in the person's terms. */
export function summaryText(page: TodoPage): string {
  const { state, L } = page;
  const { items, view, query, today } = state;
  if (query) return L("todo.summary.found", { count: items.length });
  if (!items.length) return "";
  if (view === "today") {
    const overdue = items.filter((item) => item.flags.includes("overdue")).length;
    const dueToday = items.filter((item) => item.flags.includes("due_today"));
    const waitingDue = dueToday.filter((item) => item.status === "waiting").length;
    const parts: string[] = [];
    if (overdue) parts.push(L("todo.summary.overdue", { count: overdue }));
    if (dueToday.length) parts.push(L("todo.summary.due-today", { count: dueToday.length }) + (waitingDue ? L("todo.summary.waiting-of-due", { count: waitingDue }) : ""));
    const rest = items.length - overdue - dueToday.length;
    if (rest > 0) parts.push(L("todo.summary.planned-or-doing", { count: rest }));
    return parts.join("；");
  }
  if (view === "waiting") {
    const due = items.filter((item) => item.waiting && item.waiting.follow_up_on && item.waiting.follow_up_on <= today).length;
    return L("todo.summary.waiting", { count: items.length }) + (due ? L("todo.summary.follow-up-reached", { count: due }) : "");
  }
  if (view === "unscheduled") return L("todo.summary.unscheduled", { count: items.length });
  if (view === "upcoming") return L("todo.summary.upcoming", { count: items.length });
  return "";
}

/** How a view sorts its todos into folds; a view with one list has a single untitled group. */
export function groupsFor(page: TodoPage): Group[] {
  const { state, L } = page;
  const { items, view, query } = state;
  if (query || view === "waiting" || view === "unscheduled" || view === "closed") return [{ key: "all", title: "", items }];
  if (view === "today") {
    const overdue = items.filter((item) => item.flags.includes("overdue"));
    const replan = items.filter((item) => !item.flags.includes("overdue") && item.flags.includes("planned_past"));
    const rest = items.filter((item) => !overdue.includes(item) && !replan.includes(item));
    return [{ key: "overdue", title: L("todo.flag.overdue"), items: overdue }, { key: "replan", title: L("todo.group.replan"), items: replan }, { key: "today", title: L("todo.date.today"), items: rest }]
      .filter((group) => group.items.length);
  }
  if (view === "upcoming") {
    const byDay = new Map<string, TodoRow[]>();
    for (const item of items) {
      const day = item.due_date ?? "";
      const group = byDay.get(day);
      if (group) group.push(item); else byDay.set(day, [item]);
    }
    return [...byDay.entries()].map(([key, group]) => ({ key, title: page.dayLabel(key), items: group }));
  }
  const keyOf = (item: TodoRow) => (item.placement === "project" ? (item.project_id === page.projectId() ? "project-here" : "project-other") : item.placement);
  const titles: Record<string, string> = { personal: L("todo.place.personal"), "project-here": page.hereName(), "project-other": L("todo.place.other-project"), unassigned: L("todo.place.unassigned") };
  return ["personal", "project-here", "project-other", "unassigned"].map((key) => ({ key, title: titles[key] ?? "", items: items.filter((item) => keyOf(item) === key) })).filter((group) => group.items.length);
}

const placementLabel = (page: TodoPage, item: TodoItem) => (item.placement === "project" ? (item.project_id === page.projectId() ? page.hereName() : page.L("todo.place.other-project")) : page.placeName(item.placement));

function metaFor(page: TodoPage, item: TodoRow): [string, string][] {
  const { state, L } = page;
  const meta: [string, string][] = [];
  if (item.due_date) meta.push(["due", `${L("todo.quick.due")} ${page.dayLabel(item.due_date)}${item.due_time ? ` ${item.due_time}` : ""}`]);
  if (item.planned_date && state.view !== "upcoming") meta.push(["planned", `${L("todo.quick.planned")} ${page.dayLabel(item.planned_date)}`]);
  if (item.status === "waiting") {
    const follow = item.waiting && item.waiting.follow_up_on ? ` · ${page.dayLabel(item.waiting.follow_up_on)}${L("todo.meta.follow-up")}` : "";
    meta.push(["waiting", L("todo.meta.waiting") + (item.waiting && item.waiting.who ? ` ${item.waiting.who}` : "") + follow]);
  }
  if (item.remind_at && item.status !== "done" && item.status !== "cancelled") meta.push(["remind", `${L("todo.quick.remind")} ${page.timeLabel(item.remind_at)}`]);
  if (state.view !== "all" || state.query) meta.push(["placement", placementLabel(page, item)]);
  return meta;
}

/** One todo as a row: pick box, done button, and the entry that opens it. */
export function renderRow(page: TodoPage, item: TodoRow): HTMLElement {
  const { state, L } = page;
  const flagNames: Partial<Record<TodoFlag, string>> = {
    overdue: L("todo.flag.overdue"), due_today: L("todo.flag.due-today"), planned_past: L("todo.flag.planned-past"), stale: L("todo.flag.stale"),
  };
  const closed = item.status === "done" || item.status === "cancelled";
  const row = make("article", `feed-stage-item todo-row${closed ? " is-closed" : ""}${state.selected && state.selected.id === item.id ? " is-selected" : ""}`);
  row.dataset.todoRow = item.id;
  row.setAttribute("role", "listitem");
  const pick = make("input", "mw-check todo-pick");
  pick.type = "checkbox";
  pick.dataset.todoPick = item.id;
  pick.checked = state.picked.has(item.id);
  pick.setAttribute("aria-label", L("todo.row.select", { title: item.title }));
  const done = make("button", `todo-done${item.status === "done" ? " is-done" : ""}`);
  done.type = "button";
  done.dataset.todoDone = item.id;
  done.setAttribute("aria-label", L(item.status === "done" ? "todo.row.reopen" : "todo.row.complete", { title: item.title }));
  done.innerHTML = iconSvg(item.status === "done" ? "check" : "circle");
  const open = make("button", "feed-stage-entry directory-list-row todo-entry");
  open.type = "button";
  open.dataset.todoId = item.id;
  const title = make("strong", "todo-title", item.title);
  title.title = item.title;
  const line = make("span", "todo-meta");
  for (const [kind, text] of metaFor(page, item)) line.append(make("span", `todo-meta-part todo-meta-part--${kind}`, text));
  const trail = make("span", "todo-trail");
  if (item.important) trail.append(make("span", "mw-status mw-status--attention", L("todo.field.important")));
  for (const flag of item.flags) {
    const name = flagNames[flag];
    if (name) trail.append(make("span", `mw-status mw-status--${flag === "overdue" ? "blocked" : flag === "stale" ? "quiet" : "attention"}`, name));
  }
  if (item.status === "doing" || item.status === "cancelled" || (item.status === "waiting" && state.view !== "waiting")) {
    const status = make("span", `mw-status mw-status--${item.status === "doing" ? "progress" : "quiet"}`, page.statusName(item.status));
    status.dataset.mwState = item.status;
    trail.append(status);
  }
  open.append(title, line, trail);
  row.append(pick, done, open);
  return row;
}
