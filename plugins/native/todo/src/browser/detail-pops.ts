import { dateOf, monthDay, STATUS_RINGS, todayOf, weekday } from "./detail-head.js";
import { isoDay, make, pad } from "./dom.js";
import type { TodoPage } from "./types.js";

const uiText = globalThis.t;

const DATE_NAMES: Record<string, string> = { due: "todo.prop.due", planned: "todo.prop.planned", remind: "todo.prop.remind", follow: "todo.field.follow-up" };
const civil = (date: string) => new Date(`${date}T12:00:00`);
const plus = (date: string, days: number) => { const at = civil(date); at.setDate(at.getDate() + days); return isoDay(at); };
/** The next day of the week on or after `date` (0 is Sunday); `after` skips `date` itself. */
const nextWeekday = (date: string, day: number, after = false) => plus(date, ((day - civil(date).getDay() + 7) % 7) || (after ? 7 : 0));
/** 9, 930, 9:30 and 09:30 are all a time of day; anything else is not. */
const clock = (text: string) => {
  const found = /^(\d{1,2})(?:[:：.]?(\d{2}))?$/.exec(text.trim());
  if (!found) return null;
  const hours = Number(found[1]), minutes = Number(found[2] ?? 0);
  return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
};

/**
 * The popovers of the open todo: the status and placement menus, the date popover (one for 截止, 计划做, 提醒 and the follow-up
 * day) and the link picker. Each grows from the control that opened it, closes on Escape, an outside click or a choice, and on a
 * narrow page rises from the bottom instead (styles). A date or time takes effect when picked: the hidden field takes it and the
 * editor saves, the same way a typed field does.
 */
export function installPops(page: TodoPage): void {
  const { el, state } = page;
  const host = el.workspace;
  const scrim = page.$("[data-todo-pop-scrim]");
  const datePop = page.$('[data-todo-pop="date"]');
  const calendar = page.$("[data-todo-calendar]");
  const timeInput = page.$<HTMLInputElement>("[data-todo-time-input]");
  const linkSearch = page.$<HTMLInputElement>("[data-todo-link-search]");
  let open: { pop: HTMLElement; anchor: HTMLElement; name: string } | null = null;
  let month = { year: 0, month: 0 };

  const place = () => {
    if (!open) return;
    const { pop, anchor } = open;
    const frame = host.getBoundingClientRect(), from = anchor.getBoundingClientRect();
    const width = pop.offsetWidth, height = pop.offsetHeight;
    const left = from.left - frame.left, right = from.right - frame.left, toRight = (left + right) / 2 > frame.width / 2;
    let top = from.bottom - frame.top + 6;
    const above = from.top - frame.top - height - 6;
    const up = top + height > frame.height - 8 && above >= 8;
    if (up) top = above; else top = Math.max(8, Math.min(top, frame.height - height - 8));
    pop.toggleAttribute("data-up", up);
    pop.style.left = `${Math.max(8, Math.min(frame.width - width - 8, toRight ? right - width : left))}px`;
    pop.style.top = `${top}px`;
    pop.style.setProperty("--todo-pop-origin", toRight ? "100%" : "0%");
  };

  page.closePop = (focusBack) => {
    if (!open) return;
    const { pop, anchor } = open;
    open = null;
    pop.hidden = true;
    scrim.hidden = true;
    anchor.setAttribute("aria-expanded", "false");
    if (focusBack) anchor.focus();
  };

  /** Writes a date row's value into the editor's fields and saves what changed. */
  const write = (name: string, date: string, time: string) => {
    const set = (field: string, value: string, key = field) => {
      const node = page.field(field);
      if (node.value === value) return;
      node.value = value;
      page.queueSave(key);
    };
    if (name === "due") { set("due_date", date); set("due_time", date ? time : ""); }
    else if (name === "planned") set("planned_date", date);
    else if (name === "follow") set("waiting.follow_up_on", date, "waiting");
    else set("remind_at", date ? `${date}T${time || "09:00"}` : "");
    page.paintDraft();
  };

  const paintCalendar = (selected: string) => {
    const today = todayOf(page), first = new Date(month.year, month.month, 1, 12);
    const offset = (first.getDay() + 6) % 7, days = new Date(month.year, month.month + 1, 0).getDate();
    page.$("[data-calendar-title]").textContent = uiText.text("todo.date.year-month", { y: month.year, m: month.month + 1 });
    const body = calendar.querySelector("tbody")!;
    body.replaceChildren();
    for (let row = 0; row < Math.ceil((offset + days) / 7); row++) {
      const line = make("tr");
      for (let column = 0; column < 7; column++) {
        const at = new Date(month.year, month.month, 1 - offset + row * 7 + column, 12), key = isoDay(at);
        const cell = make("td", `${at.getMonth() !== month.month ? "mw-calendar__outside" : ""}${key === selected ? " is-selected" : ""}`);
        cell.dataset.date = key;
        if (key === today) cell.setAttribute("aria-current", "date");
        const day = make("button", "mw-calendar__day", String(at.getDate()));
        day.type = "button";
        day.setAttribute("aria-label", `${monthDay(key)} ${weekday(key)}`);
        day.setAttribute("aria-pressed", String(key === selected));
        cell.append(day);
        line.append(cell);
      }
      body.append(line);
    }
  };

  const paintDate = (name: string) => {
    const today = todayOf(page), { date, time } = dateOf(page, name), due = dateOf(page, "due").date;
    datePop.setAttribute("aria-label", uiText.text(DATE_NAMES[name]!));
    const quick = page.$("[data-todo-date-quick]");
    quick.replaceChildren();
    const choice = (label: string, day: string, at = "") => {
      const button = make("button", "mw-menu__item");
      button.type = "button";
      button.dataset.todoDateQuick = day;
      if (at) button.dataset.time = at;
      const text = make("span", "", label);
      text.dataset.slot = "menu-item-label";
      button.append(text, make("small", "", at ? "" : Math.abs(page.dayDiff(day)) < 2 ? weekday(day) : monthDay(day)));
      quick.append(button);
    };
    if (name === "remind") {
      choice(uiText.text("todo.date.tonight"), today, "20:00");
      choice(uiText.text("todo.date.tomorrow-morning"), plus(today, 1), "09:00");
      if (due && due >= today) choice(uiText.text("todo.date.due-day-morning"), due, "09:00");
    } else {
      if (name !== "follow") choice(uiText.text("todo.date.today"), today);
      choice(uiText.text("todo.date.tomorrow"), plus(today, 1));
      // 本周五 only while this week's Friday is still ahead and is not simply 明天; 下周一 not when it is 明天 either.
      const weekdayNow = new Date(`${today}T00:00:00`).getDay();
      if (weekdayNow >= 1 && weekdayNow <= 3) choice(uiText.text("todo.date.this-friday"), nextWeekday(today, 5));
      if (weekdayNow !== 0) choice(uiText.text("todo.date.next-monday"), nextWeekday(today, 1, true));
    }
    paintCalendar(date);
    const timed = name === "due" || name === "remind";
    page.$("[data-todo-time]").hidden = !timed;
    page.$("[data-todo-time-help]").hidden = name !== "due";
    timeInput.value = time;
    datePop.querySelectorAll<HTMLElement>("[data-todo-time-choice]").forEach((button) => {
      const on = button.dataset.todoTimeChoice === time;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-pressed", String(on));
    });
    page.$("[data-todo-remind-hint]").hidden = name !== "remind";
    page.$("[data-todo-date-clear]").hidden = !date;
  };

  const paintLinks = () => {
    const item = state.selected, box = page.$("[data-todo-link-list]"), query = linkSearch.value.trim().toLowerCase();
    box.replaceChildren();
    if (!item) return;
    const linked = new Set(item.links.map((link) => link.subject.id));
    const pool = state.linkPool.filter((other) => other.id !== item.id && !linked.has(other.id) && (!query || other.title.toLowerCase().includes(query)));
    // Any active todo can be linked, not only the ones in the current view.
    for (const other of pool) {
      const button = make("button", "mw-menu__item");
      button.type = "button";
      button.dataset.todoLinkPick = other.id;
      button.setAttribute("role", "option");
      const ring = make("span", "todo-menu-ring");
      ring.dataset.mwState = STATUS_RINGS[other.status] ?? "idle";
      ring.setAttribute("aria-hidden", "true");
      const text = make("span", "", other.title);
      text.dataset.slot = "menu-item-label";
      button.append(ring, text, make("small", "", page.statusName(other.status)));
      box.append(button);
    }
    if (!pool.length) box.append(make("p", "todo-none", uiText.text(query ? "todo.link.no-match" : "todo.link.nothing-to-link")));
    host.querySelectorAll<HTMLElement>("[data-todo-link-relation]").forEach((button) => {
      const on = button.dataset.todoLinkRelation === state.linkRelation;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-checked", String(on));
    });
  };

  const show = (anchor: HTMLElement) => {
    const name = anchor.dataset.todoPopOpen ?? "";
    const again = open?.anchor === anchor;
    page.closePop();
    if (again || !state.selected) return;
    const pop = page.$(`[data-todo-pop="${name in DATE_NAMES ? "date" : name}"]`);
    if (name in DATE_NAMES) {
      const at = civil(dateOf(page, name).date || todayOf(page));
      month = { year: at.getFullYear(), month: at.getMonth() };
      paintDate(name);
    } else if (name === "link") { linkSearch.value = ""; paintLinks(); }
    open = { pop, anchor, name };
    pop.hidden = false;
    scrim.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    place();
    const first = name === "link" ? linkSearch
      : pop.querySelector<HTMLElement>('[aria-checked="true"], td.is-selected .mw-calendar__day, [aria-current="date"] .mw-calendar__day') ?? pop.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true });
  };

  page.popClick = (target) => {
    const opener = target.closest<HTMLElement>("[data-todo-pop-open]");
    if (opener) { show(opener); return true; }
    if (target.closest("[data-todo-pop-close]") || target === scrim) { page.closePop(true); return true; }
    if (!open) return false;
    if (!open.pop.contains(target)) { page.closePop(); return false; }
    const { name } = open;
    const relation = target.closest<HTMLElement>("[data-todo-link-relation]");
    if (relation) { state.linkRelation = relation.dataset.todoLinkRelation ?? "related"; paintLinks(); return true; }
    if (!(name in DATE_NAMES)) return false;
    const { date, time } = dateOf(page, name);
    const quick = target.closest<HTMLElement>("[data-todo-date-quick]");
    if (quick) { write(name, quick.dataset.todoDateQuick ?? "", quick.dataset.time ?? time); page.closePop(true); return true; }
    const step = target.closest<HTMLElement>("[data-calendar-step]");
    if (step) {
      const to = new Date(month.year, month.month + Number(step.dataset.calendarStep), 1, 12);
      month = { year: to.getFullYear(), month: to.getMonth() };
      paintCalendar(date);
      return true;
    }
    const day = target.closest(".mw-calendar__day")?.closest<HTMLElement>("[data-date]");
    if (day) {
      write(name, day.dataset.date ?? "", time);
      // A day alone is the whole answer for 计划做 and the follow-up; 截止 and 提醒 may still want a time.
      if (name === "planned" || name === "follow") page.closePop(true);
      else { paintDate(name); place(); calendar.querySelector<HTMLElement>("td.is-selected .mw-calendar__day")?.focus({ preventScroll: true }); }
      return true;
    }
    const at = target.closest<HTMLElement>("[data-todo-time-choice]");
    if (at) {
      const picked = at.dataset.todoTimeChoice ?? "";
      write(name, date || todayOf(page), name === "due" && picked === time ? "" : picked);
      paintDate(name);
      return true;
    }
    if (target.closest("[data-todo-date-clear]")) { write(name, "", ""); page.closePop(true); return true; }
    return true;
  };

  timeInput.addEventListener("change", () => {
    if (!open || !(open.name in DATE_NAMES)) return;
    const { date, time } = dateOf(page, open.name), typed = timeInput.value.trim() ? clock(timeInput.value) : "";
    if (typed === null || (!typed && open.name === "remind")) { timeInput.value = time; return; }
    write(open.name, typed ? date || todayOf(page) : date, typed);
    paintDate(open.name);
  });
  timeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); timeInput.blur(); page.closePop(true); } });
  linkSearch.addEventListener("input", () => { paintLinks(); place(); });
  host.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    page.closePop(true);
  });
  // Focus that leaves the popover for somewhere else on the page closes it (Tab past its last control).
  host.addEventListener("focusin", (event) => {
    if (open && event.target instanceof Node && !open.pop.contains(event.target) && !open.anchor.contains(event.target)) page.closePop();
  });
  page.$("[data-todo-scroll]").addEventListener("scroll", place, { passive: true });
  window.addEventListener("resize", place);
}
