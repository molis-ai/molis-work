/** Draft text and selected materials remain with their project and Assistant work. */
export const ASSISTANT_DRAFTS_CLIENT_SCRIPT = String.raw`
  const contextDrafts = new Map();
  let contextOwner = null;
  const contextKey = (id = curId) => "molis.assistant.context:" + json([project?.id || "", id || ""]);
  const draftJson = value => json({ ...value, files: value.files.map(({ preview: _preview, ...file }) => file), selection: value.selection ? { text: value.selection.text, truncated: value.selection.truncated } : null });
  const writeContext = (key, value) => {
    contextDrafts.set(key, value);
    store.set(key, draftJson(value));
  };
  const saveDraftContext = () => {
    if (contextOwner !== contextKey()) return;
    writeContext(contextOwner, { files, selection: sel, removed: [...removed], joined: [...joined], nextScope, nextExec, nextMode, nextChar, pendingChar });
  };
  const loadDraftContext = () => {
    const key = contextKey(); if (contextOwner === key) return;
    let held = contextDrafts.get(key);
    if (!held) { try { held = JSON.parse(store.get(key) || "null"); } catch { /* unreadable saved selections are not used */ } }
    files = Array.isArray(held?.files) ? held.files : []; sel = held?.selection || null;
    removed.clear(); (held?.removed || []).forEach(value => removed.add(value)); joined.clear(); (held?.joined || []).forEach(value => joined.add(value));
    pendingChar = held?.pendingChar; nextChar = held?.nextChar || null;
    nextScope = held?.nextScope || (project ? "project" : "personal"); nextExec = held?.nextExec || "assistant"; nextMode = held?.nextMode || "execute";
    contextOwner = key;
  };
  const moveDraftContext = nextId => {
    if (nextId === curId) return;
    saveDraftContext(); const from = contextOwner, next = contextKey(nextId);
    if (contextDrafts.has(from)) writeContext(next, contextDrafts.get(from));
    contextDrafts.delete(from); store.set(from, null); contextOwner = next;
  };
  const takeDraftMaterials = (sent) => {
    saveDraftContext(); const held = contextDrafts.get(sent.contextKey); if (!held) return;
    const ids = new Set(sent.files.map(file => file.material_id));
    const next = { ...held, files: held.files.filter(file => !ids.has(file.material_id)), selection: held.selection && sent.selection && held.selection.text === sent.selection.text && held.selection.truncated === sent.selection.truncated ? null : held.selection,
      removed: held.removed.filter(key => !sent.removed.includes(key)), joined: held.joined.filter(key => !sent.joined.includes(key)) };
    writeContext(sent.contextKey, next);
    if (contextOwner === sent.contextKey) { contextOwner = null; loadDraftContext(); paintMats(); }
  };
  /* Each work keeps its own unsent text. */
  const saveDraft = (immediate) => {
    if (curId && !getWork() && !typed) return;
    clearTimeout(draftTimer);
    saveDraftContext(); const id = curId, text = String(input.value || ""), newKey = newDraftKey();
    if (id && activeSend?.work === id) {
      const work = works.find((row) => row.work_id === id); if (work) work.draft = text;
      if (!immediate || text.trim() !== activeSend.body.text || activeSend.draft !== undefined) activeSend.draft = text;
      return;
    }
    const write = () => {
      if (!id) { store.set(newKey, text || null); return; }
      const work = works.find((row) => row.work_id === id);
      if (work && work.draft === text) return;
      if (work) work.draft = text;
      draftWrite = api("/works/" + uri(id) + "/draft", "POST", { draft: text }).catch(() => { /* kept on the page; the next edit retries */ });
    };
    if (immediate) write(); else draftTimer = setTimeout(write, 700);
  };
  const loadDraft = () => {
    loadDraftContext(); const work = getWork();
    input.value = work ? (work.draft || "") : (store.get(newDraftKey()) || ""); compose.dataset.uivKey = curId || ""; compose.dataset.uivProjectId = project?.id || "";
    syncSend();
  };
`;
