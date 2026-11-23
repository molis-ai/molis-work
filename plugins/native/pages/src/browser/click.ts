import { blankLeaving, dropBlank } from "./blank.js";
import { clearPicked, togglePicked } from "./context.js";
import { assertReadable, createPage, exportDocument, loadList, movePage, openDocument, openVersionDiff, persist, printDocument, publishPage, saveOpen, toggleStar } from "./document.js";
import { stop } from "./dom.js";
import { closeEditor, draftOf, remember, storeDocument } from "./editor.js";
import { toggleFolder } from "./list.js";
import { closeCreate, closeMore, closeMove, openMove, toggleCreate, toggleMore } from "./menus.js";
import { ask, askName, noteFailure } from "./notes.js";
import type { PagesPage } from "./page.js";
import { pageTail } from "./request.js";
import type { DocumentAnswer } from "./types.js";

const uiText = globalThis.t;

type Hit = (selector: string) => HTMLElement | null;

/** The menus, the folders and the ways to make a document: true when the click was one of them. */
async function menuClick(page: PagesPage, event: Event, hit: Hit): Promise<boolean> {
  if (hit("[data-pages-more]")) {
    stop(event);
    closeMove(page);
    closeCreate(page);
    toggleMore(page);
    return true;
  }
  if (hit("[data-pages-create-more]")) {
    stop(event);
    closeMove(page);
    toggleCreate(page);
    return true;
  }
  const moveTo = hit("[data-pages-move-to]");
  if (moveTo) {
    stop(event);
    const id = page.movingId;
    const folderId = moveTo.dataset.pagesMoveTo || "";
    closeMove(page);
    if (id) await movePage(page, id, folderId);
    return true;
  }
  const move = hit("[data-pages-move]");
  if (move) {
    stop(event);
    closeMore(page);
    if (move.getAttribute("aria-expanded") === "true") closeMove(page);
    else openMove(page, move, move.dataset.pagesMove!, event.detail === 0);
    return true;
  }
  const star = hit("[data-pages-star]");
  if (star) {
    stop(event);
    await toggleStar(page, star.dataset.pagesStar!);
    return true;
  }
  const folderNew = hit("[data-pages-folder-new]");
  if (folderNew) {
    stop(event);
    await createPage(page, { folder_id: folderNew.dataset.pagesFolderNew });
    return true;
  }
  const folderRename = hit("[data-pages-folder-rename]");
  if (folderRename) {
    stop(event);
    const folder = page.folders.find((item) => item.id === folderRename.dataset.pagesFolderRename);
    if (!folder) return true;
    const title = await askName(page, uiText.text("pages.folder.name"), folder.title, (name) => page.api("POST", "/folders/" + encodeURIComponent(folder.id), { title: name }));
    if (title == null) return true;
    await loadList(page);
    return true;
  }
  const folderDelete = hit("[data-pages-folder-delete]");
  if (folderDelete) {
    stop(event);
    const id = folderDelete.dataset.pagesFolderDelete!;
    const ok = await ask(page, uiText.text("pages.folder.delete-confirm"), uiText.text("pages.action.delete"), async () => {
      if (page.sel?.folder_id === id) await saveOpen(page, page.sel.id);
      await page.api("POST", "/folders/" + encodeURIComponent(id) + "/delete", {});
    });
    if (!ok) return true;
    await loadList(page);
    return true;
  }
  const template = hit("[data-pages-template]");
  if (template) {
    page.templateDialog?.close();
    await createPage(page, { template_id: template.dataset.pagesTemplate, folder_id: page.templateFolderId || undefined });
    page.templateFolderId = "";
    return true;
  }
  if (hit("[data-pages-templates]")) {
    closeCreate(page);
    page.templateFolderId = "";
    page.templateDialog?.showModal();
    return true;
  }
  if (hit("[data-pages-new-folder]")) {
    closeCreate(page);
    const title = await askName(page, uiText.text("pages.folder.name"), "", (name) => page.api("POST", "/folders", { title: name }));
    if (title == null) return true;
    await loadList(page);
    return true;
  }
  if (hit("[data-pages-new]")) {
    closeCreate(page);
    await createPage(page, {});
    return true;
  }
  return false;
}

/** The document list and the open document's controls. */
async function documentClick(page: PagesPage, event: MouseEvent, hit: Hit): Promise<void> {
  const listedArtifact = hit("[data-pages-artifact]");
  if (listedArtifact) {
    await publishPage(page, listedArtifact.dataset.pagesArtifact!);
    return;
  }
  const row = hit("button[data-page-id]");
  if (row && (event.metaKey || event.ctrlKey)) {
    togglePicked(page, row.dataset.pageId!);
    return;
  }
  if (row) {
    clearPicked(page);
    const record = page.records.find((item) => item.id === row.dataset.pageId);
    if (record) await openDocument(page, record);
    return;
  }
  if (hit("[data-pages-star-editor]") && page.sel) {
    await toggleStar(page, page.sel.id);
    return;
  }
  // Back saves what is unsaved, as opening another document does: a document that was only read is not written again.
  if (hit("[data-pages-back]")) {
    const seq = ++page.selectionSeq;
    page.openingId = null;
    if (page.saveTimer || page.dirty) await persist(page); else await page.saveQueue;
    if (seq !== page.selectionSeq) return;
    page.dirty = false;
    const left = blankLeaving(page);
    closeEditor(page);
    await dropBlank(page, left);
    await loadList(page);
    return;
  }
  if (hit("[data-pages-extract]") && page.sel) {
    closeMore(page); assertReadable(page);
    const id = page.sel.id, epoch = page.editorEpoch;
    await persist(page);
    if (page.sel?.id !== id || page.editorEpoch !== epoch) return;
    const draft = draftOf(page);
    const payload = await page.api<DocumentAnswer>("POST", pageTail(id, "/extract"), {});
    storeDocument(page, payload.document);
    if (page.sel?.id === id && page.editorEpoch === epoch) {
      if (draft && page.editRev === draft.version && !page.dirty && !page.saveTimer) { remember(page, payload.document, true); page.editRev += 1; }
      else await persist(page);
    }
    await loadList(page);
    return;
  }
  if (hit("[data-pages-promote]") && page.sel) {
    closeMore(page);
    await publishPage(page, page.sel.id);
    return;
  }
  if (hit("[data-pages-compare-versions]")) {
    openVersionDiff(page);
    return;
  }
  const exported = hit("[data-pages-export]");
  if (exported && page.sel) {
    closeMore(page);
    exportDocument(page, exported.dataset.pagesExport || "html");
    return;
  }
  if (hit("[data-pages-print]") && page.sel) {
    closeMore(page);
    printDocument(page);
    return;
  }
  if (hit("[data-pages-delete]") && page.sel) {
    closeMore(page);
    const id = page.sel.id;
    const ok = await ask(page, uiText.text("pages.doc.delete-confirm"), uiText.text("pages.action.delete"), () => page.api("POST", pageTail(id, "/delete"), {}));
    if (!ok) return;
    closeEditor(page);
    await loadList(page);
  }
}

/** One handler for every click in the workbench: the first control it finds under the pointer decides. */
export function bindClick(page: PagesPage) {
  const { bench } = page;
  bench.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const hit = (selector: string) => target.closest<HTMLElement>(selector);
    try {
      const folderToggle = hit("[data-pages-folder-toggle]");
      if (folderToggle) {
        stop(event);
        if (Date.now() < page.suppressFoldToggleUntil) return;
        toggleFolder(page, folderToggle.dataset.pagesFolderToggle ?? "");
        return;
      }
      if (await menuClick(page, event, hit)) return;
      await documentClick(page, event, hit);
    } catch (error) {
      noteFailure(page, error, uiText.text("pages.error.request"));
    }
  });
}
