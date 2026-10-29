import { rangesForSelection } from "./blocks.js";
import { openGeneric } from "./dialog.js";
import { extractMaterial } from "./material.js";
import { flushEditor, openRecord, recordFor } from "./notes.js";
import { syncTaskIndicators } from "./note-sync.js";
import { closeWorkspace, download, run, showNote } from "./page.js";
import { openPlan } from "./plan.js";
import { API } from "./request.js";
import { civil, esc } from "./util.js";
import { command, loadList } from "./workspace.js";
import type { JellyPage, Preview } from "./types.js";

export async function archiveRecord(page: JellyPage): Promise<void> {
  if (!page.selected) return;
  await flushEditor(page);
  const record = recordFor(page, page.selected.kind, page.selected.id);
  await command(page, { type: record?.archived_at ? "note.restore" : "note.archive", id: page.selected.id });
  closeWorkspace(page);
  await loadList(page);
}

export async function deleteNote(page: JellyPage): Promise<void> {
  if (page.selected?.kind !== "note") return;
  await flushEditor(page);
  const id = page.selected.id;
  const { preview } = await page.request<{ preview: Preview }>("POST", `${API}/preview`, { kind: "delete-note", id });
  openGeneric(page, "jelly.note.delete-title", `<p class="jelly-muted">${page.tx("jelly.note.delete-help")}</p><pre class="jelly-muted">${esc(JSON.stringify(preview.counts, null, 2))}</pre>`, "jelly.note.delete-confirm", async () => {
    await command(page, { type: "note.delete", id, confirmation_token: preview.confirmation_token });
    closeWorkspace(page);
    await loadList(page);
  });
}

export async function pinNote(page: JellyPage): Promise<void> {
  if (page.selected?.kind !== "note") return;
  await flushEditor(page);
  const note = page.selected ? recordFor(page, "note", page.selected.id) : undefined;
  if (!note) return;
  await command(page, { type: "note.pin", id: note.id, pinned: !note.pinned });
  page.editorRevision = recordFor(page, "note", note.id)?.revision ?? 0;
  page.$("[data-jelly-editor-menu]").hidden = true;
}

export async function exportNote(page: JellyPage, format: "markdown" | "html"): Promise<void> {
  await flushEditor(page);
  if (!page.selected) return;
  const result = await page.request<{ filename: string; content: string; mime: string }>("GET", `${API}/notes/${encodeURIComponent(page.selected.id)}/export?format=${format}`);
  await download(page, result.filename, result.content, result.mime);
}

export async function setRecordCategory(page: JellyPage, categoryId: string): Promise<void> {
  await flushEditor(page);
  const selected = page.selected;
  if (!selected) return;
  await command(page, { type: "note.update", id: selected.id, patch: { category_id: categoryId } });
  page.editorRevision = recordFor(page, selected.kind, selected.id)?.revision ?? 0;
  const record = recordFor(page, selected.kind, selected.id);
  if (record) page.$(".jelly-document-meta").innerHTML = page.ws().categories
    .map((entry) => `<button type="button" class="mw-btn mw-btn--ghost" data-jelly-record-category="${esc(entry.id)}" aria-pressed="${record.category_id === entry.id}">${page.categoryDot(entry.id)}${page.catName(entry)}</button>`).join("");
}

/** The selected text, as the blocks it touches and the words in it, when the person has something selected in the note. */
function capturedSelection(page: JellyPage): { block_ids: string[]; text: string } | null {
  const last = page.lastRange;
  if (page.selected?.kind !== "note" || !last || last.collapsed || !page.documentEl.contains(last.commonAncestorContainer)) return null;
  const ranges = rangesForSelection(page, last);
  const text = ranges.map((entry) => entry.range.toString()).join("\n");
  const blockIds = ranges.map((entry) => entry.node.dataset.jellyBlockText ?? "");
  return blockIds.length && text.trim() ? { block_ids: blockIds, text } : null;
}

export async function decompose(page: JellyPage): Promise<void> {
  if (!page.selected) return;
  const captured = capturedSelection(page);
  await flushEditor(page);
  const source = { ...page.selected };
  const choice = captured
    ? `<label class="jelly-check"><input type="checkbox" class="mw-check" data-jelly-plan-use-selection checked>${page.tx("jelly.plan.selection-only")}</label><pre class="jelly-import-preview">${esc(captured.text)}</pre>` : "";
  const html = `<p class="jelly-muted">${page.tx("jelly.plan.preview-help")}</p>${choice}`
    + `<label class="jelly-field">${page.tx("jelly.plan.instructions")}<textarea class="mw-textarea" rows="3" data-jelly-plan-instructions placeholder="${page.tx("jelly.plan.instructions-example")}"></textarea></label>`
    + `<label class="jelly-check" style="margin-top:12px"><input type="checkbox" class="mw-check" data-jelly-plan-manual>${page.tx("jelly.plan.manual")}</label>`;
  openGeneric(page, "jelly.plan.decompose", html, "jelly.plan.generate", async () => {
    const now = new Date();
    const useSelection = page.root.querySelector<HTMLInputElement>("[data-jelly-plan-use-selection]")?.checked;
    const result = await extractMaterial(page, { kind: "decompose", source_type: source.kind, source_id: source.id, instructions: page.$<HTMLTextAreaElement>("[data-jelly-plan-instructions]").value,
      manual: page.$<HTMLInputElement>("[data-jelly-plan-manual]").checked, ...(captured && useSelection ? { selection: captured } : {}), today: civil(), start_time: now.getHours() * 60 + now.getMinutes() });
    if (!result) return true;
    setTimeout(() => openPlan(page, result.plan, source), 0);
    return true;
  });
}

/** A task block ticked in the note: the note is saved first, and a refused answer puts the box back. */
export function completeTaskBlock(page: JellyPage, checkbox: HTMLInputElement): void {
  const completed = checkbox.checked;
  void run(page, async () => {
    await flushEditor(page);
    const selected = page.selected;
    if (!selected) return;
    try {
      await command(page, { type: "task.complete", note_id: selected.id, block_id: checkbox.dataset.jellyTaskCheck ?? "", completed });
      page.editorRevision = recordFor(page, "note", selected.id)?.revision ?? 0;
      syncTaskIndicators(page);
    } catch (error) {
      checkbox.checked = !completed;
      throw error;
    }
  });
}

/** A file chosen for "import into this note": shown with a preview, then appended or replacing the content. */
export async function importNoteFile(page: JellyPage, file: File | undefined): Promise<void> {
  if (!file || page.selected?.kind !== "note") return;
  await flushEditor(page);
  const id = page.selected.id;
  const source = await file.text();
  const format = /\.html?$/i.test(file.name) ? "html" : "markdown";
  openGeneric(page, "jelly.note.import-title", `<p class="jelly-muted">${esc(file.name)} · ${[...source].length} ${page.tx("jelly.note.import-chars")}</p><label class="jelly-check"><input class="mw-check" type="checkbox" data-jelly-import-replace>${page.tx("jelly.note.import-replace")}</label><pre class="jelly-import-preview">${esc(source.slice(0, 8000))}</pre>`, "jelly.import.confirm", async () => {
    await command(page, { type: "note.import", id, source, format, mode: page.$<HTMLInputElement>("[data-jelly-import-replace]").checked ? "replace" : "append", expected_note_revision: page.editorRevision });
    openRecord(page, "note", id);
    showNote(page, page.L("jelly.note.imported"));
  });
}
