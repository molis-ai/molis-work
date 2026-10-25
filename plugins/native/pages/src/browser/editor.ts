import { blankLeaving, dropBlank, savedByPerson } from "./blank.js";
import { markSelected, publishTools, reportFocus, sendPanel, syncEditorChrome } from "./context.js";
import { createPage, openDocument, persist, queueSave } from "./document.js";
import { renderList } from "./list.js";
import { closeCreate, closeMore, closeMove } from "./menus.js";
import { noteFailure, showNote } from "./notes.js";
import type { PagesPage } from "./page.js";
import { pageTail } from "./request.js";
import type { Draft, DocumentAnswer, PagesRecord } from "./types.js";

/** Keeps the open record in the list and on screen; `redraw` puts its text into the editor again. */
export function remember(page: PagesPage, record: PagesRecord, redraw?: boolean) {
  const { L } = page;
  page.sel = record;
  const index = page.records.findIndex((item) => item.id === record.id);
  if (index >= 0) page.records[index] = record;
  else page.records.unshift(record);
  renderList(page);
  page.titleEl.textContent = record.title;
  page.statusEl.textContent = L("pages.status.saved"); page.statusEl.dataset.mwState = "saved";
  markSelected(page, record.id);
  syncEditorChrome(page);
  if (redraw) fillEditor(page, record);
}

function ensureEditor(page: PagesPage, body: unknown) {
  const { Editor, editorHost, L } = page;
  if (!editorHost) throw new Error(L("pages.error.editor-missing"));
  if (page.editor) {
    Editor.setDoc(page.editor, body);
    return;
  }
  page.editor = Editor.mount(editorHost, {
    doc: body,
    onComment: (markId) => { void page.commentOpen(markId); },
    onChange: () => { if (!page.filling) queueSave(page); },
    onFocus: (focus) => { page.focusNow = focus; reportFocus(page); },
    onTools: () => { publishTools(page); page.landing.report(); },
    onScreen: () => reportFocus(page),
    openPanel: (panel) => Boolean(page.focusShown || !panel.node) && sendPanel(page, panel),
    translate: L,
    pages: () => page.records.map((item) => ({ id: item.id, title: item.title })),
    onOpenPage: (id) => {
      const record = page.records.find((item) => item.id === id);
      if (record) void openDocument(page, record).catch((error) => noteFailure(page, error, L("pages.error.save")));
    },
    runAi: async (input) => {
      if (!page.sel) throw new Error(L("pages.error.request"));
      const id = page.sel.id;
      const revision = page.editRev;
      if (page.saveTimer || page.dirty) await persist(page);
      if (!page.sel || page.sel.id !== id || page.editRev !== revision) throw new Error(L("pages.ai.doc-changed"));
      const result = await page.api<{ text: string }>("POST", pageTail(id, "/ai"), { ...input, expected_version: page.sel.version });
      if (!page.sel || page.sel.id !== id || page.editRev !== revision) throw new Error(L("pages.ai.doc-changed"));
      return result;
    },
    onCreateFromAi: async (input) => {
      const content = String(input.text || "").split(/\n{2,}/).map((part) => (
        part.trim()
          ? { type: "paragraph", content: [{ type: "text", text: part.trim() }] }
          : { type: "paragraph" }
      ));
      await createPage(page, { title: input.title, body: { type: "doc", content } });
    },
  });
}

/** What would be saved from the open document now, or nothing when it has none or cannot show it. */
export function draftOf(page: PagesPage): Draft | null {
  const { sel } = page;
  if (!sel || page.unshowable) return null;
  return {
    id: sel.id,
    title: page.titleInput.value,
    body: page.editor ? page.Editor.getDoc(page.editor) : sel.body,
    version: page.editRev,
    server_version: sel.version,
  };
}

export function storeDocument(page: PagesPage, document: PagesRecord) {
  const index = page.records.findIndex((item) => item.id === document.id);
  if (index >= 0) page.records[index] = document;
  else page.records.unshift(document);
  renderList(page);
}

/** What the Host saved comes back to the page: kept in the list, and shown unless the person has typed since the draft was taken. */
export function adoptSaved(page: PagesPage, draft: Draft, saved: PagesRecord): PagesRecord {
  const { L } = page;
  storeDocument(page, saved);
  if (!page.sel || page.sel.id !== draft.id) return saved;
  if (page.editRev !== draft.version || page.saveTimer) {
    page.sel = {
      ...page.sel,
      goal_id: saved.goal_id,
      artifact_id: saved.artifact_id,
      artifact_version: saved.artifact_version,
      publication_pending: saved.publication_pending,
      version: saved.version,
      updated_at: saved.updated_at,
    };
    return saved;
  }
  page.sel = saved;
  page.titleEl.textContent = saved.title;
  page.statusEl.textContent = L("pages.status.saved"); page.statusEl.dataset.mwState = "saved";
  markSelected(page, saved.id);
  syncEditorChrome(page);
  // Nothing was typed since the draft was taken (checked above), so the saved title is what the box holds.
  page.titleInput.value = saved.title;
  return saved;
}

/** Saves one at a time, in order; a patch saves those fields instead of the draft's title and body. */
export function enqueueSave(page: PagesPage, draft: Draft, patch?: Record<string, unknown>): Promise<PagesRecord> {
  const run = page.saveQueue.then(async () => {
    const payload = await page.api<DocumentAnswer>("POST", pageTail(draft.id), {
      ...(patch || { title: draft.title, body: draft.body }),
      expected_version: page.sel && page.sel.id === draft.id ? page.sel.version : draft.server_version,
    });
    if (!payload.document || payload.document.id !== draft.id) throw new Error(page.L("pages.error.request"));
    if (!patch) savedByPerson(page, payload.document);
    return adoptSaved(page, draft, payload.document);
  });
  page.saveQueue = run.then(() => undefined, () => undefined);
  return run;
}

/** Shows a record in the editor. The previous document's unsaved edits go out first, and a blank one it was is taken back. */
export function fillEditor(page: PagesPage, record: PagesRecord) {
  const { L, Editor, bench, workspace } = page;
  page.editorEpoch += 1; const switching = Boolean(page.sel && record && page.sel.id !== record.id);
  const leaving = switching ? draftOf(page) : null;
  const left = switching ? blankLeaving(page) : null;
  const pending = Boolean(switching && (page.saveTimer || page.dirty));
  clearTimeout(page.saveTimer);
  page.saveTimer = 0;
  page.filling = true;
  page.sel = record;
  bench.setAttribute("data-expanded", "true");
  workspace.hidden = false; delete workspace.dataset.missing;
  page.titleEl.textContent = record.title;
  page.statusEl.textContent = L("pages.status.saved"); page.statusEl.dataset.mwState = "saved";
  page.titleInput.value = record.title;
  // A body this editor cannot show (written elsewhere in another structure) is not shown as an empty page: the next
  // keystroke would save that empty page over it. It stays read-only and unsaved until it is replaced or undone.
  page.unshowable = Boolean(record.body && !Editor.canShow(record.body));
  try {
    ensureEditor(page, page.unshowable ? Editor.emptyDoc() : record.body || Editor.emptyDoc());
  } finally {
    page.filling = false;
  }
  if (page.editor && page.editor.view) page.editor.view.setProps({ editable: () => !page.unshowable });
  page.titleInput.disabled = page.unshowable;
  markSelected(page, record.id);
  syncEditorChrome(page);
  showNote(page, "", false);
  if (pending && leaving) {
    void enqueueSave(page, leaving).catch((error) => noteFailure(page, error, L("pages.error.save")));
  }
  void dropBlank(page, left);
}

export function closeEditor(page: PagesPage) {
  const { bench, workspace } = page;
  clearTimeout(page.saveTimer);
  page.sel = null; page.editorEpoch += 1;
  syncEditorChrome(page);
  bench.setAttribute("data-expanded", "false");
  workspace.hidden = true; delete workspace.dataset.missing;
  closeMore(page);
  closeCreate(page);
  closeMove(page);
  page.els(".pages-slash, .pages-pop, .pages-block-handle, .pages-block-menu, .pages-block-ghost, .pages-drop-line").forEach((node) => { node.hidden = true; });
  sendPanel(page, { node: null });
}
