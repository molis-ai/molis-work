/**
 * Runs inside the Pages client factory and shares its list and editor helpers (selected, records, request, renderList, draftOf).
 *
 * A blank document (W2-18 decision 6): `fresh` holds the documents this client made blank (「新建文档」, 「在此新建」; not a template,
 * not an AI result) with the title the Host gave them. When the person leaves one (back to the list, another document, another new
 * one) with that title or none and nothing but empty paragraphs, it is taken back with pages.discard at the version last saved, so a
 * document changed elsewhere in the meantime refuses and stays. A refusal or a failed call changes nothing.
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
  const blank = (node) => node.type === "text" ? !node.text.trim() : ["doc", "paragraph"].includes(node.type) && (node.content || []).every(blank);
  const blankLeaving = () => {
    if (!selected || !fresh.has(selected.id) || unshowable || saveTimer || dirty) return null;
    const draft = draftOf();
    return (!draft.title.trim() || draft.title === fresh.get(selected.id)) && blank(draft.body) ? { id: selected.id, version: selected.version } : null;
  };
  const dropBlank = async (left, unloading) => {
    if (!left) return;
    fresh.delete(left.id);
    try {
      await request("POST", "/api/plugins/pages/" + encodeURIComponent(left.id) + "/discard", { expected_version: left.version }, unloading && { keepalive: true });
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
