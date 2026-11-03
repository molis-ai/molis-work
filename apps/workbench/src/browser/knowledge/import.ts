import { WORKSPACE_SKIPPED_FOLDERS } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { DropMark } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { el, L, request } from "./common.js";

const MAX_FILES = 200;
/** What one request carries inline; a bigger file that is not text goes as its raw body (`/import/original`), any size. */
const MAX_BYTES = 6 * 1024 * 1024;
const TEXT_FILE = /\.(md|markdown|txt|html|htm)$/iu;
/** Files the Host recognizes or transcribes while the import waits (a scanned PDF too), which take seconds to minutes. */
const SLOW_FILE = /\.(pdf|png|jpe?g|webp|heic|heif|tiff?|bmp|gif|mp3|wav|m4a|aac|aiff?|flac|mp4|mov|m4v|webm)$/iu;
const skipped = new Set<string>(WORKSPACE_SKIPPED_FOLDERS);
interface Picked { file: File; path: string }
interface Imported { title: string; reused: boolean; warnings?: string[]; model_required?: { approximate_bytes: number | null } }
interface ImportSources { sources: Record<string, boolean>; connections: Array<{ connection_id: string; service_id: string; display_name: string; state: string }> }

/** A folder's files keep their path inside it; hidden ones and build or dependency folders are left out, as the workspace listing does. */
const wanted = (path: string) => !path.split("/").some((segment, index, all) => segment.startsWith(".") || (index < all.length - 1 && skipped.has(segment)));

async function dropped(items: DataTransferItemList): Promise<Picked[]> {
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (out.length >= MAX_FILES * 2) return;
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
    catch { throw new Error(L("无法读取文件。请将文本文件保存为 UTF-8 编码后重试。")); }
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
const FAILED = () => L("导入失败。请检查文件、链接、文档权限和连接器配置后重试。");
type Untranscribed = { item: Picked; row: HTMLElement | undefined };

/**
 * The speech model is downloaded only on the person's yes, asked in the import dialog with 灵光's words; then each audio or video
 * file is imported again with that yes, its download's and transcription's progress shown (specs/project-knowledge PMAT-48).
 */
function bindModelConsent(dialog: HTMLDialogElement, base: string, exclusive: (run: () => Promise<void>) => Promise<void>) {
  const $ = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const model = $("[data-knowledge-import-model]"), text = $("[data-knowledge-import-model-text]"), status = $("[data-knowledge-import-status]");
  const bar = $<HTMLProgressElement>("[data-knowledge-import-model-progress]"), choices = $("[data-knowledge-import-model-choices]");
  let waiting: Untranscribed[] = [];
  const reset = () => { waiting = []; model.hidden = true; };
  async function transcribe() {
    const queue = waiting;
    waiting = []; choices.hidden = true; bar.hidden = false; bar.removeAttribute("value");
    let done = 0;
    for (const { item, row } of queue) {
      const mark = row?.querySelector("small");
      text.textContent = L("正在转写：{name}", { name: item.path });
      try {
        const saved = await request().stream<Imported>(rawOriginal(item.file) ? originalRoute(base, true) : base + "/import", {
          ...rawOriginal(item.file) ? { file: item.file, headers: originalHeaders(item.file, "application/x-ndjson") }
            : { body: { ...await bodyOf(item.file), allow_model_download: true }, headers: { accept: "application/x-ndjson" } }, fallback: FAILED(), onProgress: event => {
            text.textContent = event.stage === "downloading" || event.stage === "model_download" ? L("正在下载转写模型（只下载这一次）")
              : event.stage === "loading" ? L("正在加载模型") : L("正在转写：{name}", { name: item.path });
            bar.value = Math.max(0, Math.min(1, event.progress));
          } });
        if (!saved.model_required) { done += 1; row?.classList.add("is-done"); }
        note(mark, saved.warnings?.[0] ?? L("已导入"));
      } catch (error) {
        row?.classList.add("is-failed");
        note(mark, request().text(error));
      }
    }
    model.hidden = true;
    status.textContent = done === queue.length ? L("转写好了 {done} 个，正在整理。", { done }) : L("转写好了 {done} 个，{failed} 个没有转成（原因见上面）。", { done, failed: queue.length - done });
  }
  $("[data-knowledge-import-model-yes]").addEventListener("click", () => void exclusive(transcribe));
  $("[data-knowledge-import-model-no]").addEventListener("click", () => {
    reset();
    status.textContent = L("音视频只保存了原件。以后要转写，重新导入它时同意下载就行。");
  });
  return {
    reset,
    ask(files: Untranscribed[], bytes: number | null) {
      waiting = files;
      const size = bytes ? Math.round(bytes / 1024 / 1024) : 0;
      text.textContent = (files.length > 1 ? L("{count} 个音视频还没有转成文字。", { count: files.length }) : "")
        + (size ? L("转写需要下载本机语音模型（{size} MB），只在这台机器上用。现在下载并继续？", { size }) : L("转写需要下载本机语音模型，只在这台机器上用。现在下载并继续？"));
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
  let picked: Picked[] = [], busy = false, sources: ImportSources | null = null, connected = false;
  // Audio and video saved without text because the speech model is not downloaded yet: asked about once the batch is done (PMAT-48).
  const consent = bindModelConsent(dialog, base, async run => {
    if (busy) return;
    busy = true; submit.disabled = true; dialog.setAttribute("aria-busy", "true");
    try { await run(); }
    finally {
      busy = false; submit.disabled = !picked.length; dialog.removeAttribute("aria-busy");
      root.querySelector<HTMLButtonElement>("[data-side-files-action=refresh]")?.click();
    }
  });
  const kind = () => (dialog.querySelector<HTMLInputElement>("input[name=kind]:checked")?.value ?? "files");

  const drawPicked = () => {
    pickedList.replaceChildren(...picked.slice(0, MAX_FILES).map(item => {
      const row = el("li");
      row.append(el("span", "", item.path), el("small", "", item.file.size > MAX_BYTES && TEXT_FILE.test(item.path) ? L("超过 6 MB") : ""));
      return row;
    }));
    if (kind() !== "online") submit.disabled = busy || !picked.length;
    status.textContent = picked.length > MAX_FILES ? L("选了 {count} 个，一次只导入前 {max} 个。", { count: picked.length, max: MAX_FILES })
      : picked.length ? L("选了 {count} 个文件。", { count: picked.length }) : "";
  };
  const take = (items: Picked[]) => {
    const seen = new Set(picked.map(item => item.path));
    picked = [...picked, ...items.filter(item => wanted(item.path) && !seen.has(item.path))];
    drawPicked();
  };
  // Each kind says only its own state: the files picked (and whether there are any to import), or the chosen tool's connection.
  const switchKind = async () => {
    const online = kind() === "online";
    $("[data-knowledge-import-local]").hidden = online;
    $("[data-knowledge-import-online]").hidden = !online;
    if (online) { status.textContent = ""; await connections(); } else drawPicked();
  };
  async function connections() {
    const note = $("[data-knowledge-import-connection-note]");
    try { sources ??= await request()<ImportSources>(base + "/import/sources"); }
    catch (error) { note.textContent = request().text(error, L("连接状态读不到")); return; }
    const source = $<HTMLSelectElement>("[data-knowledge-import-source]").value;
    const service = source === "google-docs" ? "google-drive" : source;
    const rows = sources.connections.filter(row => row.service_id === service && row.state === "connected");
    const select = $<HTMLSelectElement>("[data-knowledge-import-connection]");
    select.replaceChildren(...rows.map(row => new Option(row.display_name, row.connection_id)));
    note.textContent = rows.length ? L("用这个账号读取文档；它要有这份文档的读取权限。") : L("还没有连接这个文档工具。先在 能力 → 连接 里连接，再回来导入。");
    connected = rows.length > 0;
    if (kind() === "online") submit.disabled = busy || !connected;
  }

  const one = async (body: Record<string, unknown>) => request()<Imported>(base + "/import", { body, fallback: FAILED() });
  async function importFiles() {
    const queue = picked.slice(0, MAX_FILES);
    if (!queue.length) return;
    let done = 0, failed = 0, bytes: number | null = null;
    const rows = [...pickedList.children] as HTMLElement[], untranscribed: Untranscribed[] = [];
    consent.reset();
    for (const [index, item] of queue.entries()) {
      const mark = rows[index]?.querySelector("small");
      status.textContent = SLOW_FILE.test(item.path) ? L("正在导入 {at} / {count}：{name}（识别文字或转写要一会儿）", { at: index + 1, count: queue.length, name: item.path })
        : L("正在导入 {at} / {count}：{name}", { at: index + 1, count: queue.length, name: item.path });
      try {
        if (item.file.size > MAX_BYTES && !rawOriginal(item.file)) throw new Error(L("超过 6 MB"));
        const saved = rawOriginal(item.file) ? await request()<Imported>(originalRoute(base, false), { file: item.file, headers: originalHeaders(item.file), fallback: FAILED() })
          : await one(await bodyOf(item.file));
        done += 1;
        if (saved.model_required) { untranscribed.push({ item, row: rows[index] }); bytes ??= saved.model_required.approximate_bytes; }
        // A file still waiting on the speech model is not done yet: its note stays neutral until it is transcribed.
        if (!saved.model_required) rows[index]?.classList.add("is-done");
        note(mark, saved.model_required ? L("还没转成文字") : saved.reused ? L("没有变化") : saved.warnings?.length ? saved.warnings[0]! : L("已导入"));
      } catch (error) {
        failed += 1;
        rows[index]?.classList.add("is-failed");
        note(mark, request().text(error));
      }
    }
    status.textContent = failed ? L("导入了 {done} 个，{failed} 个没有导入（原因见上面）。", { done, failed }) : L("导入了 {done} 个，正在整理。", { done });
    picked = queue.filter((_, index) => rows[index]?.classList.contains("is-failed"));
    if (untranscribed.length) consent.ask(untranscribed, bytes);
  }

  async function importOnline() {
    const url = $<HTMLInputElement>("[data-knowledge-import-url]").value.trim();
    if (!/^https:\/\//u.test(url)) { status.textContent = L("请输入文档的 HTTPS 链接。"); return; }
    status.textContent = L("正在读取并保存…");
    try {
      const saved = await one({ source: $<HTMLSelectElement>("[data-knowledge-import-source]").value, url, connection_id: $<HTMLSelectElement>("[data-knowledge-import-connection]").value });
      status.textContent = L("已导入「{title}」，正在整理。", { title: saved.title });
    } catch (error) { status.textContent = request().text(error); }
  }

  submit.addEventListener("click", async () => {
    if (busy) return;
    busy = true; submit.disabled = true; dialog.setAttribute("aria-busy", "true");
    try { await (kind() === "online" ? importOnline() : importFiles()); }
    finally {
      busy = false; submit.disabled = kind() === "online" ? !connected : !picked.length; dialog.removeAttribute("aria-busy");
      root.querySelector<HTMLButtonElement>("[data-side-files-action=refresh]")?.click();
    }
  });
  dialog.querySelectorAll<HTMLInputElement>("input[name=kind]").forEach(input => input.addEventListener("change", () => void switchKind()));
  $("[data-knowledge-import-source]").addEventListener("change", () => void connections());
  for (const selector of ["[data-knowledge-import-pick]", "[data-knowledge-import-folder]"]) {
    const input = $<HTMLInputElement>(selector);
    input.addEventListener("change", () => { take([...input.files ?? []].map(file => ({ file, path: file.webkitRelativePath || file.name }))); input.value = ""; });
  }
  dialog.querySelectorAll("[data-knowledge-import-close]").forEach(control => control.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("close", () => { if (!busy) { picked = []; consent.reset(); drawPicked(); } });
  // Files dropped on the dialog's area, or on the side panel's list (which opens the dialog with them).
  const drop = $("[data-knowledge-import-drop]");
  const accept = (target: HTMLElement, opens: boolean) => {
    target.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); });
    const mark: DropMark = on => drop.classList.toggle("is-over", on);
    window.molisDropZone?.(target, mark, undefined, L("不支持拖入这种内容"));
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
  const open = () => { status.textContent = ""; dialog.showModal(); void switchKind(); };
  root.querySelector("[data-knowledge-import-open]")?.addEventListener("click", open);
}
