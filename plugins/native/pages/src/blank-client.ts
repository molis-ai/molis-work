/**
 * Runs inside the Pages client factory and shares its list and editor helpers (selected, records, request, renderList, draftOf).
 *
 * A blank document (W2-18 decision 6): `fresh` holds the documents this client made blank (「新建文档」, 「在此新建」; not a template,
 * not an AI result) with the title the Host gave them. When the person leaves one (back to the list, another document, another new
 * one) with that title or none and nothing but empty paragraphs, it is taken back with pages.discard at the version last saved, so a
 * document changed elsewhere in the meantime refuses and stays. A refusal or a failed call changes nothing.
 */
export const PAGES_BLANK_CLIENT_SCRIPT = String.raw`
  const fresh = new Map();
  const blank = (node) => node.type === "text" ? !node.text.trim() : ["doc", "paragraph"].includes(node.type) && (node.content || []).every(blank);
  const blankLeaving = () => {
    if (!selected || !fresh.has(selected.id) || unshowable || saveTimer || dirty) return null;
    const draft = draftOf();
    return (!draft.title.trim() || draft.title === fresh.get(selected.id)) && blank(draft.body) ? { id: selected.id, version: selected.version } : null;
  };
  const dropBlank = async (left) => {
    if (!left) return;
    fresh.delete(left.id);
    try {
      await request("POST", "/api/plugins/pages/" + encodeURIComponent(left.id) + "/discard", { expected_version: left.version });
      records = records.filter((item) => item.id !== left.id);
      renderList();
    } catch { /* stays as it was */ }
  };
`;
