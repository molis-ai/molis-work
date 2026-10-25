import { clipById, itemById, items } from "./model.js";
import { paintPreview, syncShelfStage } from "./preview.js";
import { paintLists, setMultiMode } from "./rows.js";
import { read } from "./request.js";
import type { ShelfPage, Snapshot } from "./types.js";

/** The person asked to see `selectId` (an item or a clip): selects it, and says so when it is gone. */
function followSelection(page: ShelfPage, selectId: string): void {
  page.editing = false;
  page.selected = itemById(page, selectId) || null;
  page.selClip = page.selected ? null : clipById(page, selectId) || null;
  page.clipSelection = new Set(page.selClip ? [page.selClip.clip_id] : []);
  if (page.selClip) page.clipExpanded = true;
  page.selection = page.selected ? new Set([page.selected.item_id]) : new Set();
  if (selectId === page.wantedId) {
    page.wantedId = null;
    if (!page.selected && !page.selClip) page.stickyHint = page.L("shelf.snapshot.this-material-is-no-longer");
  }
  page.pending = null;
  page.compare = false;
  page.compareSourceId = null;
}

/** Nothing new to follow: keep what is chosen, minus what the new snapshot no longer has. */
function keepSelection(page: ShelfPage): void {
  const now = items(page);
  if (page.selected) page.selected = itemById(page, page.selected.item_id) || null;
  page.selection = new Set([...page.selection].filter((id) => now.some((item) => item.item_id === id)));
  if (page.selected && !page.selection.has(page.selected.item_id)) page.selection.add(page.selected.item_id);
  if (page.selClip) page.selClip = clipById(page, page.selClip.clip_id) || null;
  page.clipSelection = new Set([...page.clipSelection].filter((id) => clipById(page, id)));
  if (page.selClip && !page.clipSelection.has(page.selClip.clip_id)) page.clipSelection.add(page.selClip.clip_id);
  if (!page.selected || page.selected.group !== "result") {
    page.compare = false;
    page.compareSourceId = null;
  }
}

export function applySnapshot(page: ShelfPage, next: Snapshot, selectId?: string): void {
  if (!page.lifetime.alive) return;
  page.loadVersion++;
  page.textVersion++;
  page.textCache.clear();
  page.snapshot = next;
  if (selectId) followSelection(page, selectId);
  else keepSelection(page);
  if (page.multiMode && !items(page).length) setMultiMode(page, false);
  paintLists(page);
  paintPreview(page);
  syncShelfStage(page);
}

export async function load(page: ShelfPage, selectId?: string, signal?: AbortSignal): Promise<void> {
  const version = ++page.loadVersion;
  const next = await read<Snapshot>(page, "/", page.L("shelf.directory.could-not-read-the-shelf"), signal);
  page.lifetime.assertCurrent(signal);
  if (version === page.loadVersion) applySnapshot(page, next, selectId || page.wantedId || undefined);
}
