import { renderBar } from "./bar.js";
import { isEditable, itemById, stageBusy } from "./model.js";
import { readFullText, paintPreview } from "./preview.js";
import { post } from "./request.js";
import { messageOf } from "./dom.js";
import type { ShelfPage, SnapshotAnswer } from "./types.js";

export function focusEditor(page: ShelfPage): void {
  const editor = page.preview.querySelector<HTMLTextAreaElement>("[data-shelf-editor]");
  if (!editor) return;
  editor.focus();
  const end = editor.value.length;
  editor.setSelectionRange(end, end);
}

/** Saves the copy being edited; saves go one after another, and a failure stays on the page with the typed text. */
export async function saveCopy(page: ShelfPage, id: string | undefined, text: string): Promise<void> {
  if (!id) return;
  const next = page.editWrites.catch(() => undefined).then(() => post<SnapshotAnswer>(page, "/items/" + encodeURIComponent(id) + "/edit", { text }));
  page.editWrites = next;
  try {
    const payload = await next;
    page.snapshot = payload.snapshot;
    page.loadVersion++;
    page.textVersion++;
    page.textCache.clear();
    page.textCache.set(id, text);
    if (page.selected?.item_id !== id) return;
    page.selected = itemById(page, id) || payload.item || page.selected;
    const status = page.preview.querySelector<HTMLElement>("[data-shelf-edit-status]");
    if (status) status.hidden = true;
  } catch (error) {
    if (!page.lifetime.alive) return;
    const status = page.preview.querySelector<HTMLElement>("[data-shelf-edit-status]");
    if (page.selected?.item_id === id && status) {
      status.hidden = false;
      status.dataset.mwState = "failed";
      status.textContent = page.L("shelf.edit.the-copy-was-not-saved") + " " + messageOf(error);
    }
    throw error;
  }
}

export async function flushEdit(page: ShelfPage): Promise<void> {
  if (page.editTimer) {
    page.lifetime.clearTimeout(page.editTimer);
    page.editTimer = 0;
  }
  if (!page.editing || !page.selected) return;
  const editor = page.preview.querySelector<HTMLTextAreaElement>("[data-shelf-editor]");
  if (editor) await saveCopy(page, page.selected.item_id, editor.value);
}

export async function stopEdit(page: ShelfPage): Promise<void> {
  await flushEdit(page);
  page.editing = false;
  paintPreview(page);
}

export async function startEdit(page: ShelfPage): Promise<void> {
  const item = page.selected;
  if (!item || !isEditable(item) || stageBusy(page) || page.editLoading) return;
  page.editLoading = true;
  const button = page.bench.querySelector<HTMLButtonElement>("[data-shelf-edit]");
  if (button) button.disabled = true;
  try {
    const text = await readFullText(page, item);
    if (page.selected?.item_id !== item.item_id || page.selClip) return;
    page.editDraft = text;
    page.editing = true;
    paintPreview(page);
  } catch (error) {
    if (!page.lifetime.alive) return;
    page.stickyHint = messageOf(error);
    renderBar(page, page.lastBarKind);
  } finally {
    page.editLoading = false;
    if (button) button.disabled = false;
  }
}
