import { iconSvg, isoDay, make } from "./dom.js";
import type { TodoPage } from "./types.js";

const uiText = globalThis.t;

/** The status chip's colour and ring: the platform's pairing (blue in progress, cyan someone else's turn, green done, grey idle). */
const STATUS_TONES: Record<string, string> = { open: "idle", doing: "progress", waiting: "hold", done: "done", cancelled: "quiet" };
export const STATUS_RINGS: Record<string, string> = { open: "idle", doing: "doing", waiting: "waiting", done: "done", cancelled: "cancelled" };
const PLACE_ICONS: Record<string, string> = { personal: "user", project: "folder", unassigned: "circle" };
const WEEK_KEYS = ["todo.week.sun", "todo.week.mon", "todo.week.tue", "todo.week.wed", "todo.week.thu", "todo.week.fri", "todo.week.sat"];

export const todayOf = (page: TodoPage) => page.state.today || isoDay(new Date());
const civil = (date: string) => new Date(`${date}T00:00:00`);
export const weekday = (date: string) => uiText.text(WEEK_KEYS[civil(date).getDay()]!);
export const monthDay = (date: string) => {
  const at = civil(date);
  return uiText.text(at.getFullYear() === new Date().getFullYear() ? "todo.date.month-day" : "todo.date.year-month-day", { y: at.getFullYear(), m: at.getMonth() + 1, d: at.getDate() });
};
/** A day the way one says it: 今天, 明天, the weekday inside the coming week, else the date. */
export const nearDay = (page: TodoPage, date: string) => {
  const diff = page.dayDiff(date);
  return diff === 0 ? uiText.text("todo.date.today") : diff === 1 ? uiText.text("todo.date.tomorrow") : diff === -1 ? uiText.text("todo.date.yesterday") : diff > 1 && diff < 7 ? weekday(date) : monthDay(date);
};
/** A day in full for the side block: 明天 11月25日, 周四 11月26日 18:00. */
export const fullDay = (page: TodoPage, date: string, time = "") => {
  const diff = page.dayDiff(date);
  const lead = diff === 0 ? uiText.text("todo.date.today") : diff === 1 ? uiText.text("todo.date.tomorrow") : weekday(date);
  return `${lead} ${monthDay(date)}${time ? ` ${time}` : ""}`;
};

/** What the editor holds for a date row, read from its fields (a save may still be on its way). */
export function dateOf(page: TodoPage, name: string): { date: string; time: string } {
  if (name === "due") return { date: page.field("due_date").value, time: page.field("due_time").value };
  if (name === "planned") return { date: page.field("planned_date").value, time: "" };
  if (name === "follow") return { date: page.field("waiting.follow_up_on").value, time: "" };
  const [date = "", time = ""] = page.field("remind_at").value.split("T");
  return { date, time };
}

function paintFacts(page: TodoPage, closed: boolean): void {
  const item = page.state.selected;
  const box = page.$("[data-todo-facts]");
  box.replaceChildren();
  if (!item) return;
  const fact = (text: string, quiet = false, icon = "") => {
    const node = make("span", `todo-fact${quiet ? " todo-fact--quiet" : ""}`);
    if (icon) node.innerHTML = iconSvg(icon);
    node.append(text);
    box.append(node);
    return node;
  };
  const flag = (text: string, tone: string, icon: string) => {
    const node = make("span", `mw-status mw-status--${tone} todo-flag`);
    node.innerHTML = iconSvg(icon);
    node.append(make("span", "", text));
    box.append(node);
  };
  if (closed) {
    if (item.status === "done" && item.completed_at) fact(uiText.text("todo.fact.done-at", { when: page.timeLabel(item.completed_at) }));
    return;
  }
  const due = dateOf(page, "due"), planned = dateOf(page, "planned").date;
  if (due.date) {
    const left = page.dayDiff(due.date), when = `${nearDay(page, due.date)}${due.time ? ` ${due.time}` : ""}`;
    if (left < 0) {
      flag(uiText.text("todo.fact.overdue", { count: -left }), "blocked", "circle-alert");
      fact(uiText.text("todo.fact.was-due", { when: fullDay(page, due.date, due.time) }), true);
    } else if (left === 0) flag(uiText.text("todo.fact.due", { when }), "attention", "clock");
    else {
      fact(uiText.text("todo.fact.due", { when }), false, "calendar");
      fact(uiText.text("todo.fact.days-left", { count: left }), true);
    }
  }
  if (planned) fact(uiText.text("todo.fact.planned", { when: nearDay(page, planned) }), true).dataset.optional = "";
  if (!box.childElementCount) fact(uiText.text("todo.fact.no-dates"), true);
}

function paintRail(page: TodoPage, closed: boolean): void {
  const item = page.state.selected;
  if (!item) return;
  const value = (name: string, text: string, late = false) => {
    const node = page.$(`[data-todo-prop-value="${name}"]`);
    node.textContent = text || uiText.text("todo.prop.unset");
    node.classList.toggle("is-unset", !text);
    node.classList.toggle("is-late", late);
  };
  for (const name of ["due", "planned", "remind"]) {
    const { date, time } = dateOf(page, name);
    value(name, date ? fullDay(page, date, time) : "", name === "due" && !closed && Boolean(date) && page.dayDiff(date) < 0);
  }
  const elsewhere = item.placement === "project" && item.project_id !== page.projectId();
  value("place", elsewhere ? uiText.text("todo.place.other-project") : page.placeName(item.placement));
  page.$('[data-todo-pop-open="place"] use').setAttribute("href", `#icon-${PLACE_ICONS[item.placement] ?? "folder"}`);
  const box = page.$("[data-todo-placement-choices]");
  const places = ["personal", ...(page.projectId() ? ["project"] : []), "unassigned"];
  const key = places.map((place) => `${place}:${page.placeName(place)}`).join("|");
  if (box.dataset.drawn !== key) {
    box.dataset.drawn = key;
    box.replaceChildren();
    for (const place of places) {
      const button = make("button", "mw-menu__item mw-menu__item--described");
      button.type = "button";
      button.dataset.todoPlacement = place;
      button.setAttribute("role", "radio");
      button.innerHTML = `${iconSvg(PLACE_ICONS[place] ?? "folder")}<span data-slot="menu-item-label"><span></span></span><span class="todo-menu-tick" aria-hidden="true">${iconSvg("check")}</span><small class="mw-menu__desc"></small>`;
      button.querySelector("[data-slot] > span")!.textContent = page.placeName(place);
      button.querySelector("small")!.textContent = uiText.text(place === "personal" ? "todo.place.personal-hint" : place === "project" ? "todo.place.project-hint" : "todo.place.unassigned-hint");
      box.append(button);
    }
  }
  box.querySelectorAll<HTMLElement>("[data-todo-placement]").forEach((button) => {
    button.setAttribute("aria-checked", String(!elsewhere && button.dataset.todoPlacement === item.placement));
  });
}

/**
 * Everything on the open todo that follows from its status and the editor's current values: the status chip and its menu, the
 * key dates beside it, which buttons show (one filled button per screen), the waiting block and the side block's values.
 */
export function paintDraft(page: TodoPage): void {
  const { state } = page;
  const item = state.selected;
  if (!item) return;
  const closed = item.status === "done" || item.status === "cancelled";
  const chip = page.$('[data-todo-pop-open="status"]');
  chip.className = `mw-status mw-status--${STATUS_TONES[item.status] ?? "idle"} todo-state`;
  chip.dataset.mwState = STATUS_RINGS[item.status] ?? "idle";
  chip.setAttribute("aria-label", `${uiText.text("todo.field.status")}${uiText.text("common.punctuation.label-separator")}${page.statusName(item.status)}`);
  page.$("[data-todo-state-name]").textContent = page.statusName(item.status);
  page.el.workspace.querySelectorAll<HTMLElement>('[data-todo-pop="status"] [data-todo-status]').forEach((choice) => choice.setAttribute("aria-checked", String(choice.dataset.todoStatus === item.status)));
  page.field("title").toggleAttribute("data-closed", closed);
  page.$("[data-todo-important-flag]").hidden = !(page.field("important") as HTMLInputElement).checked;
  paintFacts(page, closed);

  // One filled button per screen: 完成, unless one of the Assistant's works waits for the person, and then that row carries it.
  const going = state.works.some((work) => !["completed", "failed", "stopped"].includes(work.state));
  const needsYou = state.works.some((work) => work.state === "waiting-review" || work.state === "waiting-input");
  page.$("[data-todo-delegate]").hidden = closed || going;
  const complete = page.$("[data-todo-complete]");
  complete.hidden = closed;
  complete.className = `mw-btn mw-btn--${needsYou ? "secondary" : "primary"}`;
  page.$("[data-todo-reopen]").hidden = !closed;
  page.$("[data-todo-archive-here]").hidden = item.status !== "done" || Boolean(item.archived_at);
  const archivable = closed || Boolean(item.archived_at);
  page.$<HTMLButtonElement>("[data-todo-archive-menu]").disabled = !archivable;
  page.$("[data-todo-archive-label]").textContent = uiText.text(item.archived_at ? "todo.action.restore" : "todo.action.archive");
  page.$("[data-todo-archive-hint]").textContent = uiText.text(item.archived_at ? "todo.archive.restore-hint" : archivable ? "todo.archive.hint" : "todo.archive.needs-closed");

  page.$("[data-todo-waiting]").hidden = item.status !== "waiting";
  const follow = dateOf(page, "follow").date;
  page.$("[data-todo-follow-label]").textContent = follow ? uiText.text("todo.wait.follow-up", { when: nearDay(page, follow) }) : uiText.text("todo.field.follow-up");
  paintRail(page, closed);
}
