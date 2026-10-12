/**
 * Runs inside the Pages client factory and shares its list and editor helpers (selected, records, request, renderList, draftOf).
 *
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
 * (reload, window closed) the editor is closed too, and the call is sent with keepalive. Closing it matters: the workbench keeps
 * the open record of a plugin's page to reopen after a reload and forgets it when the page reports it is back at its list
 * (data-expanded false), and a record it still held would be asked for by id 1.5 s after the reload and answered 「找不到这篇文档」.
 * A tab or window that is only hidden is not leaving, and a document with a save pending is never taken back (blankLeaving), so
 * its record stays. The scope's cleanups run in the same order when the page goes away; `alive` tells the two apart, so the call
 * is made once, with keepalive.
 *
 * The workbench's own ways back to the list (its Back button, ⌘[, the mouse back button, the plugin's name on the tab strip) say
 * "no item" with a select-item event and then fold the page without asking it to close the editor (leaveOnFold, called from the
 * client's select-item handler): once the fold is done, the blank document is left like any other. An event with no item that is
 * not followed by a fold (a tab of the page shown without an item) leaves it open.
 *
 * Opening an imported document from the import dialog leaves the blank one open next to it as well (blankLeaving is read before the
 * imported document becomes the selected one).
 */
export const PAGES_BLANK_CLIENT_SCRIPT = String.raw`
  const fresh = new Map();
  const savedByPerson = (doc) => { const made = fresh.get(doc.id); if (made && doc.version === made.version + 1) made.version = doc.version; };
  const blank = (node) => node.type === "text" ? !node.text.trim() : ["doc", "paragraph"].includes(node.type) && (node.content || []).every(blank);
  const blankLeaving = () => {
    const made = selected && fresh.get(selected.id);
    if (!made || unshowable || saveTimer || dirty) return null;
    const draft = draftOf();
    return (!draft.title.trim() || draft.title === made.title) && blank(draft.body) ? { id: selected.id, version: made.version } : null;
  };
  const dropBlank = async (left, unloading) => {
    if (!left) return;
    fresh.delete(left.id);
    try {
      await request("POST", pageUrl(left.id, "/discard"), { expected_version: left.version }, unloading && { keepalive: true });
      records = records.filter((item) => item.id !== left.id);
      renderList();
    } catch { /* stays as it was */ }
  };
  const leaveBlank = (unloading) => {
    const left = blankLeaving();
    if (!left) return;
    closeEditor();
    void dropBlank(left, unloading);
  };
  const leaveOnFold = () => queueMicrotask(() => { if (workbench.getAttribute("data-expanded") === "false") leaveBlank(); });
  const lifetime = host.mountPluginClient?.(workbench);
  lifetime?.whenVisible(() => () => { if (lifetime.alive && !document.hidden) leaveBlank(); });
  lifetime?.own(() => leaveBlank(true));
`;
