import { empty, keepListScroll, matches } from "./page.js";
import { API } from "./request.js";
import { addDays, civil, clockLabel, dateLabel, dayDate, esc, glyph, mondayIndex, monthLabel } from "./util.js";
import type { JellyOccurrence, JellyPage } from "./types.js";

export const WEEKDAYS = ["jelly.week.mon", "jelly.week.tue", "jelly.week.wed", "jelly.week.thu", "jelly.week.fri", "jelly.week.sat", "jelly.week.sun"];
const HOUR_PX = 44;

/** The first and last day the page asks the calendar for. */
export function range(page: JellyPage): { start: string; end: string } {
  const date = dayDate(page.anchor);
  const calendar = page.view === "calendar";
  if (page.mode === "week" && calendar) {
    const start = addDays(page.anchor, -mondayIndex(date));
    return { start, end: addDays(start, 6) };
  }
  date.setDate(1);
  const first = civil(date);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  const last = civil(date);
  if (page.mode === "month" && calendar) {
    const start = addDays(first, -mondayIndex(dayDate(first)));
    const tail = (7 - mondayIndex(dayDate(last)) - 1) % 7;
    return { start, end: addDays(last, tail) };
  }
  return { start: first, end: last };
}

export function periodTitle(page: JellyPage): void {
  const { start, end } = range(page);
  page.$("[data-jelly-period-title]").textContent = page.mode === "week" ? `${dateLabel(start, true)} — ${dateLabel(end, true)}` : monthLabel(page.anchor);
}

export const occurrenceKey = (item: JellyOccurrence): string => (item.series_id ? `${item.series_id}@${item.original_date}` : item.id);
export const findOccurrence = (page: JellyPage, key: string): JellyOccurrence | undefined => page.occurrences.find((item) => occurrenceKey(item) === key);

export function occurrenceHtml(page: JellyPage, item: JellyOccurrence): string {
  const done = item.completed_at ? ` · ${page.L("jelly.status.completed")}` : "";
  const label = esc(`${item.title} · ${dateLabel(item.start_date)} ${clockLabel(item.start_time)}${done}`);
  const span = esc(item.title + ` · ${dateLabel(item.start_date)}` + (item.end_date !== item.start_date ? ` — ${dateLabel(item.end_date)}` : ""));
  return `<button type="button" aria-label="${label}" class="jelly-occurrence${item.completed_at ? " is-done" : ""}" draggable="true" data-jelly-occurrence="${esc(occurrenceKey(item))}" title="${span}">`
    + `${page.categoryDot(item.category_id)}${item.start_time !== null ? `<time>${clockLabel(item.start_time)}</time>` : ""}${item.pinned ? glyph("pin") : ""}`
    + `${item.priority !== "none" ? `<span class="jelly-priority" data-priority="${item.priority}">${item.priority}</span>` : ""}<span class="jelly-item-title">${esc(item.title)}</span>`
    + `${item.series_id ? glyph("refresh") : ""}${item.completed_at ? '<span data-mw-state="done" aria-hidden="true"></span>' : ""}</button>`;
}

const visibleOccurrences = (page: JellyPage): JellyOccurrence[] => page.occurrences.filter((item) => matches(page, item, item.notes) && (!page.hideCompleted || !item.completed_at));

export function agendaHtml(page: JellyPage, items: JellyOccurrence[], selectable = false): string {
  const dates = [...new Set(items.map((item) => item.start_date))].sort();
  const row = (item: JellyOccurrence) => {
    const pick = selectable && !item.series_id && !item.completed_at
      ? `<input type="checkbox" class="mw-check" data-jelly-select-item="${esc(item.id)}" aria-label="${page.tx("jelly.item.select")} ${esc(item.title)}" ${page.calendarSelected.has(item.id) ? "checked" : ""}>` : "";
    const toggle = page.btn(item.completed_at ? "jelly.item.reopen" : "jelly.item.complete", `data-jelly-toggle-item="${esc(occurrenceKey(item))}"`, item.completed_at ? "completed" : "circle");
    const up = !item.series_id && item.start_date === item.end_date && item.start_time === null ? page.btn("jelly.block.move-up", `data-jelly-reorder-item="${esc(item.id)}"`, "chevron-up") : "";
    return `<div class="jelly-agenda-row">${pick}${toggle}${occurrenceHtml(page, item)}${up}</div>`;
  };
  return `<div class="jelly-agenda">${dates.map((date) => `<section class="jelly-agenda-group"><h2>${esc(dateLabel(date))}</h2>${items.filter((item) => item.start_date === date).map(row).join("")}</section>`).join("")}</div>`;
}

export function bulkBar(page: JellyPage): string {
  const { btn } = page;
  const review = page.view === "progress" ? btn("jelly.calendar.shift-next-week", 'data-jelly-review-move="week"') + btn("jelly.calendar.shift-next-month", 'data-jelly-review-move="month"') : "";
  return `<div class="jelly-bulk-bar"><span class="jelly-muted" data-jelly-selection-count>${page.calendarSelected.size} ${page.tx("jelly.calendar.selected-count")}</span>${btn("jelly.calendar.move-selected", "data-jelly-move-selected", "calendar")}${review}${btn("jelly.calendar.clear-selection", "data-jelly-clear-selected")}</div>`;
}

const newItemLabel = (page: JellyPage, date: string): string => esc(`${dateLabel(date)} · ${page.L("jelly.item.new")}`);

function weekColumn(page: JellyPage, date: string, items: JellyOccurrence[]): string {
  const dayItems = items.filter((item) => item.start_date <= date && item.end_date >= date);
  const allDay = dayItems.filter((item) => item.start_time === null);
  const timed = dayItems.filter((item) => item.start_time !== null)
    .map((item) => ({ item, start: item.start_date < date ? 0 : item.start_time ?? 0, end: item.end_date > date ? 1440 : item.end_time ?? 0, lane: 0 }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const lanes: number[] = [];
  for (const entry of timed) {
    let lane = lanes.findIndex((end) => end <= entry.start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = entry.end;
    entry.lane = lane;
  }
  const count = Math.max(1, lanes.length);
  const events = timed.map((entry) => `<div class="jelly-week-event" style="top:${entry.start / 60 * HOUR_PX}px;height:${Math.max(24, (entry.end - entry.start) / 60 * HOUR_PX)}px;left:${entry.lane / count * 100}%;width:${100 / count}%">${occurrenceHtml(page, entry.item)}</div>`).join("");
  return `<section class="jelly-week-column jelly-day${date === civil() ? " is-today" : ""}" data-jelly-day="${date}"><header class="jelly-week-column-head"><span class="jelly-muted">${page.tx(WEEKDAYS[mondayIndex(dayDate(date))] ?? "")}</span>`
    + `<button type="button" class="jelly-day-number" aria-label="${newItemLabel(page, date)}" data-jelly-add-date="${date}">${Number(date.slice(8))}</button></header>`
    + `<div class="jelly-week-all-day">${allDay.map((item) => occurrenceHtml(page, item)).join("")}${page.btn("jelly.item.new-all-day", `data-jelly-add-date="${date}" class="jelly-day-add"`, "plus")}</div>`
    + `<div class="jelly-week-time" data-jelly-week-time="${date}">${events}</div></section>`;
}

function weekHtml(page: JellyPage, days: string[], items: JellyOccurrence[]): string {
  const hours = Array.from({ length: 24 }, (_, hour) => `<span style="top:${hour * HOUR_PX}px">${String(hour).padStart(2, "0")}:00</span>`).join("");
  const ruler = `<div class="jelly-week-ruler"><div class="jelly-week-ruler-head">${page.tx("jelly.item.all-day")}</div><div class="jelly-week-hours">${hours}</div></div>`;
  return `<div class="jelly-week-timeline">${ruler}${days.map((date) => weekColumn(page, date, items)).join("")}</div>`;
}

function monthHtml(page: JellyPage, days: string[], items: JellyOccurrence[]): string {
  const labels = WEEKDAYS.map((day) => `<div class="jelly-week-label">${page.tx(day)}</div>`).join("");
  const cells = days.map((date) => {
    const dayItems = items.filter((item) => item.start_date <= date && item.end_date >= date);
    return `<section class="jelly-day${date === civil() ? " is-today" : ""}${date.slice(0, 7) !== page.anchor.slice(0, 7) ? " is-outside" : ""}" data-jelly-day="${date}" aria-label="${esc(dateLabel(date))}"><div class="jelly-day-head">`
      + `<button type="button" class="jelly-day-number" aria-label="${newItemLabel(page, date)}" data-jelly-add-date="${date}" title="${page.tx("jelly.calendar.add-on-day")}">${Number(date.slice(8))}</button>`
      + `${page.btn("jelly.item.new", `data-jelly-add-date="${date}" class="jelly-day-add"`, "plus")}</div>${dayItems.map((item) => occurrenceHtml(page, item)).join("")}</section>`;
  }).join("");
  return `<div class="jelly-month">${labels}${cells}</div>`;
}

export async function renderCalendar(page: JellyPage): Promise<void> {
  const seq = ++page.calendarSeq;
  const { start, end } = range(page);
  const result = await page.request<{ occurrences?: JellyOccurrence[] }>("GET", `${API}/calendar?start=${start}&end=${end}`);
  if (seq !== page.calendarSeq || page.view !== "calendar") return;
  page.occurrences = result.occurrences || [];
  periodTitle(page);
  const items = visibleOccurrences(page);
  if (page.mode === "list") {
    keepListScroll(page, () => {
      page.content.innerHTML = items.length ? bulkBar(page) + agendaHtml(page, items, true)
        : empty(page, page.query ? "jelly.calendar.no-match" : "jelly.calendar.empty-title", "jelly.calendar.empty-text", "jelly.item.new");
    });
    return;
  }
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  keepListScroll(page, () => { page.content.innerHTML = page.mode === "week" ? weekHtml(page, days, items) : monthHtml(page, days, items); });
}
