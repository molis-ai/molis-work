import { blank } from "./dom.js";
import { closeEditor, draftOf } from "./editor.js";
import { renderList } from "./list.js";
import type { PagesPage } from "./page.js";
import { pageTail } from "./request.js";
import type { LeftBlank, PagesRecord } from "./types.js";

/**
 * A blank document (W2-18 decision 6): `fresh` holds the documents this client made blank (「新建文档」, 「在此新建」; not a template,
 * not an AI result) with the title the Host gave them and the version they have while nothing but this person's own typing has
 * touched them (savedByPerson moves it along with each save of the title and body, and with nothing else). When the person leaves
 * one (back to the list, another document, another new one) with that title or none and nothing but empty paragraphs, it is taken
 * back with pages.discard at that version. pages.discard is the undo of a create: it deletes only while the Host's version is the
 * one asked for, so a document starred, filed, tied to a Goal or saved as a fixed version since it was made, or changed elsewhere
 * (the list reload and the Assistant's changes move the page's own copy along, this version they do not), refuses and stays,
 * however empty the editor looks. A refusal or a failed call changes nothing.
 *
 * Leaving also means the surface going away. When the workbench hides this page (another plugin, Home, Settings) the editor is
 * closed and the blank document taken back the same way, so what comes back is the list. When the page itself is going away
 * (reload, window closed) the Host folds the editor and runs the own-action cleanup registered while the page was alive. Closing it matters: the workbench keeps
 * the open record of a plugin's page to reopen after a reload and forgets it when the page reports it is back at its list
 * (data-expanded false), and a record it still held would be asked for by id 1.5 s after the reload and answered 「找不到这篇文档」.
 * A tab or window that is only hidden is not leaving, and a document with a save pending is never taken back (blankLeaving), so
 * its record stays. The closing registration is cancelled as soon as the draft stops being eligible.
 *
 * The workbench's own ways back to the list (its Back button, ⌘[, the mouse back button, the plugin's name on the tab strip) say
 * "no item" with a select-item event and then fold the page without asking it to close the editor (leaveOnFold, called from the
 * client's select-item handler): once the fold is done, the blank document is left like any other. An event with no item that is
 * not followed by a fold (a tab of the page shown without an item) leaves it open.
 *
 * Opening an imported document from the import dialog leaves the blank one open next to it as well (blankLeaving is read before the
 * imported document becomes the selected one).
 */
export function savedByPerson(page: PagesPage, doc: PagesRecord) {
  const made = page.fresh.get(doc.id);
  if (made && doc.version === made.version + 1) made.version = doc.version;
}

export function blankLeaving(page: PagesPage): LeftBlank | null {
  const made = page.sel && page.fresh.get(page.sel.id);
  if (!made || page.unshowable || page.saveTimer || page.dirty) return null;
  const draft = draftOf(page);
  return draft && (!draft.title.trim() || draft.title === made.title) && blank(draft.body) ? { id: page.sel!.id, version: made.version } : null;
}

export async function dropBlank(page: PagesPage, left: LeftBlank | null) {
  if (!left) return;
  page.fresh.delete(left.id);
  try {
    await page.api("POST", pageTail(left.id, "/discard"), { expected_version: left.version });
    page.records = page.records.filter((item) => item.id !== left.id);
    renderList(page);
  } catch { /* stays as it was */ }
}

function leaveBlank(page: PagesPage) {
  const left = blankLeaving(page);
  if (!left) return;
  closeEditor(page);
  void dropBlank(page, left);
}

export const leaveOnFold = (page: PagesPage) => queueMicrotask(() => { if (page.bench.getAttribute("data-expanded") === "false") leaveBlank(page); });

/** Registers (or cancels) the Host's cleanup for a page that goes away while a blank document is open. */
export function closingBlank(page: PagesPage) {
  const left = blankLeaving(page);
  page.host.view.onClosing(left ? { reference: { capability_id: "pages.discard", version: 1 }, input: { id: left.id, expected_version: left.version } } : null);
}

/** Leaving by the workbench hiding this page: the blank document goes like any other. */
export function bindBlank(page: PagesPage) {
  const lifetime = page.lifetime = page.host.mountPluginClient?.(page.bench);
  lifetime?.whenVisible(() => () => { if (lifetime.alive && !document.hidden) leaveBlank(page); });
}
