import { confirmDialog } from "./dialog.js";
import { syncTaskIndicators } from "./note-sync.js";
import { showNote } from "./page.js";
import { loadList, command } from "./workspace.js";
import { clockLabel, esc, messageOf, parseClock } from "./util.js";
import type { JellyOccurrence, JellyPage, JellyRelation, LinkedTask } from "./types.js";

const PRIORITIES = ["none", "P0", "P1", "P2"] as const;
const ITEM_DIALOG = "[data-jelly-item-dialog]";
const closeItemDialog = (page: JellyPage): void => page.$<HTMLDialogElement>(ITEM_DIALOG).close();
export const itemField = (page: JellyPage, name: string): HTMLInputElement => page.$<HTMLInputElement>(`[data-jelly-field="${name}"]`);

export function paintItemChoices(page: JellyPage): void {
  const { $, btn, itemOptions: options } = page;
  const pressed = (value: boolean) => `aria-pressed="${value}"`;
  $("[data-jelly-kind]").innerHTML = (["task", "event"] as const).map((kind) => btn(kind === "task" ? "jelly.kind.task" : "jelly.kind.event", `data-jelly-item-kind="${kind}" ${pressed(options.kind === kind)}`, kind === "task" ? "check" : "calendar")).join("");
  $("[data-jelly-item-categories]").innerHTML = page.ws().categories.map((entry) => `<button type="button" class="mw-btn mw-btn--ghost" data-jelly-item-category="${esc(entry.id)}" ${pressed(options.category_id === entry.id)}>${page.categoryDot(entry.id)}${page.catName(entry)}</button>`).join("");
  $("[data-jelly-priority]").innerHTML = PRIORITIES.map((priority) => btn(priority === "none" ? "jelly.priority.none" : priority, `data-jelly-item-priority="${priority}" ${pressed(options.priority === priority)}`)).join("");
  $("[data-jelly-weekdays]").innerHTML = ["jelly.week.mon", "jelly.week.tue", "jelly.week.wed", "jelly.week.thu", "jelly.week.fri", "jelly.week.sat", "jelly.week.sun"].map((label, i) => btn(label, `data-jelly-item-weekday="${i + 1}" ${pressed(options.weekdays.includes(i + 1))}`)).join("");
  $("[data-jelly-scope-options]").innerHTML = btn("jelly.scope.only-this", `data-jelly-item-scope="onlyThis" ${pressed(options.scope === "onlyThis")}`) + btn("jelly.scope.this-and-future", `data-jelly-item-scope="thisAndFuture" ${pressed(options.scope === "thisAndFuture")}`);
  const editing = page.editingItem;
  $("[data-jelly-recurrence]").hidden = Boolean(page.linkedTask) || Boolean(editing && !editing.series_id) || Boolean(editing?.series_id && options.scope === "onlyThis");
}

export const relationDate = (page: JellyPage): string | null => (page.editingItem?.series_id && page.relationScope === "instance" ? page.editingItem.original_date : null);

function effectiveRelations(page: JellyPage, item: JellyOccurrence): JellyRelation[] {
  const state = page.ws();
  const owner = item.series_id || item.id;
  let relations = state.relations.filter((entry) => entry.owner_id === owner && entry.original_date === null);
  if (!item.series_id || page.relationScope !== "instance") return relations;
  relations = [...relations, ...state.relations.filter((entry) => entry.owner_id === owner && entry.original_date === item.original_date)];
  const override = state.relation_overrides?.find((entry) => entry.owner_id === owner && entry.original_date === item.original_date);
  if (!override) return relations;
  if (override.primary !== "inherit") {
    relations = relations.filter((entry) => entry.role !== "primary");
    if (override.primary !== "clear") relations.push({ owner_id: owner, original_date: item.original_date, note_id: override.primary, role: "primary" });
  }
  relations = relations.filter((entry) => entry.role === "primary" || !override.removed_reference_ids.includes(entry.note_id));
  for (const id of override.added_reference_ids) {
    if (!relations.some((entry) => entry.note_id === id)) relations.push({ owner_id: owner, original_date: item.original_date, note_id: id, role: "reference" });
  }
  return relations;
}

export function renderItemRelations(page: JellyPage): void {
  const { btn, tx } = page;
  const item = page.editingItem;
  const target = page.$("[data-jelly-item-relations]");
  if (!item) { target.innerHTML = ""; return; }
  const state = page.ws();
  const relations = effectiveRelations(page, item);
  const taskLinks = state.task_links.filter((entry) => entry.item_id === item.id && !relations.some((relation) => relation.note_id === entry.note_id));
  const hasOverride = state.relation_overrides?.some((entry) => entry.owner_id === item.series_id && entry.original_date === item.original_date);
  const noteOf = (id: string) => state.notes.find((n) => n.id === id);
  const scopes = item.series_id
    ? `<div class="jelly-choice-row">${btn("jelly.scope.only-this", `data-jelly-relation-scope="instance" aria-pressed="${page.relationScope === "instance"}"`)}${btn("jelly.scope.series", `data-jelly-relation-scope="series" aria-pressed="${page.relationScope === "series"}"`)}</div>` : "";
  const linked = relations.map((entry) => {
    const note = noteOf(entry.note_id);
    return note ? `<div><span class="jelly-muted">${tx(entry.role === "primary" ? "jelly.relation.primary-note" : "jelly.relation.reference")}</span>${btn(note.title || "jelly.note.untitled", `data-jelly-linked-note="${esc(note.id)}"`, "note")}${btn("jelly.relation.remove", `data-jelly-detach-note="${esc(note.id)}" data-role="${entry.role}"`, "x")}</div>` : "";
  }).join("");
  const fromTasks = taskLinks.map((entry) => {
    const note = noteOf(entry.note_id);
    return note ? btn(note.title || "jelly.note.untitled", `data-jelly-linked-note="${esc(note.id)}"`, "check") : "";
  }).join("");
  target.innerHTML = `<span class="jelly-muted">${tx("jelly.relation.link-note")}</span>${scopes}${linked}${fromTasks}${btn("jelly.relation.attach-existing", "data-jelly-attach-note", "link")}`
    + `${hasOverride && page.relationScope === "instance" ? btn("jelly.relation.reset", "data-jelly-reset-relations", "undo") : ""}${item.notes?.trim() ? btn("jelly.migrate.title", "data-jelly-migrate-notes", "note") : ""}`;
}

function fillItemForm(page: JellyPage, item: JellyOccurrence | null, date: string, task: LinkedTask | null): void {
  const series = item?.series_id ? page.ws().series.find((entry) => entry.id === item.series_id) : null;
  const set = (name: string, value: string) => { itemField(page, name).value = value; };
  set("title", task ? task.title : item?.title || "");
  set("notes", item?.notes || "");
  set("completion_description", item?.completion_description || "");
  set("start_date", item?.start_date || date);
  set("end_date", item?.end_date || date);
  set("start_time", clockLabel(item?.start_time));
  set("end_time", clockLabel(item?.end_time));
  set("until", series?.until || "");
  itemField(page, "pinned").checked = Boolean(item?.pinned);
  const { $, L } = page;
  $("[data-jelly-item-heading]").textContent = L(task ? "jelly.item.schedule-note-task" : item ? "jelly.item.edit" : "jelly.item.new");
  $("[data-jelly-delete-item]").hidden = !item;
  $("[data-jelly-complete-item]").hidden = !item;
  const completeLabel = L(item?.completed_at ? "jelly.item.reopen" : "jelly.item.complete");
  $("[data-jelly-complete-item] span").textContent = completeLabel;
  $("[data-jelly-complete-item]").setAttribute("aria-label", completeLabel);
  $("[data-jelly-series-scope]").hidden = !series;
  $("[data-jelly-recurrence]").hidden = Boolean(task) || (Boolean(item) && !series) || Boolean(series);
}

/** Opens the item dialog: a new item on `date`, an existing one, or a note's task block being given a place. */
export function openItem(page: JellyPage, item: JellyOccurrence | null, date = page.anchor, task: LinkedTask | null = null): void {
  page.editingItem = item;
  page.linkedTask = task;
  page.relationScope = "instance";
  page.relationRole = "reference";
  const series = item?.series_id ? page.ws().series.find((entry) => entry.id === item.series_id) : null;
  page.itemOptions = { kind: item?.kind || "task", category_id: item?.category_id || page.filterCategory || "uncategorized", priority: item?.priority || "none", weekdays: series ? [...series.weekdays] : [], scope: "onlyThis" };
  fillItemForm(page, item, date, task);
  page.$("[data-jelly-item-error]").hidden = true;
  paintItemChoices(page);
  renderItemRelations(page);
  page.$$("[data-jelly-item-copy]").forEach((node) => node.remove());
  if (item) page.$("[data-jelly-item-form] footer > div").insertAdjacentHTML("beforeend", page.btn("jelly.item.copy", "data-jelly-item-copy", "copy"));
  page.$<HTMLDialogElement>(ITEM_DIALOG).showModal();
  const title = itemField(page, "title");
  title.focus();
  if (!item) title.select();
  if (!item) return;
  // While an existing item is open, it is what this page shows: the workbench knows the record is open, and the Assistant reads that item.
  if (!page.itemContextBefore) page.itemContextBefore = { value: page.root.getAttribute("data-assistant-context") };
  page.root.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "io.molis.work.jelly", surface_title: "Jelly", object: { kind: "jelly_item", id: item.series_id || item.id, version: String(item.updated_at || ""), title: item.title || "" } }));
}

async function saveItem(page: JellyPage): Promise<void> {
  const { L } = page;
  const field = (name: string) => itemField(page, name);
  const options = page.itemOptions;
  const patch = {
    title: field("title").value.trim(), kind: options.kind, category_id: options.category_id, priority: options.priority, pinned: field("pinned").checked,
    start_date: field("start_date").value, end_date: field("end_date").value, start_time: parseClock(field("start_time").value), end_time: parseClock(field("end_time").value),
    notes: field("notes").value, completion_description: field("completion_description").value,
  };
  if (!patch.title) throw new Error(L("jelly.error.title-required"));
  if (patch.end_date < patch.start_date) throw new Error(L("jelly.error.end-before-start"));
  const editing = page.editingItem;
  const recurring = { ...patch, weekdays: options.weekdays, until: field("until").value || null };
  if (page.linkedTask) {
    await command(page, { type: "task.schedule", note_id: page.linkedTask.note_id, block_id: page.linkedTask.block_id,
      schedule: { start_date: patch.start_date, end_date: patch.end_date, start_time: patch.start_time, end_time: patch.end_time }, category_id: patch.category_id, priority: patch.priority });
  } else if (editing?.series_id) {
    await command(page, { type: "series.update", id: editing.series_id, original_date: editing.original_date, scope: options.scope, patch: options.scope === "thisAndFuture" ? recurring : patch });
  } else if (editing) await command(page, { type: "item.update", id: editing.id, patch });
  else if (options.weekdays.length) await command(page, { type: "series.create", series: recurring });
  else await command(page, { type: "item.create", item: patch });
  closeItemDialog(page);
  showNote(page, L("jelly.item.saved"));
  if (page.selected) syncTaskIndicators(page);
}

export async function completeItem(page: JellyPage, item: JellyOccurrence | undefined | null, description?: string): Promise<void> {
  if (!item) return;
  const extra = description === undefined ? {} : { completion_description: description };
  await command(page, item.series_id
    ? { type: "series.complete", id: item.series_id, original_date: item.original_date, completed: !item.completed_at, ...extra }
    : { type: "item.complete", id: item.id, completed: !item.completed_at, ...extra });
  syncTaskIndicators(page);
}

export async function deleteItem(page: JellyPage): Promise<void> {
  const item = page.editingItem;
  if (!item) return;
  const series = item.series_id && page.itemOptions.scope === "thisAndFuture";
  if (!await confirmDialog(page, "jelly.item.delete", page.L(series ? "jelly.item.delete-future" : "jelly.item.delete-confirm"), "jelly.action.delete")) return;
  await command(page, item.series_id ? { type: "series.delete", id: item.series_id, original_date: item.original_date, scope: page.itemOptions.scope } : { type: "item.delete", id: item.id });
  closeItemDialog(page);
  await loadList(page);
}

export function installItemDialog(page: JellyPage): void {
  page.$(ITEM_DIALOG).addEventListener("close", () => {
    const before = page.itemContextBefore;
    page.itemContextBefore = null;
    if (!before) return;
    if (before.value === null) page.root.removeAttribute("data-assistant-context"); else page.root.setAttribute("data-assistant-context", before.value);
  });
  page.$("[data-jelly-item-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submit) submit.disabled = true;
    try { await saveItem(page); } catch (error) {
      const failure = page.$("[data-jelly-item-error]");
      failure.textContent = messageOf(error);
      failure.hidden = false;
    } finally { if (submit) submit.disabled = false; }
  });
}
