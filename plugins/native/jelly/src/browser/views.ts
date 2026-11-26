import { escapeHtml as esc, icon, renderAlert, renderButton, renderEmpty, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMarkdown, noteName } from "./markdown.js";
import { addDays, civil, clockLabel, dateLabel, dayDate, monthLabel, relativeDay, shortDate, TONE_COLORS, TONES, weekdayLabel, weekStart } from "./util.js";
import type { Draft, JellyCategory, JellyOccurrence, JellyState, NoteEditor } from "./types.js";
/** The locale key of each scope (keys are lower case). */
const SCOPE_KEY = { onlyThis: "only-this", thisAndFuture: "this-and-future", all: "all" } as const;

const uiText = globalThis.t;
const tx = (key: string, values?: Record<string, string | number>): string => uiText.text(key, values);
const button = (label: string, attrs: Record<string, string | boolean>, options: Partial<Parameters<typeof renderButton>[0]> = {}): string =>
  renderButton({ variant: "ghost", size: "md", label: tx(label), attrs, ...options });
const HEX = /^#[0-9a-f]{6}$/iu;

export function categoryOf(state: JellyState, id: string): JellyCategory | undefined { return state.categories.find(category => category.id === id); }
export const categoryName = (category: JellyCategory | undefined): string => !category || category.id === "uncategorized" ? tx("jelly.category.uncategorized") : category.name;
const colour = (state: JellyState, id: string): string => { const value = categoryOf(state, id)?.color ?? TONE_COLORS.gray; return HEX.test(value) ? value : TONE_COLORS.gray; };
/** What the filters let through: the chosen categories (none chosen is all) and the search words. */
export const shown = (state: JellyState, entry: JellyOccurrence): boolean =>
  (!state.filter.size || state.filter.has(categoryOf(state, entry.category_id) ? entry.category_id : "uncategorized"))
  && (!state.query || `${entry.title}\n${entry.notes}`.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
const onDay = (state: JellyState, day: string): JellyOccurrence[] => state.occurrences.filter(entry => entry.start_date <= day && entry.end_date >= day && shown(state, entry));
const timeOf = (entry: JellyOccurrence, long = true): string => entry.start_time === null ? tx("jelly.item.all-day") : long ? `${clockLabel(entry.start_time)}–${clockLabel(entry.end_time)}` : clockLabel(entry.start_time);

/** The period on screen: a month is the six weeks that hold it, a week runs Monday to Sunday, the list is the next fortnight. */
export function period(state: JellyState): { start: string; end: string } {
  if (state.mode === "week") { const start = weekStart(state.anchor); return { start, end: addDays(start, 6) }; }
  if (state.mode === "list") return { start: state.anchor, end: addDays(state.anchor, 13) };
  const start = weekStart(`${state.anchor.slice(0, 7)}-01`);
  return { start, end: addDays(start, 41) };
}

export function renderHeader(state: JellyState): string {
  const tabs = `<div class="jelly-tabs" role="tablist" aria-label="${uiText("jelly.page.label")}">${([["calendar", "calendar", "jelly.tab.calendar"], ["notes", "note", "jelly.tab.notes"]] as const)
    .map(([id, glyph, label]) => `<button type="button" role="tab" class="jelly-tab" aria-selected="${state.tab === id}" data-jelly-tab="${id}">${icon(glyph)}<span>${uiText(label)}</span></button>`).join("")}</div>`;
  if (state.tab === "notes") return `<header class="jelly-head">${tabs}<span class="jelly-grow"></span>${button("jelly.note.new", { "data-jelly-act": "new-note" }, { variant: "primary", icon: "plus" })}</header>`;
  const { start, end } = period(state);
  const title = state.mode === "month" ? monthLabel(state.anchor) : state.mode === "week" ? `${shortDate(start)} – ${shortDate(end)}` : tx("jelly.list.title");
  const modes = `<span class="mw-toggle-group jelly-modes" data-slot="toggle-group" role="group" aria-label="${uiText("jelly.mode.label")}">${(["month", "week", "list"] as const)
    .map(mode => `<button type="button" class="mw-toggle" aria-pressed="${state.mode === mode}" data-jelly-mode="${mode}">${uiText(`jelly.mode.${mode}`)}</button>`).join("")}</span>`;
  const chips = state.categories.map(category => `<button type="button" class="jelly-chip" style="--jelly-c:${colour(state, category.id)}" aria-pressed="${state.filter.has(category.id)}" data-jelly-filter="${esc(category.id)}"><i class="jelly-dot"></i>${esc(categoryName(category))}</button>`).join("");
  return `<header class="jelly-head">${tabs}
    ${button("jelly.nav.previous", { "data-jelly-step": "-1" }, { icon: "chevron-left", iconOnly: true, className: "jelly-wide" })}
    <h1 class="jelly-period" data-jelly-period>${esc(title)}</h1>
    ${button("jelly.nav.next", { "data-jelly-step": "1" }, { icon: "chevron-right", iconOnly: true, className: "jelly-wide" })}
    ${button("jelly.nav.today", { "data-jelly-act": "today" }, { variant: "secondary" })}
    <span class="jelly-grow"></span>${modes}
    ${button("jelly.item.new", { "data-jelly-act": "new" }, { variant: "primary", icon: "plus" })}
  </header>
  <div class="jelly-sub">
    <label class="mw-input-group jelly-search jelly-wide">${icon("search")}<input class="mw-input" type="search" data-jelly-search value="${esc(state.query)}" placeholder="${uiText("jelly.search.placeholder")}" aria-label="${uiText("jelly.search.placeholder")}"></label>
    <div class="jelly-chips" role="group" aria-label="${uiText("jelly.category.filter")}">${chips}</div>
    <span class="jelly-grow"></span>${button("jelly.category.manage", { "data-jelly-act": "categories" }, { icon: "tag" })}
  </div>`;
}

const chip = (state: JellyState, entry: JellyOccurrence): string => {
  const done = entry.completed_at !== null, task = entry.kind === "task";
  return `<button type="button" class="jelly-ev" style="--jelly-c:${colour(state, entry.category_id)}" ${entry.start_time === null ? "data-all-day" : ""} ${done ? "data-done" : ""} data-jelly-open="${esc(entry.id)}" title="${esc(entry.title)}">${task ? icon(done ? "check" : "circle") : entry.start_time !== null ? `<time>${clockLabel(entry.start_time)}</time>` : ""}<span class="jelly-cut">${esc(entry.title)}</span></button>`;
};
export const renderRow = (state: JellyState, entry: JellyOccurrence): string => {
  const done = entry.completed_at !== null;
  const mark = entry.kind === "task"
    ? `<button type="button" class="jelly-check" role="checkbox" aria-checked="${done}" aria-label="${uiText(done ? "jelly.item.reopen" : "jelly.item.complete")}" data-jelly-toggle="${esc(entry.id)}">${done ? icon("check") : ""}</button>`
    : `<span class="jelly-check" data-event style="--jelly-c:${colour(state, entry.category_id)}"></span>`;
  return `<div class="jelly-row" ${done ? "data-done" : ""}>${mark}<button type="button" class="jelly-row-open" data-jelly-open="${esc(entry.id)}"><time>${esc(timeOf(entry))}</time><span class="jelly-cut">${esc(entry.title)}</span>${entry.series_id ? `<small title="${uiText("jelly.item.repeats")}">${icon("refresh")}</small>` : ""}<small>${esc(categoryName(categoryOf(state, entry.category_id)))}</small></button></div>`;
};

function month(state: JellyState, noteDays: ReadonlySet<string>): string {
  const { start } = period(state), today = civil(), inMonth = state.anchor.slice(0, 7);
  const heads = Array.from({ length: 7 }, (_, index) => `<div class="jelly-wd">${esc(weekdayLabel(addDays(start, index)))}</div>`).join("");
  let cells = "";
  for (let index = 0; index < 42; index++) {
    const day = addDays(start, index), list = onDay(state, day);
    cells += `<div class="jelly-day" role="gridcell" tabindex="-1" ${day.slice(0, 7) !== inMonth ? "data-out" : ""} ${day === today ? "data-today" : ""} ${day === state.selected ? "data-selected aria-selected=\"true\"" : ""} data-jelly-day="${day}">
      <span class="jelly-dn">${dayDate(day).getDate()}</span>${noteDays.has(day) ? `<span class="jelly-day-note" title="${uiText("jelly.rail.has-note")}">${icon("note")}</span>` : ""}
      ${list.slice(0, 3).map(entry => chip(state, entry)).join("")}${list.length > 3 ? `<span class="jelly-more">${uiText("jelly.month.more", { count: list.length - 3 })}</span>` : ""}</div>`;
  }
  return `<div class="jelly-month" role="grid" aria-label="${esc(monthLabel(state.anchor))}">${heads}${cells}</div>`;
}
function week(state: JellyState): string {
  const { start } = period(state), today = civil(), days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const hour = 44, first = 7, top = (minute: number) => (minute / 60 - first) * hour;
  const heads = `<div class="jelly-wh"></div>${days.map(day => `<button type="button" class="jelly-wh" ${day === today ? "data-today" : ""} ${day === state.selected ? "data-selected" : ""} data-jelly-day="${day}">${esc(weekdayLabel(day))}<b>${dayDate(day).getDate()}</b></button>`).join("")}`;
  const allDay = `<div class="jelly-allday-label">${uiText("jelly.item.all-day")}</div>${days.map(day => `<div class="jelly-allday" data-jelly-day="${day}">${onDay(state, day).filter(entry => entry.start_time === null || entry.start_date !== entry.end_date).map(entry => chip(state, entry)).join("")}</div>`).join("")}`;
  const ruler = `<div class="jelly-ruler">${Array.from({ length: 24 - first }, (_, index) => `<span style="top:${index * hour}px">${String(first + index).padStart(2, "0")}:00</span>`).join("")}</div>`;
  const columns = days.map(day => `<div class="jelly-col" data-jelly-day="${day}">${onDay(state, day).filter(entry => entry.start_time !== null && entry.start_date === entry.end_date).map(entry => {
    const y = Math.max(0, top(entry.start_time!)), height = Math.max(22, top(entry.end_time ?? entry.start_time! + 30) - y - 2);
    return `<div class="jelly-slot" style="top:${y}px;height:${height}px">${chip(state, entry)}</div>`;
  }).join("")}</div>`).join("");
  return `<div class="jelly-week" style="--jelly-hours:${24 - first}">${heads}${allDay}${ruler}${columns}</div>`;
}
function list(state: JellyState): string {
  const { start, end } = period(state), sections: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const entries = onDay(state, day);
    if (entries.length) sections.push(`<section class="jelly-ag"><h3>${esc(relativeDay(day) || dateLabel(day))}${relativeDay(day) ? `<small>${esc(dateLabel(day))}</small>` : ""}</h3>${entries.map(entry => renderRow(state, entry)).join("")}</section>`);
  }
  return sections.length ? `<div class="jelly-agenda">${sections.join("")}</div>` : `<p class="jelly-muted jelly-pad">${uiText("jelly.list.empty")}</p>`;
}

function noteBox(editor: NoteEditor, label: string, read: boolean): string {
  const status = editor.saving ? "jelly.note.saving" : editor.dirty ? "jelly.note.editing" : editor.note ? "jelly.note.saved" : "";
  const conflict = editor.conflict ? renderAlert({ tone: "warning", state: "conflict", title: tx("jelly.conflict.note-title"), body: tx("jelly.conflict.body"), role: "alert",
    actions: [{ label: tx("jelly.conflict.show-latest"), variant: "secondary", attrs: { "data-jelly-act": "reload-note" } }] }) : "";
  const body = read && editor.note ? `<div class="jelly-md">${renderMarkdown(editor.body)}</div>`
    : `<textarea class="jelly-md-src" spellcheck="false" data-jelly-note-body aria-label="${uiText(label)}" placeholder="${uiText("jelly.note.placeholder")}">${esc(editor.body)}</textarea>`;
  return `${conflict}<div class="jelly-note-status" data-jelly-note-status data-mw-state="${editor.saving ? "saving" : editor.dirty ? "unsaved" : "saved"}">${status ? uiText(status) : ""}</div>${body}`;
}
function rail(state: JellyState): string {
  const day = state.selected, near = relativeDay(day), entries = onDay(state, day);
  return `<aside class="jelly-rail" aria-label="${uiText("jelly.rail.label")}">
    <h2>${esc(near || dateLabel(day))}${near ? `<small>${esc(dateLabel(day))}</small>` : ""}</h2>
    <section><p class="jelly-sec">${icon("calendar")}${uiText("jelly.rail.schedule")}</p>
      ${entries.length ? entries.map(entry => renderRow(state, entry)).join("") : `<p class="jelly-muted">${uiText("jelly.rail.nothing")}</p>`}
      <label class="jelly-quick">${icon("plus")}<input class="mw-input" data-jelly-quick placeholder="${uiText("jelly.rail.quick")}" aria-label="${uiText("jelly.rail.quick")}" maxlength="500"></label></section>
    <section class="jelly-day-note-box" data-jelly-day-note><p class="jelly-sec">${icon("note")}${uiText("jelly.rail.note")}</p>${noteBox(state.dayNote, "jelly.rail.note", false)}</section>
  </aside>`;
}

export function renderCalendar(state: JellyState, noteDays: ReadonlySet<string>): string {
  if (state.load === "failed") return `<div class="jelly-center">${renderEmpty({ icon: "circle-alert", title: tx("jelly.load.failed-title"), body: state.error || tx("jelly.load.failed-text"),
    action: renderButton({ variant: "secondary", size: "md", icon: "refresh", label: tx("jelly.action.retry"), attrs: { "data-jelly-act": "retry" } }) })}</div>`;
  if (state.load === "loading" && !state.loaded) return `<p class="jelly-muted jelly-pad">${uiText("jelly.load.opening")}</p>`;
  const view = state.mode === "week" ? week(state) : state.mode === "list" ? list(state) : month(state, noteDays);
  const empty = !state.occurrences.length && !state.query && !state.filter.size && state.mode !== "list"
    ? `<p class="jelly-hint" data-jelly-empty-hint>${icon("sparkles")}${uiText("jelly.empty.hint")}</p>` : "";
  return `${empty}<div class="jelly-body"><div class="jelly-main">${view}</div>${state.mode === "list" ? "" : rail(state)}</div>`;
}

export function renderNotes(state: JellyState): string {
  if (!state.notes.length && !state.noteQuery && !state.note.note && !state.note.dirty && !state.note.open) return `<div class="jelly-center">${renderEmpty({ icon: "note", title: tx("jelly.notes.empty-title"), body: tx("jelly.notes.empty-text"),
    action: renderButton({ variant: "primary", size: "md", icon: "plus", label: tx("jelly.note.new"), attrs: { "data-jelly-act": "new-note" } }) })}</div>`;
  const current = state.note.note?.id ?? "";
  const rows = state.notes.map(note => `<button type="button" class="jelly-nrow" aria-current="${note.id === current}" data-jelly-note="${esc(note.id)}"><b class="jelly-cut">${esc(noteName(note) || tx("jelly.note.untitled"))}</b><span class="jelly-cut">${note.day ? `${icon("calendar")}${esc(shortDate(note.day))} · ` : ""}${esc(note.excerpt)}</span></button>`).join("");
  const editor = state.note.note || state.note.dirty || state.note.open ? `<section class="jelly-editor" data-jelly-notes-editor>
      <div class="jelly-ebar">${button("jelly.detail.back", { "data-jelly-act": "note-back" }, { icon: "chevron-left", iconOnly: true, className: "jelly-narrow" })}
        <label class="jelly-date-chip">${icon("calendar")}<span>${state.note.day ? esc(dateLabel(state.note.day)) : uiText("jelly.note.pin-day")}</span><input type="date" data-jelly-note-day value="${esc(state.note.day ?? "")}" aria-label="${uiText("jelly.note.pin-day")}"></label>
        <span class="jelly-grow"></span>
        <span class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${uiText("jelly.note.mode")}"><button type="button" class="mw-toggle" aria-pressed="${!state.noteRead}" data-jelly-note-mode="write">${uiText("jelly.note.write")}</button><button type="button" class="mw-toggle" aria-pressed="${state.noteRead}" data-jelly-note-mode="read">${uiText("jelly.note.read")}</button></span>
        ${state.note.note ? button("jelly.note.delete", { "data-jelly-act": "delete-note" }, { icon: "trash", iconOnly: true }) : ""}
      </div>${noteBox(state.note, "jelly.note.body", state.noteRead)}</section>`
    : `<section class="jelly-editor jelly-center"><p class="jelly-muted">${uiText("jelly.notes.pick")}</p></section>`;
  return `<div class="jelly-notes" ${current || state.note.dirty ? "data-open" : ""}><nav class="jelly-nlist" aria-label="${uiText("jelly.tab.notes")}">
    <label class="mw-input-group">${icon("search")}<input class="mw-input" type="search" data-jelly-note-search value="${esc(state.noteQuery)}" placeholder="${uiText("jelly.notes.search")}" aria-label="${uiText("jelly.notes.search")}"></label>
    ${rows || `<p class="jelly-muted jelly-pad">${uiText("jelly.notes.no-match")}</p>`}</nav>${editor}</div>`;
}

export function renderPanel(state: JellyState, draft: Draft): string {
  const existing = draft.occurrence, series = existing?.series_id ?? null;
  const ruleShown = existing ? Boolean(series) && draft.scope !== "onlyThis" : draft.repeat;
  const weekdays = Array.from({ length: 7 }, (_, index) => { const day = addDays("2024-01-01", index); return `<button type="button" class="jelly-wd-pick" aria-pressed="${draft.weekdays.includes(index + 1)}" data-jelly-weekday="${index + 1}" aria-label="${esc(weekdayLabel(day))}">${esc(weekdayLabel(day, true))}</button>`; }).join("");
  const chips = state.categories.map(category => `<button type="button" class="jelly-chip" style="--jelly-c:${colour(state, category.id)}" aria-pressed="${draft.category_id === category.id}" data-jelly-draft-category="${esc(category.id)}"><i class="jelly-dot"></i>${esc(categoryName(category))}</button>`).join("");
  const scope = series ? `<fieldset class="jelly-scope"><legend>${uiText("jelly.scope.question")}</legend>${(["onlyThis", "thisAndFuture", "all"] as const).map(value =>
    `<label><input type="radio" name="jelly-scope" value="${value}" ${draft.scope === value ? "checked" : ""} data-jelly-scope> ${uiText(`jelly.scope.${SCOPE_KEY[value]}`, value === "onlyThis" ? { date: shortDate(existing!.original_date!) } : undefined)}</label>`).join("")}</fieldset>` : "";
  const conflict = draft.conflict ? renderAlert({ tone: "warning", state: "conflict", title: tx("jelly.conflict.item-title", { title: draft.title || existing?.title || "" }), body: tx("jelly.conflict.body"), role: "alert",
    actions: [{ label: tx("jelly.conflict.show-latest"), variant: "secondary", attrs: { "data-jelly-act": "reload-item" } }] }) : "";
  const done = existing?.completed_at != null;
  return `<div class="jelly-scrim" data-jelly-act="close"></div>
  <section class="jelly-panel" role="dialog" aria-modal="true" aria-labelledby="jelly-panel-title" data-jelly-panel>
    <header><h2 id="jelly-panel-title">${uiText(existing ? "jelly.item.edit" : "jelly.item.new")}</h2>${button("jelly.action.close", { "data-jelly-act": "close" }, { icon: "x", iconOnly: true })}</header>
    <form class="jelly-form" data-jelly-form novalidate>
      ${conflict}
      <input class="mw-input jelly-title-in" name="title" value="${esc(draft.title)}" maxlength="500" required placeholder="${uiText("jelly.field.title-placeholder")}" aria-label="${uiText("jelly.field.title")}">
      <span class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${uiText("jelly.field.kind")}">${(["event", "task"] as const).map(kind => `<button type="button" class="mw-toggle" aria-pressed="${draft.kind === kind}" data-jelly-kind="${kind}">${uiText(`jelly.kind.${kind}`)}</button>`).join("")}</span>
      <div class="jelly-line">${icon("clock")}<span class="jelly-grow">${uiText("jelly.item.all-day")}</span>${renderSwitch({ name: "all_day", checked: draft.allDay, label: tx("jelly.item.all-day"), attrs: { "data-jelly-all-day": true } })}</div>
      <div class="jelly-grid">
        <label>${uiText("jelly.field.start-date")}<input class="mw-input" type="date" name="start_date" value="${esc(draft.start_date)}" required></label>
        <label>${uiText("jelly.field.end-date")}<input class="mw-input" type="date" name="end_date" value="${esc(draft.end_date)}" required></label>
        ${draft.allDay ? "" : `<label>${uiText("jelly.field.start-time")}<input class="mw-input" type="time" name="start_time" value="${esc(draft.start_time)}" required></label>
        <label>${uiText("jelly.field.end-time")}<input class="mw-input" type="time" name="end_time" value="${esc(draft.end_time)}" required></label>`}
      </div>
      ${existing ? "" : `<div class="jelly-line">${icon("refresh")}<span class="jelly-grow">${uiText("jelly.field.repeat")}</span>${renderSwitch({ name: "repeat", checked: draft.repeat, label: tx("jelly.field.repeat"), attrs: { "data-jelly-repeat": true } })}</div>`}
      ${ruleShown ? `<div class="jelly-weekdays" role="group" aria-label="${uiText("jelly.field.weekdays")}">${weekdays}</div><label class="jelly-until">${uiText("jelly.field.repeat-until")}<input class="mw-input" type="date" name="until" value="${esc(draft.until)}"></label>` : ""}
      <div class="jelly-field"><span>${uiText("jelly.field.category")}</span><div class="jelly-chips">${chips}</div></div>
      <label class="jelly-field"><span>${uiText("jelly.field.notes")}</span><textarea class="mw-textarea" name="notes" rows="3" maxlength="20000" placeholder="${uiText("jelly.field.notes-placeholder")}">${esc(draft.notes)}</textarea></label>
      ${scope}
      <p class="jelly-form-error" role="alert" ${draft.error ? "" : "hidden"}>${esc(draft.error)}</p>
    </form>
    <footer>${existing ? button("jelly.item.delete", { "data-jelly-act": "delete-item" }, { icon: "trash" }) : ""}${existing && draft.kind === "task" ? button(done ? "jelly.item.reopen" : "jelly.item.complete", { "data-jelly-act": "complete-item" }, { icon: "check" }) : ""}<span class="jelly-grow"></span>
      ${button("jelly.action.cancel", { "data-jelly-act": "close" }, { variant: "secondary" })}${renderButton({ variant: "primary", size: "md", label: tx("jelly.action.save"), loading: draft.busy, attrs: { "data-jelly-act": "save-item" } })}</footer>
  </section>`;
}

export function renderCategories(state: JellyState): string {
  const rows = state.categories.map(category => {
    const fixed = category.id === "uncategorized";
    const swatches = TONES.map(tone => `<button type="button" class="jelly-swatch" data-tone="${tone}" style="--jelly-c:${TONE_COLORS[tone]}" aria-pressed="${category.color.toLowerCase() === TONE_COLORS[tone].toLowerCase()}" aria-label="${uiText(`jelly.tone.${tone}`)}" data-jelly-colour="${tone}" data-jelly-category="${esc(category.id)}"></button>`).join("");
    return `<li class="jelly-cat-row" data-jelly-category-row="${esc(category.id)}"><i class="jelly-dot" style="--jelly-c:${colour(state, category.id)}"></i>
      ${fixed ? `<span class="jelly-grow">${esc(categoryName(category))}</span>` : `<input class="mw-input jelly-grow" maxlength="100" value="${esc(category.name)}" data-jelly-category-name="${esc(category.id)}" aria-label="${uiText("jelly.category.name")}">`}
      <span class="jelly-swatches">${swatches}</span>${fixed ? "" : button("jelly.category.delete", { "data-jelly-category-delete": category.id }, { icon: "trash", iconOnly: true })}</li>`;
  }).join("");
  return `<div class="jelly-scrim" data-jelly-act="close-categories"></div><section class="jelly-panel" role="dialog" aria-modal="true" aria-labelledby="jelly-categories-title">
    <header><h2 id="jelly-categories-title">${uiText("jelly.category.manage")}</h2>${button("jelly.action.close", { "data-jelly-act": "close-categories" }, { icon: "x", iconOnly: true })}</header>
    <ul class="jelly-cats">${rows}</ul>
    <form class="jelly-cat-new" data-jelly-category-new><input class="mw-input jelly-grow" name="name" maxlength="100" required placeholder="${uiText("jelly.category.new-placeholder")}" aria-label="${uiText("jelly.category.new")}">${renderButton({ variant: "secondary", size: "md", type: "submit", icon: "plus", label: tx("jelly.category.new") })}</form>
  </section>`;
}
