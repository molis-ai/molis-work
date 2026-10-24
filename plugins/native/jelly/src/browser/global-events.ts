import { openGeneric } from "./dialog.js";
import { openItem } from "./item.js";
import { flushEditor, openRecord, recordFor } from "./notes.js";
import { closeWorkspace, run, showNote } from "./page.js";
import { API } from "./request.js";
import { renderView } from "./view.js";
import { civil, esc, statusOf } from "./util.js";
import { command, loadList, take } from "./workspace.js";
import { above } from "./dom.js";
import type { JellyPage, JellyWorkspace, Preview } from "./types.js";

const unreadable = (page: JellyPage, itemId: string): void => {
  page.root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId } }));
};

/** The Assistant changed Jelly: read the workspace again. An open note with unsaved edits keeps them; saving then reports the conflict instead of overwriting. */
async function assistantChanged(page: JellyPage): Promise<void> {
  await page.mutationQueue.catch(() => undefined);
  await loadList(page);
  if (!page.selected) return;
  if (page.dirty) { showNote(page, page.L("jelly.sync.assistant-changed"), true); return; }
  if (recordFor(page, page.selected.kind, page.selected.id)) openRecord(page, page.selected.kind, page.selected.id);
  else closeWorkspace(page);
}

/** Opened by id (search, the side panel, an Assistant result): the object may be newer than this page, so read the workspace again and show it where it lives. */
async function showItem(page: JellyPage, id: string, quiet: boolean): Promise<void> {
  await flushEditor(page);
  await page.mutationQueue.catch(() => undefined);
  let fresh: { state: JellyWorkspace };
  try { fresh = await page.request<{ state: JellyWorkspace }>("GET", `${API}/`); } catch (error) {
    if (statusOf(error) === 403) unreadable(page, id);
    throw error;
  }
  take(page, fresh.state);
  const state = page.ws();
  const item = state.items.find((entry) => entry.id === id);
  const series = state.series.find((entry) => entry.id === id);
  const note = !item && !series ? recordFor(page, "note", id) : undefined;
  if (!item && !series && !note) {
    unreadable(page, id);
    await renderView(page);
    if (!quiet) showNote(page, page.L("jelly.sync.gone"), true);
    return;
  }
  closeWorkspace(page);
  if (note) {
    page.view = "notes";
    page.archived = Boolean(note.archived_at);
    await renderView(page);
    openRecord(page, "note", id);
    return;
  }
  const today = civil();
  const start = item ? item.start_date : series?.start_date ?? today;
  page.view = "calendar";
  page.anchor = item ? start : start > today ? start : today;
  await renderView(page);
  if (item) openItem(page, { ...item, series_id: null, original_date: null });
}

async function importWorkspaceFile(page: JellyPage, file: File | undefined): Promise<void> {
  if (!file) return;
  await flushEditor(page);
  const source = JSON.parse(await file.text()) as unknown;
  const { preview } = await page.request<{ preview: Preview }>("POST", `${API}/preview`, { kind: "import", source });
  const warnings = (preview.warnings || []).map((line) => `<p class="jelly-muted">${esc(line)}</p>`).join("");
  openGeneric(page, "jelly.import.title", `<p class="jelly-muted">${page.tx("jelly.import.help")}</p><pre class="jelly-muted">${esc(JSON.stringify(preview.counts, null, 2))}</pre>${warnings}`, "jelly.import.confirm", async () => {
    await command(page, { type: "workspace.import", source, confirmation_token: preview.confirmation_token });
    closeWorkspace(page);
    await loadList(page);
    showNote(page, page.L("jelly.import.done"));
  });
}

/** What the page listens to outside its own buttons: the search box, the file input, closing menus, and events from the workbench. */
export function installGlobalEvents(page: JellyPage): void {
  const { root } = page;
  page.$("[data-jelly-search]").addEventListener("input", (event) => {
    page.query = (event.target as HTMLInputElement).value.trim();
    void run(page, () => renderView(page));
  });
  document.addEventListener("click", (event) => {
    if (!above(event, "[data-jelly-more],[data-jelly-menu]")) {
      page.$("[data-jelly-menu]").hidden = true;
      page.$("[data-jelly-more]").setAttribute("aria-expanded", "false");
    }
    if (!above(event, "[data-jelly-editor-more],[data-jelly-editor-menu]")) page.$("[data-jelly-editor-menu]").hidden = true;
  });
  const file = page.$<HTMLInputElement>("[data-jelly-import-file]");
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    void run(page, () => importWorkspaceFile(page, chosen));
  });
  window.addEventListener("molis:assistant-effect", (event) => {
    const capability = (event as CustomEvent<{ capability_id?: unknown } | null>).detail?.capability_id;
    if (typeof capability === "string" && capability.startsWith("jelly.")) void run(page, () => assistantChanged(page));
  });
  root.addEventListener("molis-work:select-item", (event) => {
    const detail = (event as CustomEvent<{ itemId?: unknown; quiet?: boolean } | null>).detail;
    const id = detail?.itemId;
    if (typeof id === "string" && id) void run(page, () => showItem(page, id, Boolean(detail?.quiet)));
  });
  window.addEventListener("beforeunload", (event) => { if (page.dirty) { event.preventDefault(); event.returnValue = ""; } });
  root.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void run(page, () => flushEditor(page)); }
  });
}
