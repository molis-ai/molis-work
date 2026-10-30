import { blockHtml, formatBar, newBlock, readDraft } from "./blocks.js";
import { openGeneric } from "./dialog.js";
import { renderBacklinks } from "./note-sync.js";
import { empty, keepListScroll, matches, run, setStatus } from "./page.js";
import { renderView } from "./view.js";
import { command } from "./workspace.js";
import { dateLabel, esc, statusOf } from "./util.js";
import type { JellyBlock, JellyNote, JellyPage } from "./types.js";

const draftKey = (id: string): string => `molis-jelly-draft:${id}`;
interface Recovery { id: string; kind: string; revision: number; patch: { title?: string; blocks?: JellyBlock[] }; saved_at: string }

export function readRecovery(id: string): Recovery | null {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || "null") as Recovery | null; } catch { /* 读不到草稿就当没有草稿 */ return null; }
}
function writeRecovery(page: JellyPage): void {
  if (!page.selected) return;
  try {
    localStorage.setItem(draftKey(page.selected.id), JSON.stringify({ id: page.selected.id, kind: page.selected.kind, revision: page.editorRevision, patch: readDraft(page), saved_at: new Date().toISOString() }));
  } catch { /* 存不了草稿不影响保存笔记本身 */ return; }
}
export function clearRecovery(id: string): void {
  try { localStorage.removeItem(draftKey(id)); } catch { /* 清不掉草稿也不影响别的 */ return; }
}

export const blockText = (note: JellyNote): string => note.blocks.map((block) => block.text).join("\n");
export const recordFor = (page: JellyPage, kind: string, id: string): JellyNote | undefined => (kind === "note" ? page.state?.notes.find((entry) => entry.id === id) : undefined);

export function renderRecords(page: JellyPage): void {
  const records = page.ws().notes.filter((record) => Boolean(record.archived_at) === page.archived && matches(page, record, blockText(record)))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updated_at.localeCompare(a.updated_at));
  const row = (record: JellyNote) => `<button type="button" class="jelly-row feed-stage-entry directory-list-row${page.selected?.id === record.id ? " is-selected" : ""}" data-jelly-record="${esc(record.id)}" data-jelly-id="${esc(record.id)}">`
    + `<div class="jelly-row-main"><strong>${esc(record.title || page.L("jelly.note.untitled"))}</strong><p>${esc(blockText(record).replace(/\s+/g, " ").slice(0, 180).replace(/[\uD800-\uDBFF]$/, ""))}</p></div>`
    + `<div class="jelly-row-meta">${record.pinned ? '<svg aria-hidden="true"><use href="#icon-pin"></use></svg>' : ""}${page.categoryDot(record.category_id)}<time>${esc(dateLabel(record.updated_at.slice(0, 10), true))}</time></div></button>`;
  keepListScroll(page, () => {
    page.content.innerHTML = records.length ? `<div class="jelly-rows">${records.map(row).join("")}</div>`
      : empty(page, page.query ? "jelly.note.no-match" : page.archived ? "jelly.note.archive-empty-title" : "jelly.note.empty-title", page.archived ? "jelly.note.archive-empty-text" : "jelly.note.empty-text", page.archived ? "" : "jelly.note.new");
  });
}

export const noteCategoryChoices = (page: JellyPage, record: JellyNote): string =>
  page.ws().categories.map((entry) => `<button type="button" class="mw-btn mw-btn--ghost" data-jelly-record-category="${esc(entry.id)}" aria-pressed="${record.category_id === entry.id}">${page.categoryDot(entry.id)}${page.catName(entry)}</button>`).join("");

export function openRecord(page: JellyPage, kind: "note", id: string): void {
  const record = recordFor(page, kind, id);
  if (!record) return;
  const { $, L } = page;
  page.selected = { kind, id };
  page.dirty = false;
  page.editorVersion = 0;
  page.editorRevision = record.revision || 0;
  page.focusedBlock = "";
  page.lastRange = null;
  page.root.dataset.expanded = "true";
  page.workspace.hidden = false;
  $("[data-jelly-editor-heading]").textContent = L("jelly.view.notes");
  page.root.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "io.molis.work.jelly", surface_title: "Jelly", object: { kind: "jelly_note", id, version: String(record.revision || 0), title: record.title || "" } }));
  const archiveLabel = L(record.archived_at ? "jelly.action.restore" : "jelly.action.archive");
  $("[data-jelly-archive] span").textContent = archiveLabel;
  $("[data-jelly-archive]").setAttribute("aria-label", archiveLabel);
  $("[data-jelly-editor-more]").hidden = false;
  $("[data-jelly-decompose]").hidden = Boolean(record.archived_at);
  $("[data-jelly-delete-note]").hidden = !record.archived_at;
  for (const selector of ["[data-jelly-pin]", "[data-jelly-export-note]", "[data-jelly-export-note-html]", "[data-jelly-import-note]"]) $(selector).hidden = false;
  const title = `<input class="jelly-document-title" data-jelly-record-title value="${esc(record.title)}" placeholder="${page.tx("jelly.note.untitled")}" aria-label="${page.tx("jelly.field.title")}"><div class="jelly-document-meta">${noteCategoryChoices(page, record)}</div>`;
  page.draftBlocks = structuredClone(record.blocks.length ? record.blocks : [newBlock()]);
  page.documentEl.innerHTML = `${title}${formatBar(page)}<div data-jelly-blocks>${page.draftBlocks.map((block, index) => blockHtml(page, block, index)).join("")}</div>${page.btn("jelly.block.add", "data-jelly-add-block", "plus")}<div class="jelly-note-backlinks" data-jelly-backlinks></div>`;
  renderBacklinks(page);
  if (readRecovery(id)) {
    page.documentEl.insertAdjacentHTML("afterbegin", `<div class="jelly-draft-recovery"><p>${page.tx("jelly.draft.found")}</p>${page.btn("jelly.draft.restore", "data-jelly-recover-draft", "undo")}${page.btn("jelly.draft.discard", "data-jelly-discard-draft", "x")}</div>`);
  }
  setStatus(page, "jelly.save.saved");
  renderRecords(page);
}

export function queueSave(page: JellyPage): void {
  page.dirty = true;
  page.editorVersion++;
  setStatus(page, "jelly.save.editing");
  clearTimeout(page.saveTimer);
  if (page.composing) return;
  writeRecovery(page);
  page.saveTimer = window.setTimeout(() => { void run(page, () => saveEditor(page)); }, 650);
}

export function saveEditor(page: JellyPage): Promise<unknown> {
  clearTimeout(page.saveTimer);
  if (!page.dirty || !page.selected || page.composing) return page.savePending;
  if (page.savingEditor) return page.savePending.then(() => (page.dirty ? saveEditor(page) : undefined));
  const selection = { ...page.selected };
  const version = page.editorVersion;
  const patch = readDraft(page);
  const noteRevision = page.editorRevision;
  setStatus(page, "jelly.save.saving");
  page.savingEditor = true;
  const saving = page.savePending.catch(() => undefined).then(async () => {
    await command(page, { type: "note.update", id: selection.id, expected_note_revision: noteRevision, patch });
    if (page.selected?.id !== selection.id) return;
    page.editorRevision = recordFor(page, selection.kind, selection.id)?.revision || 0;
    if (version === page.editorVersion) {
      page.dirty = false;
      clearRecovery(selection.id);
      setStatus(page, "jelly.save.saved");
    } else setStatus(page, "jelly.save.editing");
  }).catch((error: unknown) => {
    setStatus(page, "jelly.save.failed");
    if (statusOf(error) === 409 && page.selected?.id === selection.id) {
      const latest = recordFor(page, selection.kind, selection.id);
      openGeneric(page, "jelly.conflict.title", `<p class="jelly-muted">${page.tx("jelly.conflict.help")}</p>${page.btn("jelly.conflict.reload", "data-jelly-reload-editor")}`, "jelly.conflict.keep", async () => {
        page.editorRevision = latest?.revision || 0;
        await saveEditor(page);
      });
    }
    throw error;
  }).finally(() => { page.savingEditor = false; });
  page.savePending = saving;
  return saving;
}

export async function flushEditor(page: JellyPage): Promise<void> {
  clearTimeout(page.saveTimer);
  await page.savePending.catch(() => undefined);
  if (page.composing) throw new Error(page.L("jelly.error.composing"));
  if (page.dirty) await saveEditor(page);
}

export async function createNote(page: JellyPage): Promise<void> {
  const before = new Set(page.ws().notes.map((entry) => entry.id));
  await command(page, { type: "note.create", title: "", category_id: page.filterCategory || "uncategorized", blocks: [newBlock()] });
  page.archived = false;
  const record = page.ws().notes.find((entry) => !before.has(entry.id));
  if (!record) return;
  page.view = "notes";
  await renderView(page);
  openRecord(page, "note", record.id);
  page.$<HTMLInputElement>("[data-jelly-record-title]").focus();
}
