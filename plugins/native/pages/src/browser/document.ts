import { blankLeaving, dropBlank, leaveOnFold } from "./blank.js";
import { publishContext, syncEditorChrome } from "./context.js";
import { escapeHtml, said, statusOf } from "./dom.js";
import { adoptSaved, closeEditor, draftOf, enqueueSave, fillEditor, remember, storeDocument } from "./editor.js";
import { renderList } from "./list.js";
import { noteFailure, showNote } from "./notes.js";
import type { PagesPage } from "./page.js";
import { pageTail } from "./request.js";
import type { DocumentAnswer, ListAnswer, PagesRecord, PlacedDetail } from "./types.js";

/** Reads the list again; a document open here that changed elsewhere is shown as it is now unless the person has edits of their own waiting. */
export async function loadList(page: PagesPage) {
  const seq = ++page.listSeq;
  const payload = await page.api<ListAnswer>("GET", "");
  if (seq !== page.listSeq) return;
  page.records = [...(payload.documents || [])];
  page.folders = [...(payload.folders || [])];
  renderList(page);
  const open = page.sel;
  if (open) {
    const next = page.records.find((item) => item.id === open.id);
    if (!next) closeEditor(page);
    else if (!page.saveTimer && !page.dirty) {
      // Changed elsewhere (the Assistant, another window): show what is there now. The old text left on screen under
      // the new version would be saved over the change by the next keystroke.
      const moved = next.version !== open.version;
      remember(page, next, moved);
      if (moved) page.editRev += 1;
    }
  }
}

export async function save(page: PagesPage): Promise<PagesRecord | null> {
  clearTimeout(page.saveTimer);
  page.saveTimer = 0;
  const draft = draftOf(page);
  if (!draft) return null;
  try {
    const saved = await enqueueSave(page, draft);
    if (page.editRev === draft.version && !page.saveTimer) page.dirty = false;
    publishContext(page);
    return saved;
  } catch (error) {
    page.dirty = true;
    page.statusEl.textContent = page.L("pages.error.save"); page.statusEl.dataset.mwState = "failed";
    throw error;
  }
}

/** A change was made: say so, and save it after a short quiet. */
export function queueSave(page: PagesPage) {
  if (page.unshowable) return;
  page.statusEl.textContent = page.L("pages.status.saving"); page.statusEl.dataset.mwState = "saving";
  page.editRev += 1;
  page.dirty = true;
  publishContext(page);
  clearTimeout(page.saveTimer);
  page.saveTimer = setTimeout(() => { void save(page).catch((error) => noteFailure(page, error, page.L("pages.error.save"))); }, 400);
}

export async function persist(page: PagesPage) {
  if (!page.sel || page.unshowable) return;
  do { await save(page); } while (page.sel && (page.saveTimer || page.dirty));
}

export const saveOpen = (page: PagesPage, id: string): Promise<void> | false => page.sel?.id === id && Boolean(page.saveTimer || page.dirty) && persist(page);

// Shown again (item tab, reload): the workbench took its name off when it hid it, so name it again.
function revealEditor(page: PagesPage) {
  page.bench.setAttribute("data-expanded", "true");
  page.workspace.hidden = false;
  syncEditorChrome(page);
}

export async function openDocument(page: PagesPage, record: PagesRecord | null | undefined) {
  if (!record) return;
  if (page.sel && page.sel.id === record.id) {
    revealEditor(page);
    return;
  }
  if (page.sel && (page.saveTimer || page.dirty)) await persist(page);
  fillEditor(page, record);
  page.dirty = false;
  page.editRev += 1;
}

/** Tell the workbench what just happened, so it can say where the result is and what comes next. */
export const placed = (detail: PlacedDetail) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };

const safeName = (page: PagesPage, value: string | undefined) => [...String(value || page.L("pages.doc.untitled")).replace(/[\\/:*?"<>|]/g, "_")].slice(0, 80).join("");

const htmlDocument = (page: PagesPage, body: unknown) => {
  const title = escapeHtml(page.sel!.title);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + title
    + "</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:15px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#222}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body><h1>"
    + title + "</h1>" + page.Editor.toHTML(body) + "</body></html>";
};

export const assertReadable = (page: PagesPage, record: PagesRecord | null = page.sel) => {
  if (record?.body && !page.Editor.canShow(record.body)) throw new Error(page.L("pages.note.unsupported-op"));
};

export function exportDocument(page: PagesPage, format: string) {
  const { sel, editor, Editor, L } = page;
  assertReadable(page); if (!sel) return;
  const body = editor ? Editor.getDoc(editor) : sel.body;
  const markdown = format === "md";
  const content = markdown ? "# " + (sel.title || L("pages.doc.untitled")) + "\n\n" + Editor.toMarkdown(body) : htmlDocument(page, body);
  const blob = new Blob([content], { type: markdown ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8" });
  const name = safeName(page, sel.title) + (markdown ? ".md" : ".html");
  void page.host.download(blob, name).catch((error: unknown) => showNote(page, said(error, ""), true));
  placed({ verb: "exported", title: sel.title, file: { name, format: markdown ? "Markdown" : L("pages.export.web") } });
}

export function printDocument(page: PagesPage) {
  const { sel, editor, Editor } = page;
  assertReadable(page); if (!sel) return;
  page.host.printDocument(htmlDocument(page, editor ? Editor.getDoc(editor) : sel.body));
  placed({ verb: "printed", title: sel.title });
}

/** Makes a document (blank, from a template, in a folder, from a text) and opens it with its title selected. */
export async function createPage(page: PagesPage, body?: Record<string, unknown>) {
  const { L } = page;
  const epoch = page.editorEpoch;
  if (page.sel && (page.saveTimer || page.dirty)) await persist(page);
  if (page.editorEpoch !== epoch) return;
  const left = blankLeaving(page);
  const payload = await page.api<DocumentAnswer>("POST", "", body || {});
  if (!body || !(body.template_id || body.body || body.title)) page.fresh.set(payload.document.id, { title: payload.document.title, version: payload.document.version });
  storeDocument(page, payload.document); placed({ verb: "created", title: payload.document.title || L("pages.doc.untitled"), object: { kind: "pages_document", id: payload.document.id } });
  await loadList(page);
  void dropBlank(page, left);
  if (page.editorEpoch === epoch) { await openDocument(page, payload.document); page.titleInput.focus(); page.titleInput.select(); }
}

export async function toggleStar(page: PagesPage, id: string) {
  const record = page.records.find((item) => item.id === id);
  if (!record) return;
  await saveOpen(page, id);
  await page.api("POST", pageTail(id), { starred: !record.starred });
  await loadList(page);
}

export async function movePage(page: PagesPage, id: string, folderId: string) {
  const record = page.records.find((item) => item.id === id);
  if (!record || (record.folder_id || "") === folderId) return;
  await saveOpen(page, id);
  await page.api("POST", pageTail(id), { folder_id: folderId });
  await loadList(page);
}

/** Saves the document as a fixed version (an artifact); a half-finished earlier save is picked up where it stopped. */
export async function publishPage(page: PagesPage, id: string) {
  const { L } = page;
  if (page.publishing.has(id)) return;
  page.publishing.add(id);
  let draft = null;
  try {
    if (page.sel?.id === id) await persist(page);
    const current = page.sel?.id === id ? page.sel : page.records.find((record) => record.id === id);
    if (!current) return;
    assertReadable(page, current);
    draft = page.sel?.id === id ? draftOf(page) : null;
    const payload = await page.api<DocumentAnswer>("POST", pageTail(id, "/promote"), {
      goal_id: current.publication_pending?.goal_id ?? current.goal_id ?? "", expected_version: current.version,
    });
    if (draft) adoptSaved(page, draft, payload.document); else storeDocument(page, payload.document);
    if (payload.recovered) showNote(page, L("pages.version.recovered"), false);
    placed({ verb: "versioned", title: payload.document.title, object: { kind: "pages_document", id: payload.document.id }, artifact: payload.artifact,
      note: L("pages.version.saved-note", { version: payload.document.artifact_version }) });
  } catch (error) {
    // A failed response may follow a committed version: refresh recovery state, keep local edits.
    try {
      const payload = await page.api<DocumentAnswer>("GET", pageTail(id));
      if (draft) adoptSaved(page, draft, payload.document); else storeDocument(page, payload.document);
      if (page.sel?.id === id) syncEditorChrome(page);
    } catch { /* Keep the original error and the user's draft. */ }
    throw error;
  } finally { page.publishing.delete(id); }
}

/** Listeners that keep the open document and the list in step with the workbench: opening an item, a placement, a flush before a move. */
export function bindDocument(page: PagesPage) {
  const { bench, host, L } = page;
  page.commentOpen = page.Editor.bindComments({ workbench: bench, messages: host.messages, persistCurrent: () => persist(page), showNote: (message, isError) => showNote(page, message, isError), translate: L,
    get selected() { return page.sel; }, get editor() { return page.editor; }, get unshowable() { return page.unshowable; }, get dirty() { return page.dirty || Boolean(page.saveTimer); } });
  bench.addEventListener("molis-work:select-item", (event) => {
    const detail = (event as CustomEvent<{ itemId?: string; quiet?: boolean } | undefined>).detail;
    const id = detail?.itemId;
    if (!id) { page.selectionSeq++; page.openingId = null; leaveOnFold(page); return; }
    if (page.sel?.id === id) {
      revealEditor(page);
      return;
    }
    if (page.openingId === id) return;
    page.openingId = id;
    const seq = ++page.selectionSeq;
    void (async () => {
      if (page.sel && (page.saveTimer || page.dirty)) await persist(page);
      const payload = await page.api<DocumentAnswer>("GET", pageTail(id));
      if (seq !== page.selectionSeq) return;
      fillEditor(page, payload.document);
      page.dirty = false;
      page.editRev += 1;
      showNote(page, "", false);
    })().catch((error: unknown) => {
      if (seq !== page.selectionSeq) return;
      const status = statusOf(error);
      if (status === 404 || status === 403) bench.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: id } }));
      if (!page.sel && (!detail?.quiet || status === 403)) { bench.setAttribute("data-expanded", "true"); page.workspace.hidden = false; page.workspace.dataset.missing = ""; page.titleEl.textContent = L("pages.doc.name"); }
      showNote(page, said(error, L("pages.error.save")), true);
    }).finally(() => { if (seq === page.selectionSeq) page.openingId = null; });
  });
  window.addEventListener?.("molis:placement-flush", (event) => {
    const detail = (event as CustomEvent<{ mode?: string; object?: { kind?: string; id: string }; settle?: unknown[] } | undefined>).detail || {};
    if (detail.mode === "move" && detail.object?.kind === "pages_document") detail.settle?.push(saveOpen(page, detail.object.id));
  });
  window.addEventListener?.("molis:placement-changed", (event) => {
    const detail = (event as CustomEvent<{ mode?: string; from?: { kind?: string; id: string }; to?: { kind?: string } } | undefined>).detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("pages_document")) return;
    void (async () => {
      if (detail.mode === "move" && detail.from && page.sel && page.sel.id === detail.from.id) closeEditor(page);
      await loadList(page);
    })().catch((error: unknown) => noteFailure(page, error, L("pages.error.request")));
  });
}
