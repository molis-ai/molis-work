import { admitFiles, showAdmissionError } from "./admit.js";
import { renderBar } from "./bar.js";
import { closest, messageOf } from "./dom.js";
import { copyShelfItem, joinClips, makeClipCurrent, shelveClipboard } from "./clips.js";
import { hasFile, itemById, items } from "./model.js";
import { showProblem } from "./panes.js";
import { download } from "./preview.js";
import { paintLists, setMultiMode } from "./rows.js";
import { post } from "./request.js";
import { selectChild, selectClip, selectItem } from "./select.js";
import { applySnapshot } from "./snapshot.js";
import type { ShelfPage, SnapshotAnswer } from "./types.js";

/** The directory's own menu and list controls; true when the click was one of them. */
async function controlClick(page: ShelfPage, event: Event, sideMenu: HTMLElement | null): Promise<boolean> {
  const hideMenu = () => { if (sideMenu) sideMenu.hidden = true; };
  if (closest(event, "[data-shelf-side-more]")) {
    event.preventDefault();
    if (sideMenu) sideMenu.hidden = !sideMenu.hidden;
    return true;
  }
  if (closest(event, "[data-shelf-pick]")) {
    event.preventDefault();
    hideMenu();
    page.fileInput?.click();
    return true;
  }
  if (closest(event, "[data-shelf-paste-clip]")) {
    event.preventDefault();
    hideMenu();
    await shelveClipboard(page).catch(() => undefined);
    return true;
  }
  if (closest(event, "[data-shelf-multi]")) {
    event.preventDefault();
    hideMenu();
    setMultiMode(page, !page.multiMode);
    return true;
  }
  if (closest(event, "[data-shelf-sample]")) {
    event.preventDefault();
    hideMenu();
    await post<SnapshotAnswer>(page, "/sample").then((payload) => applySnapshot(page, payload.snapshot, payload.item?.item_id), () => undefined);
    return true;
  }
  if (closest(event, "[data-shelf-clip-more]")) {
    event.preventDefault();
    page.clipExpanded = !page.clipExpanded;
    paintLists(page);
    return true;
  }
  return false;
}

/** One of a row's own buttons (hide, delete, join, copy). */
async function rowOperation(page: ShelfPage, event: Event, action: HTMLElement, row: HTMLElement): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  if (action.getAttribute("aria-disabled") === "true") return;
  const { shelfItem, shelfClip } = row.dataset;
  const id = shelfItem || shelfClip || "";
  const what = action.dataset.shelfRowAction;
  const change = async (path: string) => applySnapshot(page, (await post<SnapshotAnswer>(page, path)).snapshot);
  try {
    if (what === "hide" && shelfItem) await change("/items/" + encodeURIComponent(id) + "/hide");
    else if (what === "delete" && shelfItem) await change("/items/" + encodeURIComponent(id) + "/delete");
    else if (what === "delete" && shelfClip) await change("/clipboard/" + encodeURIComponent(id) + "/delete");
    else if (what === "join" && shelfClip) await joinClips(page, page.clipSelection.has(id) && page.clipSelection.size > 1 ? [...page.clipSelection] : [id]);
    else if (what === "copy") await (shelfItem ? copyShelfItem(page, id) : makeClipCurrent(page, id));
  } catch (error) {
    if (page.lifetime.alive) showProblem(page, page.L("shelf.directory.could-not-read-the-shelf"), messageOf(error));
  }
}

async function directoryClick(page: ShelfPage, event: Event): Promise<void> {
  const sideMenu = page.directory.querySelector<HTMLElement>("[data-shelf-side-menu]");
  if (sideMenu && !closest(event, "[data-shelf-side-more], [data-shelf-side-menu]")) sideMenu.hidden = true;
  if (await controlClick(page, event, sideMenu)) return;
  const action = closest(event, "[data-shelf-row-action]");
  const row = closest(event, "[data-shelf-item], [data-shelf-clip]");
  if (action && row) { await rowOperation(page, event, action, row); return; }
  if (row?.dataset.shelfChild) { await selectChild(page, row.dataset.shelfItem ?? "", row.dataset.shelfChild); return; }
  const mouse = event as MouseEvent;
  if (mouse.detail > 1) return;
  const command = mouse.metaKey || mouse.ctrlKey;
  if (row?.dataset.shelfItem) {
    const item = itemById(page, row.dataset.shelfItem);
    if (item?.kind === "folder" && closest(event, ".shelf-glyph")) {
      if (page.openFolders.has(item.item_id)) page.openFolders.delete(item.item_id);
      else page.openFolders.add(item.item_id);
      paintLists(page);
      return;
    }
    await selectItem(page, row.dataset.shelfItem, command);
  }
  if (row?.dataset.shelfClip) await selectClip(page, row.dataset.shelfClip, command);
}

/** Double-clicking an item opens its file; the browser previews it in the side panel's file tab, never a new tab. */
function openItem(page: ShelfPage, id: string): void {
  const item = itemById(page, id);
  if (!item || !hasFile(item)) return;
  const opened = page.host.nativeFiles?.open(item.relative_path);
  if (opened) { opened.catch((error) => showAdmissionError(page, error)); return; }
  const detail = { tab: "files", target: { subject: { kind: "shelf_item", id: item.item_id }, title: item.name }, focus: true };
  if (!document.dispatchEvent(new CustomEvent("molis:side-open", { detail, cancelable: true }))) return;
  // A frame asks its page; with no page around it, the copy downloads.
  if (window.parent !== window) window.parent.postMessage({ type: "molis:side-open", ...detail }, location.origin);
  else download(page, item);
}

async function directoryDoubleClick(page: ShelfPage, event: Event): Promise<void> {
  const itemRow = closest(event, "[data-shelf-item]");
  if (itemRow?.dataset.shelfItem && !closest(event, "[data-shelf-row-action]")) {
    event.preventDefault();
    openItem(page, itemRow.dataset.shelfItem);
    return;
  }
  const row = closest(event, "[data-shelf-clip]");
  if (!row?.dataset.shelfClip || closest(event, "[data-shelf-row-action]")) return;
  event.preventDefault();
  try {
    await makeClipCurrent(page, row.dataset.shelfClip);
  } catch (error) {
    if (page.lifetime.alive) showProblem(page, page.L("shelf.directory.could-not-read-the-shelf"), messageOf(error));
  }
}

/** A drag out of the list: on the desktop a real AppKit drag, so Finder and upload fields take the file itself. */
function directoryDragStart(page: ShelfPage, event: Event): void {
  const drag = event as DragEvent;
  const row = closest(event, "[data-shelf-item]");
  if (!row || !drag.dataTransfer) return;
  const id = row.dataset.shelfItem || "";
  const dragged = page.selection.has(id) && page.selection.size > 1 ? items(page).filter((item) => page.selection.has(item.item_id)) : items(page).filter((item) => item.item_id === id);
  const takeaway = dragged.filter(hasFile);
  if (!takeaway.length) {
    // A failed run has nothing to hand over; springing back beats a broken drop.
    event.preventDefault();
    return;
  }
  const native = page.host.nativeFiles?.drag(takeaway.map((item) => item.relative_path), takeaway.map((item) => item.item_id));
  if (native) {
    event.preventDefault();
    native.catch((error) => { page.stickyHint = messageOf(error); renderBar(page, page.lastBarKind); });
    return;
  }
  drag.dataTransfer.setData("application/x-molis-shelf", id || "1");
  drag.dataTransfer.effectAllowed = "copy";
}

async function findLocalFiles(page: ShelfPage): Promise<void> {
  const native = page.host.nativeFiles;
  if (!native?.pick) return;
  try {
    const files = await native.pick((page.search?.value || "").trim());
    if (!page.lifetime.alive || !files.length) return;
    await admitFiles(page, files);
    if (page.search) page.search.value = "";
    paintLists(page);
  } catch (error) {
    if (page.lifetime.alive) showAdmissionError(page, error);
  }
}

export function installDirectory(page: ShelfPage): void {
  const { lifetime, directory, search } = page;
  lifetime.listen(directory, "click", (event) => directoryClick(page, event));
  lifetime.listen(directory, "dblclick", (event) => directoryDoubleClick(page, event));
  lifetime.listen(directory, "dragstart", (event) => directoryDragStart(page, event));
  lifetime.listen(search, "input", () => {
    paintLists(page);
    if (page.findTimer) lifetime.clearTimeout(page.findTimer);
    page.findTimer = lifetime.timeout(() => { void findLocalFiles(page); }, 220);
  });
}
