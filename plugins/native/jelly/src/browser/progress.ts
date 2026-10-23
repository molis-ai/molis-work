import { agendaHtml, bulkBar } from "./calendar.js";
import { keepListScroll, matches } from "./page.js";
import { API } from "./request.js";
import { addDays, civil, dateLabel, dayDate, mondayIndex } from "./util.js";
import type { JellyOccurrence, JellyPage, ReviewTab } from "./types.js";

const TABS: readonly (readonly [ReviewTab, string])[] = [["completed", "jelly.review.completed"], ["open", "jelly.review.open"], ["overdue", "jelly.review.postponed"], ["priority", "jelly.review.high-priority"], ["categories", "jelly.review.categories"]];

function reviewRange(page: JellyPage): { start: string; end: string } {
  const day = dayDate(page.anchor);
  let start: string;
  let end: string;
  if (page.reviewPeriod === "week") {
    start = addDays(page.anchor, -mondayIndex(day));
    end = addDays(start, 6);
  } else {
    day.setDate(1);
    start = civil(day);
    day.setMonth(day.getMonth() + 1);
    day.setDate(0);
    end = civil(day);
  }
  if (start <= civil() && end >= civil()) end = civil();
  return { start, end };
}

function categoryBreakdown(page: JellyPage, items: JellyOccurrence[]): string {
  return page.ws().categories.map((entry) => {
    const all = items.filter((item) => item.category_id === entry.id);
    const completed = all.filter((item) => item.completed_at).length;
    return all.length ? `<div class="jelly-agenda-row">${page.categoryDot(entry.id)}<span>${page.catName(entry)}</span><span class="jelly-muted">${completed} / ${all.length} ${page.tx("jelly.status.completed")}</span></div>` : "";
  }).join("");
}

function summaryHtml(page: JellyPage, counts: { total: number; done: number; due: number; ratio: number }): string {
  const cell = (value: string | number, label: string) => `<div><strong>${value}</strong> <span>${page.tx(label)}</span></div>`;
  return `<div class="jelly-review-summary">${cell(counts.total, "jelly.review.scheduled")}${cell(counts.done, "jelly.status.completed")}${cell(counts.due, "jelly.review.overdue")}${cell(`${counts.ratio}%`, "jelly.review.complete-rate")}</div>`
    + `<div class="jelly-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${counts.ratio}"><span style="width:${counts.ratio}%"></span></div>`;
}

export async function renderProgress(page: JellyPage): Promise<void> {
  const seq = ++page.calendarSeq;
  const { start, end } = reviewRange(page);
  page.$("[data-jelly-period-title]").textContent = `${dateLabel(start, true)} — ${dateLabel(end, true)}`;
  const category = page.filterCategory ? `&category_id=${encodeURIComponent(page.filterCategory)}` : "";
  const [, calendar] = await Promise.all([
    page.request("GET", `${API}/progress?start=${start}&end=${end}&today=${civil()}${category}`),
    page.request<{ occurrences?: JellyOccurrence[] }>("GET", `${API}/calendar?start=${start}&end=${end}`),
  ]);
  if (seq !== page.calendarSeq || page.view !== "progress") return;
  page.occurrences = calendar.occurrences || [];
  const items = page.occurrences.filter((item) => matches(page, item, item.notes));
  const done = items.filter((item) => item.completed_at);
  const open = items.filter((item) => !item.completed_at);
  const due = open.filter((item) => item.end_date < civil());
  const ratio = items.length ? Math.round(done.length / items.length * 100) : 0;
  const tab = page.reviewTab;
  const displayed = tab === "completed" ? done : tab === "overdue" ? due : tab === "priority" ? open.filter((item) => ["P0", "P1"].includes(item.priority)) : open;
  const pressed = (value: boolean) => `aria-pressed="${value}"`;
  const body = tab === "categories" ? categoryBreakdown(page, items)
    : (tab !== "completed" ? bulkBar(page) : "") + (displayed.length ? agendaHtml(page, displayed, tab !== "completed") : `<p class="jelly-muted">${page.tx("jelly.review.none")}</p>`);
  keepListScroll(page, () => {
    page.content.innerHTML = `<div class="jelly-choice-row">${page.btn("jelly.review.this-week", `data-jelly-review-period="week" ${pressed(page.reviewPeriod === "week")}`)}${page.btn("jelly.review.this-month", `data-jelly-review-period="month" ${pressed(page.reviewPeriod === "month")}`)}</div>`
      + summaryHtml(page, { total: items.length, done: done.length, due: due.length, ratio })
      + `<p class="jelly-muted">${page.tx("jelly.review.count-note")}</p>`
      + `<div class="jelly-review-tabs">${TABS.map(([id, label]) => page.btn(label, `data-jelly-review-tab="${id}" ${pressed(tab === id)}`)).join("")}</div>${body}`;
  });
}
