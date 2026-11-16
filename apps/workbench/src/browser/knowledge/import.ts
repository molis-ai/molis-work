import { WORKSPACE_SKIPPED_FOLDERS } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ArtifactImportResult as Imported } from "@molis-ai/molis-work-module-artifacts";
import type { DropMark } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { el, request } from "./common.js";

const uiText = globalThis.t;

const MAX_FILES = 200;
/** What one request carries inline; a bigger file that is not text goes as its raw body (`/import/original`), any size. */
const MAX_BYTES = 6 * 1024 * 1024;
const TEXT_FILE = /\.(md|markdown|txt|html|htm)$/iu;
/** Files the Host recognizes or transcribes while the import waits (a scanned PDF too), which take seconds to minutes. */
const SLOW_FILE = /\.(pdf|png|jpe?g|webp|heic|heif|tiff?|bmp|gif|mp3|wav|m4a|aac|aiff?|flac|mp4|mov|m4v|webm)$/iu;
const skipped = new Set<string>(WORKSPACE_SKIPPED_FOLDERS);
interface Picked { file: File; path: string }
interface ImportSources { sources: Record<string, boolean>; connections: Array<{ connection_id: string; service_id: string; display_name: string; state: string }> }

/** A folder's files keep their path inside it; hidden ones and build or dependency folders are left out, as the workspace listing does. */
const wanted = (path: string) => !path.split("/").some((segment, index, all) => segment.startsWith(".") || (index < all.length - 1 && skipped.has(segment)));

async function dropped(items: DataTransferItemList): Promise<Picked[]> {
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (!wanted(prefix + entry.name + (entry.isDirectory ? "/" : ""))) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, path: prefix + file.name });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, prefix + entry.name + "/");
    }
  };
  for (const entry of [...items].map(item => item.webkitGetAsEntry()).filter((item): item is FileSystemEntry => !!item)) await walk(entry, "");
  return out;
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
const originalRoute = (base: string, allowDownload: boolean) => base + "/import/original" + (allowDownload ? "?allow_model_download=true" : "");
const originalHeaders = (file: File, accept?: string): Record<string, string> => ({ "x-molis-work-filename": encodeURIComponent(file.name), ...accept ? { accept } : {} });

/** A row's note, cut to one line; the whole of it on hover. */
const note = (mark: HTMLElement | null | undefined, text: string) => { if (mark) { mark.textContent = text; mark.title = text; } };
const FAILED = () => uiText.text("workbench.import.import-failed-check-file-link-document-permissions-connector");
type ImportBatch = { kind: "files" | "online" | "transcription"; phase: "running" | "stopping" };
const stopping = (batch: ImportBatch): boolean => batch.phase === "stopping";

/**
 * The speech model is downloaded only on the person's yes, asked in the import dialog with 灵光's words; then each audio or video
 * file is imported again with that yes, its download's and transcription's progress shown (specs/project-knowledge PMAT-48).
 */
function bindModelConsent(dialog: HTMLDialogElement, base: string, exclusive: (run: (batch: ImportBatch) => Promise<void>) => Promise<void>) {
  const $ = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const model = $("[data-knowledge-import-model]"), text = $("[data-knowledge-import-model-text]"), status = $("[data-knowledge-import-status]");
  const bar = $<HTMLProgressElement>("[data-knowledge-import-model-progress]"), choices = $("[data-knowledge-import-model-choices]");
  let waiting: Picked[] = [];
  const reset = () => { waiting = []; model.hidden = true; };
  async function transcribe(batch: ImportBatch) {
    const queue = waiting;
    const rows = queue.map(item => { const row = el("li"); row.append(el("span", "", item.path), el("small")); return row; });
    $("[data-knowledge-import-picked]").replaceChildren(...rows);
    waiting = []; choices.hidden = true; bar.hidden = false; bar.removeAttribute("value");
    let done = 0, attempted = 0;
    const retry: Picked[] = [];
    for (const [index, item] of queue.entries()) {
      if (stopping(batch)) break;
      const row = rows[index];
      attempted++;
      const mark = row?.querySelector("small");
      text.textContent = uiText.text("workbench.import.transcribing-name", { name: item.path });
      try {
        const body = rawOriginal(item.file) ? undefined : await bodyOf(item.file);
        if (stopping(batch)) { attempted--; break; }
        row?.classList.remove("is-failed");
        const saved = await request().stream<Imported>(rawOriginal(item.file) ? originalRoute(base, true) : base + "/import", {
          ...rawOriginal(item.file) ? { file: item.file, headers: originalHeaders(item.file, "application/x-ndjson") }
            : { body: { ...body, allow_model_download: true }, headers: { accept: "application/x-ndjson" } }, fallback: FAILED(), onProgress: event => {
            text.textContent = event.stage === "downloading" || event.stage === "model_download" ? uiText.text("workbench.import.downloading-transcription-model-only-once")
              : event.stage === "loading" ? uiText.text("workbench.import.loading-model") : uiText.text("workbench.import.transcribing-name", { name: item.path });
            bar.value = Math.max(0, Math.min(1, event.progress));
          } });
        if (saved.text_available) { done += 1; row?.classList.add("is-done"); }
        else { retry.push(item); row?.classList.add("is-failed"); }
        note(mark, saved.warnings[0] ?? uiText.text("workbench.import.imported"));
      } catch (error) {
        retry.push(item);
        row?.classList.add("is-failed");
        note(mark, request().text(error));
      }
    }
    waiting = [...queue.slice(attempted), ...retry];
    model.hidden = waiting.length === 0;
    if (waiting.length) {
      choices.hidden = false; bar.hidden = true;
      text.textContent = uiText.text("workbench.import.transcription-remaining", { count: waiting.length });
      $("[data-knowledge-import-model-yes]").textContent = uiText.text("workbench.import.continue-transcribing");
    }
    status.textContent = batch.phase === "stopping" ? uiText.text("workbench.import.transcription-stopped", { done, remaining: waiting.length }) : done === queue.length ? uiText.text("workbench.import.transcribed-done-organizing", { done }) : uiText.text("workbench.import.transcribed-done-failed-not-transcribed-reasons-above", { done, failed: queue.length - done });
  }
  $("[data-knowledge-import-model-yes]").addEventListener("click", () => void exclusive(transcribe));
  $("[data-knowledge-import-model-no]").addEventListener("click", () => {
    reset();
    status.textContent = uiText.text("workbench.import.only-original-audio-video-kept-transcribe-later-import");
  });
  return {
    reset,
    ask(files: Picked[], bytes: number | null) {
      waiting = [...waiting, ...files];
      const size = bytes ? Math.round(bytes / 1024 / 1024) : 0;
      text.textContent = (waiting.length > 1 ? uiText.text("workbench.import.count-audio-video-files-have-no-text-yet", { count: waiting.length }) : "")
        + (size ? uiText.text("workbench.import.transcription-needs-local-speech-model-size-mb-used", { size }) : uiText.text("workbench.import.transcription-needs-local-speech-model-used-only-machine"));
      $("[data-knowledge-import-model-yes]").textContent = uiText.text("workbench.side-panel-files.download-continue");
      bar.hidden = true; choices.hidden = false; model.hidden = false;
    },
  };
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
  let picked: Picked[] = [], active: ImportBatch | null = null, sources: ImportSources | null = null, connected = false;
  const kind = () => (dialog.querySelector<HTMLInputElement>("input[name=kind]:checked")?.value ?? "files");
  const controls = () => {
    submit.disabled = !!active || (kind() === "online" ? !connected : !picked.length);
    cancel.disabled = active?.phase === "stopping";
    for (const selector of ["[data-knowledge-import-model-yes]", "[data-knowledge-import-model-no]"]) $<HTMLButtonElement>(selector).disabled = !!active;
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
  // Audio and video saved without text because the speech model is not downloaded yet: asked about once the batch is done (PMAT-48).
  const consent = bindModelConsent(dialog, base, run => exclusive("transcription", run));

  const drawPicked = () => {
    pickedList.replaceChildren(...picked.slice(0, MAX_FILES).map(item => {
      const row = el("li");
      row.append(el("span", "", item.path), el("small", "", item.file.size > MAX_BYTES && TEXT_FILE.test(item.path) ? uiText.text("workbench.import.over-6-mb") : ""));
      return row;
    }));
    if (kind() !== "online") submit.disabled = !!active || !picked.length;
    status.textContent = picked.length > MAX_FILES ? uiText.text("workbench.import.count-chosen-only-first-max-imported-time", { count: picked.length, max: MAX_FILES })
      : picked.length ? uiText.text("workbench.import.count-count-chosen", { count: picked.length }) : "";
  };
  const take = (items: Picked[]) => {
    // A display path can name different files; content reuse belongs to the import service.
    picked = [...picked, ...items.filter(item => wanted(item.path))];
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
    const source = $<HTMLSelectElement>("[data-knowledge-import-source]").value;
    const service = source === "google-docs" ? "google-drive" : source;
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
    let done = 0, failed = 0, attempted = 0, bytes: number | null = null;
    const imported = new Set<Picked>();
    const rows = [...pickedList.children] as HTMLElement[], untranscribed: Picked[] = [];
    for (const [index, item] of queue.entries()) {
      if (stopping(batch)) break;
      attempted++;
      const mark = rows[index]?.querySelector("small");
      status.textContent = SLOW_FILE.test(item.path) ? uiText.text("workbench.import.importing-count-name-recognizing-text-transcribing-takes-moment", { at: index + 1, count: queue.length, name: item.path })
        : uiText.text("workbench.import.importing-count-name", { at: index + 1, count: queue.length, name: item.path });
      try {
        if (item.file.size > MAX_BYTES && !rawOriginal(item.file)) throw new Error(uiText.text("workbench.import.over-6-mb"));
        const body = rawOriginal(item.file) ? undefined : await bodyOf(item.file);
        if (stopping(batch)) { attempted--; break; }
        const saved = rawOriginal(item.file) ? await request()<Imported>(originalRoute(base, false), { file: item.file, headers: originalHeaders(item.file), fallback: FAILED() })
          : await one(body!);
        done += 1;
        imported.add(item);
        if (saved.model_required) { untranscribed.push(item); bytes ??= saved.model_required.approximate_bytes; }
        // A file still waiting on the speech model is not done yet: its note stays neutral until it is transcribed.
        if (!saved.model_required) rows[index]?.classList.add("is-done");
        note(mark, saved.model_required ? uiText.text("workbench.import.no-text-yet") : saved.reused ? uiText.text("workbench.import.unchanged") : saved.warnings.length ? saved.warnings[0]! : uiText.text("workbench.import.imported"));
      } catch (error) {
        failed += 1;
        rows[index]?.classList.add("is-failed");
        note(mark, request().text(error));
      }
    }
    // Keep the unattempted tail ahead of failures, so a rejected batch cannot block later files forever.
    picked = [...queue.slice(attempted), ...picked.slice(queue.length), ...queue.slice(0, attempted).filter(item => !imported.has(item))];
    const result = failed ? uiText.text("workbench.import.done-imported-failed-not-imported-reasons-above", { done, failed }) : uiText.text("workbench.import.done-imported-organizing-now", { done });
    const remaining = picked.length - failed;
    status.textContent = batch.phase === "stopping" ? uiText.text("workbench.import.stopped", { done, failed, remaining }) : result + (remaining ? " " + uiText.text("workbench.import.remaining-files", { count: remaining }) : "");
    if (untranscribed.length) consent.ask(untranscribed, bytes);
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
    if (!active) { picked = []; consent.reset(); drawPicked(); dialog.close(); return; }
    if (active.kind === "online") { dialog.close(); return; }
    active.phase = "stopping"; controls();
    status.textContent = uiText.text("workbench.import.stopping");
  });
  dialog.querySelectorAll<HTMLInputElement>("input[name=kind]").forEach(input => input.addEventListener("change", () => void switchKind()));
  $("[data-knowledge-import-source]").addEventListener("change", () => void connections());
  for (const selector of ["[data-knowledge-import-pick]", "[data-knowledge-import-folder]"]) {
    const input = $<HTMLInputElement>(selector);
    input.addEventListener("change", () => { take([...input.files ?? []].map(file => ({ file, path: file.webkitRelativePath || file.name }))); input.value = ""; });
  }
  dialog.querySelectorAll("header [data-knowledge-import-close]").forEach(control => control.addEventListener("click", () => dialog.close()));
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
      void dropped(event.dataTransfer.items).then(take);
    });
  };
  accept(drop, false);
  const browse = root.querySelector<HTMLElement>("[data-side-files-browse]");
  if (browse) accept(browse, true);
  const open = () => { if (!active) status.textContent = ""; dialog.showModal(); void switchKind(); };
  root.querySelector("[data-knowledge-import-open]")?.addEventListener("click", open);
}
