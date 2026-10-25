import { admitFiles, admitFolderEntry, showAdmissionError } from "./admit.js";
import { renderBar } from "./bar.js";
import { closest, messageOf } from "./dom.js";
import { copySelection, shelveClipboard } from "./clips.js";
import { stopEdit } from "./edit.js";
import { isConcealed, matchesPanelKey, stageBusy } from "./model.js";
import { showProblem } from "./panes.js";
import { post } from "./request.js";
import { selectClip, selectItem } from "./select.js";
import { applySnapshot, load } from "./snapshot.js";
import type { ShelfPage, SnapshotAnswer } from "./types.js";

const INPUTS = "input, textarea, [contenteditable=true]";

const dragTypes = (event: Event): string[] => [...((event as DragEvent).dataTransfer?.types || [])];
const isExternalFileDrag = (event: Event): boolean => {
  const types = dragTypes(event);
  return !types.includes("application/x-molis-shelf") && types.includes("Files");
};
const insideShelfDrop = (event: Event): boolean => Boolean(closest(event, "[data-shelf], [data-plugin-section=shelf]"));

/** A drop of files or folders from outside: every entry goes to the shelf, and the failures are reported together. */
async function dropFiles(page: ShelfPage, event: Event): Promise<void> {
  const transfer = (event as DragEvent).dataTransfer;
  const entries = [...(transfer?.items || [])].map((item) => item.webkitGetAsEntry?.() ?? null).filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.some((entry) => entry.isDirectory)) {
    const files = [...(transfer?.files || [])];
    try { if (files.length) await admitFiles(page, files); } catch (error) { if (page.lifetime.alive) showAdmissionError(page, error); }
    return;
  }
  const failures: string[] = [];
  for (const entry of entries) {
    try {
      if (entry.isDirectory) await admitFolderEntry(page, entry as FileSystemDirectoryEntry);
      else if (entry.isFile) await admitFiles(page, [await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))]);
    } catch (error) {
      if (!page.lifetime.alive) return;
      failures.push(entry.name + "（" + messageOf(error) + "）");
    }
  }
  if (failures.length) showAdmissionError(page, new Error(failures.join(" · ")));
}

async function pasteIntoShelf(page: ShelfPage, event: Event): Promise<void> {
  const data = (event as ClipboardEvent).clipboardData;
  if (closest(event, INPUTS) || !data) return;
  const types = [...data.types];
  if (isConcealed(types)) return;
  event.preventDefault();
  try {
    if (data.files?.length) { await admitFiles(page, [...data.files]); return; }
    const text = (data.getData("text/plain") || data.getData("text/uri-list") || "").trim();
    if (!text || /^file:/i.test(text)) return;
    const recorded = await post<SnapshotAnswer>(page, "/clipboard", { text, types });
    page.snapshot = recorded.snapshot;
    const admitted = await post<SnapshotAnswer>(page, "/items", { text });
    applySnapshot(page, admitted.snapshot, admitted.item?.item_id);
  } catch (error) {
    if (page.lifetime.alive) showProblem(page, page.L("shelf.directory.could-not-read-the-shelf"), messageOf(error));
  }
}

/** ↑↓ walk the group you are standing in; focus never jumps to another group. */
async function walkList(page: ShelfPage, event: KeyboardEvent): Promise<void> {
  const step = event.key === "ArrowUp" ? -1 : 1;
  const query = (page.search?.value || "").trim().toLowerCase();
  const visible = <T extends { name?: string; title?: string }>(entries: readonly T[]): T[] => entries.filter((entry) => !query || String(entry.name || entry.title || "").toLowerCase().includes(query));
  if (page.selClip) {
    const clips = visible(page.snapshot.clipboard || []);
    const index = clips.findIndex((clip) => clip.clip_id === page.selClip?.clip_id);
    const next = clips[Math.min(Math.max(index + step, 0), clips.length - 1)];
    if (next) { event.preventDefault(); await selectClip(page, next.clip_id); }
    return;
  }
  const rows = visible(page.selected?.group === "result" ? (page.snapshot.results || []) : (page.snapshot.materials || []));
  const index = rows.findIndex((item) => item.item_id === page.selected?.item_id);
  const next = rows[index < 0 ? 0 : Math.min(Math.max(index + step, 0), rows.length - 1)];
  if (next) { event.preventDefault(); await selectItem(page, next.item_id); }
}

async function deleteSelection(page: ShelfPage): Promise<void> {
  try {
    if (page.clipSelection.size) {
      let next = page.snapshot;
      for (const id of [...page.clipSelection]) next = (await post<SnapshotAnswer>(page, "/clipboard/" + encodeURIComponent(id) + "/delete")).snapshot;
      page.selClip = null;
      page.clipSelection = new Set();
      applySnapshot(page, next);
    } else if (page.selected) {
      if (stageBusy(page)) return;
      applySnapshot(page, (await post<SnapshotAnswer>(page, "/items/" + encodeURIComponent(page.selected.item_id) + "/hide")).snapshot);
    }
  } catch (error) {
    if (page.lifetime.alive) showProblem(page, page.L("shelf.directory.could-not-read-the-shelf"), messageOf(error));
  }
}

async function keydown(page: ShelfPage, event: KeyboardEvent): Promise<void> {
  if (page.bench.hidden) return;
  if (matchesPanelKey(page, event, "hide") && page.editing) {
    event.preventDefault();
    await stopEdit(page);
    return;
  }
  if (closest(event, INPUTS)) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") { await walkList(page, event); return; }
  if (matchesPanelKey(page, event, "copy")) {
    event.preventDefault();
    try {
      await copySelection(page);
    } catch (error) {
      if (!page.lifetime.alive) return;
      page.stickyHint = messageOf(error);
      renderBar(page, page.lastBarKind);
    }
    return;
  }
  if (matchesPanelKey(page, event, "paste")) {
    // ⌘V still arrives as a paste event; anything else has to read the clipboard itself.
    if (event.code === "KeyV" && event.metaKey) return;
    event.preventDefault();
    await shelveClipboard(page).catch(() => undefined);
    return;
  }
  if (!matchesPanelKey(page, event, "delete")) return;
  event.preventDefault();
  await deleteSelection(page);
}

/** A file drag over the shelf marks its drop zones. */
function markDrop(page: ShelfPage, on: boolean): void {
  page.bench.classList.toggle("is-drop", on);
  page.stage.classList.toggle("is-drop", on);
  page.directory.classList.toggle("is-drop", on);
  document.querySelectorAll("[data-shelf-drop]").forEach((node) => node.setAttribute("aria-hidden", on ? "false" : "true"));
}

/** The page-level events that put things on the shelf or move around it: dropped files, paste, and the panel's keys. */
export function installDocument(page: ShelfPage): void {
  const { lifetime, bench } = page;
  // The page's drop-zone program says when a file drag is over Shelf's directory or page and when it has really left.
  window.molisDropZone?.("[data-shelf], [data-plugin-section=shelf]", (on) => markDrop(page, on), (types) => !bench.hidden && types.includes("Files") && !types.includes("application/x-molis-shelf"));
  const accepts = (event: Event): boolean => !bench.hidden && isExternalFileDrag(event) && insideShelfDrop(event);
  lifetime.listen(document, "dragenter", (event) => { if (accepts(event)) event.preventDefault(); });
  lifetime.listen(document, "dragover", (event) => {
    const transfer = (event as DragEvent).dataTransfer;
    if (!accepts(event) || !transfer) return;
    event.preventDefault();
    transfer.dropEffect = "copy";
  });
  lifetime.listen(document, "drop", async (event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    await dropFiles(page, event);
  });
  lifetime.listen(document, "paste", async (event) => {
    if (!bench.hidden) await pasteIntoShelf(page, event);
  });
  lifetime.listen(document, "keydown", (event) => keydown(page, event as KeyboardEvent));
}

/** Messages other pages leave for this one: open an item, a notice for the hint, a refresh. */
export function installPageEvents(page: ShelfPage): void {
  const { lifetime, bench } = page;
  if (typeof ResizeObserver === "function") {
    lifetime.observe(new ResizeObserver((entries) => {
      for (const entry of entries) page.stage.classList.toggle("is-narrow", entry.contentRect.width < 640);
    }), page.stage);
  }
  lifetime.listen(bench, "molis-work:select-item", async (event) => {
    const id = (event as CustomEvent<{ itemId?: string } | null>).detail?.itemId;
    if (!id || page.selected?.item_id === id || page.selClip?.clip_id === id) return;
    try {
      if (page.editing) await stopEdit(page);
      if (!lifetime.alive || stageBusy(page)) return;
      page.wantedId = id;
      await load(page, id);
      if (lifetime.alive) renderBar(page, page.lastBarKind);
    } catch (error) {
      if (!lifetime.alive) return;
      page.stickyHint = messageOf(error);
      renderBar(page, page.lastBarKind);
    }
  });
  lifetime.listen(window, "molis-shelf-notice", (event) => {
    const detail = (event as CustomEvent<{ message?: string } | null>).detail;
    page.stickyHint = detail && detail.message ? String(detail.message) : "";
    renderBar(page, page.lastBarKind);
  });
  lifetime.listen(window, "molis-shelf-refresh", async (event) => {
    if (page.editing || page.editLoading || stageBusy(page)) return;
    try {
      await load(page, (event as CustomEvent<{ item_ids?: string[] } | null>).detail?.item_ids?.at(-1));
    } catch (error) {
      if (!lifetime.alive) return;
      page.stickyHint = messageOf(error);
      renderBar(page, page.lastBarKind);
    }
  });
}

