import { flushEdit } from "./edit.js";
import { clipById, itemById, items } from "./model.js";
import { paintPreview, syncShelfStage } from "./preview.js";
import { paintLists } from "./rows.js";
import type { ShelfPage } from "./types.js";

function repaint(page: ShelfPage): void {
  paintLists(page);
  paintPreview(page);
  syncShelfStage(page);
}

export async function selectChild(page: ShelfPage, itemId: string, relative: string): Promise<void> {
  await flushEdit(page);
  page.editing = false;
  page.selClip = null;
  const folder = itemById(page, itemId);
  if (!folder) return;
  page.selected = folder;
  page.selection = new Set([itemId]);
  page.selectedChild = { item_id: itemId, relative };
  page.pending = null;
  page.compare = false;
  repaint(page);
}

export async function selectItem(page: ShelfPage, id: string, command = false): Promise<void> {
  page.composingAction = false;
  page.stickyHint = "";
  await flushEdit(page);
  page.editing = false;
  page.selClip = null;
  page.clipSelection = new Set();
  const item = itemById(page, id);
  if (!item) return;
  page.selectedChild = null;
  if ((command || page.multiMode) && page.selected && page.selected.group === item.group) {
    if (page.selection.has(id) && page.selection.size > 1) {
      page.selection.delete(id);
      if (page.selected.item_id === id) page.selected = items(page).find((entry) => page.selection.has(entry.item_id)) || null;
    } else {
      page.selection.add(id);
      page.selected = item;
    }
  } else {
    page.selected = item;
    page.selection = new Set([id]);
  }
  page.pending = null;
  page.compare = false;
  page.compareSourceId = null;
  repaint(page);
}

export async function selectClip(page: ShelfPage, clipId: string, command = false): Promise<void> {
  page.composingAction = false;
  await flushEdit(page);
  page.editing = false;
  page.selected = null;
  page.selection = new Set();
  page.pending = null;
  page.compare = false;
  page.compareSourceId = null;
  if (command) {
    if (page.clipSelection.has(clipId)) page.clipSelection.delete(clipId);
    else page.clipSelection.add(clipId);
    page.selClip = clipById(page, clipId) || page.selClip;
    if (page.selClip && !page.clipSelection.has(page.selClip.clip_id)) {
      page.selClip = (page.snapshot.clipboard || []).find((clip) => page.clipSelection.has(clip.clip_id)) || null;
    }
    if (!page.clipSelection.size) page.selClip = null;
  } else {
    page.selClip = clipById(page, clipId) || null;
    page.clipSelection = page.selClip ? new Set([page.selClip.clip_id]) : new Set();
  }
  repaint(page);
}
