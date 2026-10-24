import { applyInline, changeBlockKind, collectBlocks, focusBlock, hasTaskLink, insertBlock, newBlock, renderBlocks } from "./blocks.js";
import { openGeneric } from "./dialog.js";
import { openItem } from "./item.js";
import { archiveRecord, decompose, deleteNote, exportNote, pinNote, setRecordCategory } from "./note-actions.js";
import { renderBacklinks } from "./note-sync.js";
import { clearRecovery, flushEditor, openRecord, queueSave, readRecovery, recordFor } from "./notes.js";
import { run, showNote } from "./page.js";
import { civil } from "./util.js";
import { command } from "./workspace.js";
import type { JellyPage } from "./types.js";

type Click = (page: JellyPage, target: HTMLElement) => void;
const data = (target: HTMLElement, name: string): string => target.getAttribute(name) ?? "";
const dismissRecovery = (page: JellyPage): void => { page.root.querySelector(".jelly-draft-recovery")?.remove(); };

function recoverDraft(page: JellyPage): void {
  if (!page.selected) return;
  const recovery = readRecovery(page.selected.id);
  if (!recovery) return;
  page.$<HTMLInputElement>("[data-jelly-record-title]").value = recovery.patch.title || "";
  page.draftBlocks = recovery.patch.blocks || [newBlock()];
  renderBlocks(page);
  page.editorRevision = recovery.revision;
  dismissRecovery(page);
  queueSave(page);
}

function deleteBlock(page: JellyPage, id: string): void {
  if (hasTaskLink(page, id)) { showNote(page, page.L("jelly.block.unlink-first-delete"), true); return; }
  page.draftBlocks = collectBlocks(page);
  const index = page.draftBlocks.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  page.draftBlocks.splice(index, 1);
  if (!page.draftBlocks.length) page.draftBlocks = [newBlock()];
  renderBlocks(page);
  const next = page.draftBlocks[Math.max(0, index - 1)];
  if (next) focusBlock(page, next.id);
  queueSave(page);
}

function moveBlockUp(page: JellyPage, id: string): void {
  page.draftBlocks = collectBlocks(page);
  const index = page.draftBlocks.findIndex((entry) => entry.id === id);
  const block = page.draftBlocks[index];
  const above = page.draftBlocks[index - 1];
  if (index <= 0 || !block || !above) return;
  page.draftBlocks[index - 1] = block;
  page.draftBlocks[index] = above;
  renderBlocks(page);
  focusBlock(page, block.id);
  queueSave(page);
}

function scheduleBlock(page: JellyPage, id: string): void {
  void run(page, async () => {
    await flushEditor(page);
    const selected = page.selected;
    const note = selected ? recordFor(page, "note", selected.id) : undefined;
    const block = note?.blocks.find((entry) => entry.id === id);
    if (!note || !block) return;
    const state = page.ws();
    const link = state.task_links.find((entry) => entry.note_id === note.id && entry.block_id === id);
    const item = link ? state.items.find((entry) => entry.id === link.item_id) : undefined;
    if (item) openItem(page, { ...item, series_id: null, original_date: null });
    else openItem(page, null, civil(), { note_id: note.id, block_id: id, title: block.text });
  });
}

function openLinkedItem(page: JellyPage, id: string): void {
  const state = page.ws();
  const item = state.items.find((entry) => entry.id === id);
  if (item) { openItem(page, { ...item, series_id: null, original_date: null }); return; }
  const series = state.series.find((entry) => entry.id === id);
  if (series) openItem(page, { ...series, series_id: series.id, original_date: series.start_date });
}

function addLink(page: JellyPage): void {
  openGeneric(page, "jelly.format.add-link", `<input class="mw-input" type="url" data-jelly-link-url placeholder="https://" aria-label="${page.tx("jelly.format.link")}">`, "jelly.action.apply", async () => applyInline(page, "link", page.$<HTMLInputElement>("[data-jelly-link-url]").value));
}

const closeDialog = (page: JellyPage): void => page.$<HTMLDialogElement>("[data-jelly-dialog]").close();
const task = (fn: (page: JellyPage, target: HTMLElement) => unknown): Click => (page, target) => { void run(page, () => fn(page, target)); };

const CLICKS: readonly (readonly [string, Click])[] = [
  ["data-jelly-discard-draft", (page) => { if (page.selected) clearRecovery(page.selected.id); dismissRecovery(page); }],
  ["data-jelly-recover-draft", (page) => recoverDraft(page)],
  ["data-jelly-reload-editor", (page) => {
    const current = page.selected;
    page.dirty = false;
    page.savePending = Promise.resolve();
    closeDialog(page);
    if (current) openRecord(page, current.kind, current.id);
  }],
  ["data-jelly-archive", task((page) => archiveRecord(page))],
  ["data-jelly-pin", task((page) => pinNote(page))],
  ["data-jelly-export-note", task((page) => exportNote(page, "markdown"))],
  ["data-jelly-export-note-html", task((page) => exportNote(page, "html"))],
  ["data-jelly-import-note", (page) => page.$("[data-jelly-note-file]").click()],
  ["data-jelly-delete-note", task((page) => deleteNote(page))],
  ["data-jelly-record-category", task((page, target) => setRecordCategory(page, data(target, "data-jelly-record-category")))],
  ["data-jelly-format", (page, target) => changeBlockKind(page, data(target, "data-jelly-format") as Parameters<typeof changeBlockKind>[1])],
  ["data-jelly-choose-format", (page, target) => { closeDialog(page); changeBlockKind(page, data(target, "data-jelly-choose-format") as Parameters<typeof changeBlockKind>[1]); }],
  ["data-jelly-inline", (page, target) => { if (data(target, "data-jelly-inline") === "link") addLink(page); else applyInline(page, data(target, "data-jelly-inline")); }],
  ["data-jelly-add-block", (page) => insertBlock(page, page.draftBlocks.at(-1)?.id)],
  ["data-jelly-block-delete", (page, target) => deleteBlock(page, data(target, "data-jelly-block-delete"))],
  ["data-jelly-block-up", (page, target) => moveBlockUp(page, data(target, "data-jelly-block-up"))],
  ["data-jelly-schedule-block", (page, target) => scheduleBlock(page, data(target, "data-jelly-schedule-block"))],
  ["data-jelly-open-linked-item", (page, target) => openLinkedItem(page, data(target, "data-jelly-open-linked-item"))],
  ["data-jelly-unlink-task", task(async (page, target) => {
    await flushEditor(page);
    if (!page.selected) return;
    await command(page, { type: "task.unlink", note_id: page.selected.id, block_id: data(target, "data-jelly-unlink-task") });
    renderBacklinks(page);
  })],
  ["data-jelly-decompose", task((page) => decompose(page))],
];

/** The note editor's buttons; the first attribute that matches answers the click. */
export function handleContentClick(page: JellyPage, target: HTMLElement): void {
  CLICKS.find(([attr]) => target.hasAttribute(attr))?.[1](page, target);
}
