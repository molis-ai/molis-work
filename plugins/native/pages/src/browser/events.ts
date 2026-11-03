import { loadGoals, closeCreate, closeMore, closeMove } from "./menus.js";
import { bindClick } from "./click.js";
import { enqueueSave, draftOf, fillEditor, remember } from "./editor.js";
import { loadList, movePage, queueSave } from "./document.js";
import { listFailed, renderList } from "./list.js";
import { noteFailure, showNote } from "./notes.js";
import type { PagesPage } from "./page.js";
import { pageTail } from "./request.js";
import { stop } from "./dom.js";
import type { DocumentAnswer } from "./types.js";

// Back in this window: the open document may have changed elsewhere (another window, the Assistant in another tab).
// Only it is read again; the change shows at once when nothing of the person's own waits, and otherwise they are told.
async function recheckOpen(page: PagesPage) {
  if (!page.sel || document.hidden) return;
  const id = page.sel.id, version = page.sel.version;
  const payload = await page.api<DocumentAnswer>("GET", pageTail(id));
  const next = payload && payload.document;
  if (!next || !page.sel || page.sel.id !== id || next.version === version) return;
  if (page.saveTimer || page.dirty) { showNote(page, page.L("pages.note.changed-elsewhere"), true); return; }
  remember(page, next, true);
  page.editRev += 1;
}

function bindWindow(page: PagesPage) {
  const { L } = page;
  window.addEventListener?.("focus", () => { void recheckOpen(page).catch(() => {}); });
  document.addEventListener?.("visibilitychange", () => { void recheckOpen(page).catch(() => {}); });
  // The Assistant changed a Pages document: show the saved version, unless the person has edits of their own in flight.
  window.addEventListener?.("molis:assistant-effect", (event) => {
    const capability = (event as CustomEvent<{ capability_id?: unknown } | undefined>).detail?.capability_id;
    if (typeof capability !== "string" || capability.indexOf("pages.") !== 0) return;
    void (async () => {
      const before = page.sel ? { id: page.sel.id, version: page.sel.version } : null;
      await loadList(page);
      if (!before || !page.sel || page.sel.id !== before.id) return;
      const next = page.records.find((item) => item.id === before.id);
      if (!next || next.version === before.version) return;
      if (page.saveTimer || page.dirty) { showNote(page, L("pages.note.assistant-changed"), true); return; }
      fillEditor(page, next);
      page.dirty = false;
      page.editRev += 1;
    })().catch(() => {});
  });
}

function bindFields(page: PagesPage) {
  const { titleInput, titleEl, searchInput, goalSelect, L } = page;
  titleInput.addEventListener("input", () => {
    if (titleEl) titleEl.textContent = titleInput.value || L("pages.doc.name");
    queueSave(page);
  });
  titleInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (!page.editor) return;
    event.preventDefault();
    page.Editor.focusStart(page.editor);
  });
  searchInput?.addEventListener("input", () => {
    page.query = searchInput.value || "";
    renderList(page);
  });
  goalSelect?.addEventListener("change", () => {
    if (!page.sel) return;
    const draft = draftOf(page);
    if (!draft) return;
    page.sel = { ...page.sel, goal_id: goalSelect.value };
    void enqueueSave(page, draft, { goal_id: goalSelect.value })
      .catch((error) => {
        page.dirty = true;
        noteFailure(page, error, L("pages.error.save"));
      });
  });
}

const clearDrop = (page: PagesPage) => {
  page.els("[data-pages-drop].is-drop").forEach((node) => node.classList.remove("is-drop"));
};

function bindDrag(page: PagesPage) {
  const { bench, L } = page;
  const foldOf = (event: Event) => (event.target as HTMLElement).closest<HTMLElement>("[data-pages-drop=folder]");
  bench.addEventListener("dragstart", (event) => {
    if ((event.target as HTMLElement).closest(".pages-row-act, .pages-folder-actions, .creative-artifact-act")) {
      event.preventDefault();
      return;
    }
    const row = (event.target as HTMLElement).closest<HTMLElement>(".pages-doc-row[data-page-id]");
    if (!row || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", row.dataset.pageId!);
    event.dataTransfer.effectAllowed = "move";
    row.classList.add("is-dragging");
  });
  bench.addEventListener("dragover", (event) => {
    const fold = foldOf(event);
    if (!fold) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDrop(page);
    fold.classList.add("is-drop");
  });
  bench.addEventListener("dragleave", (event) => {
    const fold = foldOf(event);
    if (!fold) return;
    const next = event.relatedTarget;
    if (next && fold.contains(next as Node)) return;
    fold.classList.remove("is-drop");
  });
  bench.addEventListener("drop", (event) => {
    const fold = foldOf(event);
    clearDrop(page);
    page.els(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
    if (!fold || !event.dataTransfer) return;
    stop(event);
    page.suppressFoldToggleUntil = Date.now() + 400;
    const id = event.dataTransfer.getData("text/plain");
    void movePage(page, id, fold.dataset.folderId || "").catch((error) => noteFailure(page, error, L("pages.error.save")));
  });
  bench.addEventListener("dragend", () => {
    clearDrop(page);
    page.els(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
  });
}

/** A press outside an open menu closes it; Escape closes the open menus when no dialog has the key. */
function bindMenus(page: PagesPage) {
  document.addEventListener("pointerdown", (event) => {
    const hit = event.target as Node | null;
    const target = hit && hit.nodeType === 1 ? hit as HTMLElement : hit && hit.parentElement;
    if (!target) return;
    const { moreMenu, moreButton, createMenu, createMore, moveMenu } = page;
    if (moreMenu && !moreMenu.hidden && !moreMenu.contains(target) && !moreButton?.contains(target)) closeMore(page);
    if (createMenu && !createMenu.hidden && !createMenu.contains(target) && !createMore?.contains(target)) closeCreate(page);
    if (moveMenu && !moveMenu.hidden && !moveMenu.contains(target) && !target.closest("[data-pages-move]")) closeMove(page);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.querySelector("dialog[open]")) return;
    const { moreMenu, moreButton, createMenu, moveMenu } = page;
    let handled = false;
    if (moreMenu && !moreMenu.hidden) {
      closeMore(page);
      moreButton?.focus();
      handled = true;
    }
    if (moveMenu && !moveMenu.hidden) {
      closeMove(page);
      handled = true;
    }
    if (createMenu && !createMenu.hidden) {
      closeCreate(page);
      handled = true;
    }
    if (handled) event.preventDefault();
  });
}

/** Wires every listener of the page and reads the list and the goals. */
export function bindEvents(page: PagesPage) {
  const { L } = page;
  bindWindow(page);
  bindFields(page);
  bindClick(page);
  bindDrag(page);
  bindMenus(page);
  void loadList(page).catch((error) => { noteFailure(page, error, L("pages.error.request")); listFailed(page, error, () => loadList(page)); });
  void loadGoals(page);
}
