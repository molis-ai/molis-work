import { make } from "./dom.js";
import type { ReminderEntry, TodoPage } from "./types.js";

/** The reminders that came due: what to do with each (done, later, noted, switched off), and reading them from the Host. */
export function installReminders(page: TodoPage): void {
  const { el, state, L } = page;
  const laterOptions = (): [string, Date][] => {
    const now = new Date();
    const at = (hours: number, minutes: number, dayOffset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes);
    const tonight = at(20, 0, 0);
    return [
      [L("todo.reminder.in-15-minutes"), new Date(now.getTime() + 15 * 60000)],
      [L("todo.reminder.in-1-hour"), new Date(now.getTime() + 60 * 60000)],
      ...(tonight.getTime() - now.getTime() > 30 * 60000 ? [[L("todo.reminder.tonight"), tonight] as [string, Date]] : []),
      [L("todo.reminder.tomorrow-morning"), at(9, 0, 1)],
    ];
  };
  const button = (label: string, attrs: Record<string, string>) => {
    const node = make("button", "mw-btn mw-btn--ghost", label);
    node.type = "button";
    Object.assign(node.dataset, attrs);
    return node;
  };
  const renderRow = ({ item, late }: ReminderEntry) => {
    const row = make("div", "todo-reminder");
    row.dataset.todoReminder = item.id;
    const text = make("div", "todo-reminder-text");
    const title = make("button", "mw-btn mw-btn--link", item.title);
    title.type = "button";
    title.dataset.todoId = item.id;
    text.append(title, make("small", "", (late ? L("todo.reminder.missed-prefix") : "") + (item.remind_at ? page.timeLabel(item.remind_at) : "")));
    const actions = make("div", "todo-reminder-actions");
    const later = make("details", "todo-reminder-later");
    const summaryNode = make("summary", "mw-btn mw-btn--ghost", L("todo.reminder.later"));
    const menu = make("div", "mw-menu");
    menu.setAttribute("role", "menu");
    for (const [label, when] of laterOptions()) {
      const option = button(label, { todoReminderLater: item.id, todoReminderAt: when.toISOString() });
      option.className = "mw-menu__item";
      menu.append(option);
    }
    later.append(summaryNode, menu);
    actions.append(button(L("todo.action.complete"), { todoReminderDone: item.id }), later, button(L("todo.reminder.ack"), { todoReminderAck: item.id }), button(L("todo.reminder.close"), { todoReminderClose: item.id }));
    row.append(text, actions);
    return row;
  };
  const renderReminders = () => {
    el.remindersBox.hidden = state.reminders.length === 0;
    const late = state.reminders.filter((entry) => entry.late).length;
    page.$("[data-todo-reminders-title]").textContent = late === state.reminders.length && late > 1 ? L("todo.reminder.missed-title", { count: late }) : L("todo.reminder.due-title");
    page.$("[data-todo-reminder-rows]").replaceChildren(...state.reminders.map(renderRow));
  };
  page.loadReminders = async () => {
    const seq = ++state.reminderSeq;
    const payload = await page.request<{ reminders?: ReminderEntry[] }>("GET", "/reminders");
    if (seq !== state.reminderSeq) return;
    state.reminders = payload.reminders || [];
    renderReminders();
  };
}
