import { blankLeaving, dropBlank } from "./blank.js";
import { loadList, openDocument, save } from "./document.js";
import { required, said, statusOf } from "./dom.js";
import { closeCreate, closeMore, closeMove } from "./menus.js";
import { noteFailure } from "./notes.js";
import type { PagesPage } from "./page.js";

interface ImportDocument { readonly key: string; readonly title: string; readonly name: string; readonly body: unknown; readonly warnings?: readonly string[] }
interface ImportPreview { readonly warnings?: readonly string[]; readonly documents?: readonly ImportDocument[] }

/** The text of an imported body, for the plain-text preview. */
function importText(node: unknown): string {
  const { type, text, content } = (node ?? {}) as { type?: string; text?: string; content?: unknown[] };
  if (type === "text") return text || "";
  return (content || []).map(importText).join(type === "doc" ? "\n" : " ");
}

function appendImportWarnings(container: HTMLElement, warnings: readonly string[] | undefined) {
  container.replaceChildren();
  for (const warning of warnings || []) {
    const li = document.createElement("li"); li.textContent = warning; container.append(li);
  }
  container.hidden = !container.childElementCount;
}

const readImportFile = (page: PagesPage, file: File) => new Promise<{ name: string; data: string }>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(",")[1] || "" });
  reader.onerror = () => reject(new Error(page.L("pages.import.read-failed")));
  reader.readAsDataURL(file);
});

/** The import dialog: choose files, preview what they become, pick which to bring in and where. */
export function bindImport(page: PagesPage) {
  const { bench, L, host } = page, state = page.importing;
  const dialog = required<HTMLDialogElement>(bench, "[data-pages-import-dialog]");
  const part = <T extends HTMLElement = HTMLElement>(name: string) => required<T>(dialog, `[data-pages-import-${name}]`);
  const filesInput = part<HTMLInputElement>("files"), source = part<HTMLSelectElement>("source"), folder = part<HTMLSelectElement>("folder"), preview = part("preview"), documents = part("documents");
  const status = part("status"), submit = part<HTMLButtonElement>("submit"), open = part<HTMLButtonElement>("open"), close = part<HTMLButtonElement>("close");
  const all = part<HTMLInputElement>("all"), drop = part("drop");
  const base = () => host.pluginRoute("/pages/import");
  const sameProject = () => host.projectId() === state.project && base() === state.base;
  const message = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle("is-error", error);
  };
  const help = () => {
    part("help").textContent = source.value === "notion" ? L("pages.import.help-notion") : source.value === "feishu" ? L("pages.import.help-feishu") : L("pages.import.help-other");
  };
  const checks = () => [...documents.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
  const sync = () => {
    const boxes = checks();
    const count = boxes.filter((input) => input.checked).length;
    const locked = state.busy || Boolean(state.submission) || state.finished.length > 0;
    [filesInput, source, folder, all, ...boxes].forEach((input) => { input.disabled = locked; });
    all.checked = boxes.length > 0 && count === boxes.length;
    all.indeterminate = count > 0 && count < boxes.length;
    submit.disabled = state.busy || state.blocked || count === 0 || state.finished.length > 0;
    submit.hidden = state.finished.length > 0;
    submit.textContent = state.busy ? L("pages.import.processing") : L("pages.import.submit") + (count ? " (" + count + ")" : "");
    open.hidden = state.finished.length === 0;
    close.disabled = state.busy;
    close.textContent = state.finished.length ? L("pages.import.done") : state.blocked ? L("pages.import.close") : L("pages.action.cancel");
    dialog.setAttribute("aria-busy", String(state.busy));
  };
  const request = async <T>(path: string, body: Record<string, unknown>) => {
    if (!sameProject()) throw new Error(L("pages.import.project-changed"));
    return molisWorkRequest<T>(state.base + path, { method: "POST", body, fallback: L("pages.import.failed") });
  };
  const showPreview = (payload: ImportPreview) => {
    documents.replaceChildren();
    appendImportWarnings(part("warnings"), payload.warnings);
    for (const doc of payload.documents || []) {
      const card = document.createElement("section"); card.className = "pages-import-document";
      const label = document.createElement("label");
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = true; check.value = doc.key;
      const title = document.createElement("strong"); title.textContent = doc.title;
      label.append(check, title); card.append(label);
      const origin = document.createElement("small"); origin.textContent = doc.name; card.append(origin);
      const warnings = document.createElement("ul"); warnings.className = "pages-import-warnings";
      appendImportWarnings(warnings, doc.warnings); card.append(warnings);
      const details = document.createElement("details");
      const summary = document.createElement("summary"); summary.textContent = L("pages.import.preview-body");
      const content = document.createElement("div"); content.className = "pages-import-body";
      // Plain text preview never inserts source HTML or follows imported links.
      const text = importText(doc.body); content.textContent = text.slice(0, 4000) + (text.length > 4000 ? "…" : "");
      details.append(summary, content); card.append(details); documents.append(card);
    }
    preview.hidden = false;
    message(L("pages.import.parsed"));
  };
  const prepare = async (files: File[]) => {
    if (state.busy || state.submission || state.finished.length || !files.length) return;
    state.busy = true; state.files = []; documents.replaceChildren(); preview.hidden = true;
    message(L("pages.import.reading")); sync();
    try {
      if (files.length > 100 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024) {
        throw new Error(L("pages.import.too-many"));
      }
      const parsed = [];
      for (const file of files) parsed.push(await readImportFile(page, file));
      const payload = await request<ImportPreview>("/preview", { files: parsed });
      state.files = parsed;
      showPreview(payload);
    } catch (error) { message(said(error, L("pages.import.failed")), true); }
    finally { state.busy = false; filesInput.value = ""; sync(); }
  };
  const openDialog = async () => {
    closeCreate(page); closeMore(page); closeMove(page);
    // A failed save must leave the current page and its editor intact.
    if (page.sel) { clearTimeout(page.saveTimer); await save(page); page.saveTimer = 0; }
    if (!state.submission || state.blocked || state.finished.length || !sameProject()) {
      state.project = host.projectId(); state.base = base(); state.files = []; state.submission = null; state.finished = []; state.blocked = false;
      filesInput.value = ""; documents.replaceChildren(); preview.hidden = true; message("");
      folder.replaceChildren();
      for (const entry of [{ id: "", title: L("pages.folder.unfiled") }, ...page.folders]) {
        const option = document.createElement("option"); option.value = entry.id; option.textContent = entry.title; folder.append(option);
      }
    }
    help(); sync(); dialog.showModal();
  };
  bench.querySelectorAll("[data-pages-import]").forEach((button) => button.addEventListener("click", () => {
    void openDialog().catch((error) => noteFailure(page, error, L("pages.error.save")));
  }));
  source.addEventListener("change", help);
  filesInput.addEventListener("change", () => { void prepare([...(filesInput.files ?? [])]); });
  all.addEventListener("change", () => { checks().forEach((input) => { input.checked = all.checked; }); sync(); });
  documents.addEventListener("change", sync);
  drop.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); });
  window.molisDropZone?.(drop, (on) => drop.classList.toggle("is-dragover", on), undefined, L("pages.import.drop-refused"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault(); event.stopPropagation();
    if (event.dataTransfer) void prepare([...event.dataTransfer.files]);
  });
  dialog.addEventListener("cancel", (event) => { if (state.busy) event.preventDefault(); });
  close.addEventListener("click", () => { if (!state.busy) dialog.close(); });
  submit.addEventListener("click", async () => {
    if (state.busy || state.blocked || state.finished.length) return;
    const keys = checks().filter((input) => input.checked).map((input) => input.value);
    if (!keys.length) return;
    state.busy = true;
    state.submission ||= { files: state.files, selected_keys: keys, folder_id: folder.value, request_id: crypto.randomUUID() };
    message(L("pages.import.importing")); sync();
    try {
      const payload = await request<{ documents?: PagesPage["importing"]["finished"] }>("", state.submission);
      state.finished = payload.documents || [];
      message(L("pages.import.imported-count", { count: state.finished.length }));
      const only = state.finished.length === 1 ? state.finished[0] : undefined;
      window.dispatchEvent(new CustomEvent("molis:placement-result", { detail: { verb: "imported", title: "", note: L("pages.import.receipt-note", { count: state.finished.length }),
        ...(only && only.id ? { object: { kind: "pages_document", id: only.id } } : {}) } }));
      if (sameProject()) {
        page.query = ""; if (page.searchInput) page.searchInput.value = "";
        // Keep the successful receipt visible even if refreshing the library fails.
        await loadList(page).catch(() => {});
      }
    } catch (error) {
      const code = statusOf(error);
      if (code !== undefined && [400, 404, 413].includes(code)) state.submission = null;
      state.blocked = code === 409;
      message(said(error, L("pages.import.failed")) + (state.blocked ? "" : " " + L("pages.import.retry-hint")), true);
    } finally { state.busy = false; sync(); }
  });
  open.addEventListener("click", async () => {
    if (!sameProject()) {
      message(L("pages.import.project-changed"), true); return;
    }
    const imported = state.finished[0];
    if (imported) { try { const left = blankLeaving(page); void dropBlank(page, left); await openDocument(page, imported); dialog.close(); } catch (error) { message(said(error, L("pages.error.save")), true); } }
  });
}
