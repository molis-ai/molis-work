import { renderBar } from "./bar.js";
import { messageOf } from "./dom.js";
import { flushEdit } from "./edit.js";
import { batch, clipById, hasFile, itemById } from "./model.js";
import { download } from "./preview.js";
import { post } from "./request.js";
import { applySnapshot } from "./snapshot.js";
import type { Item, ShelfPage, SnapshotAnswer } from "./types.js";

/** A line in the bar's hint; with `ms` it goes away by itself. */
export function say(page: ShelfPage, text: string, ms?: number): void {
  page.stickyHint = text;
  renderBar(page, page.lastBarKind);
  if (!ms) return;
  page.lifetime.timeout(() => {
    if (page.stickyHint !== text) return;
    page.stickyHint = "";
    renderBar(page, page.lastBarKind);
  }, ms);
}

export async function copyClip(page: ShelfPage, text: string): Promise<boolean> {
  const ok = await page.host.copyText(text).then(() => true, () => false);
  say(page, ok ? page.L("shelf.clips.copied") : page.L("shelf.clips.could-not-copy"), ok ? 2500 : 4000);
  return ok;
}

export async function makeClipCurrent(page: ShelfPage, clipId: string): Promise<void> {
  const clip = clipById(page, clipId);
  if (!clip || !await copyClip(page, clip.body)) return;
  const payload = await post<SnapshotAnswer>(page, "/clipboard", { text: clip.body });
  page.selected = null;
  page.selClip = payload.clip || (payload.snapshot.clipboard || []).find((item) => item.clip_id === clipId) || clip;
  page.clipSelection = new Set([page.selClip.clip_id]);
  applySnapshot(page, payload.snapshot);
}

export async function copyFiles(page: ShelfPage, picked: readonly Item[]): Promise<void> {
  await flushEdit(page);
  const files = picked.filter(hasFile);
  const native = page.host.nativeFiles?.copy(files.map((item) => item.relative_path));
  if (native) {
    await native;
    say(page, page.L("shelf.clips.copied"), 2500);
    return;
  }
  // A browser cannot place file URLs on the macOS pasteboard.
  for (const item of files) download(page, item);
  say(page, page.L("shelf.clips.copy-downloaded-the-desktop-app"));
}

export async function copyShelfItem(page: ShelfPage, id: string): Promise<void> {
  const item = itemById(page, id);
  if (item) await copyFiles(page, [item]);
}

/** Puts clips on the shelf as materials, one after another; a partial add says how many went in. */
export async function joinClips(page: ShelfPage, ids: readonly string[]): Promise<void> {
  let lastId = "";
  let done = 0;
  let next = page.snapshot;
  try {
    for (const id of ids) {
      const payload = await post<SnapshotAnswer>(page, "/clipboard/" + encodeURIComponent(id) + "/material");
      lastId = payload.item?.item_id || lastId;
      next = payload.snapshot;
      done += 1;
    }
  } catch (error) {
    if (done) (error as Error).message = page.L("shelf.clips.done-added-the-rest-could", { done, reason: messageOf(error) });
    throw error;
  } finally {
    if (done) {
      page.selClip = null;
      page.clipSelection = new Set();
      applySnapshot(page, next, lastId);
    }
  }
}

/** Takes the text on the clipboard onto the shelf, as a clip and as a material. */
export async function shelveClipboard(page: ShelfPage): Promise<void> {
  const pasted = (await navigator.clipboard.readText().catch(() => "")).trim();
  if (!pasted || /^file:/i.test(pasted)) return;
  const recorded = await post<SnapshotAnswer>(page, "/clipboard", { text: pasted });
  page.snapshot = recorded.snapshot;
  const admitted = await post<SnapshotAnswer>(page, "/items", { text: pasted });
  applySnapshot(page, admitted.snapshot, admitted.item?.item_id);
}

export async function copySelection(page: ShelfPage): Promise<void> {
  if (page.selClip) {
    await copyClip(page, page.selClip.body);
    return;
  }
  const picked = batch(page).filter(hasFile);
  if (picked.length) await copyFiles(page, picked);
}
