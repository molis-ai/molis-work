import { findOccurrence } from "./calendar.js";
import { handleDatePickerClick } from "./datepicker.js";
import { openGeneric } from "./dialog.js";
import { completeItem, deleteItem, itemField, openItem, paintItemChoices, relationDate, renderItemRelations } from "./item.js";
import { flushEditor, openRecord } from "./notes.js";
import { run, showNote } from "./page.js";
import { renderView } from "./view.js";
import { command } from "./workspace.js";
import { addDays, civil, esc, mondayIndex } from "./util.js";
import type { JellyPage, RelationRole, ReviewTab, Scope } from "./types.js";

type Click = (page: JellyPage, target: HTMLElement) => void;
const data = (target: HTMLElement, name: string): string => target.getAttribute(name) ?? "";
const repaint = (page: JellyPage): void => { void run(page, () => renderView(page)); };
const itemDialog = (page: JellyPage): HTMLDialogElement => page.$<HTMLDialogElement>("[data-jelly-item-dialog]");
const owner = (page: JellyPage): string => page.editingItem?.series_id || page.editingItem?.id || "";

function moveSelected(page: JellyPage): void {
  if (!page.calendarSelected.size) { showNote(page, page.L("jelly.move.pick-first")); return; }
  openGeneric(page, "jelly.move.title", `<label class="jelly-field">${page.tx("jelly.move.to-date")}<input class="mw-input" data-jelly-bulk-date value="${civil()}" placeholder="YYYY-MM-DD"></label>`, "jelly.action.move", async () => {
    await command(page, { type: "item.move_many", ids: [...page.calendarSelected], date: page.$<HTMLInputElement>("[data-jelly-bulk-date]").value });
    page.calendarSelected.clear();
    await renderView(page);
  });
}

function reviewMove(page: JellyPage, target: HTMLElement): void {
  void run(page, async () => {
    if (!page.calendarSelected.size) { showNote(page, page.L("jelly.move.pick-first")); return; }
    let date: string;
    if (data(target, "data-jelly-review-move") === "week") date = addDays(civil(), 7 - mondayIndex(new Date()));
    else {
      const next = new Date();
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      date = civil(next);
    }
    await command(page, { type: "item.move_many", ids: [...page.calendarSelected], date });
    page.calendarSelected.clear();
    await renderView(page);
    showNote(page, page.L("jelly.move.done"));
  });
}

function reorderItem(page: JellyPage, target: HTMLElement): void {
  void run(page, async () => {
    const state = page.ws();
    const item = state.items.find((entry) => entry.id === data(target, "data-jelly-reorder-item"));
    if (!item) return;
    const ids = state.items.filter((entry) => entry.start_date === item.start_date && entry.end_date === item.start_date && entry.start_time === null)
      .sort((a, b) => a.untimed_rank - b.untimed_rank || a.created_at.localeCompare(b.created_at)).map((entry) => entry.id);
    const index = ids.indexOf(item.id);
    if (index > 0) {
      [ids[index - 1], ids[index]] = [ids[index] ?? "", ids[index - 1] ?? ""];
      await command(page, { type: "item.reorder", date: item.start_date, ids });
    }
  });
}

function copyItem(page: JellyPage): void {
  void run(page, async () => {
    const editing = page.editingItem;
    if (!editing) return;
    const { id: _id, created_at: _created, updated_at: _updated, series_id: _series, original_date: _original, ...fields } = editing;
    await command(page, { type: "item.create", item: { ...fields, completed_at: null, completion_description: "" } });
    itemDialog(page).close();
    showNote(page, page.L("jelly.item.copied"));
  });
}

function openLinkedNote(page: JellyPage, target: HTMLElement): void {
  void run(page, async () => {
    await flushEditor(page);
    itemDialog(page).close();
    page.view = "notes";
    page.archived = false;
    await renderView(page);
    openRecord(page, "note", data(target, "data-jelly-linked-note"));
  });
}

function migrateNotes(page: JellyPage): void {
  const notes = page.ws().notes.filter((note) => !note.archived_at);
  const { btn, tx } = page;
  openGeneric(page, "jelly.migrate.title", `<p class="jelly-muted">${tx("jelly.migrate.help")}</p><pre class="jelly-import-preview">${esc(page.editingItem?.notes)}</pre>`
    + btn("jelly.migrate.new-primary", "data-jelly-migrate-new", "plus") + notes.map((note) => btn(note.title || "jelly.note.untitled", `data-jelly-migrate-append="${esc(note.id)}"`, "note")).join(""), "", null);
}

function migrateChosen(page: JellyPage, target: HTMLElement): void {
  void run(page, async () => {
    const editing = page.editingItem;
    if (!editing) return;
    await command(page, { type: "item.notes_to_note", owner_id: owner(page), original_date: editing.original_date || null,
      mode: target.hasAttribute("data-jelly-migrate-new") ? "new" : "append", note_id: target.dataset.jellyMigrateAppend });
    editing.notes = "";
    itemField(page, "notes").value = "";
    page.$<HTMLDialogElement>("[data-jelly-dialog]").close();
    renderItemRelations(page);
    showNote(page, page.L("jelly.migrate.done"));
  });
}

function attachNote(page: JellyPage): void {
  const notes = page.ws().notes.filter((note) => !note.archived_at);
  const { btn, tx } = page;
  page.relationRole = "reference";
  const choices = notes.length ? notes.map((note) => btn(note.title || "jelly.note.untitled", `data-jelly-choose-note="${esc(note.id)}"`, "note")).join("") : `<p class="jelly-muted">${tx("jelly.relation.create-note-first")}</p>`;
  openGeneric(page, "jelly.relation.link-note", `<div class="jelly-choice-row">${btn("jelly.relation.reference-note", 'data-jelly-relation-role="reference" aria-pressed="true"')}${btn("jelly.relation.primary-note", 'data-jelly-relation-role="primary" aria-pressed="false"')}</div>`
    + `<p class="jelly-muted">${tx("jelly.relation.primary-help")}</p>${choices}`, " ", null);
}

const relationCommand = (type: string, extra: (page: JellyPage, target: HTMLElement) => Record<string, unknown>, after?: (page: JellyPage) => void): Click => (page, target) => {
  void run(page, async () => {
    await command(page, { type, ...extra(page, target) });
    after?.(page);
    renderItemRelations(page);
  });
};

/** Choice buttons of the item form: each sets one option and repaints the choices. */
const choose = (set: (page: JellyPage, value: string) => void, attr: string): Click => (page, target) => { set(page, data(target, attr)); paintItemChoices(page); };

const CLICKS: readonly (readonly [string, Click])[] = [
  ["data-jelly-clear-selected", (page) => { page.calendarSelected.clear(); repaint(page); }],
  ["data-jelly-move-selected", moveSelected],
  ["data-jelly-review-move", reviewMove],
  ["data-jelly-reorder-item", reorderItem],
  ["data-jelly-item-copy", copyItem],
  ["data-jelly-review-tab", (page, target) => { page.reviewTab = data(target, "data-jelly-review-tab") as ReviewTab; repaint(page); }],
  ["data-jelly-review-period", (page, target) => { page.reviewPeriod = data(target, "data-jelly-review-period") === "week" ? "week" : "month"; page.anchor = civil(); repaint(page); }],
  ["data-jelly-add-date", (page, target) => openItem(page, null, data(target, "data-jelly-add-date"))],
  ["data-jelly-occurrence", (page, target) => { const item = findOccurrence(page, data(target, "data-jelly-occurrence")); if (item) openItem(page, item); }],
  ["data-jelly-toggle-item", (page, target) => { void run(page, () => completeItem(page, findOccurrence(page, data(target, "data-jelly-toggle-item")))); }],
  ["data-jelly-item-kind", choose((page, value) => { page.itemOptions.kind = value === "event" ? "event" : "task"; }, "data-jelly-item-kind")],
  ["data-jelly-item-category", choose((page, value) => { page.itemOptions.category_id = value; }, "data-jelly-item-category")],
  ["data-jelly-item-priority", choose((page, value) => { page.itemOptions.priority = value as typeof page.itemOptions.priority; }, "data-jelly-item-priority")],
  ["data-jelly-item-weekday", choose((page, value) => {
    const day = Number(value);
    page.itemOptions.weekdays = page.itemOptions.weekdays.includes(day) ? page.itemOptions.weekdays.filter((n) => n !== day) : [...page.itemOptions.weekdays, day];
  }, "data-jelly-item-weekday")],
  ["data-jelly-item-scope", choose((page, value) => { page.itemOptions.scope = value as Scope; }, "data-jelly-item-scope")],
  ["data-jelly-complete-item", (page) => { void run(page, async () => { await completeItem(page, page.editingItem, itemField(page, "completion_description").value); itemDialog(page).close(); }); }],
  ["data-jelly-delete-item", (page) => { void run(page, () => deleteItem(page)); }],
  ["data-jelly-linked-note", openLinkedNote],
  ["data-jelly-detach-note", relationCommand("relation.detach", (page, target) => ({ owner_id: owner(page), original_date: relationDate(page), note_id: data(target, "data-jelly-detach-note"), role: target.dataset.role }))],
  ["data-jelly-relation-role", (page, target) => {
    page.relationRole = data(target, "data-jelly-relation-role") as RelationRole;
    page.$$("[data-jelly-relation-role]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.jellyRelationRole === page.relationRole)));
  }],
  ["data-jelly-relation-scope", (page, target) => { page.relationScope = data(target, "data-jelly-relation-scope") === "series" ? "series" : "instance"; renderItemRelations(page); }],
  ["data-jelly-reset-relations", relationCommand("relation.reset", (page) => ({ owner_id: page.editingItem?.series_id, original_date: page.editingItem?.original_date }))],
  ["data-jelly-migrate-notes", (page) => migrateNotes(page)],
  ["data-jelly-migrate-new", migrateChosen],
  ["data-jelly-migrate-append", migrateChosen],
  ["data-jelly-attach-note", (page) => attachNote(page)],
  ["data-jelly-choose-note", (page, target) => { void run(page, async () => {
    await command(page, { type: "relation.attach", owner_id: owner(page), original_date: relationDate(page), note_id: data(target, "data-jelly-choose-note"), role: page.relationRole });
    page.$<HTMLDialogElement>("[data-jelly-dialog]").close();
    renderItemRelations(page);
  }); }],
];

/** The calendar, item-dialog and review buttons; the first attribute that matches answers the click. */
export function handleCalendarClick(page: JellyPage, target: HTMLElement): void {
  if (handleDatePickerClick(page, target)) return;
  const click = CLICKS.find(([attr]) => target.hasAttribute(attr));
  click?.[1](page, target);
}
