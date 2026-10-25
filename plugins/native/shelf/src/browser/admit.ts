import { renderBar } from "./bar.js";
import { bufferToBase64, messageOf } from "./dom.js";
import { expandShelfStage } from "./preview.js";
import { showProblem } from "./panes.js";
import { post } from "./request.js";
import { applySnapshot } from "./snapshot.js";
import type { Item, ShelfFailure, ShelfPage, SnapshotAnswer } from "./types.js";

const FOLDER_LIMIT = 32 * 1024 * 1024;

const readEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => new Promise((resolve, reject) => {
  const found: FileSystemEntry[] = [];
  const step = () => reader.readEntries((batch) => {
    if (!batch.length) { resolve(found); return; }
    found.push(...batch);
    step();
  }, reject);
  step();
});

const fileOf = (entry: FileSystemFileEntry): Promise<File> => new Promise((resolve, reject) => entry.file(resolve, reject));

interface Found { relative: string; file: File }

async function walkEntry(entry: FileSystemEntry, prefix: string, into: Found[]): Promise<void> {
  if (entry.isFile) {
    into.push({ relative: prefix + entry.name, file: await fileOf(entry as FileSystemFileEntry) });
    return;
  }
  if (!entry.isDirectory) return;
  for (const child of await readEntries((entry as FileSystemDirectoryEntry).createReader())) await walkEntry(child, prefix + entry.name + "/", into);
}

export async function admitFolderEntry(page: ShelfPage, entry: FileSystemDirectoryEntry): Promise<Item | null> {
  const found: Found[] = [];
  for (const child of await readEntries(entry.createReader())) await walkEntry(child, "", found);
  if (!found.length) return null;
  if (found.reduce((total, file) => total + file.file.size, 0) > FOLDER_LIMIT) throw new Error(page.L("shelf.admit.this-folder-is-over-32"));
  const entries = [];
  for (const file of found) entries.push({ relative: file.relative, bytes_base64: bufferToBase64(new Uint8Array(await file.file.arrayBuffer())), mime: file.file.type || "" });
  const payload = await post<SnapshotAnswer>(page, "/folders", { name: entry.name, entries });
  applySnapshot(page, payload.snapshot, payload.item?.item_id);
  return payload.item ?? null;
}

/** Every file is tried; a partial add says how many went in, which did not and why, and carries the others for one retry button. */
export async function admitFiles(page: ShelfPage, files: readonly File[]): Promise<void> {
  let lastId = "";
  let added = 0;
  const refused: { file: File; reason: string }[] = [];
  try {
    for (const file of files) {
      try {
        const payload = await post<SnapshotAnswer>(page, "/items", { filename: file.name, mime: file.type, bytes_base64: bufferToBase64(new Uint8Array(await file.arrayBuffer())) });
        lastId = payload.item?.item_id || lastId;
        page.snapshot = payload.snapshot;
        added += 1;
      } catch (error) {
        if (!page.lifetime.alive || files.length === 1) throw error;
        refused.push({ file, reason: messageOf(error) });
      }
    }
  } finally {
    if (lastId) applySnapshot(page, page.snapshot, lastId);
  }
  if (!refused.length) return;
  const list = refused.map((entry) => entry.file.name + "（" + entry.reason + "）").join("；");
  throw Object.assign(new Error(page.L("shelf.admit.done-added-count-could-not", { done: added, count: refused.length, list })), { retryFiles: refused.map((entry) => entry.file) });
}

export function showAdmissionError(page: ShelfPage, error: unknown): void {
  const message = messageOf(error);
  const retryFiles = (error as ShelfFailure).retryFiles;
  page.admitRetry = retryFiles ? { files: retryFiles, hint: message } : null;
  expandShelfStage(page, true);
  if (!page.selected) showProblem(page, page.L("shelf.admit.could-not-add-material"), message);
  page.stickyHint = message;
  renderBar(page, page.lastBarKind);
}
