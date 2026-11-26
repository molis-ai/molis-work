import { WORKSPACE_SKIPPED_FOLDERS } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ArtifactImportResult as Imported } from "@molis-ai/molis-work-module-artifacts";
import type { DropMark } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { el, request } from "./common.js";

const uiText = globalThis.t;

const MAX_FILES = 200;
const MAX_DROPPED_FILES = 2_000;
const MAX_DROPPED_DEPTH = 16;
/** What one request carries inline; a bigger file that is not text goes as its raw body (`/import/original`), any size. */
const MAX_BYTES = 6 * 1024 * 1024;
const TEXT_FILE = /\.(md|markdown|txt|html|htm)$/iu;
/** Files the Host recognizes while the import waits (a scanned PDF too), which take seconds to minutes. */
const SLOW_FILE = /\.(pdf|png|jpe?g|webp|heic|heif|tiff?|bmp|gif)$/iu;
const skipped = new Set<string>(WORKSPACE_SKIPPED_FOLDERS);
interface Picked { file: File; path: string }
interface ImportSources { offered: Array<{ source: string; service_id: string; title: string }>; connections: Array<{ connection_id: string; service_id: string; display_name: string; state: string }> }

/** A folder's files keep their path inside it; hidden ones and build or dependency folders are left out, as the workspace listing does. */
const wanted = (path: string) => !path.split("/").some((segment, index, all) => segment.startsWith(".") || (index < all.length - 1 && skipped.has(segment)));

async function dropped(items: DataTransferItemList): Promise<{ items: Picked[]; truncated: boolean }> {
  const out: Picked[] = [];
  let truncated = false;
  const walk = async (entry: FileSystemEntry, prefix: string, depth: number): Promise<void> => {
    if (out.length >= MAX_DROPPED_FILES) {
      truncated = true;
      return;
    }
    if (!wanted(prefix + entry.name + (entry.isDirectory ? "/" : ""))) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      if (out.length >= MAX_DROPPED_FILES) {
        truncated = true;
        return;
      }
      out.push({ file, path: prefix + file.name });
      return;
    }
    if (depth >= MAX_DROPPED_DEPTH) {
      truncated = true;
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) {
        if (out.length >= MAX_DROPPED_FILES) {
          truncated = true;
          return;
        }
        await walk(child, prefix + entry.name + "/", depth + 1);
      }
    }
  };
  for (const entry of [...items].map(item => item.webkitGetAsEntry()).filter((item): item is FileSystemEntry => !!item)) {
    if (out.length >= MAX_DROPPED_FILES) {
      truncated = true;
      break;
    }
    await walk(entry, "", 0);
  }
  return { items: out, truncated };
}

async function bodyOf(file: File): Promise<Record<string, unknown>> {
  const bytes = await file.arrayBuffer();
  if (TEXT_FILE.test(file.name)) {
    try { return { source: "file", filename: file.name, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }; }
    catch { throw new Error(uiText.text("workbench.import.file-cannot-be-read-save-text-files-utf")); }
  }
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index += 0x8000) binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  return { source: "file", filename: file.name, original_file: { filename: file.name, mime: file.type || "application/octet-stream", data_base64: btoa(binary) } };
}

/** A file too big to carry inline that the 成果库 keeps as its original: its raw bytes, its name in a header. */
const rawOriginal = (file: File) => !TEXT_FILE.test(file.name) && file.size > MAX_BYTES;
const originalRoute = (base: string) => base + "/import/original";
const originalHeaders = (file: File): Record<string, string> => ({ "x-molis-work-filename": encodeURIComponent(file.name) });

/** A row's note, cut to one line; the whole of it on hover. */
const note = (mark: HTMLElement | null | undefined, text: string) => { if (mark) { mark.textContent = text; mark.title = text; } };
const importWarning = (saved: Imported) => saved.warnings[0] === undefined ? undefined : globalThis.say.text(saved.warnings[0]);
const FAILED = () => uiText.text("workbench.import.import-failed-check-file-link-document-permissions-connector");
type ImportBatch = { kind: "files" | "online"; phase: "running" | "stopping" };
const stopping = (batch: ImportBatch): boolean => batch.phase === "stopping";

/** Browser file/folder inputs and both drop surfaces feed the import owner's current selection. */
function bindFileSelection(root: HTMLElement, dialog: HTMLDialogElement, take: (items: Picked[], truncated?: boolean) => void, open: () => void): void {
  const $ = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  for (const selector of ["[data-knowledge-import-pick]", "[data-knowledge-import-folder]"]) {
    const input = $<HTMLInputElement>(selector);
    input.addEventListener("change", () => {
      take([...input.files ?? []].map(file => ({ file, path: file.webkitRelativePath || file.name })));
      input.value = "";
    });
  }
  // Files dropped on the dialog's area, or on the side panel's list (which opens the dialog with them).
  const drop = $("[data-knowledge-import-drop]");
  const accept = (target: HTMLElement, opens: boolean) => {
    target.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); });
    const mark: DropMark = on => drop.classList.toggle("is-over", on);
    window.molisDropZone?.(target, mark, undefined, uiText.text("workbench.import.kind-content-can-t-be-dropped-here"));
    target.addEventListener("drop", event => {
      if (!event.dataTransfer?.items.length || !event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      if (opens && !dialog.open) open();
      void dropped(event.dataTransfer.items).then(result => take(result.items, result.truncated)).catch(() => undefined);
    });
  };
  accept(drop, false);
  const browse = root.querySelector<HTMLElement>("[data-side-files-browse]");
  if (browse) accept(browse, true);
}

/**
 * The side panel's import (specs/project-knowledge PMAT-14): several files, a folder or files dropped on the list, and online
 * documents through a connected account. Each is saved by the 成果库's import, one at a time, and organized after.
 */
export function bindKnowledgeImport(root: HTMLElement): void {
  const dialog = root.querySelector<HTMLDialogElement>("[data-knowledge-import-dialog]");
  if (!dialog || dialog.dataset.bound === "1") return;
  dialog.dataset.bound = "1";
  const $ = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const base = (document.body.dataset.routePrefix || "") + "/api/artifacts";
  const status = $("[data-knowledge-import-status]");
  const pickedList = $("[data-knowledge-import-picked]");
  const submit = $<HTMLButtonElement>("[data-knowledge-import-submit]");
  const cancel = $<HTMLButtonElement>("footer [data-knowledge-import-close]");
  let picked: Picked[] = [];
  let truncatedSelection = false;
  let active: ImportBatch | null = null;
  let sources: ImportSources | null = null;
  let connected = false;
  const kind = () => (dialog.querySelector<HTMLInputElement>("input[name=kind]:checked")?.value ?? "files");
  const controls = () => {
    submit.disabled = !!active || (kind() === "online" ? !connected : !picked.length);
    cancel.disabled = active?.phase === "stopping";
    cancel.textContent = uiText.text(active ? active.kind === "online" ? "workbench.import.hide" : "workbench.import.stop-remaining" : "common.control.cancel");
    if (active) dialog.setAttribute("aria-busy", "true"); else dialog.removeAttribute("aria-busy");
  };
  async function exclusive(batchKind: ImportBatch["kind"], run: (batch: ImportBatch) => Promise<void>) {
    if (active) return;
    const batch: ImportBatch = { kind: batchKind, phase: "running" };
    active = batch; controls();
    try { await run(batch); }
    finally {
      active = null; controls();
      root.querySelector<HTMLButtonElement>("[data-side-files-action=refresh]")?.click();
    }
  }

  const drawPicked = () => {
    pickedList.replaceChildren(...picked.slice(0, MAX_FILES).map(item => {
      const row = el("li");
      row.append(el("span", "", item.path), el("small", "", item.file.size > MAX_BYTES && TEXT_FILE.test(item.path) ? uiText.text("workbench.import.over-6-mb") : ""));
      return row;
    }));
    if (kind() !== "online") submit.disabled = !!active || !picked.length;
    const base = picked.length > MAX_FILES
      ? uiText.text("workbench.import.count-chosen-only-first-max-imported-time", { count: picked.length, max: MAX_FILES })
      : picked.length ? uiText.text("workbench.import.count-count-chosen", { count: picked.length }) : "";
    const scanNote = truncatedSelection ? uiText.text("workbench.import.folder-scan-truncated") : "";
    status.textContent = base && scanNote ? `${base} ${scanNote}` : base || scanNote;
  };
  const take = (items: Picked[], truncated = false) => {
    // A display path can name different files; content reuse belongs to the import service.
    const next = [...picked, ...items.filter(item => wanted(item.path))];
    if (next.length > MAX_DROPPED_FILES) {
      picked = next.slice(0, MAX_DROPPED_FILES);
      truncatedSelection = true;
    } else {
      picked = next;
      if (truncated) truncatedSelection = true;
    }
    // The running batch owns its result rows; new selections wait for the next batch.
    if (!active) drawPicked();
  };
  // Each kind says only its own state: the files picked (and whether there are any to import), or the chosen tool's connection.
  const switchKind = async () => {
    const online = kind() === "online";
    $("[data-knowledge-import-local]").hidden = online;
    $("[data-knowledge-import-online]").hidden = !online;
    if (online) { if (!active) status.textContent = ""; await connections(); } else if (!active) drawPicked();
  };
  async function connections() {
    const note = $("[data-knowledge-import-connection-note]");
    try { sources ??= await request()<ImportSources>(base + "/import/sources"); }
    catch (error) { note.textContent = request().text(error, uiText.text("workbench.import.connection-state-cannot-be-loaded")); return; }
    const picker = $<HTMLSelectElement>("[data-knowledge-import-source]");
    if (!picker.options.length) picker.append(...sources.offered.map(offer => new Option(offer.title, offer.source)));
    const service = sources.offered.find(offer => offer.source === picker.value)?.service_id;
    const rows = sources.connections.filter(row => row.service_id === service && row.state === "connected");
    const select = $<HTMLSelectElement>("[data-knowledge-import-connection]");
    select.replaceChildren(...rows.map(row => new Option(row.display_name, row.connection_id)));
    note.textContent = rows.length ? uiText.text("workbench.import.document-read-account-needs-read-access") : uiText.text("workbench.import.document-tool-not-connected-yet-connect-capabilities-connections");
    connected = rows.length > 0;
    if (kind() === "online") submit.disabled = !!active || !connected;
  }

  const one = async (body: Record<string, unknown>) => request()<Imported>(base + "/import", { body, fallback: FAILED() });
  async function importFiles(batch: ImportBatch) {
    const queue = picked.slice(0, MAX_FILES);
    if (!queue.length) return;
    drawPicked();
    let done = 0, failed = 0, attempted = 0;
    const imported = new Set<Picked>();
    const rows = [...pickedList.children] as HTMLElement[];
    for (const [index, item] of queue.entries()) {
      if (stopping(batch)) break;
      attempted++;
      const mark = rows[index]?.querySelector("small");
      status.textContent = SLOW_FILE.test(item.path) ? uiText.text("workbench.import.importing-count-name-recognizing-text-takes-moment", { at: index + 1, count: queue.length, name: item.path })
        : uiText.text("workbench.import.importing-count-name", { at: index + 1, count: queue.length, name: item.path });
      try {
        if (item.file.size > MAX_BYTES && !rawOriginal(item.file)) throw new Error(uiText.text("workbench.import.over-6-mb"));
        const body = rawOriginal(item.file) ? undefined : await bodyOf(item.file);
        if (stopping(batch)) { attempted--; break; }
        const saved = rawOriginal(item.file) ? await request()<Imported>(originalRoute(base), { file: item.file, headers: originalHeaders(item.file), fallback: FAILED() })
          : await one(body!);
        done += 1;
        imported.add(item);
        rows[index]?.classList.add("is-done");
        note(mark, saved.reused ? uiText.text("workbench.import.unchanged") : importWarning(saved) ?? uiText.text("workbench.import.imported"));
      } catch (error) {
        failed += 1;
        rows[index]?.classList.add("is-failed");
        note(mark, request().text(error));
      }
    }
    // Keep the unattempted tail ahead of failures, so a rejected batch cannot block later files forever.
    picked = [...queue.slice(attempted), ...picked.slice(queue.length), ...queue.slice(0, attempted).filter(item => !imported.has(item))];
    truncatedSelection = false;
    const result = failed ? uiText.text("workbench.import.done-imported-failed-not-imported-reasons-above", { done, failed }) : uiText.text("workbench.import.done-imported-organizing-now", { done });
    const remaining = picked.length - failed;
    status.textContent = batch.phase === "stopping" ? uiText.text("workbench.import.stopped", { done, failed, remaining }) : result + (remaining ? " " + uiText.text("workbench.import.remaining-files", { count: remaining }) : "");
  }

  async function importOnline() {
    const url = $<HTMLInputElement>("[data-knowledge-import-url]").value.trim();
    if (!/^https:\/\//u.test(url)) { status.textContent = uiText.text("workbench.import.enter-document-s-https-url"); return; }
    status.textContent = uiText.text("workbench.import.reading-saving");
    try {
      const saved = await one({ source: $<HTMLSelectElement>("[data-knowledge-import-source]").value, url, connection_id: $<HTMLSelectElement>("[data-knowledge-import-connection]").value });
      status.textContent = uiText.text("workbench.import.imported-title-organizing-now", { title: saved.title });
    } catch (error) { status.textContent = request().text(error); }
  }

  submit.addEventListener("click", () => void (kind() === "online" ? exclusive("online", importOnline) : exclusive("files", importFiles)));
  cancel.addEventListener("click", () => {
    if (!active) {
      picked = [];
      truncatedSelection = false;
      drawPicked();
      dialog.close();
      return;
    }
    if (active.kind === "online") { dialog.close(); return; }
    active.phase = "stopping"; controls();
    status.textContent = uiText.text("workbench.import.stopping");
  });
  dialog.querySelectorAll<HTMLInputElement>("input[name=kind]").forEach(input => input.addEventListener("change", () => void switchKind()));
  $("[data-knowledge-import-source]").addEventListener("change", () => void connections());
  dialog.querySelectorAll("header [data-knowledge-import-close]").forEach(control => control.addEventListener("click", () => dialog.close()));
  const open = () => { if (!active) status.textContent = ""; dialog.showModal(); void switchKind(); };
  bindFileSelection(root, dialog, take, open);
  root.querySelector("[data-knowledge-import-open]")?.addEventListener("click", open);
}
