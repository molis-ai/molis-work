/** Draft text and selected materials remain with their project and Assistant work. */
export const ASSISTANT_DRAFTS_CLIENT_SCRIPT = String.raw`
  const drafts = new Map();
  let draftOwner = null;
  const contextKey = (id = curId) => "molis.assistant.context:" + json([project?.id || "", id || ""]);
  const draftJson = value => json({ ...value, files: value.files.map(({ preview: _preview, ...file }) => file), selection: value.selection ? { text: value.selection.text, truncated: value.selection.truncated } : null });
  const writeContext = (key, value) => {
    drafts.set(key, value);
    store.set(key, draftJson(value));
  };
  const saveContext = () => {
    if (draftOwner !== contextKey()) return;
    writeContext(draftOwner, { files, selection: sel, removed: [...removed], joined: [...joined], nextScope, nextExec, nextMode, nextChar, pendingChar });
  };
  const loadContext = () => {
    const key = contextKey(); if (draftOwner === key) return;
    let held = drafts.get(key);
    if (!held) { try { held = JSON.parse(store.get(key) || "null"); } catch { /* unreadable saved selections are not used */ } }
    files = Array.isArray(held?.files) ? held.files : []; sel = held?.selection || null;
    removed.clear(); (held?.removed || []).forEach(value => removed.add(value)); joined.clear(); (held?.joined || []).forEach(value => joined.add(value));
    pendingChar = held?.pendingChar; nextChar = held?.nextChar || null;
    nextScope = held?.nextScope || (project ? "project" : "personal"); nextExec = held?.nextExec || "assistant"; nextMode = held?.nextMode || "execute";
    draftOwner = key;
  };
  const moveContext = nextId => {
    if (nextId === curId) return;
    saveContext(); const from = draftOwner, next = contextKey(nextId);
    if (drafts.has(from)) writeContext(next, drafts.get(from));
    drafts.delete(from); store.set(from, null); draftOwner = next;
  };
  const takeMaterials = (sent) => {
    saveContext(); const held = drafts.get(sent.contextKey); if (!held) return;
    const ids = new Set(sent.files.map(file => file.material_id));
    const next = { ...held, files: held.files.filter(file => !ids.has(file.material_id)), selection: held.selection && sent.selection && held.selection.text === sent.selection.text && held.selection.truncated === sent.selection.truncated ? null : held.selection,
      removed: held.removed.filter(key => !sent.removed.includes(key)), joined: held.joined.filter(key => !sent.joined.includes(key)) };
    writeContext(sent.contextKey, next);
    if (draftOwner === sent.contextKey) { draftOwner = null; loadContext(); paintMats(); }
  };
  /* Each work keeps its own unsent text. */
  const saveDraft = (immediate) => {
    if (curId && !getWork() && !typed) return;
    clearTimeout(draftTimer);
    saveContext(); const id = curId, text = words(), newKey = newDraftKey();
    if (id && activeSend?.work === id) {
      const work = rowOf(id); if (work) work.draft = text;
      if (!immediate || text.trim() !== activeSend.body.text || activeSend.draft !== undefined) activeSend.draft = text;
      return;
    }
    const write = () => {
      if (!id) { store.set(newKey, text || null); return; }
      const work = rowOf(id);
      if (work && work.draft === text) return;
      if (work) work.draft = text;
      draftWrite = post(workUrl(id) + "/draft", { draft: text }).catch(() => { /* kept on the page; the next edit retries */ });
    };
    if (immediate) write(); else draftTimer = setTimeout(write, 700);
  };
  const loadDraft = () => {
    loadContext(); const work = getWork();
    input.value = work ? (work.draft || "") : (store.get(newDraftKey()) || ""); compose.dataset.uivKey = curId || ""; compose.dataset.uivProjectId = project?.id || "";
    syncSend();
  };
`;
