import { WORKSPACE_SKIPPED_FOLDERS } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { el, L, request } from "./common.js";

const MAX_FILES = 200;
const MAX_BYTES = 6 * 1024 * 1024;
const TEXT_FILE = /\.(md|markdown|txt|html|htm)$/iu;
const skipped = new Set<string>(WORKSPACE_SKIPPED_FOLDERS);
interface Picked { file: File; path: string }
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
  let picked: Picked[] = [], busy = false, sources: ImportSources | null = null;
  const kind = () => (dialog.querySelector<HTMLInputElement>("input[name=kind]:checked")?.value ?? "files");

  const drawPicked = () => {
    pickedList.replaceChildren(...picked.slice(0, MAX_FILES).map(item => {
      const row = el("li");
      row.append(el("span", "", item.path), el("small", "", item.file.size > MAX_BYTES ? L("超过 6 MB") : ""));
      return row;
    }));
    status.textContent = picked.length > MAX_FILES ? L("选了 {count} 个，一次只导入前 {max} 个。", { count: picked.length, max: MAX_FILES })
      : picked.length ? L("选了 {count} 个文件。", { count: picked.length }) : "";
  };
  const take = (items: Picked[]) => {
    const seen = new Set(picked.map(item => item.path));
    picked = [...picked, ...items.filter(item => wanted(item.path) && !seen.has(item.path))];
    drawPicked();
  };
  const switchKind = async () => {
    const online = kind() === "online";
    $("[data-knowledge-import-local]").hidden = online;
    $("[data-knowledge-import-online]").hidden = !online;
    if (online) await connections();
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
    submit.disabled = !rows.length;
  }

  const one = async (body: Record<string, unknown>) => request()<{ title: string; reused: boolean; warnings?: string[] }>(base + "/import", { body, fallback: L("导入失败。请检查文件、链接、文档权限和连接器配置后重试。") });
  async function importFiles() {
    const queue = picked.slice(0, MAX_FILES);
    if (!queue.length) { status.textContent = L("请先选择文件。"); return; }
    let done = 0, failed = 0;
    const rows = [...pickedList.children] as HTMLElement[];
    for (const [index, item] of queue.entries()) {
      const mark = rows[index]?.querySelector("small");
      status.textContent = L("正在导入 {at} / {count}：{name}", { at: index + 1, count: queue.length, name: item.path });
      try {
        if (item.file.size > MAX_BYTES) throw new Error(L("超过 6 MB"));
        const saved = await one(await bodyOf(item.file));
        done += 1;
        rows[index]?.classList.add("is-done");
        if (mark) mark.textContent = saved.reused ? L("没有变化") : saved.warnings?.length ? saved.warnings[0]! : L("已导入");
      } catch (error) {
        failed += 1;
        rows[index]?.classList.add("is-failed");
        if (mark) mark.textContent = request().text(error);
      }
    }
    status.textContent = failed ? L("导入了 {done} 个，{failed} 个没有导入（原因见上面）。", { done, failed }) : L("导入了 {done} 个，正在整理。", { done });
    picked = queue.filter((_, index) => rows[index]?.classList.contains("is-failed"));
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
      busy = false; submit.disabled = false; dialog.removeAttribute("aria-busy");
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
  dialog.addEventListener("close", () => { if (!busy) { picked = []; drawPicked(); } });
  // Files dropped on the dialog's area, or on the side panel's list (which opens the dialog with them).
  const drop = $("[data-knowledge-import-drop]");
  const accept = (target: HTMLElement, opens: boolean) => {
    target.addEventListener("dragover", event => { if (!event.dataTransfer?.types.includes("Files")) return; event.preventDefault(); drop.classList.add("is-over"); });
    target.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    target.addEventListener("drop", event => {
      if (!event.dataTransfer?.items.length || !event.dataTransfer.types.includes("Files")) return;
      event.preventDefault(); drop.classList.remove("is-over");
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
